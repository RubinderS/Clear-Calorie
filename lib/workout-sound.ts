// Workout cues synthesized in the browser: chimes or the device's
// built-in voice, so there are no audio files to ship.

import {LEAD_IN_BEAT_MS, type WorkoutCue} from '@/lib/workout';

export type SoundMode = 'tones' | 'count';

export type WorkoutSound = {
  /** tempoMs is the time per rep, so spoken counts can keep up with it. */
  play: (cue: WorkoutCue, mode: SoundMode, tempoMs: number) => void;
};

type Tone = {frequency: number; durationMs: number; gain?: number};

// Chime notes from a C major chord; durationMs is how long each rings out.
const LEAD_IN_TONE: Tone = {frequency: 659.25, durationMs: 700}; // E5
const REP_TONE: Tone = {frequency: 783.99, durationMs: 500}; // G5
const ACCENT_TONE: Tone = {frequency: 1046.5, durationMs: 1600}; // C6
// A full chord that rings longest, so the end of a set stands out.
const SET_END_TONES: Tone[] = [
  {frequency: 523.25, durationMs: 2500, gain: 0.5}, // C5
  {frequency: 659.25, durationMs: 2500, gain: 0.4}, // E5
  {frequency: 783.99, durationMs: 2500, gain: 0.4}, // G5
  {frequency: 1046.5, durationMs: 2500, gain: 0.35}, // C6
];
const VOLUME = 0.35;
const STRIKE_S = 0.003;
// Overtones give the bell-like color; higher ones are quieter and fade sooner.
const PARTIALS = [
  {ratio: 1, gain: 1},
  {ratio: 2, gain: 0.35},
  {ratio: 3, gain: 0.12},
];

function cueTones(cue: WorkoutCue): Tone[] {
  if (cue.type === 'leadIn') return [LEAD_IN_TONE];
  if (cue.type === 'go') return [ACCENT_TONE];
  if (cue.type === 'setEnd') return SET_END_TONES;
  return [REP_TONE];
}

// Syllables in zero..nine and ten..nineteen as spoken words.
const ONES_SYLLABLES = [2, 1, 1, 1, 1, 1, 1, 2, 1, 1];
const TEENS_SYLLABLES = [1, 3, 1, 2, 2, 2, 2, 3, 2, 2];

function countSyllables(n: number): number {
  if (n >= 100) return 3; // one hundred
  if (n < 10) return ONES_SYLLABLES[n];
  if (n < 20) return TEENS_SYLLABLES[n - 10];
  const tens = Math.floor(n / 10) === 7 ? 3 : 2; // seventy vs twenty
  return tens + (n % 10 === 0 ? 0 : ONES_SYLLABLES[n % 10]);
}

// Even at full speed the voice needs time to start, then time per syllable,
// so fast tempos only leave room for short words.
const SPEECH_START_MS = 500;
const SYLLABLE_MS = 400;

/** Long counts shorten to their last digit when they won't fit the beat. */
function countWords(n: number, tempoMs: number): string {
  const fits = Math.max(
    1,
    Math.floor((tempoMs - SPEECH_START_MS) / SYLLABLE_MS),
  );
  if (countSyllables(n) <= fits || n % 10 === 0) return String(n);
  return String(n % 10);
}

function cueWords(cue: WorkoutCue, tempoMs: number): string {
  if (cue.type === 'go') return 'Go';
  if (cue.type === 'setEnd') return cue.lastSet ? 'Great work' : 'And rest';
  if (cue.type === 'leadIn') return String(cue.n);
  return countWords(cue.n, tempoMs);
}

// Speech rates, where 1 is the voice's normal pace. iOS treats 2 as its top
// speed.
const BASE_RATE = 0.8;
const MAX_RATE = 2;
// The fastest tempo whose counts still finish at BASE_RATE; faster tempos
// speed the voice up in proportion so the next count doesn't cut it off.
const RELAXED_TEMPO_MS = 2_500;

function speechRate(cue: WorkoutCue, tempoMs: number): number {
  const beatMs =
    cue.type === 'rep' ? tempoMs : cue.type === 'leadIn' ? LEAD_IN_BEAT_MS : 0;
  if (!beatMs) return BASE_RATE;
  const rate = (BASE_RATE * RELAXED_TEMPO_MS) / beatMs;
  return Math.min(MAX_RATE, Math.max(BASE_RATE, rate));
}

// One context for the page: browsers cap how many can exist, and closing it on
// unmount would silence a remount (React Strict Mode mounts effects twice).
let sharedContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (sharedContext && sharedContext.state !== 'closed') return sharedContext;
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as {webkitAudioContext?: typeof AudioContext})
      .webkitAudioContext;
  sharedContext = AudioContextClass ? new AudioContextClass() : null;
  return sharedContext;
}

/** Resumes after the browser suspends audio (iOS reports "interrupted"). */
function wake(context: AudioContext) {
  if (context.state !== 'running') void context.resume().catch(() => {});
}

/**
 * Must be called from a tap: iOS only allows audio that a user gesture
 * started, after which later sounds can play on their own.
 */
export function unlockAudio(): AudioContext | null {
  const context = getAudioContext();
  if (context) {
    wake(context);
    // Older iOS only unlocks audio once something actually plays in the tap.
    const unlock = context.createBufferSource();
    unlock.buffer = context.createBuffer(1, 1, context.sampleRate);
    unlock.connect(context.destination);
    unlock.start();
  }
  return context;
}

/**
 * Must be called from a tap: iOS only allows audio and speech that a user
 * gesture started, after which later cues can play on their own.
 */
export function createWorkoutSound(): WorkoutSound {
  const context = unlockAudio();

  const speech = 'speechSynthesis' in window ? window.speechSynthesis : null;
  if (speech) {
    const primer = new SpeechSynthesisUtterance(' ');
    primer.volume = 0;
    speech.speak(primer);
  }

  function chime({frequency, durationMs, gain: toneGain = 1}: Tone) {
    if (!context) return;
    wake(context);
    const start = context.currentTime;
    for (const partial of PARTIALS) {
      const end = start + durationMs / 1000 / partial.ratio;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency * partial.ratio;
      // A near-instant strike, then an exponential ring-out like a struck bell.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(
        VOLUME * toneGain * partial.gain,
        start + STRIKE_S,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }
  }

  function say(text: string, rate: number) {
    if (!speech) return false;
    // A word being spoken gets to finish, but one still waiting to start means
    // speech has fallen behind the timer. cancel() can only clear everything.
    if (speech.pending) speech.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    speech.speak(utterance);
    return true;
  }

  return {
    play(cue, mode, tempoMs) {
      // Backstop for a cancelled utterance whose onend never fired.
      if (context) wake(context);
      if (
        mode === 'count' &&
        say(cueWords(cue, tempoMs), speechRate(cue, tempoMs))
      ) {
        return;
      }
      cueTones(cue).forEach(chime);
    },
  };
}

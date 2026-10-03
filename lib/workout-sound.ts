// Workout cues synthesized in the browser: chimes or the device's
// built-in voice, so there are no audio files to ship.

import type {WorkoutCue} from '@/lib/workout';

export type SoundMode = 'beep' | 'count';

export type WorkoutSound = {
  play: (cue: WorkoutCue, mode: SoundMode) => void;
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

function cueWords(cue: WorkoutCue): string {
  if (cue.type === 'go') return 'Go';
  if (cue.type === 'setEnd') return cue.lastSet ? 'Great work' : 'And rest';
  return String(cue.n);
}

// One context for the page: browsers cap how many can exist, and closing it on
// unmount would silence a remount (React Strict Mode mounts effects twice).
let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
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
 * Must be called from a tap: iOS only allows audio and speech that a user
 * gesture started, after which later cues can play on their own.
 */
export function createWorkoutSound(): WorkoutSound {
  const context = getAudioContext();
  if (context) {
    wake(context);
    // Older iOS only unlocks audio once something actually plays in the tap.
    const unlock = context.createBufferSource();
    unlock.buffer = context.createBuffer(1, 1, context.sampleRate);
    unlock.connect(context.destination);
    unlock.start();
  }

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

  function say(text: string, interrupt: boolean) {
    if (!speech) return false;
    // Drop anything still queued so counts never fall behind the tempo.
    if (interrupt) speech.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // 1 is the voice's normal pace.
    utterance.rate = 0.8;
    speech.speak(utterance);
    return true;
  }

  return {
    play(cue, mode) {
      // The set-end words queue after the final count instead of cutting it off.
      if (mode === 'count' && say(cueWords(cue), cue.type !== 'setEnd')) {
        return;
      }
      cueTones(cue).forEach(chime);
    },
  };
}

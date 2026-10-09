// Workout cues: chimes synthesized in the browser, or a voice recorded into
// mp3 clips by scripts/voice/generate_voice.py. The clips play through Web
// Audio rather than the device's speech engine, whose start-up lag varies by
// device and drifts off the on-screen count.

import {
  FIRST_LEAD_IN_BEATS,
  LEAD_IN_BEATS,
  LEAD_IN_BEAT_MS,
  MAX_REPS,
  type WorkoutCue,
} from '@/lib/workout';

export type SoundMode = 'tones' | 'count';

export type WorkoutSound = {
  /**
   * tempoMs is the time per rep, so counts can keep up with it; leadInBeats
   * picks the countdown the cue belongs to.
   */
  play: (
    cue: WorkoutCue,
    mode: SoundMode,
    tempoMs: number,
    leadInBeats: number,
  ) => void;
  /** Silences the voice at once, e.g. on pause or cancel. */
  stop: () => void;
  /** Cuts off a countdown that no longer applies, but lets a set-end phrase finish. */
  endCountdown: () => void;
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

const VOICE_URL = '/audio/voice';
// Quiet before the next count so two counts never run together.
const COUNT_GAP_MS = 150;

function countdownName(beats: number): string {
  return `countdown-${beats}`;
}

/**
 * Long counts shorten to their last digit when the clip won't fit the beat.
 * lengthMs is undefined for a clip that hasn't loaded.
 */
export function countClip(
  n: number,
  tempoMs: number,
  lengthMs: (name: string) => number | undefined,
): string {
  const full = String(n);
  if (n < 10 || n % 10 === 0) return full;
  const length = lengthMs(full);
  if (length !== undefined && length <= tempoMs - COUNT_GAP_MS) return full;
  return String(n % 10);
}

export type VoiceClip = {name: string; offsetMs: number};

/**
 * The clip for a cue, and how far into it to start. A lead-in is one clip with
 * a word on each beat, so a countdown joined partway (after a pause, or once
 * it finishes loading) starts at the current beat and stays on time.
 */
export function voiceClip(
  cue: WorkoutCue,
  tempoMs: number,
  leadInBeats: number,
  lengthMs: (name: string) => number | undefined,
): VoiceClip {
  if (cue.type === 'leadIn' || cue.type === 'go') {
    const beat = cue.type === 'go' ? leadInBeats : leadInBeats - cue.n;
    return {
      name: countdownName(leadInBeats),
      offsetMs: beat * LEAD_IN_BEAT_MS,
    };
  }
  if (cue.type === 'setEnd') {
    return {name: cue.lastSet ? 'great-work' : 'and-rest', offsetMs: 0};
  }
  return {name: countClip(cue.n, tempoMs, lengthMs), offsetMs: 0};
}

// Most urgent first: the countdown plays the moment a workout starts.
const CLIP_NAMES = [
  countdownName(FIRST_LEAD_IN_BEATS),
  countdownName(LEAD_IN_BEATS),
  'and-rest',
  'great-work',
  ...Array.from({length: MAX_REPS}, (_, i) => String(i + 1)),
];

/** startS skips the silence mp3 encoding adds before the first word. */
type Clip = {buffer: AudioBuffer; startS: number};

const clips = new Map<string, Clip>();
// In-flight and finished loads; a failed one is dropped so it's retried.
const clipLoads = new Map<string, Promise<void>>();
// A stalled download shouldn't hold the workout hostage; a cue whose clip is
// missing plays its chime instead.
const VOICE_LOAD_TIMEOUT_MS = 15_000;

// Encoder padding decodes to near-zero samples; the voice is well above this.
const SILENCE_LEVEL = 0.003;
const MAX_PADDING_S = 0.25;

function leadingSilenceS(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const limit = Math.min(
    data.length,
    Math.round(MAX_PADDING_S * buffer.sampleRate),
  );
  for (let i = 0; i < limit; i++) {
    if (Math.abs(data[i]) > SILENCE_LEVEL) return i / buffer.sampleRate;
  }
  return 0;
}

function clipLengthMs(name: string): number | undefined {
  const clip = clips.get(name);
  return clip && (clip.buffer.duration - clip.startS) * 1000;
}

function loadClip(context: AudioContext, name: string): Promise<void> {
  let load = clipLoads.get(name);
  if (!load) {
    load = fetch(`${VOICE_URL}/${name}.mp3`)
      .then((response) => {
        if (!response.ok) throw new Error(`${name}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        clips.set(name, {buffer, startS: leadingSilenceS(buffer)});
      })
      .catch(() => {
        clipLoads.delete(name);
      });
    clipLoads.set(name, load);
  }
  return load;
}

/**
 * Downloads and decodes the voice clips so they play without delay. Resolves
 * once every clip has loaded or failed, or after VOICE_LOAD_TIMEOUT_MS. Safe
 * to call repeatedly; clips that failed to load are retried.
 */
export function loadWorkoutVoice(): Promise<void> {
  const context = getAudioContext();
  if (!context) return Promise.resolve();
  const loads = Promise.all(CLIP_NAMES.map((name) => loadClip(context, name)));
  const timeout = new Promise<void>((resolve) =>
    setTimeout(resolve, VOICE_LOAD_TIMEOUT_MS),
  );
  return Promise.race([loads.then(() => {}), timeout]);
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
 * Must be called from a tap: iOS only allows audio that a user gesture
 * started, after which later cues can play on their own.
 */
export function createWorkoutSound(): WorkoutSound {
  const context = unlockAudio();

  // The clip being spoken; a new one cuts it off, as a new count would.
  let speaking: {name: string; source: AudioBufferSourceNode} | null = null;

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

  function stop() {
    if (!speaking) return;
    speaking.source.onended = null;
    speaking.source.stop();
    speaking = null;
  }

  function say({name, offsetMs}: VoiceClip): boolean {
    const clip = clips.get(name);
    if (!context || !clip) return false;
    // A countdown already playing has this beat's word in it.
    if (speaking?.name === name && name.startsWith('countdown-')) return true;
    const offsetS = clip.startS + offsetMs / 1000;
    if (offsetS >= clip.buffer.duration) return false;
    wake(context);
    stop();
    const source = context.createBufferSource();
    source.buffer = clip.buffer;
    source.connect(context.destination);
    source.start(0, offsetS);
    const current = {name, source};
    source.onended = () => {
      if (speaking === current) speaking = null;
    };
    speaking = current;
    return true;
  }

  return {
    play(cue, mode, tempoMs, leadInBeats) {
      if (
        mode === 'count' &&
        say(voiceClip(cue, tempoMs, leadInBeats, clipLengthMs))
      ) {
        return;
      }
      cueTones(cue).forEach(chime);
    },
    stop,
    endCountdown() {
      if (speaking?.name.startsWith('countdown-')) stop();
    },
  };
}

// A gym beat synthesized in the browser to play behind the workout timer.
// Tone.js only loads once music is turned on, and it shares the cue sounds'
// AudioContext so the tap that unlocks cues on iOS unlocks the music too.

import type * as ToneModule from "tone";
import { getAudioContext } from "@/lib/workout-sound";

type Tone = typeof ToneModule;

export type MusicIntensity = "set" | "rest";

export type WorkoutMusic = {
  setPlaying: (playing: boolean) => void;
  /** Rests drop the drums and muffle the rest; sets bring the drums back. */
  setIntensity: (intensity: MusicIntensity) => void;
  /** Fades out, then frees every node. */
  dispose: () => void;
};

const BPM = 126;
const STEPS_PER_BAR = 16;
// The first pass builds up over the intro; later passes loop the rest.
const INTRO_BARS = 4;
const BARS = 16;
const ARP_FROM_BAR = 8;

// Music sits at a steady level below the cues, which play on top of it.
const MUSIC_LEVEL = 0.3;
const FADE_IN_S = 0.3;
const FADE_OUT_S = 1;
const OPEN_FILTER_HZ = 18_000;
const REST_FILTER_HZ = 600;

// Am – F – C – G, one chord a bar. Bass sits an octave higher than a club
// mix would so phone speakers can still carry it.
const CHORDS = [
  { bass: "A2", pad: ["A3", "C4", "E4"], arp: ["A4", "C5", "E5", "A5"] },
  { bass: "F2", pad: ["F3", "A3", "C4"], arp: ["F4", "A4", "C5", "F5"] },
  { bass: "C3", pad: ["G3", "C4", "E4"], arp: ["E4", "G4", "C5", "E5"] },
  { bass: "G2", pad: ["G3", "B3", "D4"], arp: ["D4", "G4", "B4", "D5"] },
];
// Which arp note plays on each 16th of the bar.
const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2];

let tonePromise: Promise<Tone> | null = null;
let toneContext: AudioContext | null = null;
// Instances still fading out share the one transport with a new one.
let liveCount = 0;

/** Starts downloading Tone.js so music is ready when the workout starts. */
export function preloadWorkoutMusic(): Promise<Tone> {
  tonePromise ??= import("tone");
  tonePromise.catch(() => {
    tonePromise = null;
  });
  return tonePromise;
}

/** Call after a tap has unlocked audio (see unlockAudio). */
export async function createWorkoutMusic(): Promise<WorkoutMusic> {
  const Tone = await preloadWorkoutMusic();
  const context = getAudioContext();
  if (!context) throw new Error("Web Audio is not supported");
  if (toneContext !== context) {
    Tone.setContext(context);
    toneContext = context;
  }

  const transport = Tone.getTransport();
  const nodes: { dispose: () => unknown }[] = [];
  function track<T extends { dispose: () => unknown }>(node: T): T {
    nodes.push(node);
    return node;
  }

  // Master bus: everything → filter (for rests) → glue → fade.
  const fade = track(new Tone.Gain(0)).toDestination();
  const limiter = track(new Tone.Limiter(-2)).connect(fade);
  const compressor = track(
    new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.01, release: 0.2 }),
  ).connect(limiter);
  const bus = track(
    new Tone.Filter({ type: "lowpass", frequency: OPEN_FILTER_HZ, rolloff: -24 }),
  ).connect(compressor);

  const kick = track(
    new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
      volume: -2,
    }),
  ).connect(bus);

  const clapReverb = track(new Tone.Reverb({ decay: 1.2, wet: 0.25 })).connect(
    bus,
  );
  const clapFilter = track(
    new Tone.Filter({ type: "bandpass", frequency: 1_500, Q: 1 }),
  ).connect(clapReverb);
  const clap = track(
    new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
      volume: -6,
    }),
  ).connect(clapFilter);

  const hatFilter = track(
    new Tone.Filter({ type: "highpass", frequency: 8_000 }),
  ).connect(bus);
  const hat = track(
    new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
      volume: -10,
    }),
  ).connect(hatFilter);

  const bass = track(
    new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      filter: { type: "lowpass", Q: 2 },
      filterEnvelope: {
        attack: 0.005,
        decay: 0.15,
        sustain: 0.2,
        baseFrequency: 180,
        octaves: 2.5,
      },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.1 },
      volume: -8,
    }),
  ).connect(bus);

  const padReverb = track(new Tone.Reverb({ decay: 3, wet: 0.35 })).connect(bus);
  const padChorus = track(new Tone.Chorus(4, 2.5, 0.5).start()).connect(
    padReverb,
  );
  const pad = track(
    new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
      envelope: { attack: 0.3, decay: 0.3, sustain: 0.7, release: 1.2 },
      volume: -16,
    }),
  ).connect(padChorus);

  const arpDelay = track(
    new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.3, wet: 0.25 }),
  ).connect(bus);
  const arpFilter = track(
    new Tone.Filter({ type: "lowpass", frequency: 3_000 }),
  ).connect(arpDelay);
  const arp = track(
    new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.1, release: 0.1 },
      volume: -20,
    }),
  ).connect(arpFilter);

  // A noise swell over the last bar leads back into the loop.
  const riserFilter = track(
    new Tone.Filter({ type: "highpass", frequency: 1_000 }),
  ).connect(bus);
  const riser = track(
    new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 1.8, decay: 0.01, sustain: 1, release: 0.05 },
      volume: -22,
    }),
  ).connect(riserFilter);

  await Promise.all([clapReverb.ready, padReverb.ready]);

  let wantDrums = true;
  let drums = true;
  let step = 0;

  function playStep(time: number) {
    const pos = step % STEPS_PER_BAR;
    const pass = Math.floor(step / STEPS_PER_BAR);
    step++;
    const bar =
      pass < BARS ? pass : INTRO_BARS + ((pass - INTRO_BARS) % (BARS - INTRO_BARS));
    // Drums only come back on a bar line, so a set starts on the downbeat.
    if (pos === 0) drums = wantDrums;
    const chord = CHORDS[bar % CHORDS.length];
    const intro = bar < INTRO_BARS;
    const full = drums && !intro;
    const beat = pos % 4 === 0;

    if (pos === 0) pad.triggerAttackRelease(chord.pad, "1m", time, 0.8);

    // The intro keeps a soft kick on 1 and 3 until the full beat lands.
    if (drums && (full ? beat : pos % 8 === 0)) {
      kick.triggerAttackRelease("C1", "8n", time, full ? 1 : 0.6);
    }
    if (full && (pos === 4 || pos === 12)) clap.triggerAttackRelease("16n", time);
    if (pos % 4 === 2) hat.triggerAttackRelease("32n", time, drums ? 0.9 : 0.4);
    else if (drums && !intro && !beat) {
      hat.triggerAttackRelease("32n", time, 0.2 + Math.random() * 0.15);
    }
    if (full && pos % 4 === 2) {
      bass.triggerAttackRelease(chord.bass, "16n", time);
    }
    if (bar >= ARP_FROM_BAR) {
      const note = chord.arp[ARP_PATTERN[pos]];
      arp.triggerAttackRelease(note, "32n", time, drums ? 0.8 : 0.4);
    }
    if (bar === BARS - 1 && drums) {
      if (pos === 0) riser.triggerAttackRelease("1m", time);
      // A roll that builds through the last two beats.
      if (pos >= 8) clap.triggerAttackRelease("32n", time, 0.3 + (pos - 8) * 0.08);
    }
  }

  if (liveCount === 0) {
    transport.stop();
    transport.position = 0;
  }
  liveCount++;
  transport.bpm.value = BPM;
  const eventId = transport.scheduleRepeat(playStep, "16n");

  // Created silent and stopped, so it can load early and start on cue.
  let disposed = false;
  let started = false;
  return {
    setPlaying(playing) {
      if (disposed) return;
      if (playing) {
        if (transport.state !== "started") transport.start("+0.05");
        if (!started) fade.gain.rampTo(MUSIC_LEVEL, FADE_IN_S);
        started = true;
      } else {
        transport.pause();
        pad.releaseAll();
      }
    },
    setIntensity(intensity) {
      if (disposed) return;
      wantDrums = intensity === "set";
      if (!wantDrums) drums = false;
      bus.frequency.rampTo(wantDrums ? OPEN_FILTER_HZ : REST_FILTER_HZ, 1);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      fade.gain.rampTo(0, FADE_OUT_S);
      setTimeout(() => {
        transport.clear(eventId);
        for (const node of nodes) node.dispose();
        liveCount--;
        if (liveCount === 0) transport.stop();
      }, FADE_OUT_S * 1000 + 100);
    },
  };
}

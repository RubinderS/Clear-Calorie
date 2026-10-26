// Gym beats synthesized in the browser to play behind the workout timer; each
// exercise gets a track picked at random. Calm exercises, like meditation, get
// a slow ambient track instead (createCalmMusic).
// Tone.js only loads once music is turned on, and it shares the cue sounds'
// AudioContext so the tap that unlocks cues on iOS unlocks the music too.

import type * as ToneModule from "tone";
import { getAudioContext } from "@/lib/workout-sound";

type Tone = typeof ToneModule;

export type MusicIntensity = "set" | "rest";

export type WorkoutMusic = {
  /** The track playing, e.g. "Dance". */
  name: string;
  setPlaying: (playing: boolean) => void;
  /** Rests drop the drums and muffle the rest; sets bring the drums back. */
  setIntensity: (intensity: MusicIntensity) => void;
  /** Fades out, then frees every node. */
  dispose: () => void;
};

const STEPS_PER_BAR = 16;
// The first pass builds up over the intro; later passes loop the rest.
const INTRO_BARS = 4;
const BARS = 16;

// Music sits at a steady level below the cues, which play on top of it.
const MUSIC_LEVEL = 0.3;
const FADE_IN_S = 0.3;
const FADE_OUT_S = 1;
const OPEN_FILTER_HZ = 18_000;
const REST_FILTER_HZ = 600;

type Chord = { bass: string; pad: string[]; arp: string[] };
type Oscillator = "sine" | "triangle" | "square" | "sawtooth";

/**
 * One loop. Drum and bass patterns are a char per 16th of the bar:
 * "x" hits, "o" is a ghost hat (only with the full beat), "r" is a hat roll
 * of two 32nds (only with the full beat), "." is silent.
 */
type Track = {
  name: string;
  bpm: number;
  /** Delays every other 16th, 0–1. */
  swing: number;
  /** One chord a bar, looping. */
  chords: Chord[];
  kick: string;
  /** The soft kick that carries the intro before the full beat lands. */
  introKick: string;
  clap: string;
  hat: string;
  bass: string;
  /** Which arp note plays on each 16th; -1 rests. */
  arp: number[];
  arpFromBar: number;
  bassOscillator: Oscillator;
  padOscillator: "fatsawtooth" | "fattriangle" | "fatsquare";
  arpOscillator: Oscillator;
  /** A long, tuned 808 kick that plays each chord's root in place of the bass. */
  kick808?: boolean;
};

// Bass sits an octave higher than a club mix would so phone speakers can
// still carry it.
const TRACKS: Track[] = [
  {
    name: "House",
    bpm: 126,
    swing: 0,
    // Am – F – C – G
    chords: [
      { bass: "A2", pad: ["A3", "C4", "E4"], arp: ["A4", "C5", "E5", "A5"] },
      { bass: "F2", pad: ["F3", "A3", "C4"], arp: ["F4", "A4", "C5", "F5"] },
      { bass: "C3", pad: ["G3", "C4", "E4"], arp: ["E4", "G4", "C5", "E5"] },
      { bass: "G2", pad: ["G3", "B3", "D4"], arp: ["D4", "G4", "B4", "D5"] },
    ],
    kick: "x...x...x...x...",
    introKick: "x.......x.......",
    clap: "....x.......x...",
    hat: ".oxo.oxo.oxo.oxo",
    bass: "..x...x...x...x.",
    arp: [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2],
    arpFromBar: 8,
    bassOscillator: "sawtooth",
    padOscillator: "fatsawtooth",
    arpOscillator: "square",
  },
  {
    name: "Techno",
    bpm: 132,
    swing: 0,
    // Em – C – G – D
    chords: [
      { bass: "E2", pad: ["E3", "G3", "B3"], arp: ["E4", "G4", "B4", "E5"] },
      { bass: "C3", pad: ["E3", "G3", "C4"], arp: ["E4", "G4", "C5", "E5"] },
      { bass: "G2", pad: ["D3", "G3", "B3"], arp: ["D4", "G4", "B4", "D5"] },
      { bass: "D3", pad: ["D3", "F#3", "A3"], arp: ["D4", "F#4", "A4", "D5"] },
    ],
    kick: "x...x...x...x...",
    introKick: "x...x...x...x...",
    clap: "....x.......x...",
    hat: "oox.oox.oox.oox.",
    // A rolling bass that ducks out of the kick's way.
    bass: ".xxx.xxx.xxx.xxx",
    arp: [0, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 2],
    arpFromBar: 4,
    bassOscillator: "square",
    padOscillator: "fatsquare",
    arpOscillator: "sawtooth",
  },
  {
    name: "Disco",
    bpm: 122,
    swing: 0,
    // D – A – Bm – G: a bright, major-key lift.
    chords: [
      { bass: "D3", pad: ["F#3", "A3", "D4"], arp: ["D5", "F#5", "A5", "D6"] },
      { bass: "A2", pad: ["E3", "A3", "C#4"], arp: ["C#5", "E5", "A5", "C#6"] },
      { bass: "B2", pad: ["F#3", "B3", "D4"], arp: ["B4", "D5", "F#5", "B5"] },
      { bass: "G2", pad: ["G3", "B3", "D4"], arp: ["B4", "D5", "G5", "B5"] },
    ],
    kick: "x...x...x...x...",
    introKick: "x...x...x...x...",
    clap: "....x.......x...",
    // Open offbeat hats with ghost 16ths in between.
    hat: "o.x.o.x.o.x.o.x.",
    // A bouncing, syncopated disco bass line.
    bass: "x.xx..x.x.xx..x.",
    arp: [0, -1, 2, -1, 1, -1, 3, -1, 0, -1, 2, -1, 3, 2, 1, -1],
    arpFromBar: 4,
    bassOscillator: "square",
    padOscillator: "fatsawtooth",
    arpOscillator: "square",
  },
  {
    name: "Hip hop",
    bpm: 140,
    swing: 0,
    // C – G – Am – F: a triumphant, half-time anthem.
    chords: [
      { bass: "C2", pad: ["E3", "G3", "C4"], arp: ["C5", "E5", "G5", "C6"] },
      { bass: "G2", pad: ["D3", "G3", "B3"], arp: ["B4", "D5", "G5", "B5"] },
      { bass: "A2", pad: ["E3", "A3", "C4"], arp: ["A4", "C5", "E5", "A5"] },
      { bass: "F2", pad: ["F3", "A3", "C4"], arp: ["A4", "C5", "F5", "A5"] },
    ],
    // The 808 kick carries the bass, sliding to each chord's root.
    kick: "x......x..x.....",
    introKick: "x.......x.......",
    clap: "........x.......",
    hat: "x.x.x.rrx.x.x.rr",
    bass: "................",
    arp: [0, -1, -1, 1, -1, -1, 2, -1, 3, -1, -1, 2, -1, -1, 1, -1],
    arpFromBar: 4,
    bassOscillator: "sine",
    padOscillator: "fatsawtooth",
    arpOscillator: "triangle",
    kick808: true,
  },
  {
    name: "Dance",
    bpm: 128,
    swing: 0,
    // E – B – C♯m – A: a euphoric, hands-up anthem.
    chords: [
      { bass: "E2", pad: ["G#3", "B3", "E4"], arp: ["E5", "G#5", "B5", "E6"] },
      { bass: "B2", pad: ["F#3", "B3", "D#4"], arp: ["D#5", "F#5", "B5", "D#6"] },
      { bass: "C#3", pad: ["G#3", "C#4", "E4"], arp: ["C#5", "E5", "G#5", "C#6"] },
      { bass: "A2", pad: ["A3", "C#4", "E4"], arp: ["C#5", "E5", "A5", "C#6"] },
    ],
    kick: "x...x...x...x...",
    introKick: "x...x...x...x...",
    clap: "....x.......x...",
    hat: "oox.oox.oox.oox.",
    // A pumping offbeat bass between the kicks.
    bass: "..x...x...x...x.",
    // A driving 16th-note supersaw riff.
    arp: [0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 3, 2, 1, 3, 2],
    arpFromBar: 4,
    bassOscillator: "sawtooth",
    padOscillator: "fatsawtooth",
    arpOscillator: "sawtooth",
  },
];

/** Track names, for previewing a specific one. */
export const MUSIC_TRACKS = TRACKS.map((track) => track.name);

let lastTrack = -1;

/** A random track, never the one the last exercise played. */
function pickTrack(): Track {
  const choices = lastTrack < 0 ? TRACKS.length : TRACKS.length - 1;
  let index = Math.floor(Math.random() * choices);
  if (lastTrack >= 0 && index >= lastTrack) index++;
  lastTrack = index;
  return TRACKS[index];
}

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

/** Tone.js on the cue sounds' AudioContext. */
async function loadTone(): Promise<Tone> {
  const Tone = await preloadWorkoutMusic();
  const context = getAudioContext();
  if (!context) throw new Error("Web Audio is not supported");
  if (toneContext !== context) {
    Tone.setContext(context);
    toneContext = context;
  }
  return Tone;
}

/**
 * Call after a tap has unlocked audio (see unlockAudio). Plays a random track
 * unless one is named.
 */
export async function createWorkoutMusic(
  trackName?: string,
): Promise<WorkoutMusic> {
  const Tone = await loadTone();
  const song = TRACKS.find((track) => track.name === trackName) ?? pickTrack();

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
    new Tone.MembraneSynth(
      song.kick808
        ? {
            pitchDecay: 0.04,
            octaves: 3,
            envelope: { attack: 0.001, decay: 0.9, sustain: 0.2, release: 0.4 },
            volume: 0,
          }
        : {
            pitchDecay: 0.05,
            octaves: 6,
            envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
            volume: -2,
          },
    ),
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
      oscillator: { type: song.bassOscillator },
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
      oscillator: { type: song.padOscillator, count: 3, spread: 30 },
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
      oscillator: { type: song.arpOscillator },
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
    const chord = song.chords[bar % song.chords.length];
    const intro = bar < INTRO_BARS;
    const full = drums && !intro;

    if (pos === 0) pad.triggerAttackRelease(chord.pad, "1m", time, 0.8);

    if (full ? song.kick[pos] === "x" : drums && song.introKick[pos] === "x") {
      if (song.kick808) {
        kick.triggerAttackRelease(chord.bass, "4n", time, full ? 1 : 0.6);
      } else {
        kick.triggerAttackRelease("C1", "8n", time, full ? 1 : 0.6);
      }
    }
    if (full && song.clap[pos] === "x") clap.triggerAttackRelease("16n", time);
    if (song.hat[pos] === "x") {
      hat.triggerAttackRelease("32n", time, drums ? 0.9 : 0.4);
    } else if (full && song.hat[pos] === "o") {
      hat.triggerAttackRelease("32n", time, 0.2 + Math.random() * 0.15);
    } else if (full && song.hat[pos] === "r") {
      hat.triggerAttackRelease("64n", time, 0.6);
      hat.triggerAttackRelease("64n", time + transport.toSeconds("32n"), 0.45);
    }
    if (full && song.bass[pos] === "x") {
      bass.triggerAttackRelease(chord.bass, "16n", time);
    }
    const arpNote = song.arp[pos];
    if (bar >= song.arpFromBar && arpNote >= 0) {
      arp.triggerAttackRelease(chord.arp[arpNote], "32n", time, drums ? 0.8 : 0.4);
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
  transport.bpm.value = song.bpm;
  transport.swing = song.swing;
  transport.swingSubdivision = "16n";
  const eventId = transport.scheduleRepeat(playStep, "16n");

  // Created silent and stopped, so it can load early and start on cue.
  let disposed = false;
  let started = false;
  return {
    name: song.name,
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

/** The calm track's name, shown as "Music: Calm". */
export const CALM_TRACK = "Calm";

// One beat a second; each chord holds for two bars, eight seconds.
const CALM_BPM = 60;
const CALM_BARS_PER_CHORD = 2;
const CALM_OPEN_FILTER_HZ = 5_000;
const CALM_REST_FILTER_HZ = 1_200;

// Dmaj9 – Bm11 – Gmaj7 – Asus: soft, unresolved chords over a held D drone.
const CALM_CHORDS = [
  ["D3", "A3", "E4", "F#4"],
  ["B2", "F#3", "A3", "E4"],
  ["G2", "D3", "F#3", "B3"],
  ["A2", "E3", "B3", "D4"],
];
const CALM_DRONE = "D2";
// D major pentatonic, so any bowl note sits well over any chord.
const CALM_BOWL_NOTES = ["D4", "E4", "F#4", "A4", "B4", "D5", "E5", "F#5", "A5"];

/**
 * A slow ambient track for meditation: a held drone, long swelling pads and
 * the odd singing-bowl note, all washed in reverb. No drums, no beat to keep.
 * Call after a tap has unlocked audio (see unlockAudio).
 */
export async function createCalmMusic(): Promise<WorkoutMusic> {
  const Tone = await loadTone();
  const transport = Tone.getTransport();
  const nodes: { dispose: () => unknown }[] = [];
  function track<T extends { dispose: () => unknown }>(node: T): T {
    nodes.push(node);
    return node;
  }

  // Master bus: everything → filter (for rests) → limiter → fade.
  const fade = track(new Tone.Gain(0)).toDestination();
  const limiter = track(new Tone.Limiter(-2)).connect(fade);
  const bus = track(
    new Tone.Filter({ type: "lowpass", frequency: CALM_OPEN_FILTER_HZ, rolloff: -24 }),
  ).connect(limiter);
  const reverb = track(new Tone.Reverb({ decay: 10, wet: 0.6 })).connect(bus);

  const drone = track(
    new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 4, decay: 0, sustain: 1, release: 4 },
      volume: -14,
    }),
  ).connect(reverb);

  // A slow chorus keeps the held pads gently moving.
  const padChorus = track(new Tone.Chorus(0.3, 3.5, 0.4).start()).connect(reverb);
  const pad = track(
    new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fattriangle", count: 3, spread: 12 },
      envelope: { attack: 3, decay: 1, sustain: 0.8, release: 5 },
      volume: -20,
    }),
  ).connect(padChorus);

  // Inharmonic FM partials, struck and left to ring, like a singing bowl.
  const bowl = track(
    new Tone.FMSynth({
      harmonicity: 2.76,
      modulationIndex: 1.5,
      oscillator: { type: "sine" },
      modulation: { type: "sine" },
      envelope: { attack: 0.005, decay: 6, sustain: 0, release: 6 },
      modulationEnvelope: { attack: 0.005, decay: 2, sustain: 0, release: 2 },
      volume: -18,
    }),
  ).connect(reverb);

  await reverb.ready;

  const beatsPerChord = CALM_BARS_PER_CHORD * 4;
  let beat = 0;
  // A new chord swells in on the next beat after starting or resuming.
  let padDue = true;

  function playBeat(time: number) {
    const pos = beat % beatsPerChord;
    const chord = CALM_CHORDS[Math.floor(beat / beatsPerChord) % CALM_CHORDS.length];
    beat++;
    if (pos === 0 || padDue) {
      // Held a little past the change, so each chord fades under the next.
      pad.triggerAttackRelease(chord, beatsPerChord - pos + 0.5, time, 0.7);
      padDue = false;
    }
    // A bowl on each chord change, and now and then between.
    if (pos === 0 || (pos % 2 === 0 && Math.random() < 0.2)) {
      const note = CALM_BOWL_NOTES[Math.floor(Math.random() * CALM_BOWL_NOTES.length)];
      bowl.triggerAttackRelease(note, 0.1, time, pos === 0 ? 0.6 : 0.3 + Math.random() * 0.2);
    }
  }

  if (liveCount === 0) {
    transport.stop();
    transport.position = 0;
  }
  liveCount++;
  transport.bpm.value = CALM_BPM;
  transport.swing = 0;
  const eventId = transport.scheduleRepeat(playBeat, "4n");

  // Created silent and stopped, so it can load early and start on cue.
  let disposed = false;
  let started = false;
  let sounding = false;
  return {
    name: CALM_TRACK,
    setPlaying(playing) {
      if (disposed) return;
      if (playing) {
        if (transport.state !== "started") transport.start("+0.05");
        if (!sounding) drone.triggerAttack(CALM_DRONE, Tone.now());
        sounding = true;
        if (!started) fade.gain.rampTo(MUSIC_LEVEL, FADE_IN_S);
        started = true;
      } else {
        transport.pause();
        pad.releaseAll();
        drone.triggerRelease(Tone.now());
        sounding = false;
        padDue = true;
      }
    },
    setIntensity(intensity) {
      if (disposed) return;
      bus.frequency.rampTo(intensity === "set" ? CALM_OPEN_FILTER_HZ : CALM_REST_FILTER_HZ, 2);
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

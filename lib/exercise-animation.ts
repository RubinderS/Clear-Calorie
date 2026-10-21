import type {ComponentType} from 'react';

/**
 * Timing shared by every exercise animation. The player in
 * components/exercise-animation.tsx owns the clock; each exercise's scene
 * only draws the frame it's given.
 */

/** One phase of a rep, as in the exercise's JSON config. */
export type AnimationPhase = {
  name: string;
  durationMs: number;
  // Rep progress at the phase's start and end, 0 = start pose, 1 = end pose
  from: number;
  to: number;
  cue: string;
};

export type AnimationFrame = {
  phaseIndex: number;
  phase: AnimationPhase;
  /** Linear time through the phase, 0 to 1. */
  phaseT: number;
  /** Eased rep progress, 0 = start pose, 1 = end pose; drive every pose from this. */
  progress: number;
};

/** An exercise's scene: draws the rabbit at one frame. */
export type ExerciseScene = ComponentType<{frame: AnimationFrame}>;

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function cycleMs(phases: readonly AnimationPhase[]): number {
  return phases.reduce((sum, phase) => sum + phase.durationMs, 0);
}

/** The phases stretched or squeezed in proportion so one loop lasts `totalMs`. */
export function scalePhases(
  phases: readonly AnimationPhase[],
  totalMs: number,
): AnimationPhase[] {
  const scale = totalMs / cycleMs(phases);
  return phases.map((phase) => ({...phase, durationMs: phase.durationMs * scale}));
}

/** The frame `timeMs` into the loop; time past the end wraps around. */
export function frameAt(
  phases: readonly AnimationPhase[],
  timeMs: number,
): AnimationFrame {
  const total = cycleMs(phases);
  let time = ((timeMs % total) + total) % total;
  let phaseIndex = 0;
  while (phaseIndex < phases.length - 1 && time >= phases[phaseIndex].durationMs) {
    time -= phases[phaseIndex].durationMs;
    phaseIndex++;
  }
  const phase = phases[phaseIndex];
  const phaseT = Math.min(1, time / phase.durationMs);
  return {
    phaseIndex,
    phase,
    phaseT,
    progress: phase.from + (phase.to - phase.from) * easeInOut(phaseT),
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

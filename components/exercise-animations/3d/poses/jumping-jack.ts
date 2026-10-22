import type {AnimationFrame} from '@/lib/exercise-animation';
import {frontStance, jackArms} from '../moves/stance';
import {skeleton} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +z, the middle of the hips over the origin. */

/** Highest point of each hop. */
export const HOP = 0.22;
/** Each leg's spread from vertical at full stretch. */
export const LEG_SPREAD_DEG = 20;

/** The hop at a frame: a smooth arc through each jump out and in, none while landed. */
export function hopAt(frame: AnimationFrame): number {
  const moving = frame.phase.from !== frame.phase.to;
  return moving ? HOP * Math.sin(Math.PI * frame.phaseT) : 0;
}

/**
 * The rabbit at a point in the rep: 0 = feet together, arms down; 1 = feet
 * wide, arms overhead. `hop` lifts it off the floor.
 */
export function jumpingJackPose(progress: number, hop = 0): Skeleton {
  // Straight legs: the hips drop as they spread, then rise for the hop.
  const {body, legs, feet} = frontStance(LEG_SPREAD_DEG * progress, hop);
  return skeleton(body, {
    // The ears bounce a little higher than the head on the hop.
    earLift: hop * 0.15,
    ...jackArms(body, progress),
    legs,
    feet,
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return jumpingJackPose(frame.progress, hopAt(frame));
}

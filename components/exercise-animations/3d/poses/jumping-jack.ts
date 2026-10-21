import type {AnimationFrame} from '@/lib/exercise-animation';
import {frontStance} from '../moves/stance';
import {RIG, armTo, frontalSwing, openPaw, skeleton, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +z, the middle of the hips over the origin. */

/** Highest point of each hop. */
export const HOP = 0.22;
/** Each leg's spread from vertical, and the arms' swing from hanging down, at full stretch. */
export const LEG_SPREAD_DEG = 20;
export const ARM_START_DEG = 8;
export const ARM_RANGE_DEG = 157;
/** The forearms turn in a little more as the arms rise. */
export const FOREARM_EXTRA_DEG = 7;

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
  const upper = ARM_START_DEG + ARM_RANGE_DEG * progress;
  const lower = upper + FOREARM_EXTRA_DEG * progress;
  const arm = (side: Side) => {
    const shoulder = body.shoulderOf(side);
    const wrist = shoulder.clone()
      .addScaledVector(frontalSwing(body, side, upper), RIG.upperArm)
      .addScaledVector(frontalSwing(body, side, lower), RIG.forearm);
    // The forearm swings further round than the upper arm, so the elbow trails behind on the arc.
    return armTo(shoulder, wrist, frontalSwing(body, side, upper - 90));
  };
  const arms = {left: arm('left'), right: arm('right')};
  return skeleton(body, {
    // The ears bounce a little higher than the head on the hop.
    earLift: hop * 0.15,
    arms,
    legs,
    feet,
    paws: {left: openPaw(arms.left, body.forward), right: openPaw(arms.right, body.forward)},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return jumpingJackPose(frame.progress, hopAt(frame));
}

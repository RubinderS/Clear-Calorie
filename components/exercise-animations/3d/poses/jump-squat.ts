import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {chainAt, legChain, plantedLegs} from '../moves/stance';
import {Y, levelHead, shifted, skeleton, swungArm, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +x, the middle of the planted ankles at the origin. */

/** Joint angles standing tall and at the bottom (see `ChainAngles`): thighs about level. */
export const SQUAT = {
  top: {shin: 3, thigh: 3, lean: 3},
  bottom: {shin: 30, thigh: 88, lean: 38},
};
/** The arms' swing forward of hanging down, in degrees: standing, at the bottom, and how much higher they reach at the top of the jump. */
export const ARM_SWING = {top: 25, bottom: -50, jump: 90};
const ELBOW_BEND = 15;
/** Highest point of the jump. */
export const HOP = 0.3;

/** The jump at a frame: an arc through the jump phase, none on the floor. */
export function hopAt(frame: AnimationFrame): number {
  return frame.phase.name === 'jump' ? HOP * Math.sin(Math.PI * frame.phaseT) : 0;
}

/** The rabbit at a point in the rep: 0 = standing tall, 1 = thighs about level, arms back; `hop` lifts it off the floor. */
export function jumpSquatPose(progress: number, hop = 0): Skeleton {
  const body = legChain(chainAt(SQUAT, progress));
  const swing = lerp(ARM_SWING.top, ARM_SWING.bottom, progress) + ARM_SWING.jump * (hop / HOP);
  const arm = (side: Side) => swungArm(body, side, swing, ELBOW_BEND);
  const left = arm('left');
  const right = arm('right');
  const s = skeleton(body, {
    head: levelHead(body),
    // The ears bounce a little higher than the head on the jump.
    earLift: hop * 0.15,
    arms: {left: left.arm, right: right.arm},
    paws: {left: left.paw, right: right.paw},
    ...plantedLegs(body),
  });
  return hop > 0 ? shifted(s, Y.clone().multiplyScalar(hop)) : s;
}

export function pose(frame: AnimationFrame): Skeleton {
  return jumpSquatPose(frame.progress, hopAt(frame));
}

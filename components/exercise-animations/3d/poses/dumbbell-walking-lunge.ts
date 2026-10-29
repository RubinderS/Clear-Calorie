import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {carryingArms} from '../moves/carry';
import {FOOT, HIP_HALF, X, Y, bodyFrame, flatFoot, legTo, levelHead, pitchedFoot, skeleton, v} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +x, the hips over the origin. The front foot is the left (near
 * side), the back foot the right, each in line with its hip.
 */

/** Planted front ankle, foot flat. */
export const FRONT_ANKLE = v(0.8, FOOT.ankle, HIP_HALF);
/** The back foot up on its toes behind. */
export const BACK_ANKLE = v(-0.78, 0.28, -HIP_HALF);
/** How far the back heel lifts: the foot's tip forward of flat, in degrees. */
export const BACK_FOOT_PITCH = 40;
/** The hips drop straight down between the feet: from the stepped-out lunge to the back knee just above the floor. */
export const HIP_Y = {top: 1.04, bottom: 0.76};
/** The torso a touch forward of upright, in degrees. */
const LEAN_DEG = 1.7;

/** The rabbit at a point in the rep: 0 = top of the lunge, 1 = back knee just above the floor. */
export function walkingLungePose(progress: number): Skeleton {
  const lean = THREE.MathUtils.degToRad(LEAN_DEG);
  const body = bodyFrame(v(0, lerp(HIP_Y.top, HIP_Y.bottom, progress), 0), v(Math.sin(lean), Math.cos(lean), 0), X);
  // The front knee bends forward over the foot; the back knee drops towards the floor.
  const legs = {
    left: legTo(body.hipOf('left'), FRONT_ANKLE, X),
    right: legTo(body.hipOf('right'), BACK_ANKLE, X.clone().addScaledVector(Y, -2)),
  };
  return skeleton(body, {
    head: levelHead(body),
    ...carryingArms(body),
    legs,
    feet: {left: flatFoot(FRONT_ANKLE, X), right: pitchedFoot(BACK_ANKLE, X, BACK_FOOT_PITCH)},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return walkingLungePose(frame.progress);
}

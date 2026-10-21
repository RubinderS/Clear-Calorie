import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {
  FOOT,
  HIP_HALF,
  RIG,
  SHOULDER_HALF,
  SIDE_SIGN,
  X,
  Y,
  armTo,
  bodyFrame,
  flatFoot,
  grippingPaw,
  legTo,
  levelHead,
  pitchedFoot,
  skeleton,
  v,
  type Body,
  type Side,
} from '../rig';
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
/** How far each dumbbell hangs out from the middle: wide enough that its inner plate passes outside the hips. */
export const HAND_HALF = 0.48;

/**
 * Arms hanging straight down, just short of locked, with a dumbbell in each
 * paw: neutral grip, the handles pointing forward and the palms to the legs.
 */
export function carryingArms(body: Body, out = HAND_HALF): Pick<Skeleton, 'arms' | 'paws'> {
  const reach = RIG.upperArm + RIG.forearm - 0.01;
  const arm = (side: Side) => {
    const shoulder = body.shoulderOf(side);
    // Straight under the shoulder, then out to the side, the body's right being level.
    const wide = out - SHOULDER_HALF;
    const hand = shoulder.clone()
      .addScaledVector(body.right, SIDE_SIGN[side] * wide)
      .addScaledVector(Y, -Math.sqrt(reach * reach - wide * wide));
    return armTo(shoulder, hand, X.clone().negate());
  };
  const arms = {left: arm('left'), right: arm('right')};
  const paw = (side: Side) =>
    grippingPaw(arms[side].wrist, X, body.right.clone().multiplyScalar(SIDE_SIGN[side]), Y.clone().negate());
  return {arms, paws: {left: paw('left'), right: paw('right')}};
}

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

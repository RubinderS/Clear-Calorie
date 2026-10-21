import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {RIG, SIDE_SIGN, X, Y, Z, armTo, bodyFrame, grippingPaw, legTo, pitchedFoot, skeleton, v, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +z, hanging from a bar along x, the middle of the hips under the
 * origin. Hanging, there's no floor in view.
 */

/** The bar: high up, and in front of the shoulders so the face rises past it rather than into it. */
export const BAR = {y: 3.6, z: 0.45, length: 2.2};
/** Wide overhand grip: each hand this far from the middle, planted on the bar. */
export const GRIP_HALF = 0.7;
/** The middle of the shoulders below the bar at a dead hang (arms long) and at the top (chin just over the bar). */
export const SHOULDER_BELOW_BAR = {bottom: 0.98, top: 0.08};
/** The legs hang straight down, the feet together and the toes pointing down. */
const ANKLE_IN = 0.03;
const TOE_POINT_DEG = 50;

/** Where each hand grips the bar. */
export function handOnBar(side: Side): THREE.Vector3 {
  return v(SIDE_SIGN[side] * GRIP_HALF, BAR.y, BAR.z);
}

/** The rabbit at a point in the rep: 0 = dead hang, 1 = chin over the bar. */
export function pullUpPose(progress: number): Skeleton {
  const shoulderY = BAR.y - lerp(SHOULDER_BELOW_BAR.bottom, SHOULDER_BELOW_BAR.top, progress);
  const body = bodyFrame(v(0, shoulderY - RIG.torso, 0), Y, Z);
  // Hands stay on the bar; the elbows bend out and drive down.
  const elbows = (side: Side) => body.right.clone().multiplyScalar(SIDE_SIGN[side]).addScaledVector(Y, -0.5);
  const arm = (side: Side) => armTo(body.shoulderOf(side), handOnBar(side), elbows(side));
  const arms = {left: arm('left'), right: arm('right')};
  // Overhand: palms facing away, so the palm is on the rabbit's side of the bar and the fingers wrap over the top.
  const paw = (side: Side) => {
    const {elbow, wrist} = arms[side];
    return grippingPaw(wrist, X, Z.clone().negate(), wrist.clone().sub(elbow));
  };
  const leg = (side: Side) => {
    const hip = body.hipOf(side);
    const ankle = hip.clone().addScaledVector(Y, -Math.sqrt((RIG.thigh + RIG.shin - 1e-9) ** 2 - ANKLE_IN ** 2))
      .addScaledVector(body.right, -SIDE_SIGN[side] * ANKLE_IN);
    return legTo(hip, ankle, Z);
  };
  const legs = {left: leg('left'), right: leg('right')};
  const foot = (side: Side) => pitchedFoot(legs[side].ankle, Z, TOE_POINT_DEG);
  return skeleton(body, {
    arms,
    legs,
    feet: {left: foot('left'), right: foot('right')},
    paws: {left: paw('left'), right: paw('right')},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return pullUpPose(frame.progress);
}

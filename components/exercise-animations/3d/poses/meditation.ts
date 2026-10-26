import * as THREE from 'three';
import type {AnimationFrame} from '@/lib/exercise-animation';
import {FOOT, HIP_HALF, RIG, X, Y, Z, armTo, bodyFrame, legTo, levelHead, openPaw, skeleton, turn, v, type Side} from '../rig';
import type {Contact3D, Leg3D, Skeleton} from '../skeleton';

/**
 * Facing +z, sitting cross-legged on the floor over the origin: the knees
 * out wide, each shin folded in across the front, the right one resting in
 * front of and a little above the left. The hands rest on the knees. Only the
 * breath moves it: the chest lifts tall on the in-breath and settles a
 * touch forward on the out-breath.
 */

/** The middle of the hips: sitting on the floor, the shorts just clear of it. */
export const SEAT = v(0, 0.19, 0);
/** How far the torso settles forward on the out-breath (progress 0) and on the in-breath (1), in degrees. */
export const LEAN = {out: 4, in: 0};
/** The eyes soft and lowered, lifting a little with the in-breath. */
const NOD = {out: 14, in: 8};

/**
 * Each thigh out to its side and forward, the knee near the floor; each
 * shin folds back in across the front. The left shin tucks in behind,
 * under the right knee; the right shin lies in front of it, a little higher.
 */
const THIGH: Record<Side, THREE.Vector3> = {left: v(-0.55, -0.03, 0.83), right: v(0.55, 0.2, 0.83)};
const SHIN: Record<Side, THREE.Vector3> = {left: v(0.92, 0, -0.4), right: v(-0.99, -0.01, 0.04)};

/** One folded leg: the knee from the thigh's direction, then the ankle in across the front. */
function foldedLeg(side: Side): Leg3D {
  const hip = SEAT.clone().addScaledVector(X, side === 'left' ? -HIP_HALF : HIP_HALF);
  const knee = hip.clone().addScaledVector(THIGH[side].clone().normalize(), RIG.thigh);
  const ankle = knee.clone().addScaledVector(SHIN[side].clone().normalize(), RIG.shin);
  // Bend towards where the knee is, so the IK puts it back exactly there.
  return legTo(hip, ankle, knee.clone().sub(hip.clone().lerp(ankle, 0.5)));
}

/** The foot lies on its outer edge, toes on along the shin, sole turned up and back. */
function tuckedFoot({knee, ankle}: Leg3D): Contact3D {
  const forward = ankle.clone().sub(knee).setY(0).normalize();
  const top = Z.clone().addScaledVector(Y, 0.4);
  const up = top.addScaledVector(forward, -top.dot(forward)).normalize();
  return {at: ankle.clone().addScaledVector(forward, FOOT.forward), forward, up};
}

export const LEGS = {left: foldedLeg('left'), right: foldedLeg('right')};
const FEET = {left: tuckedFoot(LEGS.left), right: tuckedFoot(LEGS.right)};
/** How far the paw sits above the knee joint to rest on top of it: the leg's thickness plus the paw's. */
const ON_KNEE = 0.2;
/** Where each wrist rests: on top of its knee. */
export const REST: Record<Side, THREE.Vector3> = {
  left: LEGS.left.knee.clone().addScaledVector(Y, ON_KNEE),
  right: LEGS.right.knee.clone().addScaledVector(Y, ON_KNEE),
};

/** The rabbit at a point in the breath: 0 = breathed out, 1 = breathed in. */
export function meditationPose(progress: number): Skeleton {
  const lean = THREE.MathUtils.lerp(LEAN.out, LEAN.in, progress);
  // About +x a positive turn tips the top of the torso forward, towards +z.
  const body = bodyFrame(SEAT, turn(Y, X, lean), Z);
  // The elbows hang soft, a little out and back from the sides.
  const arm = (side: Side) => {
    const out = X.clone().multiplyScalar(side === 'left' ? -1 : 1);
    return armTo(body.shoulderOf(side), REST[side], out.addScaledVector(Z, -1));
  };
  const arms = {left: arm('left'), right: arm('right')};
  return skeleton(body, {
    head: levelHead(body, THREE.MathUtils.lerp(NOD.out, NOD.in, progress)),
    arms,
    legs: LEGS,
    feet: FEET,
    paws: {left: openPaw(arms.left, Y), right: openPaw(arms.right, Y)},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return meditationPose(frame.progress);
}

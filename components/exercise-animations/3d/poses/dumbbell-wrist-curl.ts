import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {
  FOOT,
  HIP_HALF,
  RIG,
  SIDE_SIGN,
  X,
  Y,
  bodyFrame,
  flatFoot,
  grippingPaw,
  legTo,
  levelHead,
  skeleton,
  v,
  type Side,
} from '../rig';
import type {Arm3D, Skeleton} from '../skeleton';

/**
 * Facing +x, sitting on the end of a flat bench with the hips over the
 * origin, leaning forward with the forearms level across the knees.
 */

/** The bench, front to back along x. */
export const BENCH = {left: -1.2, right: 0.2, top: 0.53, bottom: 0.39};
/** Planted ankles: knees bent, feet flat on the floor. */
export const ANKLES = {
  left: v(0.65, FOOT.ankle, HIP_HALF),
  right: v(0.65, FOOT.ankle, -HIP_HALF),
} satisfies Record<Side, THREE.Vector3>;
/** Leaning forward over the thighs, in degrees from upright. */
export const LEAN_DEG = 50;
export const BODY = bodyFrame(
  v(0, 0.75, 0),
  v(Math.sin(THREE.MathUtils.degToRad(LEAN_DEG)), Math.cos(THREE.MathUtils.degToRad(LEAN_DEG)), 0),
  X,
);
/** The hand's angle at the wrist, in degrees below level: hanging down, then curled up. */
export const HAND_DEG = {bottom: 55, top: -40};
/** Wrist to the dumbbell's handle, closed in the fingers. */
export const HAND = 0.17;
/** How far out each forearm lies: over its thigh, and far enough apart that the dumbbells clear each other. */
export const FOREARM_OUT = 0.2;
/** The dumbbells are small: they sit in the curled fingers. */
export const DUMBBELL = {radius: 0.12, handle: 0.26} as const;
/** Eyes on the hands. */
const HEAD_NOD = 30;

const leg = (side: Side) => legTo(BODY.hipOf(side), ANKLES[side], X.clone().add(Y));
/** The forearms rest level across the tops of the knees. */
export const FOREARM_Y = leg('left').knee.y + 0.24;

/** An arm from its shoulder with the forearm lying level on the thigh, pointing forward. */
export function restingArm(side: Side): Arm3D {
  const shoulder = BODY.shoulderOf(side);
  const z = BODY.right.z * SIDE_SIGN[side] * FOREARM_OUT;
  const drop = shoulder.y - FOREARM_Y;
  const across = z - shoulder.z;
  const elbow = v(shoulder.x - Math.sqrt(RIG.upperArm ** 2 - drop ** 2 - across ** 2), FOREARM_Y, z);
  return {shoulder, elbow, wrist: elbow.clone().addScaledVector(X, RIG.forearm)};
}

/** The way the hand points from the wrist at a point in the rep. */
export function handDirection(progress: number): THREE.Vector3 {
  const rad = THREE.MathUtils.degToRad(lerp(HAND_DEG.bottom, HAND_DEG.top, progress));
  return v(Math.cos(rad), -Math.sin(rad), 0);
}

/** The rabbit at a point in the rep: 0 = wrists bent down, 1 = curled up. */
export function wristCurlPose(progress: number): Skeleton {
  const arms = {left: restingArm('left'), right: restingArm('right')};
  const hand = handDirection(progress);
  // Palms up: the palm under the handle as the hand curls it up, the fingers round the far side.
  const palm = v(-hand.y, hand.x, 0).negate();
  const paw = (side: Side) =>
    grippingPaw(arms[side].wrist.clone().addScaledVector(hand, HAND), BODY.right, palm, hand);
  return skeleton(BODY, {
    head: levelHead(BODY, HEAD_NOD),
    arms,
    legs: {left: leg('left'), right: leg('right')},
    feet: {left: flatFoot(ANKLES.left, X), right: flatFoot(ANKLES.right, X)},
    paws: {left: paw('left'), right: paw('right')},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return wristCurlPose(frame.progress);
}

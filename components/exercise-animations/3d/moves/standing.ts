import * as THREE from 'three';
import {lerp} from '@/lib/exercise-animation';
import {
  FOOT,
  HIP_HALF,
  RIG,
  SIDE_SIGN,
  X,
  Y,
  armTo,
  bodyFrame,
  flatFoot,
  grippingPaw,
  legTo,
  levelHead,
  skeleton,
  v,
  type Side,
} from '../rig';
import type {Arm3D, Contact3D, Skeleton} from '../skeleton';

/**
 * Standing tall, facing +x, the middle of the planted ankles at the origin
 * with the toes straight ahead and the knees soft. The upper arms hang
 * pinned by the sides, so the forearms can curl, push down or hold weights.
 * The curls, the calf raise and the standing band work share it.
 */

/** Planted ankles, hip-width; the feet stay flat. */
export const ANKLES = {
  left: v(0, FOOT.ankle, HIP_HALF),
  right: v(0, FOOT.ankle, -HIP_HALF),
} satisfies Record<Side, THREE.Vector3>;
/** Standing tall over the feet, knees soft. */
export const BODY = bodyFrame(v(-0.04, 1.35, 0), Y, X);
/** The upper arm hangs a touch forward, in degrees, and just out from the body, and stays pinned there. */
const UPPER_ARM_DEG = 4;
const UPPER_ARM_OUT = 0.13;
/** A curl's forearm swing forward from hanging down: arms long, up to the shoulder. */
export const CURL_DEG = {bottom: 10, top: 140};
/**
 * The carrying angle: palms forward with the arm long, the forearm angles
 * out from the elbow. It fades as the forearm comes up in front.
 */
const CARRY = 0.3;

const rad = THREE.MathUtils.degToRad;

/** Standing tall: the legs, feet and head. */
export function standingTall(): Omit<Parameters<typeof skeleton>[1], 'arms' | 'paws'> {
  const leg = (side: Side) => legTo(BODY.hipOf(side), ANKLES[side], X);
  return {
    head: levelHead(BODY),
    legs: {left: leg('left'), right: leg('right')},
    feet: {left: flatFoot(ANKLES.left, X), right: flatFoot(ANKLES.right, X)},
  };
}

/** Where each elbow is pinned by the side. */
export function elbowOf(side: Side): THREE.Vector3 {
  const direction = BODY.forward.clone().multiplyScalar(Math.sin(rad(UPPER_ARM_DEG)))
    .addScaledVector(BODY.up, -Math.cos(rad(UPPER_ARM_DEG)))
    .addScaledVector(BODY.right, SIDE_SIGN[side] * UPPER_ARM_OUT)
    .normalize();
  return BODY.shoulderOf(side).addScaledVector(direction, RIG.upperArm);
}

/** Square to the forearm, in the plane it swings in: the way the inside of the forearm faces. */
export function forearmFront(deg: number): THREE.Vector3 {
  return X.clone().multiplyScalar(Math.cos(rad(deg))).addScaledVector(Y, Math.sin(rad(deg)));
}

/**
 * An arm from `shoulder` with the elbow pinned at `elbow` and the forearm
 * swung `deg` forward (+x) from hanging straight down, angled `out` by the
 * carrying angle (`carry` across for each unit down, fading as it rises).
 */
export function pinnedArm(shoulder: THREE.Vector3, elbow: THREE.Vector3, deg: number, out: THREE.Vector3, carry = CARRY): Arm3D {
  const swing = X.clone().multiplyScalar(Math.sin(rad(deg)))
    .addScaledVector(Y, -Math.cos(rad(deg)))
    .addScaledVector(out, carry * (1 + Math.cos(rad(deg))) / 2)
    .normalize();
  // The elbow stays where it's pinned: bend it towards there.
  return armTo(shoulder, elbow.clone().addScaledVector(swing, RIG.forearm), elbow.clone().sub(shoulder));
}

/** An arm with the elbow pinned by the side and the forearm swung `deg` forward from hanging down. */
export function armAtSide(side: Side, deg: number, carry = CARRY): Arm3D {
  return pinnedArm(BODY.shoulderOf(side), elbowOf(side), deg, BODY.right.clone().multiplyScalar(SIDE_SIGN[side]), carry);
}

/**
 * Underhand: the handle across the palm, square to the forearm, the palm on
 * its inside and the fingers wrapping round the outside.
 */
export function underhandPaw(arm: Arm3D, _side: Side, deg: number): Contact3D {
  const along = arm.wrist.clone().sub(arm.elbow).normalize();
  const across = BODY.right.clone().addScaledVector(along, -BODY.right.dot(along));
  return grippingPaw(arm.wrist, across, forearmFront(deg).negate(), along);
}

/** Neutral grip: thumbs up, the handle square to the forearm in the plane it swings in, the palm on its outside. */
export function neutralPaw(arm: Arm3D, side: Side, deg: number): Contact3D {
  const outward = BODY.right.clone().multiplyScalar(SIDE_SIGN[side]);
  return grippingPaw(arm.wrist, forearmFront(deg), outward, arm.wrist.clone().sub(arm.elbow));
}

/**
 * A standing curl at a point in the rep, with a paw from `paw` on each arm:
 * 0 = arms long by the sides, 1 = dumbbells curled to the shoulders.
 */
export function curlWith(progress: number, paw: (arm: Arm3D, side: Side, deg: number) => Contact3D): Skeleton {
  const deg = lerp(CURL_DEG.bottom, CURL_DEG.top, progress);
  const arms = {left: armAtSide('left', deg), right: armAtSide('right', deg)};
  return skeleton(BODY, {
    ...standingTall(),
    arms,
    paws: {left: paw(arms.left, 'left', deg), right: paw(arms.right, 'right', deg)},
  });
}

import * as THREE from 'three';
import {FOOT, HIP_HALF, X, Y, bodyFrame, flatFoot, legTo, lookingUp, skeleton, v, type Body, type Side} from '../rig';
import {SIZES} from '../rabbit-3d';
import type {Skeleton} from '../skeleton';

/**
 * Lying back on a bench: flat on the back (head towards -x, the chest facing
 * up), or sitting back on an incline (facing +x). The hips are over the
 * origin and the feet flat on the floor. The bench press and fly share the
 * flat bench; the incline curl and press share the incline.
 */

/** The flat bench's pad, along x. */
export const FLAT_BENCH = {left: -2, right: 0.2, top: 0.65, bottom: 0.51};
/** Lying flat: the torso line sits the waist's depth above the pad. */
export const LYING = bodyFrame(
  v(0, FLAT_BENCH.top + SIZES.torso.radius * SIZES.torso.depth + 0.015, 0),
  X.clone().negate(),
  Y,
);
/** Lying flat, the ankles planted with the knees bent about a right angle, a little wider than the hips. */
export const LYING_ANKLES = {
  left: v(0.62, FOOT.ankle, 0.25),
  right: v(0.62, FOOT.ankle, -0.25),
} satisfies Record<Side, THREE.Vector3>;
/** Head on the bench, chin a little tucked, eyes on the hands: looking this far above level towards the feet. */
const LYING_HEAD_DEG = 65;
/** The head rests on the pad: this far up off the line of the torso. */
const LYING_HEAD_AHEAD = 0.07;

/** Lying flat on the bench: the legs, feet and head. */
export function lyingOnBench(): Omit<Parameters<typeof skeleton>[1], 'arms' | 'paws'> {
  // The knees point up.
  const leg = (side: Side) => legTo(LYING.hipOf(side), LYING_ANKLES[side], Y);
  return {
    head: lookingUp(LYING, LYING_HEAD_DEG, LYING_HEAD_AHEAD),
    legs: {left: leg('left'), right: leg('right')},
    feet: {left: flatFoot(LYING_ANKLES.left, X), right: flatFoot(LYING_ANKLES.right, X)},
  };
}

/** Sitting back on an incline, the ankles planted with the knees bent. */
export const SEATED_ANKLES = {
  left: v(0.64, FOOT.ankle, HIP_HALF),
  right: v(0.64, FOOT.ankle, -HIP_HALF),
} satisfies Record<Side, THREE.Vector3>;
/** The head rests on the back pad: this far forward of where it sits on the neck. */
export const SEATED_HEAD_AHEAD = 0.04;

/** The body sitting back on a bench whose back pad is `incline` degrees above the floor, the hips in its corner. */
export function inclineBody(incline: number): Body {
  const rad = THREE.MathUtils.degToRad(incline);
  // The thighs slope down from the hips to rest on the seat.
  return bodyFrame(v(0, 0.87, 0), v(-Math.cos(rad), Math.sin(rad), 0), X);
}

/** Sitting on the seat: the legs and feet. */
export function seatedLegs(body: Body): Pick<Skeleton, 'legs' | 'feet'> {
  const leg = (side: Side) => legTo(body.hipOf(side), SEATED_ANKLES[side], X);
  return {
    legs: {left: leg('left'), right: leg('right')},
    feet: {left: flatFoot(SEATED_ANKLES.left, X), right: flatFoot(SEATED_ANKLES.right, X)},
  };
}

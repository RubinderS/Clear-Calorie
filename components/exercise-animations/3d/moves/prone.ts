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
  legTo,
  levelHead,
  openPaw,
  skeleton,
  v,
  type Body,
  type Side,
} from '../rig';
import {SIZES} from '../rabbit-3d';
import type {Contact3D, Skeleton} from '../skeleton';

/**
 * Face down on the floor, the head towards +x, the toes planted either side
 * of the origin. The straight body pivots about the toes. The push-ups and
 * the plank share it.
 */

/** The planted ankles, hip-width so the straight legs line up with the hips. */
export const ANKLES = {
  left: v(0, FOOT.ankle, HIP_HALF),
  right: v(0, FOOT.ankle, -HIP_HALF),
} satisfies Record<Side, THREE.Vector3>;
/** Toes tucked under: each foot stands on its toes, tipped this far from flat, its middle beside the ankle. */
const TOE_TUCK_DEG = 50;

const rad = THREE.MathUtils.degToRad;

/** The straight body at `deg` above the floor, from the planted toes up to the head. */
export function proneBody(deg: number): Body {
  const along = v(Math.cos(rad(deg)), Math.sin(rad(deg)), 0);
  const hip = v(0, FOOT.ankle, 0).addScaledVector(along, RIG.thigh + RIG.shin);
  // The chest faces the floor.
  return bodyFrame(hip, along, v(Math.sin(rad(deg)), -Math.cos(rad(deg)), 0));
}

/** Straight legs to the planted toes, the feet tucked under. */
export function proneLegs(body: Body): Pick<Skeleton, 'legs' | 'feet'> {
  // Dead straight: any bend would point the knees at the floor.
  const leg = (side: Side) => legTo(body.hipOf(side), ANKLES[side], body.forward);
  const foot = (side: Side): Contact3D => {
    const tip = rad(TOE_TUCK_DEG);
    return {
      at: ANKLES[side].clone().add(v(-0.04, 0.015, 0)),
      forward: v(Math.cos(tip), -Math.sin(tip), 0),
      up: v(Math.sin(tip), Math.cos(tip), 0),
    };
  };
  return {
    legs: {left: leg('left'), right: leg('right')},
    feet: {left: foot('left'), right: foot('right')},
  };
}

/** A push-up's set-up: the hands' place and the body's angle at the top and bottom. */
export type PushUpSetup = {
  /** How far forward of the toes, and out from the middle, the hands are planted. */
  hands: {x: number; out: number};
  /** Body angle above the floor: arms straight at the top, chest near the floor at the bottom. */
  deg: {top: number; bottom: number};
  /** Which way the elbows bend, from the shoulder: back towards the feet, and how far out and up. */
  elbows: {out: number; up: number};
};

/** The planted hand on `side`: its wrist sits a paw's height above the floor. */
export function handOf(setup: PushUpSetup, side: Side): THREE.Vector3 {
  return v(setup.hands.x, SIZES.paw, -SIDE_SIGN[side] * setup.hands.out);
}

export function bodyAngle(setup: PushUpSetup, progress: number): number {
  return lerp(setup.deg.top, setup.deg.bottom, progress);
}

/** A high plank: hands under the shoulders, arms long, heels to head in one straight line. The mountain climber and plank jack hold it. */
export const HIGH_PLANK: PushUpSetup = {
  hands: {x: 2.13, out: 0.3},
  deg: {top: 27.8, bottom: 27.8},
  elbows: {out: 0.6, up: 0.5},
};

/** The rabbit at a point in a push-up: 0 = the top, 1 = the bottom. */
export function pushUpWith(setup: PushUpSetup, progress: number): Skeleton {
  const deg = bodyAngle(setup, progress);
  const body = proneBody(deg);
  const elbows = (side: Side) => X.clone().negate()
    .addScaledVector(body.right, SIDE_SIGN[side] * setup.elbows.out)
    .addScaledVector(Y, setup.elbows.up);
  const arm = (side: Side) => armTo(body.shoulderOf(side), handOf(setup, side), elbows(side));
  const arms = {left: arm('left'), right: arm('right')};
  return skeleton(body, {
    // Looking a little ahead along the floor.
    head: levelHead(body, 8 - deg),
    arms,
    ...proneLegs(body),
    paws: {left: openPaw(arms.left, Y), right: openPaw(arms.right, Y)},
  });
}

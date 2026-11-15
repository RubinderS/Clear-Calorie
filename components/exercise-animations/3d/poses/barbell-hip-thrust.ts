import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {SIZES} from '../rabbit-3d';
import {FOOT, RIG, SIDE_SIGN, X, Z, armTo, bodyFrame, flatFoot, grippingPaw, legTo, lookingUp, skeleton, toesOut, v, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +x, lying back with the upper back across the edge of a bench
 * behind (head towards -x), the feet planted in front. The body pivots
 * about the bench's edge: hips down near the floor, then driven up until
 * the torso and thighs are level, the shins upright.
 */

/** The back of the torso, from the line of the torso. */
const DEPTH = SIZES.torso.radius * SIZES.torso.depth;
/** At the top the middle of the hips is here, level with the knees over upright shins. */
const TOP_HIP = v(0, FOOT.ankle + RIG.shin, 0);
/** Where the bench's edge meets the upper back: this far down the torso from the shoulders. */
export const CONTACT_FROM_SHOULDER = 0.25;
/** The bench's edge under the upper back, the point the body pivots about. */
export const PIVOT = v(TOP_HIP.x - RIG.torso + CONTACT_FROM_SHOULDER, TOP_HIP.y - DEPTH, 0);
/** The bench, seen end-on: its pad runs back from the edge, across the body. */
export const BENCH = {left: PIVOT.x - 0.8, right: PIVOT.x, top: PIVOT.y - 0.01, bottom: PIVOT.y - 0.15, width: 1.0};
/** The torso's tilt below level, hips down: at the bottom and at the top. */
export const TILT_DEG = {bottom: 30, top: 0};
/** The planted ankles: under the knees at the top, a little wider than the hips. */
export const ANKLES = {
  left: v(TOP_HIP.x + RIG.thigh, FOOT.ankle, 0.2),
  right: v(TOP_HIP.x + RIG.thigh, FOOT.ankle, -0.2),
} satisfies Record<Side, THREE.Vector3>;
/** The bar across the hip crease: this far up the torso from the hips, and out above its line. */
export const BAR_ON_HIPS = {up: 0.16, out: 0.28} as const;
/** How far each hand grips out from the middle of the bar, outside the hips. */
export const GRIP_HALF = 0.42;
/** Chin tucked: the eyes this far above the line of the torso, towards the knees. */
const GAZE_DEG = 40;
/** The head held up off the bench. */
const HEAD_AHEAD = 0.1;

/** The body at a tilt: the torso pivoted about the bench's edge, its back touching it. */
export function thrustBody(tiltDeg: number) {
  const t = THREE.MathUtils.degToRad(tiltDeg);
  // Shoulders to hips, and the way the chest faces.
  const down = v(Math.cos(t), -Math.sin(t), 0);
  const chest = v(Math.sin(t), Math.cos(t), 0);
  const hip = PIVOT.clone()
    .addScaledVector(down, RIG.torso - CONTACT_FROM_SHOULDER)
    .addScaledVector(chest, DEPTH);
  return bodyFrame(hip, down.negate(), chest);
}

/** The middle of the bar at a point in the rep. */
export function hipThrustBarAt(progress: number): THREE.Vector3 {
  return thrustBody(tiltAt(progress)).at(0, BAR_ON_HIPS.up, BAR_ON_HIPS.out);
}

const tiltAt = (progress: number) => lerp(TILT_DEG.bottom, TILT_DEG.top, progress);

/** The rabbit at a point in the rep: 0 = hips down, 1 = hips up, torso and thighs level. */
export function barbellHipThrustPose(progress: number): Skeleton {
  const tilt = tiltAt(progress);
  const body = thrustBody(tilt);
  const bar = hipThrustBarAt(progress);
  // Arms along the sides to the bar, the elbows soft and out.
  const arm = (side: Side) => {
    const outward = body.right.clone().multiplyScalar(SIDE_SIGN[side]);
    return armTo(body.shoulderOf(side), bar.clone().addScaledVector(outward, GRIP_HALF), outward);
  };
  const arms = {left: arm('left'), right: arm('right')};
  // Palms down on top of the bar, the fingers wrapping over it.
  const paw = (side: Side) =>
    grippingPaw(arms[side].wrist, Z, body.forward, arms[side].wrist.clone().sub(arms[side].elbow));
  // The knees point up.
  const leg = (side: Side) => legTo(body.hipOf(side), ANKLES[side], body.forward.clone().add(X));
  return skeleton(body, {
    // The head moves with the torso: chin tucked, eyes on the knees.
    head: lookingUp(body, GAZE_DEG - tilt, HEAD_AHEAD),
    arms,
    legs: {left: leg('left'), right: leg('right')},
    feet: {left: flatFoot(ANKLES.left, toesOut(X, 'left')), right: flatFoot(ANKLES.right, toesOut(X, 'right'))},
    paws: {left: paw('left'), right: paw('right')},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return barbellHipThrustPose(frame.progress);
}

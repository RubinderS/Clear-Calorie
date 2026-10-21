import * as THREE from 'three';
import {RIG, SIDE_SIGN, X, Y, Z, armTo, bodyFrame, grippingPaw, legTo, pitchedFoot, v, type Body, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Hanging from a bar along z, facing +x, the middle of the shoulders under
 * the origin. Hanging, there's no floor in view. The chin-up and hanging
 * knee raise share it.
 */

/** The bar: high up, a little in front of the shoulders, so the body hangs straight below and the face passes behind it. */
export const BAR = v(0.4, 3.6, 0);
export const BAR_LENGTH = 1.3;
/** At a dead hang, arms long, the middle of the shoulders is this far below the bar. */
export const DEAD_HANG = 1.085;

const rad = THREE.MathUtils.degToRad;

/** A direction `deg` forward of straight down. */
export function downAndForward(deg: number): THREE.Vector3 {
  return X.clone().multiplyScalar(Math.sin(rad(deg))).addScaledVector(Y, -Math.cos(rad(deg)));
}

/** The upright body hanging with the shoulders `below` the bar. */
export function hangingBody(below: number): Body {
  return bodyFrame(v(0, BAR.y - below - RIG.torso, 0), Y, X);
}

/**
 * Both arms reaching up to the bar, `gripHalf` out from the middle, the
 * elbows bending towards `elbows`, and the paws closed round it with the
 * palm on the `palm` side.
 */
export function hangingArms(body: Body, gripHalf: number, elbows: (side: Side) => THREE.Vector3, palm: THREE.Vector3) {
  const arm = (side: Side) =>
    armTo(body.shoulderOf(side), BAR.clone().addScaledVector(body.right, SIDE_SIGN[side] * gripHalf), elbows(side));
  const arms = {left: arm('left'), right: arm('right')};
  const paw = (side: Side) => {
    const {elbow, wrist} = arms[side];
    return grippingPaw(wrist, Z, palm, wrist.clone().sub(elbow));
  };
  return {arms, paws: {left: paw('left'), right: paw('right')}};
}

/** Legs hanging from the hips, the thigh and shin each at a swing forward of straight down, the toes pointed. */
export function hangingLegs(body: Body, thigh: number, shin: number, toePoint: number): Pick<Skeleton, 'legs' | 'feet'> {
  const leg = (side: Side) => {
    const hip = body.hipOf(side);
    const knee = hip.clone().addScaledVector(downAndForward(thigh), RIG.thigh);
    // The knee stays where the thigh puts it: bend it towards there.
    return legTo(hip, knee.clone().addScaledVector(downAndForward(shin), RIG.shin), knee.sub(hip));
  };
  const legs = {left: leg('left'), right: leg('right')};
  const foot = (side: Side) => pitchedFoot(legs[side].ankle, X, toePoint);
  return {legs, feet: {left: foot('left'), right: foot('right')}};
}

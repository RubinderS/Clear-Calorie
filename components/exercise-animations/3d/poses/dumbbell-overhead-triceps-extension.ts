import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {BODY, standingTall} from '../moves/standing';
import {RIG, SIDE_SIGN, X, Y, armTo, openPaw, skeleton, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +x, standing as for the curls. Both hands hold one dumbbell overhead,
 * palms up under its top plate; only the forearms move.
 */

/** The upper arms point up beside the head, back so the elbows clear the ears, in degrees from straight up. */
export const UPPER_ARM_DEG = -28;
/** How far out from the body the upper arms lean, so they pass outside the head. */
const UPPER_ARM_OUT = 0.13;
/** How far the forearms fold back from the line of the upper arms: dumbbell behind the neck, then arms long overhead. */
export const ELBOW_FOLD_DEG = {start: 130, end: 0};
/** Each paw sits this far out from the middle, under the top plate on either side of the handle. */
export const PAW_HALF = 0.15;
/** A smaller plate than the curls' dumbbell, so the forearms pass outside it as they come together under it. */
export const DUMBBELL = {radius: 0.12, handle: 0.34} as const;
/** The dumbbell hangs upright with its middle this far below the paws, so its top plate rests on them. */
export const DUMBBELL_BELOW_PAWS = 0.02;

const rad = THREE.MathUtils.degToRad;

/** The upper arm's way up from the shoulder on `side`. */
function upperArm(side: Side): THREE.Vector3 {
  return X.clone().multiplyScalar(Math.sin(rad(UPPER_ARM_DEG)))
    .addScaledVector(Y, Math.cos(rad(UPPER_ARM_DEG)))
    .addScaledVector(BODY.right, SIDE_SIGN[side] * UPPER_ARM_OUT)
    .normalize();
}

/** Each elbow, held still overhead. */
export function elbowOf(side: Side): THREE.Vector3 {
  return BODY.shoulderOf(side).addScaledVector(upperArm(side), RIG.upperArm);
}

/** The paw on `side` at a point in the rep: 0 = dumbbell behind the neck, 1 = arms long overhead. */
export function handAt(progress: number, side: Side): THREE.Vector3 {
  const elbow = elbowOf(side);
  // The paws stay together under the plate, so the forearm angles in to meet it.
  const inward = SIDE_SIGN[side] * PAW_HALF - elbow.dot(BODY.right);
  const deg = UPPER_ARM_DEG - lerp(ELBOW_FOLD_DEG.start, ELBOW_FOLD_DEG.end, progress);
  const inPlane = Math.sqrt(RIG.forearm ** 2 - inward ** 2);
  return elbow
    .addScaledVector(X, Math.sin(rad(deg)) * inPlane)
    .addScaledVector(Y, Math.cos(rad(deg)) * inPlane)
    .addScaledVector(BODY.right, inward);
}

/** The middle of the dumbbell at a point in the rep. */
export function dumbbellAt(progress: number): THREE.Vector3 {
  return handAt(progress, 'left').lerp(handAt(progress, 'right'), 0.5).addScaledVector(Y, -DUMBBELL_BELOW_PAWS);
}

/** The rabbit at a point in the rep: 0 = dumbbell lowered behind the neck, 1 = pressed overhead. */
export function overheadTricepsExtensionPose(progress: number): Skeleton {
  // The elbows stay where they're held: bend them towards there.
  const arm = (side: Side) =>
    armTo(BODY.shoulderOf(side), handAt(progress, side), elbowOf(side).sub(BODY.shoulderOf(side)));
  const arms = {left: arm('left'), right: arm('right')};
  return skeleton(BODY, {
    ...standingTall(),
    arms,
    paws: {left: openPaw(arms.left, Y), right: openPaw(arms.right, Y)},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return overheadTricepsExtensionPose(frame.progress);
}

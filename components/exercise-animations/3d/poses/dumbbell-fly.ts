import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {LYING, lyingOnBench} from '../moves/bench';
import {RIG, SIDE_SIGN, X, Y, armTo, grippingPaw, skeleton, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/** Lying on the bench as for the bench press; only the arms move. */

/** How far the arms open, in degrees from pointing at the ceiling: about level with the chest. */
export const OPEN_DEG = 85;
/** The soft elbow bend, held for the whole rep. */
export const ELBOW_BEND_DEG = 20;
/** The arms lean a little towards the hips, so the dumbbells meet over the chest. */
const UPPER_ARM_LEAN_DEG = 6;
const FOREARM_LEAN_DEG = 10;

const rad = THREE.MathUtils.degToRad;

/** A direction leaning `lean` towards the hips and opened `open` from straight up out to `side`. */
function opened(side: Side, lean: number, open: number): THREE.Vector3 {
  return X.clone().multiplyScalar(Math.sin(rad(lean)))
    .addScaledVector(Y, Math.cos(rad(lean)) * Math.cos(rad(open)))
    .addScaledVector(LYING.right, SIDE_SIGN[side] * Math.cos(rad(lean)) * Math.sin(rad(open)));
}

/** The arm on `side` at a point in the rep: the upper arm opens out to the side, the forearm a soft bend behind it. */
export function flyArm(progress: number, side: Side) {
  const open = lerp(0, OPEN_DEG, progress);
  const shoulder = LYING.shoulderOf(side);
  const elbow = shoulder.clone().addScaledVector(opened(side, UPPER_ARM_LEAN_DEG, open), RIG.upperArm);
  const wrist = elbow.clone().addScaledVector(opened(side, FOREARM_LEAN_DEG, open - ELBOW_BEND_DEG), RIG.forearm);
  // The elbow holds its soft bend: bend it towards where it is.
  return armTo(shoulder, wrist, elbow.sub(shoulder));
}

/** The rabbit at a point in the rep: 0 = dumbbells together over the chest, 1 = arms open wide. */
export function dumbbellFlyPose(progress: number): Skeleton {
  const open = lerp(0, OPEN_DEG, progress);
  const arms = {left: flyArm(progress, 'left'), right: flyArm(progress, 'right')};
  // Neutral grip, the handles along the body: palms in over the chest, palms up when open.
  // The palm is on the side of the handle the arm opens towards.
  const paw = (side: Side) => {
    const {elbow, wrist} = arms[side];
    return grippingPaw(wrist, X, opened(side, 0, open + 90), wrist.clone().sub(elbow));
  };
  return skeleton(LYING, {...lyingOnBench(), arms, paws: {left: paw('left'), right: paw('right')}});
}

export function pose(frame: AnimationFrame): Skeleton {
  return dumbbellFlyPose(frame.progress);
}

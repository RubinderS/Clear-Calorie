import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {ANKLES, BODY, CURL_DEG, armAtSide, standingTall} from '../moves/standing';
import {RIG, SIDE_SIGN, X, Y, armTo, openPaw, skeleton, v} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +x, standing as for the curls. The left arm (the near side) works
 * overhead; the right hangs relaxed with nothing in it.
 */

/** The band is held down under the back edge of the working side's heel, so it runs up behind the ankle. */
export const ANCHOR = v(ANKLES.left.x - 0.12, 0.05, ANKLES.left.z);
/** The working upper arm points up beside the head, a touch back so the face stays clear, in degrees from straight up. */
export const UPPER_ARM_DEG = -20;
/** How far out from the body the upper arm leans, so the elbow sits beside the ear rather than in it. */
const UPPER_ARM_OUT = 0.25;
/** How far the forearm folds back behind the head from the line of the upper arm: hand behind the neck, then straight. */
export const ELBOW_FOLD_DEG = {start: 140, end: 5};
/** As it folds, the hand drops in behind the head towards the middle of the back. */
const HAND_IN = 0.35;

const rad = THREE.MathUtils.degToRad;
const outward = BODY.right.clone().multiplyScalar(SIDE_SIGN.left);

/** A direction `deg` from straight up, positive forward, leaning `out` to the working side. */
function fromUp(deg: number, out: number): THREE.Vector3 {
  return X.clone().multiplyScalar(Math.sin(rad(deg))).addScaledVector(Y, Math.cos(rad(deg))).addScaledVector(outward, out).normalize();
}

/** The working elbow, held still overhead. */
export const ELBOW = BODY.shoulderOf('left').addScaledVector(fromUp(UPPER_ARM_DEG, UPPER_ARM_OUT), RIG.upperArm);

/** The working hand at a point in the rep: 0 = behind the head, 1 = straight up. */
export function handAt(progress: number): THREE.Vector3 {
  const fold = lerp(ELBOW_FOLD_DEG.start, ELBOW_FOLD_DEG.end, progress);
  const share = fold / ELBOW_FOLD_DEG.start;
  return ELBOW.clone().addScaledVector(fromUp(UPPER_ARM_DEG - fold, UPPER_ARM_OUT - HAND_IN * share), RIG.forearm);
}

/** The rabbit at a point in the rep: 0 = hand behind the head, 1 = arm straight overhead. */
export function bandTricepsExtensionPose(progress: number): Skeleton {
  const shoulder = BODY.shoulderOf('left');
  // The elbow stays where it's held: bend it towards there.
  const working = armTo(shoulder, handAt(progress), ELBOW.clone().sub(shoulder));
  const relaxed = armAtSide('right', CURL_DEG.bottom);
  return skeleton(BODY, {
    ...standingTall(),
    arms: {left: working, right: relaxed},
    paws: {left: openPaw(working, X), right: openPaw(relaxed, X)},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return bandTricepsExtensionPose(frame.progress);
}

import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {BODY, standingTall} from '../moves/standing';
import {RIG, SIDE_SIGN, X, Y, armTo, openPaw, skeleton, v, type Side} from '../rig';
import type {Arm3D, Skeleton} from '../skeleton';

/** Facing +x, standing as for the curls; only the arms move. */

/** Where the band is tied to the post: in front of the rabbit, a little above shoulder height. */
export const ANCHOR = v(BODY.shoulder.x + 2.25, BODY.shoulder.y + 0.08, 0);

const rad = THREE.MathUtils.degToRad;

/**
 * The arm on `side` at a point in the rep. The upper arm stays level at
 * shoulder height and swings from pointing forward to pointing out to the
 * side; the elbow bends until the forearm points straight up, hands by the ears.
 */
export function facePullArm(progress: number, side: Side): Arm3D {
  const out = rad(lerp(0, 90, progress));
  const bend = rad(lerp(0, 90, progress));
  const shoulder = BODY.shoulderOf(side);
  const level = X.clone().multiplyScalar(Math.cos(out)).addScaledVector(BODY.right, SIDE_SIGN[side] * Math.sin(out));
  const elbow = shoulder.clone().addScaledVector(level, RIG.upperArm);
  const wrist = elbow.clone()
    .addScaledVector(level, RIG.forearm * Math.cos(bend))
    .addScaledVector(Y, RIG.forearm * Math.sin(bend));
  // The elbow stays level with the shoulder: bend it towards there.
  return armTo(shoulder, wrist, elbow.sub(shoulder));
}

/** The rabbit at a point in the rep: 0 = arms long towards the anchor, 1 = hands pulled back by the ears. */
export function facePullPose(progress: number): Skeleton {
  const arms = {left: facePullArm(progress, 'left'), right: facePullArm(progress, 'right')};
  return skeleton(BODY, {
    ...standingTall(),
    arms,
    paws: {left: openPaw(arms.left, Y), right: openPaw(arms.right, Y)},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return facePullPose(frame.progress);
}

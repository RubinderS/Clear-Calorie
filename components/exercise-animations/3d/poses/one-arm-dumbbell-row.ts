import * as THREE from 'three';
import type {AnimationFrame} from '@/lib/exercise-animation';
import {
  FOOT,
  RIG,
  SHOULDER_HALF,
  SIDE_SIGN,
  X,
  Y,
  armTo,
  bodyFrame,
  flatFoot,
  grippingPaw,
  legTo,
  levelHead,
  lerp3,
  openPaw,
  skeleton,
  v,
} from '../rig';
import {SIZES} from '../rabbit-3d';
import type {Contact3D, Skeleton} from '../skeleton';

/**
 * Facing +x, the hips over the origin, bent over a low flat bench. The
 * right knee and hand rest on the bench; the left foot stands on the floor
 * beside it, and the left arm rows.
 */

/** A low flat bench under the right side of the body, along x. */
export const BENCH = {left: -0.92, right: 1.68, top: 0.53, bottom: 0.39, z: -0.25};
/** Flat back, held at this angle above horizontal for the whole set. */
export const BACK_DEG = 20;
/** The right knee rests on the bench with the thigh upright, so the hips sit a thigh above it. */
export const BODY = bodyFrame(
  v(0, BENCH.top + SIZES.leg + RIG.thigh, 0),
  v(Math.cos(THREE.MathUtils.degToRad(BACK_DEG)), Math.sin(THREE.MathUtils.degToRad(BACK_DEG)), 0),
  X,
);
/** The kneeling knee, under its hip on the bench, with the shin lying flat behind it. */
export const KNEE = BODY.hipOf('right').addScaledVector(Y, -RIG.thigh);
export const KNEELING_ANKLE = KNEE.clone().addScaledVector(X, -RIG.shin);
/** The standing ankle: the left foot on the floor beside the bench. */
export const ANKLE = v(-0.08, FOOT.ankle, 0.3);
/** The right hand, planted on the bench in front of its shoulder. */
export const SUPPORT_HAND = BODY.shoulderOf('right').setY(BENCH.top + SIZES.paw).add(v(0.5, 0, 0.03));
/** How far the rowing hand hangs out from the middle: the dumbbell clear of the hip at the top. */
export const HAND_HALF = 0.5;
/** Where the dumbbell touches at the top: this far up the torso from the hips, beside the waist. */
export const DUMBBELL_PATH = {
  bottom: BODY.shoulder.clone().addScaledVector(Y, -Math.sqrt((RIG.upperArm + RIG.forearm - 0.02) ** 2 - (HAND_HALF - SHOULDER_HALF) ** 2)),
  top: BODY.at(0, 0.45, SIZES.torso.radius * SIZES.torso.depth),
};
/** Neck in line with the back, eyes on the bench a little ahead. */
const HEAD_NOD = 10;

/** The middle of the rowing hand's line at a point in the rep: 0 = arm long, 1 = dumbbell at the hip. */
export function dumbbellAt(progress: number): THREE.Vector3 {
  return lerp3(DUMBBELL_PATH.bottom, DUMBBELL_PATH.top, progress).addScaledVector(BODY.right, SIDE_SIGN.left * HAND_HALF);
}

/** The rabbit at a point in the rep: 0 = arm long, 1 = dumbbell pulled to the hip. */
export function oneArmRowPose(progress: number): Skeleton {
  // The rowing elbow drives back and up past the back; the support arm's elbow bends back too.
  const back = X.clone().negate();
  const rowing = armTo(BODY.shoulderOf('left'), dumbbellAt(progress), back.clone().addScaledVector(Y, 0.6));
  const support = armTo(BODY.shoulderOf('right'), SUPPORT_HAND, back);
  // Neutral grip: the handle fore and aft, square to the forearm; palm facing in, so it's on the outside of the handle.
  const along = rowing.wrist.clone().sub(rowing.elbow).normalize();
  const handle = X.clone().addScaledVector(along, -X.dot(along));
  const grip = grippingPaw(rowing.wrist, handle, BODY.right.clone().multiplyScalar(SIDE_SIGN.left), along);
  // The kneeling foot lies on the bench, toes pointing back.
  const kneelingFoot: Contact3D = {
    at: KNEELING_ANKLE.clone().add(v(-0.08, FOOT.height - SIZES.leg, 0)),
    forward: X.clone().negate(),
    up: Y.clone(),
  };
  return skeleton(BODY, {
    head: levelHead(BODY, HEAD_NOD),
    arms: {left: rowing, right: support},
    legs: {
      left: legTo(BODY.hipOf('left'), ANKLE, X),
      // The kneeling leg folds forward: thigh straight down, shin back along the bench.
      right: legTo(BODY.hipOf('right'), KNEELING_ANKLE, X),
    },
    feet: {left: flatFoot(ANKLE, X), right: kneelingFoot},
    paws: {left: grip, right: openPaw(support, Y)},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return oneArmRowPose(frame.progress);
}

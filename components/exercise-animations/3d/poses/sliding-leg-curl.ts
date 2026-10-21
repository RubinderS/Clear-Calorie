import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {FOOT, HIP_HALF, RIG, SIDE_SIGN, X, Y, armTo, bodyFrame, legTo, openPaw, skeleton, v, type Side} from '../rig';
import {SIZES} from '../rabbit-3d';
import type {Arm3D, Contact3D, Skeleton} from '../skeleton';

/**
 * Lying on the back, the head towards -x, the middle of the shoulders over
 * the origin and planted on the floor; the heels on sliders.
 */

/** The shoulders rest on the floor: the torso line sits the back's depth above it. */
export const SHOULDER = v(0, SIZES.torso.radius * SIZES.torso.depth + 0.02, 0);
/** The hips' lift, in degrees: from a low straight-legged bridge to a high bridge. */
export const BRIDGE_DEG = {start: 4, end: 30};
/** The heels slide in from straight legs to under the knees. */
export const HEEL_IN = 0.5;
/** Arms lying on the floor by the sides, palms down, out past the torso. */
const ARM = {drop: 0.14, out: 0.12};
/** Head resting on the floor behind the shoulders, eyes up and a little towards the feet. */
const HEAD = {at: v(-0.42, SIZES.head.radius + 0.01, 0), deg: 75};

const rad = THREE.MathUtils.degToRad;

/** The middle of the hips at a bridge angle: up from the shoulders along the torso. */
export function hipAt(deg: number): THREE.Vector3 {
  return SHOULDER.clone().add(v(Math.cos(rad(deg)), Math.sin(rad(deg)), 0).multiplyScalar(RIG.torso));
}

const START_HIP = hipAt(BRIDGE_DEG.start);
const END_HIP = hipAt(BRIDGE_DEG.end);
/** The heel's slide along the floor: from straight legs out in front to under the knees. */
export const HEEL_X = {
  start: START_HIP.x + Math.sqrt((RIG.thigh + RIG.shin - 0.001) ** 2 - (FOOT.ankle - START_HIP.y) ** 2),
  end: END_HIP.x + HEEL_IN,
};

/** The heel on `side` at a point in the rep: 0 = legs long, 1 = pulled in. */
export function heelAt(progress: number, side: Side): THREE.Vector3 {
  return v(lerp(HEEL_X.start, HEEL_X.end, progress), FOOT.ankle, -SIDE_SIGN[side] * HIP_HALF);
}

/** An arm flat on the floor by the side, pointing to the feet. */
function armOnFloor(shoulder: THREE.Vector3, side: Side): Arm3D {
  const outward = -SIDE_SIGN[side];
  const elbow = shoulder.clone().add(v(0, -ARM.drop, outward * ARM.out));
  elbow.x += Math.sqrt(RIG.upperArm ** 2 - ARM.drop ** 2 - ARM.out ** 2);
  // The elbow stays on the floor: bend it towards there.
  return armTo(shoulder, elbow.clone().addScaledVector(X, RIG.forearm), elbow.sub(shoulder));
}

/** The rabbit at a point in the rep: 0 = hips up, legs long; 1 = heels pulled in, hips high. */
export function slidingLegCurlPose(progress: number): Skeleton {
  const hip = hipAt(lerp(BRIDGE_DEG.start, BRIDGE_DEG.end, progress));
  // The chest faces the ceiling.
  const body = bodyFrame(hip, SHOULDER.clone().sub(hip), Y);
  const arms = {left: armOnFloor(body.shoulderOf('left'), 'left'), right: armOnFloor(body.shoulderOf('right'), 'right')};
  // The knees bend up towards the ceiling.
  const leg = (side: Side) => legTo(body.hipOf(side), heelAt(progress, side), Y);
  const legs = {left: leg('left'), right: leg('right')};
  // Heel on the slider, toes pointing up.
  const toes = THREE.MathUtils.degToRad(75);
  const foot = (side: Side): Contact3D => ({
    at: legs[side].ankle.clone().add(v(0.07, 0.12, 0)),
    forward: v(Math.cos(toes), Math.sin(toes), 0),
    up: v(-Math.sin(toes), Math.cos(toes), 0),
  });
  const look = rad(HEAD.deg);
  return skeleton(body, {
    head: {
      head: HEAD.at.clone(),
      headForward: v(Math.cos(look), Math.sin(look), 0),
      headUp: v(-Math.sin(look), Math.cos(look), 0),
    },
    arms,
    legs,
    feet: {left: foot('left'), right: foot('right')},
    paws: {left: openPaw(arms.left, Y), right: openPaw(arms.right, Y)},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return slidingLegCurlPose(frame.progress);
}

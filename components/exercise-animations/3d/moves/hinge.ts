import * as THREE from 'three';
import {RIG, SIDE_SIGN, X, armTo, grippingPaw, levelHead, skeleton, type Side} from '../rig';
import {SIZES} from '../rabbit-3d';
import type {Skeleton} from '../skeleton';
import {ANKLES, chainAt, legChain, plantedLegs} from './stance';

/**
 * The Romanian deadlift's hip hinge, facing +x with the middle of the
 * planted ankles at the origin, the weight hanging in the hands. The
 * barbell and dumbbell versions share it.
 */

/**
 * A hip hinge: the knees stay softly bent while the hips push back and the
 * torso tips forward. The shins move back to upright as the thighs tip, so
 * the knee angle barely changes.
 */
export const HINGE = {
  top: {shin: 10, thigh: 5, lean: 2},
  bottom: {shin: 3, thigh: 27, lean: 72},
};
/** The weight slides straight down the front of the legs, just in front of the shins, once it's below the waist. */
export const WEIGHT_X = ANKLES.left.x + 0.18;
/** How far short of straight the arms hang. */
export const ARM_SLACK = 0.02;
/** The neck stays in line with the back: the head nods this share of the torso's lean. */
const NOD = 0.4;

/**
 * The front of the waist, from the line of the torso: the bar can't come
 * closer than this plus its own thickness.
 */
export const WAIST_FRONT = SIZES.torso.radius * SIZES.torso.depth + 0.04;

/**
 * Where a hand `out` from the middle hangs at a point in the rep: straight
 * down the front of the legs, as low as the nearly straight arm reaches. At
 * the top the hands hang by the hips, so the line moves out just enough to
 * pass in front of the waist.
 */
export function handAt(progress: number, side: Side, out: number): THREE.Vector3 {
  const body = legChain(chainAt(HINGE, progress));
  const shoulder = body.shoulderOf(side);
  const reach = RIG.upperArm + RIG.forearm - ARM_SLACK;
  const z = body.right.z * SIDE_SIGN[side] * out;
  const hand = (x: number) => {
    const dx = x - shoulder.x;
    const dz = z - shoulder.z;
    return new THREE.Vector3(x, shoulder.y - Math.sqrt(reach * reach - dx * dx - dz * dz), z);
  };
  // Out onto the front plane of the waist where the hand hangs beside it; the hand's height
  // changes a little as it moves out, so settle it in a few steps.
  let x = WEIGHT_X;
  for (let i = 0; i < 20; i++) {
    const offset = hand(x).sub(body.hip);
    if (offset.dot(body.up) < -SIZES.torso.below) break;
    const next = Math.max(WEIGHT_X, body.hip.x + (WAIST_FRONT - offset.y * body.forward.y) / body.forward.x);
    if (Math.abs(next - x) < 1e-12) break;
    x = next;
  }
  return hand(x);
}

/**
 * The hinge with the hands `out` from the middle, gripping a handle along
 * the bar's axis (the body's right), the elbows `flare` out from pointing
 * back. 0 = standing tall, 1 = hips back, weight below the knees.
 */
export function hingePose(progress: number, out: number, flare = 0.3): Skeleton {
  const angles = chainAt(HINGE, progress);
  const body = legChain(angles);
  // Arms hang nearly straight, the elbows back towards the hips and a little out.
  const elbows = (side: Side) => X.clone().negate().addScaledVector(body.right, SIDE_SIGN[side] * flare);
  const arm = (side: Side) => armTo(body.shoulderOf(side), handAt(progress, side, out), elbows(side));
  const arms = {left: arm('left'), right: arm('right')};
  // Overhand: palms to the thighs, so the palm is on the front of the handle and the fingers wrap under.
  const paw = (side: Side) => {
    const {elbow, wrist} = arms[side];
    return grippingPaw(wrist, body.right, X, wrist.clone().sub(elbow));
  };
  return skeleton(body, {
    head: levelHead(body, NOD * angles.lean),
    arms,
    ...plantedLegs(body),
    paws: {left: paw('left'), right: paw('right')},
  });
}

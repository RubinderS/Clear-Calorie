import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {frontStance} from '../moves/stance';
import {SIDE_SIGN, armTo, grippingPaw, skeleton, type Body, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +z, the middle of the hips over the origin. */

/** Feet about shoulder-width: each leg's spread from vertical. */
export const LEG_SPREAD_DEG = 5;
/**
 * Where each hand is from its shoulder: out to the side, up, and a little in
 * front. At the bottom the dumbbells sit just above the shoulders with the
 * forearms upright; at the top the arms are long, just outside the ears.
 */
export const HAND_FROM_SHOULDER = {
  bottom: {out: 0.6, up: 0.45, forward: 0.06},
  top: {out: 0.28, up: 1.13, forward: 0.06},
};

/** The hips stay still: only the arms move. */
export const BODY: Body = frontStance(LEG_SPREAD_DEG).body;

/** The hand on `side` at a point in the rep: 0 = dumbbells at the shoulders, 1 = locked out. */
export function handAt(progress: number, side: Side): THREE.Vector3 {
  const {bottom, top} = HAND_FROM_SHOULDER;
  return BODY.shoulderOf(side)
    .addScaledVector(BODY.right, SIDE_SIGN[side] * lerp(bottom.out, top.out, progress))
    .addScaledVector(BODY.up, lerp(bottom.up, top.up, progress))
    .addScaledVector(BODY.forward, lerp(bottom.forward, top.forward, progress));
}

/** The rabbit at a point in the rep: 0 = dumbbells at the shoulders, 1 = pressed overhead. */
export function shoulderPressPose(progress: number): Skeleton {
  const {legs, feet} = frontStance(LEG_SPREAD_DEG);
  // Elbows point out to the sides and down, under the wrists.
  const elbows = (side: Side) => BODY.right.clone().multiplyScalar(SIDE_SIGN[side]).sub(BODY.up);
  const arm = (side: Side) => armTo(BODY.shoulderOf(side), handAt(progress, side), elbows(side));
  const arms = {left: arm('left'), right: arm('right')};
  // Palms forward: the handle across, square to the forearm, the palm behind it and the fingers over the top.
  const paw = (side: Side) => {
    const {elbow, wrist} = arms[side];
    const along = wrist.clone().sub(elbow).normalize();
    const across = BODY.right.clone().addScaledVector(along, -BODY.right.dot(along));
    return grippingPaw(wrist, across, BODY.forward.clone().negate(), along);
  };
  return skeleton(BODY, {arms, legs, feet, paws: {left: paw('left'), right: paw('right')}});
}

export function pose(frame: AnimationFrame): Skeleton {
  return shoulderPressPose(frame.progress);
}

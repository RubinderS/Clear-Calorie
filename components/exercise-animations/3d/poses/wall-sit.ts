import * as THREE from 'three';
import {legChain, plantedLegs} from '../moves/stance';
import {RIG, X, Y, armTo, levelHead, openPaw, skeleton, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +x, sitting back against a wall behind: the ankles planted either
 * side of the origin, the shins upright, the thighs level and the back flat
 * on the wall. A hold, so nothing moves.
 */

/** Shins upright, thighs level, the torso tipped back a little to lie flat on the wall. */
export const SIT = {shin: 0, thigh: 90, lean: -5};
export const BODY = legChain(SIT);
/** The wall's face: just behind the tail, which presses into it with the upper back. */
export const WALL_X = BODY.hip.x - 0.35;
/** The wall: up past the tips of the ears and wide enough to frame the rabbit; `centre` puts its face at `WALL_X`. */
export const WALL = {height: 3.5, width: 1.6, thickness: 0.12};
export const WALL_CENTRE = new THREE.Vector3(WALL_X - WALL.thickness / 2, WALL.height / 2, 0);
/** The back of the head rests on the wall, eyes level. */
const HEAD_AHEAD = 0.08;

/** The wall sit: knees over the ankles at 90°, back and head on the wall, arms out in front. */
export function wallSitPose(): Skeleton {
  // Straight out ahead at shoulder height, shoulder width apart, the elbows soft and pointing down.
  const arm = (side: Side) => {
    const shoulder = BODY.shoulderOf(side);
    return armTo(shoulder, shoulder.clone().addScaledVector(X, RIG.upperArm + RIG.forearm - 0.02), Y.clone().negate());
  };
  const arms = {left: arm('left'), right: arm('right')};
  return skeleton(BODY, {
    head: levelHead(BODY, 0, HEAD_AHEAD),
    arms,
    ...plantedLegs(BODY),
    paws: {left: openPaw(arms.left, Y), right: openPaw(arms.right, Y)},
  });
}

/** A hold: every frame is the same pose. */
export function pose(): Skeleton {
  return wallSitPose();
}

import * as THREE from 'three';
import type {AnimationFrame} from '@/lib/exercise-animation';
import {chainAt, legChain, plantedLegs} from '../moves/stance';
import {RIG, SIDE_SIGN, Y, armTo, levelHead, openPaw, skeleton, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +x, the middle of the planted ankles at the origin. */

/** The dumbbell at the chest keeps the torso more upright than a back squat, and lets it sink deeper. */
export const GOBLET = {
  top: {shin: 4, thigh: 4, lean: 4},
  bottom: {shin: 35, thigh: 100, lean: 22},
};
/** Where the hands hold the dumbbell: this far down the torso from the shoulders, and in front of the chest. */
export const AT_CHEST = {down: 0.28, front: 0.44} as const;
/** The paws cup the dumbbell's top end from either side of the handle. */
export const PAW_HALF = 0.1;
/** How far the elbows flare out, as a share of pointing straight down. */
const ELBOW_FLARE = 0.3;
/** A smaller dumbbell than the curls', so the lower plate fits between the forearms. */
export const DUMBBELL = {radius: 0.14, handle: 0.3} as const;
/** The dumbbell sits this far behind the paws, against the chest. */
export const DUMBBELL_BEHIND_PAWS = 0.06;
/** The dumbbell stands upright with its middle this far above the paws, so its top plate rests on them. */
export const DUMBBELL_ABOVE_PAWS = 0.02;

/** The middle of the hands (and dumbbell) at a point in the rep, held against the chest. */
export function gobletAt(progress: number): THREE.Vector3 {
  return legChain(chainAt(GOBLET, progress)).at(0, RIG.torso - AT_CHEST.down, AT_CHEST.front);
}

/** The rabbit at a point in the rep: 0 = standing tall, 1 = deep squat. */
export function gobletSquatPose(progress: number): Skeleton {
  const body = legChain(chainAt(GOBLET, progress));
  const hands = gobletAt(progress);
  // Elbows point down, between the knees at the bottom.
  const elbows = (side: Side) => Y.clone().negate().addScaledVector(body.right, SIDE_SIGN[side] * ELBOW_FLARE);
  const arm = (side: Side) =>
    armTo(body.shoulderOf(side), hands.clone().addScaledVector(body.right, SIDE_SIGN[side] * PAW_HALF), elbows(side));
  const arms = {left: arm('left'), right: arm('right')};
  return skeleton(body, {
    head: levelHead(body),
    arms,
    ...plantedLegs(body),
    paws: {left: openPaw(arms.left, Y), right: openPaw(arms.right, Y)},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return gobletSquatPose(frame.progress);
}

import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {BODY, armAtSide, standingTall} from '../moves/standing';
import {Y, openPaw, skeleton, v, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +x, standing as for the curls, the upper arms pinned by the sides. */

/** Where the band is tied to the post: high up, in front of the rabbit. */
export const ANCHOR = v(BODY.shoulder.x + 1.15, BODY.shoulder.y + 0.7, 0);
/** The forearm's angle forward from hanging down: just above level, then pushed straight down. */
export const FOREARM_DEG = {start: 100, end: 5};

/** The rabbit at a point in the rep: 0 = elbows bent, hands at chest height; 1 = arms pushed straight down. */
export function tricepsPushdownPose(progress: number): Skeleton {
  const deg = lerp(FOREARM_DEG.start, FOREARM_DEG.end, progress);
  // Only the forearms move, straight down under the elbows: no carrying angle with the palms down.
  const arm = (side: Side) => armAtSide(side, deg, 0);
  const arms = {left: arm('left'), right: arm('right')};
  return skeleton(BODY, {
    ...standingTall(),
    arms,
    paws: {left: openPaw(arms.left, Y), right: openPaw(arms.right, Y)},
  });
}

/** The hand on `side` at a point in the rep. */
export function handAt(progress: number, side: Side): THREE.Vector3 {
  return tricepsPushdownPose(progress).paws[side].at;
}

export function pose(frame: AnimationFrame): Skeleton {
  return tricepsPushdownPose(frame.progress);
}

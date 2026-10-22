import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {STANDING, lerpLeg, onTheSpot, spotBody, type LegAngles} from '../moves/on-the-spot';
import {alternate, swungArm} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +x on the spot, the middle of the ankles at the origin, leaning a little forward. */

/** The torso's lean forward, in degrees. */
export const LEAN_DEG = 12;
/** The heel curled up behind: the thigh stays near vertical, the shin comes up past level. */
export const CURL: LegAngles = {thigh: -8, knee: 105, point: 10};
/** The arms reach forward at chest height, then row back, the elbows past the body, as the heel comes up. */
export const ARMS = {
  reach: {swing: 70, bend: 20},
  row: {swing: -30, bend: 120},
};

/** The rabbit at a point in the rep: the left heel curls up and down (0 to 0.5), then the right. */
export function hamstringCurlPose(progress: number): Skeleton {
  const {side, amount} = alternate(progress);
  const legs = {left: STANDING, right: STANDING, [side]: lerpLeg(STANDING, CURL, amount)};
  const body = spotBody(LEAN_DEG);
  const swing = lerp(ARMS.reach.swing, ARMS.row.swing, amount);
  const bend = lerp(ARMS.reach.bend, ARMS.row.bend, amount);
  return onTheSpot(body, legs, {
    left: swungArm(body, 'left', swing, bend),
    right: swungArm(body, 'right', swing, bend),
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return hamstringCurlPose(frame.progress);
}

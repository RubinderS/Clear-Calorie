import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {DEAD_HANG, hangingArms, hangingBody, hangingLegs} from '../moves/hanging';
import {X, Y, levelHead, skeleton} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +x, hanging from the bar underhand and pulling up until the chin reaches it. */

/** The middle of the shoulders below the bar at a dead hang (arms long) and at the top (chin at the bar). */
export const SHOULDER_BELOW_BAR = {bottom: DEAD_HANG, top: 0.24};
/** Underhand grip about shoulder-width: each hand this far from the middle. */
export const GRIP_HALF = 0.3;
/** Knees bent with the feet tucked back: the thigh a touch forward of straight down, the shin back, in degrees. */
const THIGH_DEG = 8;
const SHIN_DEG = -60;
/** Toes pointing down: the feet tip this far from flat. */
const TOE_POINT_DEG = 60;
/** Eyes up on the bar. */
const HEAD_NOD = -15;

/** The rabbit at a point in the rep: 0 = dead hang, 1 = chin at the bar. */
export function chinUpPose(progress: number): Skeleton {
  const body = hangingBody(lerp(SHOULDER_BELOW_BAR.bottom, SHOULDER_BELOW_BAR.top, progress));
  // Hands stay on the bar; the elbows come down in front of the body.
  // Underhand: palms facing the rabbit, so the palm is on the far side of the bar.
  const hands = hangingArms(body, GRIP_HALF, () => X.clone().addScaledVector(Y, -1), X);
  return skeleton(body, {
    head: levelHead(body, HEAD_NOD),
    ...hands,
    ...hangingLegs(body, THIGH_DEG, SHIN_DEG, TOE_POINT_DEG),
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return chinUpPose(frame.progress);
}

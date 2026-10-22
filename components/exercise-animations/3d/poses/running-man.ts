import type {AnimationFrame} from '@/lib/exercise-animation';
import {STANDING, lerpLeg, onTheSpot, pumpingArms, spotBody, type LegAngles} from '../moves/on-the-spot';
import {alternate} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +x on the spot, the middle of the ankles at the origin. */

/** The knee driven up to about hip height. */
export const KNEE_UP: LegAngles = {thigh: 85, knee: 90, point: 15};
/** The foot stepped back behind, its toes on the floor and the heel up. */
export const STEP_BACK: LegAngles = {thigh: -20, knee: 16, point: 14};
/** Degrees of arm swing for each degree the thigh moves. */
const ARM_GAIN = 0.7;

/** One leg's move, `t` through it: from standing the knee drives up, the foot steps back, then it comes in. */
export function legThrough(t: number): LegAngles {
  if (t < 1 / 3) return lerpLeg(STANDING, KNEE_UP, t * 3);
  if (t < 2 / 3) return lerpLeg(KNEE_UP, STEP_BACK, t * 3 - 1);
  return lerpLeg(STEP_BACK, STANDING, t * 3 - 2);
}

/** The rabbit at a point in the rep: the left leg's move (0 to 0.5), then the right's. */
export function runningManPose(progress: number): Skeleton {
  const {side, t} = alternate(progress);
  const legs = {left: STANDING, right: STANDING, [side]: legThrough(t)};
  const body = spotBody();
  return onTheSpot(body, legs, pumpingArms(body, legs, ARM_GAIN));
}

export function pose(frame: AnimationFrame): Skeleton {
  return runningManPose(frame.progress);
}

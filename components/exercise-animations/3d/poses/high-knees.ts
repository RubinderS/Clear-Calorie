import type {AnimationFrame} from '@/lib/exercise-animation';
import {STANDING, lerpLeg, onTheSpot, pumpingArms, spotBody, type LegAngles} from '../moves/on-the-spot';
import {alternate} from '../rig';
import type {Skeleton} from '../skeleton';

/** Jogging on the spot facing +x, the middle of the ankles at the origin. */

/** A knee driven up: the thigh level, the shin hanging under it, the toes pointed a little. */
export const KNEE_UP: LegAngles = {thigh: 90, knee: 95, point: 15};
/** Degrees of arm swing for each degree the thigh rises. */
const ARM_GAIN = 0.55;

/** The rabbit at a point in the rep: the left knee up and down (0 to 0.5), then the right. */
export function highKneesPose(progress: number): Skeleton {
  const {side, amount} = alternate(progress);
  const legs = {left: STANDING, right: STANDING, [side]: lerpLeg(STANDING, KNEE_UP, amount)};
  const body = spotBody();
  return onTheSpot(body, legs, pumpingArms(body, legs, ARM_GAIN));
}

export function pose(frame: AnimationFrame): Skeleton {
  return highKneesPose(frame.progress);
}

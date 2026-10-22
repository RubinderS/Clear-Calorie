import type {AnimationFrame} from '@/lib/exercise-animation';
import {STANDING, lerpLeg, onTheSpot, pumpingArms, spotBody, type LegAngles} from '../moves/on-the-spot';
import {alternate} from '../rig';
import type {Skeleton} from '../skeleton';

/** Jogging on the spot facing +x, the middle of the ankles at the origin. */

/** A heel kicked up to the glutes: the thigh just behind vertical, the knee folded tight. */
export const HEEL_UP: LegAngles = {thigh: -5, knee: 155, point: 10};
/** Degrees of arm swing for each degree the thigh moves; it barely does, so the arms swing more. */
const ARM_GAIN = 1.6;

/** The rabbit at a point in the rep: the left heel up and down (0 to 0.5), then the right. */
export function buttKicksPose(progress: number): Skeleton {
  const {side, amount} = alternate(progress);
  const legs = {left: STANDING, right: STANDING, [side]: lerpLeg(STANDING, HEEL_UP, amount)};
  const body = spotBody();
  return onTheSpot(body, legs, pumpingArms(body, legs, ARM_GAIN));
}

export function pose(frame: AnimationFrame): Skeleton {
  return buttKicksPose(frame.progress);
}

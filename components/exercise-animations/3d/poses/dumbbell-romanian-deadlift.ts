import type {AnimationFrame} from '@/lib/exercise-animation';
import {hingePose} from '../moves/hinge';
import type {Skeleton} from '../skeleton';

/** The same hinge as the barbell Romanian deadlift, with a dumbbell in each paw. */

/** How far each hand hangs out from the middle: wide enough that the inner plates pass outside the legs. */
export const HAND_HALF = 0.52;
/** The elbows flare out over the hands, so each forearm comes down to the middle of its handle. */
const ELBOW_FLARE = 1.5;

export function dumbbellRomanianDeadliftPose(progress: number): Skeleton {
  return hingePose(progress, HAND_HALF, ELBOW_FLARE);
}

export function pose(frame: AnimationFrame): Skeleton {
  return dumbbellRomanianDeadliftPose(frame.progress);
}

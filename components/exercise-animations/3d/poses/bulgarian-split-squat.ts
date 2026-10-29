import type {AnimationFrame} from '@/lib/exercise-animation';
import {splitSquatPose} from '../moves/split-squat';
import type {Skeleton} from '../skeleton';

export {BACK_ANKLE, BENCH, FRONT_ANKLE} from '../moves/split-squat';

/** The rabbit at a point in the rep, empty-handed: 0 = top of the split squat, 1 = bottom. */
export function bulgarianSplitSquatPose(progress: number): Skeleton {
  return splitSquatPose(progress);
}

export function pose(frame: AnimationFrame): Skeleton {
  return bulgarianSplitSquatPose(frame.progress);
}

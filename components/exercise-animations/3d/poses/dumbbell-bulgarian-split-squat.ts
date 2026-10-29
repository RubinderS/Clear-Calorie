import type {AnimationFrame} from '@/lib/exercise-animation';
import {carryingArms} from '../moves/carry';
import {splitSquatPose} from '../moves/split-squat';
import type {Skeleton} from '../skeleton';

export {BACK_ANKLE, BENCH, FRONT_ANKLE} from '../moves/split-squat';

/** The Bulgarian split squat with a dumbbell hanging in each paw: 0 = top, 1 = bottom. */
export function dumbbellBulgarianSplitSquatPose(progress: number): Skeleton {
  return splitSquatPose(progress, (body) => carryingArms(body));
}

export function pose(frame: AnimationFrame): Skeleton {
  return dumbbellBulgarianSplitSquatPose(frame.progress);
}

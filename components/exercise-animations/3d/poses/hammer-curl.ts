import type {AnimationFrame} from '@/lib/exercise-animation';
import {curlWith, neutralPaw} from '../moves/standing';
import type {Skeleton} from '../skeleton';

/** The same curl as the dumbbell curl with a neutral grip: thumbs up, the palms facing in. */

export function hammerCurlPose(progress: number): Skeleton {
  return curlWith(progress, neutralPaw);
}

export function pose(frame: AnimationFrame): Skeleton {
  return hammerCurlPose(frame.progress);
}

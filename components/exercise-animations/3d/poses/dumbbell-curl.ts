import type {AnimationFrame} from '@/lib/exercise-animation';
import {curlWith, underhandPaw} from '../moves/standing';
import type {Skeleton} from '../skeleton';

/** Standing tall, facing +x: a curl with the palms up, the upper arms pinned by the sides. */

/** The rabbit at a point in the rep: 0 = arms long by the sides, 1 = dumbbells curled to the shoulders. */
export function curlPose(progress: number): Skeleton {
  return curlWith(progress, underhandPaw);
}

export function pose(frame: AnimationFrame): Skeleton {
  return curlPose(frame.progress);
}

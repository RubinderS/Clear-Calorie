import type {AnimationFrame} from '@/lib/exercise-animation';
import {hingePose} from '../moves/hinge';
import type {Skeleton} from '../skeleton';

/** The hip hinge with a barbell, facing +x. */

/** How far each hand grips out from the middle of the bar: just outside the thighs. */
export const BAR_GRIP_HALF = 0.32;

/** The rabbit at a point in the rep: 0 = standing tall, 1 = hips back, the bar below the knees. */
export function romanianDeadliftPose(progress: number): Skeleton {
  return hingePose(progress, BAR_GRIP_HALF);
}

export function pose(frame: AnimationFrame): Skeleton {
  return romanianDeadliftPose(frame.progress);
}

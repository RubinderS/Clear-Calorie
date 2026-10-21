import type {AnimationFrame} from '@/lib/exercise-animation';
import {pushUpWith, type PushUpSetup} from '../moves/prone';
import type {Skeleton} from '../skeleton';

/** The push-up with the hands close together under the chest and the elbows tucked along the ribs. */

/**
 * The elbows point back along the ribs, out only as far as the sides of the
 * chest. The top stops just short of locking the arms, which can't quite
 * reach hands planted this close.
 */
export const CLOSE_GRIP: PushUpSetup = {
  hands: {x: 2.03, out: 0.14},
  deg: {top: 27.2, bottom: 7.4},
  elbows: {out: 0.3, up: 0.5},
};

export function closeGripPushUpPose(progress: number): Skeleton {
  return pushUpWith(CLOSE_GRIP, progress);
}

export function pose(frame: AnimationFrame): Skeleton {
  return closeGripPushUpPose(frame.progress);
}

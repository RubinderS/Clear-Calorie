import type {AnimationFrame} from '@/lib/exercise-animation';
import {pushUpWith, type PushUpSetup} from '../moves/prone';
import type {Skeleton} from '../skeleton';

/** Face down, the head towards +x: a push-up with the hands a little wider than the shoulders. */

/** Hands a little wider than the shoulders, the elbows back and out about 45°. */
export const PUSH_UP: PushUpSetup = {
  hands: {x: 2.15, out: 0.36},
  deg: {top: 26.9, bottom: 7.2},
  elbows: {out: 0.6, up: 0.5},
};

export function pushUpPose(progress: number): Skeleton {
  return pushUpWith(PUSH_UP, progress);
}

export function pose(frame: AnimationFrame): Skeleton {
  return pushUpPose(frame.progress);
}

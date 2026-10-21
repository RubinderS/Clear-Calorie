import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {DEAD_HANG, hangingArms, hangingBody, hangingLegs} from '../moves/hanging';
import {SIDE_SIGN, X, skeleton, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +x, a still dead hang from the bar; only the legs move. */

/** The thighs' swing forward from hanging straight down: up to just above level. */
export const THIGH_DEG = {bottom: 5, top: 100};
/** The shins hang from the knees, a touch forward at the bottom, straight down at the top. */
export const SHIN_DEG = {bottom: 5, top: 0};
/** Overhand grip a little wider than the shoulders, so the arms pass outside the head. */
export const GRIP_HALF = 0.4;
/** Toes pointing down and a little forward. */
const TOE_POINT_DEG = 70;

export const BODY = hangingBody(DEAD_HANG);

/** The rabbit at a point in the rep: 0 = hanging long, 1 = knees raised above the hips. */
export function hangingKneeRaisePose(progress: number): Skeleton {
  // Arms long, the elbows back and a little out. Overhand: palms facing away, so the palm
  // is on the rabbit's side of the bar.
  const elbows = (side: Side) => X.clone().negate().addScaledVector(BODY.right, SIDE_SIGN[side] * 0.5);
  return skeleton(BODY, {
    ...hangingArms(BODY, GRIP_HALF, elbows, X.clone().negate()),
    ...hangingLegs(
      BODY,
      lerp(THIGH_DEG.bottom, THIGH_DEG.top, progress),
      lerp(SHIN_DEG.bottom, SHIN_DEG.top, progress),
      TOE_POINT_DEG,
    ),
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return hangingKneeRaisePose(frame.progress);
}

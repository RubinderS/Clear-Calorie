import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {frontStance} from '../moves/stance';
import {RIG, armTo, frontalSwing, grippingPaw, skeleton, type Body, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +z, the middle of the hips over the origin. */

/** Feet about hip-width: each leg's spread from vertical. */
export const LEG_SPREAD_DEG = 3;
/**
 * The upper arms' swing out from hanging down: by the thighs, up to
 * shoulder height. They start just far enough out that the dumbbells hang
 * beside the shorts rather than in them.
 */
export const ARM_DEG = {bottom: 16, top: 88};
/** The forearms hang a little lower than the upper arms: soft elbows, leading the lift. */
export const ELBOW_LEAD_DEG = 10;

/** The hips stay still: only the arms move. */
export const BODY: Body = frontStance(LEG_SPREAD_DEG).body;

/** The rabbit at a point in the rep: 0 = dumbbells by the thighs, 1 = arms out at shoulder height. */
export function lateralRaisePose(progress: number): Skeleton {
  const {legs, feet} = frontStance(LEG_SPREAD_DEG);
  const upper = lerp(ARM_DEG.bottom, ARM_DEG.top, progress);
  const arm = (side: Side) => {
    const shoulder = BODY.shoulderOf(side);
    const wrist = shoulder.clone()
      .addScaledVector(frontalSwing(BODY, side, upper), RIG.upperArm)
      .addScaledVector(frontalSwing(BODY, side, upper - ELBOW_LEAD_DEG), RIG.forearm);
    // The elbow leads: it sits on the side of the arm the lift is heading to.
    return armTo(shoulder, wrist, frontalSwing(BODY, side, upper + 90));
  };
  const arms = {left: arm('left'), right: arm('right')};
  // Palms in by the thighs, palms down at the top: the handle points forward, and the palm
  // is on the side of it the lift is heading to.
  const paw = (side: Side) => {
    const {elbow, wrist} = arms[side];
    return grippingPaw(wrist, BODY.forward, frontalSwing(BODY, side, upper + 90), wrist.clone().sub(elbow));
  };
  return skeleton(BODY, {arms, legs, feet, paws: {left: paw('left'), right: paw('right')}});
}

export function pose(frame: AnimationFrame): Skeleton {
  return lateralRaisePose(frame.progress);
}

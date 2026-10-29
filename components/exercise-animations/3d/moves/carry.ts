import {RIG, SHOULDER_HALF, SIDE_SIGN, X, Y, armTo, grippingPaw, type Body, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Carrying a dumbbell at each side, as the walking lunge and the dumbbell
 * split squat share.
 */

/** How far each dumbbell hangs out from the middle: wide enough that its inner plate passes outside the hips. */
export const HAND_HALF = 0.48;

/**
 * Arms hanging straight down, just short of locked, with a dumbbell in each
 * paw: neutral grip, the handles pointing forward and the palms to the legs.
 */
export function carryingArms(body: Body, out = HAND_HALF): Pick<Skeleton, 'arms' | 'paws'> {
  const reach = RIG.upperArm + RIG.forearm - 0.01;
  const arm = (side: Side) => {
    const shoulder = body.shoulderOf(side);
    // Straight under the shoulder, then out to the side, the body's right being level.
    const wide = out - SHOULDER_HALF;
    const hand = shoulder.clone()
      .addScaledVector(body.right, SIDE_SIGN[side] * wide)
      .addScaledVector(Y, -Math.sqrt(reach * reach - wide * wide));
    return armTo(shoulder, hand, X.clone().negate());
  };
  const arms = {left: arm('left'), right: arm('right')};
  const paw = (side: Side) =>
    grippingPaw(arms[side].wrist, X, body.right.clone().multiplyScalar(SIDE_SIGN[side]), Y.clone().negate());
  return {arms, paws: {left: paw('left'), right: paw('right')}};
}

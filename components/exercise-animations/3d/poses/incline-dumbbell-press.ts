import * as THREE from 'three';
import type {AnimationFrame} from '@/lib/exercise-animation';
import {SEATED_HEAD_AHEAD, inclineBody, seatedLegs} from '../moves/bench';
import {
  SIDE_SIGN,
  X,
  Y,
  armTo,
  grippingPaw,
  lerp3,
  lookingUp,
  skeleton,
  v,
  type Side,
} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +x, the hips in the corner of an incline bench over the origin,
 * the back on its pad and the feet flat on the floor.
 */

/** The bench's back pad, in degrees above the floor. */
export const INCLINE_DEG = 35;
/** Seat pad under the hips: front to back along x, and its top and bottom. */
export const SEAT = {left: -0.3, right: 0.5, top: 0.6, bottom: 0.46};
/** Sitting back on the bench, the hips in its corner. */
export const BODY = inclineBody(INCLINE_DEG);
/** How far each hand is out from the middle. */
export const HAND_HALF = 0.36;
/** The middle of the hands: beside the upper chest, straight up to over the shoulders. */
export const DUMBBELLS = {
  top: BODY.shoulder.clone().add(v(0.03, 1.17, 0)),
  bottom: BODY.at(0, 0.95, 0.34),
};
/** Head back on the pad, chin a little tucked: looking this far above level. */
const HEAD_DEG = 45;

/** The middle of the hands at a point in the rep: 0 = arms locked out, 1 = dumbbells at the chest. */
export function dumbbellsAt(progress: number): THREE.Vector3 {
  return lerp3(DUMBBELLS.top, DUMBBELLS.bottom, progress);
}

/** The rabbit at a point in the rep: 0 = arms locked out, 1 = dumbbells at the chest. */
export function inclinePressPose(progress: number): Skeleton {
  const hands = dumbbellsAt(progress);
  // Elbows drop down below the chest, out wide of the pad and a little towards the hips.
  const elbows = (side: Side) => Y.clone().negate()
    .addScaledVector(BODY.right, SIDE_SIGN[side] * 1.2)
    .addScaledVector(X, 0.3);
  const arm = (side: Side) =>
    armTo(BODY.shoulderOf(side), hands.clone().addScaledVector(BODY.right, SIDE_SIGN[side] * HAND_HALF), elbows(side));
  const arms = {left: arm('left'), right: arm('right')};
  // Palms towards the feet: the handle across, square to the forearm, the palm on the head's side
  // and the fingers over the top.
  const paw = (side: Side) => {
    const {elbow, wrist} = arms[side];
    const along = wrist.clone().sub(elbow).normalize();
    const across = BODY.right.clone().addScaledVector(along, -BODY.right.dot(along));
    return grippingPaw(wrist, across, X.clone().negate(), along);
  };
  return skeleton(BODY, {
    head: lookingUp(BODY, HEAD_DEG, SEATED_HEAD_AHEAD),
    arms,
    ...seatedLegs(BODY),
    paws: {left: paw('left'), right: paw('right')},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return inclinePressPose(frame.progress);
}

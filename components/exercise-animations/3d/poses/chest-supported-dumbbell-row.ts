import * as THREE from 'three';
import type {AnimationFrame} from '@/lib/exercise-animation';
import {proneBody, proneLegs} from '../moves/prone';
import {RIG, SHOULDER_HALF, SIDE_SIGN, X, Y, armTo, grippingPaw, levelHead, lerp3, skeleton, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +x, lying face down on an incline bench: the chest on its pad, the
 * body straight down to the toes planted on the floor behind it either side
 * of the origin. The body stays still; only the arms row.
 */

/** The bench's pad, in degrees above the floor; the straight body lies along it. */
export const INCLINE_DEG = 35;
export const BODY = proneBody(INCLINE_DEG);
/**
 * The pad under the chest, along the torso from the hips: it stops at the
 * upper chest, and is narrower than the shoulders, so the arms hang past it.
 */
export const PAD = {start: -0.15, end: 1.1, width: 0.4};
/** How far each hand hangs out from the middle: the dumbbells clear of the waist at the top. */
export const HAND_HALF = 0.5;
/** The middle of the hands: hanging straight down under the shoulders with long arms, up beside the lower ribs. */
export const DUMBBELLS = {
  bottom: BODY.shoulder.clone().addScaledVector(Y, -Math.sqrt((RIG.upperArm + RIG.forearm - 0.02) ** 2 - (HAND_HALF - SHOULDER_HALF) ** 2)),
  top: BODY.at(0, 0.65, 0.1),
};
/** Neck in line with the back, chin just lifted, eyes on the floor ahead of the bench. */
const HEAD_NOD = 35;

/** The middle of the hands at a point in the rep: 0 = arms long, 1 = dumbbells at the ribs. */
export function dumbbellsAt(progress: number): THREE.Vector3 {
  return lerp3(DUMBBELLS.bottom, DUMBBELLS.top, progress);
}

/** The rabbit at a point in the rep: 0 = arms hanging long, 1 = dumbbells pulled to the ribs. */
export function chestSupportedRowPose(progress: number): Skeleton {
  const hands = dumbbellsAt(progress);
  // Elbows drive back towards the hips and up past the back, tucked in by the sides.
  const elbows = (side: Side) => X.clone().negate().addScaledVector(Y, 0.6).addScaledVector(BODY.right, SIDE_SIGN[side] * 0.15);
  const arm = (side: Side) =>
    armTo(BODY.shoulderOf(side), hands.clone().addScaledVector(BODY.right, SIDE_SIGN[side] * HAND_HALF), elbows(side));
  const arms = {left: arm('left'), right: arm('right')};
  // Neutral grip: the handle fore and aft, square to the forearm; palms facing in, so each is on the outside of its handle.
  const paw = (side: Side) => {
    const {elbow, wrist} = arms[side];
    const along = wrist.clone().sub(elbow).normalize();
    const handle = X.clone().addScaledVector(along, -X.dot(along));
    return grippingPaw(wrist, handle, BODY.right.clone().multiplyScalar(SIDE_SIGN[side]), along);
  };
  return skeleton(BODY, {
    head: levelHead(BODY, HEAD_NOD),
    arms,
    ...proneLegs(BODY),
    paws: {left: paw('left'), right: paw('right')},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return chestSupportedRowPose(frame.progress);
}

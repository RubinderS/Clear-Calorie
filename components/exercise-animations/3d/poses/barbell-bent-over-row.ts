import * as THREE from 'three';
import type {AnimationFrame} from '@/lib/exercise-animation';
import {legChain, plantedLegs} from '../moves/stance';
import {RIG, SHOULDER_HALF, SIDE_SIGN, X, Y, armTo, grippingPaw, levelHead, lerp3, skeleton, type Side} from '../rig';
import {SIZES} from '../rabbit-3d';
import type {Skeleton} from '../skeleton';

/** Facing +x, the middle of the planted ankles at the origin, bent over with a flat back. */

/** Flat back, held at this angle above horizontal for the whole set. */
export const BACK_DEG = 40;
/** Knees softly bent: the shin forward of vertical, the thigh back, in degrees. */
export const CHAIN = {shin: 10, thigh: 25, lean: 90 - BACK_DEG};
export const BODY = legChain(CHAIN);
/** How far each hand grips out from the middle of the bar: just outside the shoulders. */
export const GRIP_HALF = 0.36;
/** Where the bar touches at the top: this far up the torso from the hips, against the belly. */
export const BAR_TOUCH = {up: 0.8, front: SIZES.torso.radius * SIZES.torso.depth + 0.035};
/** The middle of the bar: hanging under the shoulders with long arms, up to the belly. */
export const BAR = {
  bottom: BODY.shoulder.clone().addScaledVector(Y, -Math.sqrt((RIG.upperArm + RIG.forearm - 0.02) ** 2 - (GRIP_HALF - SHOULDER_HALF) ** 2)),
  top: BODY.at(0, BAR_TOUCH.up, BAR_TOUCH.front),
};
/** Neck in line with the back, eyes on the floor a little ahead: nodded this far down. */
const HEAD_NOD = 20;

/** The middle of the bar at a point in the rep: 0 = arms long, 1 = bar at the belly. */
export function barAt(progress: number): THREE.Vector3 {
  return lerp3(BAR.bottom, BAR.top, progress);
}

/** The rabbit at a point in the rep: 0 = arms long, 1 = bar pulled to the belly. */
export function bentOverRowPose(progress: number): Skeleton {
  const bar = barAt(progress);
  // Elbows drive back towards the hips and up past the back, a little out from the sides.
  const elbows = (side: Side) => X.clone().negate().addScaledVector(Y, 0.6).addScaledVector(BODY.right, SIDE_SIGN[side] * 0.3);
  const arm = (side: Side) =>
    armTo(BODY.shoulderOf(side), bar.clone().addScaledVector(BODY.right, SIDE_SIGN[side] * GRIP_HALF), elbows(side));
  const arms = {left: arm('left'), right: arm('right')};
  // Overhand: palms to the legs, so the palm is on the front of the bar and the fingers wrap under.
  const paw = (side: Side) => {
    const {elbow, wrist} = arms[side];
    return grippingPaw(wrist, BODY.right, X, wrist.clone().sub(elbow));
  };
  return skeleton(BODY, {
    head: levelHead(BODY, HEAD_NOD),
    arms,
    ...plantedLegs(BODY),
    paws: {left: paw('left'), right: paw('right')},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return bentOverRowPose(frame.progress);
}

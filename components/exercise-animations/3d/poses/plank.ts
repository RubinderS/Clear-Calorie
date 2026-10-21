import * as THREE from 'three';
import {proneBody, proneLegs} from '../moves/prone';
import {FOOT, RIG, SIDE_SIGN, X, Y, armTo, levelHead, openPaw, skeleton, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/** A forearm plank: face down, the head towards +x, the toes planted either side of the origin. */

/** Elbows on the floor right under the shoulders, forearms flat and pointing forward. */
export const ELBOW_Y = 0.12;
/** The forearms angle in a little, the paws closer together than the elbows. */
const PAW_IN = 0.1;
/** The body angle above the floor that puts the shoulders straight over the elbows. */
export const BODY_DEG = THREE.MathUtils.radToDeg(
  Math.asin((ELBOW_Y + RIG.upperArm - FOOT.ankle) / (RIG.thigh + RIG.shin + RIG.torso)),
);
export const BODY = proneBody(BODY_DEG);
/** Neck long, eyes on the floor a little ahead. */
const HEAD_NOD = 14 - BODY_DEG;

/** Where each elbow rests, under its shoulder. */
export function elbowOf(side: Side): THREE.Vector3 {
  return BODY.shoulderOf(side).setY(ELBOW_Y);
}

/** The plank: held still, heels to head in one straight line. */
export function plankPose(): Skeleton {
  const arm = (side: Side) => {
    const elbow = elbowOf(side);
    const inward = BODY.right.clone().multiplyScalar(-SIDE_SIGN[side] * PAW_IN);
    const wrist = elbow.clone().add(inward).addScaledVector(X, Math.sqrt(RIG.forearm ** 2 - PAW_IN ** 2));
    // The elbow stays on the floor under the shoulder: bend it towards there.
    return armTo(BODY.shoulderOf(side), wrist, elbow.sub(BODY.shoulderOf(side)));
  };
  const arms = {left: arm('left'), right: arm('right')};
  return skeleton(BODY, {
    head: levelHead(BODY, HEAD_NOD),
    arms,
    ...proneLegs(BODY),
    paws: {left: openPaw(arms.left, Y), right: openPaw(arms.right, Y)},
  });
}

/** A hold: every frame is the same pose. */
export function pose(): Skeleton {
  return plankPose();
}

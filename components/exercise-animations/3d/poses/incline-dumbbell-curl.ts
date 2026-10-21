import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {SEATED_HEAD_AHEAD, inclineBody, seatedLegs} from '../moves/bench';
import {pinnedArm, underhandPaw} from '../moves/standing';
import {
  RIG,
  SIDE_SIGN,
  Y,
  levelHead,
  skeleton,
  type Side,
} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +x, the hips in the corner of an incline bench over the origin,
 * leaning back on its pad with the arms hanging beside it.
 */

/** The bench's back pad, in degrees above the floor. */
export const INCLINE_DEG = 55;
/** Seat pad under the hips: front to back along x, and its top and bottom. */
export const SEAT = {left: -0.18, right: 0.5, top: 0.6, bottom: 0.46};
/** Sitting back on the bench, the hips in its corner. */
export const BODY = inclineBody(INCLINE_DEG);
/** The forearm's swing forward from hanging straight down: arms long, up towards the shoulder. */
export const FOREARM_DEG = {bottom: 6, top: 130};
/** The upper arms hang straight down behind the body, out wide enough to pass beside the pad. */
const UPPER_ARM_OUT = 0.3;
/** The head rests back on the pad, chin up a little, eyes forward. */
const HEAD_NOD = -25;

/** Where each elbow hangs, still, behind the body. */
export function elbowOf(side: Side): THREE.Vector3 {
  const down = Y.clone().negate().addScaledVector(BODY.right, SIDE_SIGN[side] * UPPER_ARM_OUT).normalize();
  return BODY.shoulderOf(side).addScaledVector(down, RIG.upperArm);
}

/** The rabbit at a point in the rep: 0 = arms hanging long, 1 = dumbbells curled up. */
export function inclineCurlPose(progress: number): Skeleton {
  const deg = lerp(FOREARM_DEG.bottom, FOREARM_DEG.top, progress);
  const arm = (side: Side) =>
    pinnedArm(BODY.shoulderOf(side), elbowOf(side), deg, BODY.right.clone().multiplyScalar(SIDE_SIGN[side]));
  const arms = {left: arm('left'), right: arm('right')};
  return skeleton(BODY, {
    head: levelHead(BODY, HEAD_NOD, SEATED_HEAD_AHEAD),
    arms,
    ...seatedLegs(BODY),
    paws: {left: underhandPaw(arms.left, 'left', deg), right: underhandPaw(arms.right, 'right', deg)},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return inclineCurlPose(frame.progress);
}

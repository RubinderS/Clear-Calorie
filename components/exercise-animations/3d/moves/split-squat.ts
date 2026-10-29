import * as THREE from 'three';
import {lerp} from '@/lib/exercise-animation';
import {
  FOOT,
  HIP_HALF,
  RIG,
  SIDE_SIGN,
  X,
  Y,
  armTo,
  bodyFrame,
  flatFoot,
  legTo,
  levelHead,
  openPaw,
  skeleton,
  turn,
  v,
  type Body,
  type Side,
} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * The Bulgarian split squat the bodyweight and dumbbell versions share:
 * facing +x, the hips over the origin. The front foot is the left (near
 * side), the back foot the right, each in line with its hip.
 */

/** Planted front ankle; the foot stays flat. */
export const FRONT_ANKLE = v(0.7, FOOT.ankle, HIP_HALF);
/** The back ankle, just beyond the front edge of a knee-high bench behind. */
export const BACK_ANKLE = v(-0.85, 0.78, -HIP_HALF);
/** The bench: the back foot rests on it laces down, its front edge under the instep so the shin stays clear. */
export const BENCH = {top: BACK_ANKLE.y - 0.13, bottom: 0.51, back: -1.9, front: BACK_ANKLE.x - 0.05, z: -HIP_HALF};
/** The hips drop straight down: from standing in the split stance to the front thigh about level. */
export const HIP_Y = {top: 1.11, bottom: 0.66};
/** The torso leans forward a little more at the bottom. */
const LEAN_DEG = {top: 12, bottom: 22};
/** Laces down on the bench: the back foot lies on the pad behind the ankle, toes pointing back, sole up. */
export const BACK_FOOT = {
  at: v(BACK_ANKLE.x - 0.14, BENCH.top + FOOT.height, BACK_ANKLE.z),
  forward: X.clone().negate(),
  up: Y.clone().negate(),
};

/**
 * Arms hanging relaxed by the sides: the upper arm a touch forward of
 * straight down, the forearm a little more, both just out from the body.
 */
export function hangingArms(body: Body, {upper = 3, fore = 6, out = 0.14} = {}): Skeleton['arms'] {
  const arm = (side: Side) => {
    const shoulder = body.shoulderOf(side);
    const outward = body.right.clone().multiplyScalar(SIDE_SIGN[side] * out);
    const down = (deg: number) => turn(Y.clone().negate(), body.right, -deg).add(outward).normalize();
    const elbow = shoulder.clone().addScaledVector(down(upper), RIG.upperArm);
    const wrist = elbow.clone().addScaledVector(down(fore), RIG.forearm);
    // The forearm hangs further forward than the upper arm, so the elbow sits back.
    return armTo(shoulder, wrist, X.clone().negate());
  };
  return {left: arm('left'), right: arm('right')};
}

/** Empty paws, the arms hanging relaxed. */
function emptyHands(body: Body): Pick<Skeleton, 'arms' | 'paws'> {
  const arms = hangingArms(body);
  return {arms, paws: {left: openPaw(arms.left, X), right: openPaw(arms.right, X)}};
}

/**
 * The rabbit at a point in the rep: 0 = top of the split squat, 1 = bottom.
 * `hands` sets the arms and paws for the body, empty by default.
 */
export function splitSquatPose(
  progress: number,
  hands: (body: Body) => Pick<Skeleton, 'arms' | 'paws'> = emptyHands,
): Skeleton {
  const lean = THREE.MathUtils.degToRad(lerp(LEAN_DEG.top, LEAN_DEG.bottom, progress));
  const body = bodyFrame(v(0, lerp(HIP_Y.top, HIP_Y.bottom, progress), 0), v(Math.sin(lean), Math.cos(lean), 0), X);
  // The front knee bends forward over the foot; the back knee drops towards the floor.
  const legs = {
    left: legTo(body.hipOf('left'), FRONT_ANKLE, X),
    right: legTo(body.hipOf('right'), BACK_ANKLE, X.clone().addScaledVector(Y, -2)),
  };
  return skeleton(body, {
    head: levelHead(body),
    ...hands(body),
    legs,
    feet: {
      left: flatFoot(FRONT_ANKLE, X),
      right: {at: BACK_FOOT.at.clone(), forward: BACK_FOOT.forward.clone(), up: BACK_FOOT.up.clone()},
    },
  });
}

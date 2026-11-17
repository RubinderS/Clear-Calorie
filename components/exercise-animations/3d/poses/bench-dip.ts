import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {SIZES} from '../rabbit-3d';
import {FOOT, RIG, SHOULDER_HALF, X, Y, armTo, bodyFrame, flatFoot, legTo, levelHead, skeleton, v, type Side} from '../rig';
import type {Contact3D, Skeleton} from '../skeleton';

/**
 * Facing +x, the hands on the front edge of a bench behind, the heels on the
 * floor ahead with the knees bent. The torso stays upright and close to the
 * bench; the elbows bend straight back, lowering the hips down past the
 * bench's edge, then the arms press the body back up.
 */

/** The bench behind: its front edge at x = 0, the pad running back from it, wide enough for the hands. */
export const BENCH = {left: -1.1, right: 0, top: 0.75, bottom: 0.61, width: 0.9};
/** The hands on the pad just behind its edge, a little wider than the shoulders, fingers forward over the edge. */
export const HANDS = {
  left: v(-0.08, BENCH.top + SIZES.paw, 0.36),
  right: v(-0.08, BENCH.top + SIZES.paw, -0.36),
} satisfies Record<Side, ReturnType<typeof v>>;
/** The hips stay this far in front of the edge: close to the bench, the tail just clear of it. */
export const HIP_X = 0.38;
/** Shoulder to wrist: arms long with soft elbows at the top, the elbows at a right angle at the bottom. */
export const REACH = {top: RIG.upperArm + RIG.forearm - 0.02, bottom: Math.hypot(RIG.upperArm, RIG.forearm)};
/** The heels planted out ahead, about hip-width, the knees bent. */
export const ANKLES = {
  left: v(HIP_X + 0.95, FOOT.ankle, 0.17),
  right: v(HIP_X + 0.95, FOOT.ankle, -0.17),
} satisfies Record<Side, ReturnType<typeof v>>;

/** How far the shoulders sit across from their hands, along the floor. */
const ACROSS = Math.hypot(HIP_X - HANDS.left.x, HANDS.left.z - SHOULDER_HALF);

/** The height of the hips at a point in the rep: the shoulders `reach` from the hands, straight up the torso. */
export function hipHeightAt(progress: number): number {
  const reach = lerp(REACH.top, REACH.bottom, progress);
  return HANDS.left.y + Math.sqrt(reach * reach - ACROSS * ACROSS) - RIG.torso;
}

/** The rabbit at a point in the rep: 0 = arms long at the top, 1 = elbows at a right angle, hips low. */
export function benchDipPose(progress: number): Skeleton {
  // Upright, chest up and facing ahead; the body slides straight down the front of the bench.
  const body = bodyFrame(v(HIP_X, hipHeightAt(progress), 0), Y, X);
  // The elbows bend straight back, towards the bench, not out to the sides.
  const back = X.clone().negate();
  const arm = (side: Side) => armTo(body.shoulderOf(side), HANDS[side], back);
  const arms = {left: arm('left'), right: arm('right')};
  // Flat on the pad, the fingers pointing forward over the edge.
  const paw = (side: Side): Contact3D => ({at: arms[side].wrist.clone(), forward: X.clone(), up: Y.clone()});
  // The knees point up.
  const leg = (side: Side) => legTo(body.hipOf(side), ANKLES[side], Y);
  return skeleton(body, {
    head: levelHead(body),
    arms,
    legs: {left: leg('left'), right: leg('right')},
    feet: {left: flatFoot(ANKLES.left, X), right: flatFoot(ANKLES.right, X)},
    paws: {left: paw('left'), right: paw('right')},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return benchDipPose(frame.progress);
}

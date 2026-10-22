import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {
  FOOT,
  RIG,
  SIDE_SIGN,
  X,
  Y,
  Z,
  alternate,
  armTo,
  bodyFrame,
  flatFoot,
  headOn,
  legTo,
  openPaw,
  skeleton,
  turn,
  v,
  type Side,
} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +x in an orthodox stance, the hips over the origin: the left foot
 * forward and the right back, the body turned so the left shoulder leads.
 */

/** Planted ankles, staggered front to back and a little apart. */
export const ANKLES = {left: v(0.3, FOOT.ankle, 0.14), right: v(-0.3, FOOT.ankle, -0.14)};
/** Both feet point a little towards the back side. */
const TOES = turn(X, Y, 20);
/** The hips over the middle of the feet, the knees soft. */
export const HIP = v(0, 1.3, 0);
/** How far the chest is turned away from +x, in degrees: in the guard, at the end of the jab, and squared up on the cross. */
export const TURN = {guard: 25, jab: 32, cross: -5};
/** The paws in the guard, in the body's frame: in front of the chin, either side of the muzzle. */
export const GUARD = {out: 0.16, up: RIG.torso + 0.12, forward: 0.42};
/** How far a punch reaches ahead of its shoulder, and how much of the way in to the middle line it aims. */
export const PUNCH = {reach: 1.15, inward: 0.6};
/** The chin tucked a little, in degrees. */
const CHIN_TUCK = 8;

/** The rabbit at a point in the rep: a left jab out and back (0 to 0.5), then a right cross. */
export function shadowBoxingPose(progress: number): Skeleton {
  const {side: punching, amount} = alternate(progress);
  const deg = lerp(TURN.guard, punching === 'left' ? TURN.jab : TURN.cross, amount);
  const body = bodyFrame(HIP, Y, turn(X, Y, deg));
  const arm = (side: Side) => {
    const shoulder = body.shoulderOf(side);
    const guard = body.at(SIDE_SIGN[side] * GUARD.out, GUARD.up, GUARD.forward);
    const target = shoulder.clone().add(v(PUNCH.reach, 0, -shoulder.z * PUNCH.inward));
    const wrist = side === punching ? guard.lerp(target, amount) : guard;
    // Elbows down and a little out, tucked by the ribs in the guard.
    const pole = Y.clone().negate().addScaledVector(body.right, SIDE_SIGN[side] * 0.5);
    return armTo(shoulder, wrist, pole);
  };
  const arms = {left: arm('left'), right: arm('right')};
  const leg = (side: Side) => legTo(body.hipOf(side), ANKLES[side], TOES);
  return skeleton(body, {
    // Eyes on the target ahead.
    head: headOn(body, {forward: turn(X, Z, -CHIN_TUCK), up: turn(Y, Z, -CHIN_TUCK)}),
    arms,
    paws: {left: openPaw(arms.left, Y), right: openPaw(arms.right, Y)},
    legs: {left: leg('left'), right: leg('right')},
    feet: {left: flatFoot(ANKLES.left, TOES), right: flatFoot(ANKLES.right, TOES)},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return shadowBoxingPose(frame.progress);
}

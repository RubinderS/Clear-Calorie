import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {FOOT, RIG, SIDE_SIGN, X, alternate, bodyFrame, legTo, levelHead, pitchedFoot, skeleton, swungArm, sideSwing, v, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +x, the feet set wide either side of the origin, leaning a little
 * forward. Side to side: the weight shifts onto one foot as the other heel
 * curls up behind, then that foot steps back out wide; then the other way.
 */

/** The torso's lean forward, in degrees. */
export const LEAN_DEG = 12;
/** Each foot's place on the floor, out from the middle: wider than the hips. */
export const STANCE = 0.4;
/** How far the hips travel over the standing foot, as a share of the way. */
const SHIFT = 0.8;
/** The hips: a little lower in the wide stance, up over the standing leg. */
export const HIP_Y = {wide: 1.26, over: 1.3};
/** The heel curled up behind: the thigh stays near vertical, the shin comes up past level. */
export const CURL = {thigh: -8, knee: 105};
/** How far the curled foot tips toes-down from flat. */
const CURL_PITCH = 100;
/** The arms reach forward at chest height, then row back, the elbows past the body, as the heel comes up. */
export const ARMS = {
  reach: {swing: 70, bend: 20},
  row: {swing: -30, bend: 120},
};

/** Where `side`'s foot is planted, out wide. */
export function footOf(side: Side): THREE.Vector3 {
  return v(0, FOOT.ankle, -SIDE_SIGN[side] * STANCE);
}

/** The curled ankle from its hip: the thigh down and a little back, the shin up behind. */
const CURLED = sideSwing(CURL.thigh).multiplyScalar(RIG.thigh)
  .addScaledVector(sideSwing(CURL.thigh - CURL.knee), RIG.shin);

/** The rabbit at a point in the rep: onto the right foot as the left heel curls up and back down (0 to 0.5), then onto the left. */
export function hamstringCurlPose(progress: number): Skeleton {
  const {side, amount} = alternate(progress);
  const standing: Side = side === 'left' ? 'right' : 'left';
  const hip = v(0, lerp(HIP_Y.wide, HIP_Y.over, amount), footOf(standing).z * SHIFT * amount);
  const rad = THREE.MathUtils.degToRad(LEAN_DEG);
  const body = bodyFrame(hip, v(Math.sin(rad), Math.cos(rad), 0), X);
  // The standing foot stays put, the knee soft and forward.
  const plant = legTo(body.hipOf(standing), footOf(standing), X);
  // The working foot lifts off its place and curls up behind its hip.
  const ankle = footOf(side).lerp(body.hipOf(side).add(CURLED), amount);
  const curl = legTo(body.hipOf(side), ankle, X);
  const legs = {[standing]: plant, [side]: curl} as Skeleton['legs'];
  const feet = {
    [standing]: pitchedFoot(plant.ankle, X, 0),
    [side]: pitchedFoot(curl.ankle, X, CURL_PITCH * amount),
  } as Skeleton['feet'];
  const swing = lerp(ARMS.reach.swing, ARMS.row.swing, amount);
  const bend = lerp(ARMS.reach.bend, ARMS.row.bend, amount);
  const arms = {left: swungArm(body, 'left', swing, bend), right: swungArm(body, 'right', swing, bend)};
  return skeleton(body, {
    head: levelHead(body),
    arms: {left: arms.left.arm, right: arms.right.arm},
    paws: {left: arms.left.paw, right: arms.right.paw},
    legs,
    feet,
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return hamstringCurlPose(frame.progress);
}

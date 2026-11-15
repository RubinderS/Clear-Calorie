import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {FOOT, SIDE_SIGN, Y, Z, armTo, bodyFrame, flatFoot, legTo, levelHead, openPaw, shifted, skeleton, toesOut, v, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +z, held low in a half squat the whole time: the feet jump out
 * wide and back in under the hips, the hands together in front of the chest.
 */

/** Highest point of each hop: lower than a jumping jack's, staying in the squat. */
export const HOP = 0.14;
/** How far each ankle sits out from the middle: feet together, then wide. */
export const ANKLE_OUT = {together: 0.17, wide: 0.48};
/** The middle of the hips: its height together and wide (a little lower), sat back behind the feet. */
export const HIP = {together: 1.07, wide: 1.02, back: 0.1};
/** The torso leans this far forward from upright. */
export const LEAN_DEG = 20;
/** How far each toe turns out, with the knees following. */
const TOE_OUT_DEG = 15;
/** The paws together in front of the chest: out from the middle, up the torso, and out in front. */
const HANDS = {out: 0.1, up: 0.8, forward: 0.42};

/** The hop at a frame: a smooth arc through each jump out and in, none while landed. */
export function hopAt(frame: AnimationFrame): number {
  const moving = frame.phase.from !== frame.phase.to;
  return moving ? HOP * Math.sin(Math.PI * frame.phaseT) : 0;
}

/** The rabbit at a point in the rep: 0 = feet together, 1 = feet wide; `hop` lifts it off the floor. */
export function lowJackPose(progress: number, hop = 0): Skeleton {
  const lean = THREE.MathUtils.degToRad(LEAN_DEG);
  const body = bodyFrame(
    v(0, lerp(HIP.together, HIP.wide, progress), -HIP.back),
    v(0, Math.cos(lean), Math.sin(lean)),
    Z,
  );
  const out = lerp(ANKLE_OUT.together, ANKLE_OUT.wide, progress);
  const ankle = (side: Side) => v(SIDE_SIGN[side] * out, FOOT.ankle, 0);
  // The knees push out over the toes.
  const leg = (side: Side) => legTo(body.hipOf(side), ankle(side), toesOut(Z, side, TOE_OUT_DEG));
  const foot = (side: Side) => flatFoot(ankle(side), toesOut(Z, side, TOE_OUT_DEG));
  // Elbows tucked down and out, the paws meeting in front of the chest.
  const arm = (side: Side) => {
    const outward = body.right.clone().multiplyScalar(SIDE_SIGN[side]);
    const hand = body.at(SIDE_SIGN[side] * HANDS.out, HANDS.up, HANDS.forward);
    return armTo(body.shoulderOf(side), hand, outward.multiplyScalar(0.6).sub(body.up));
  };
  const arms = {left: arm('left'), right: arm('right')};
  const s = skeleton(body, {
    head: levelHead(body),
    // The ears bounce a little higher than the head on the hop.
    earLift: hop * 0.15,
    arms,
    legs: {left: leg('left'), right: leg('right')},
    feet: {left: foot('left'), right: foot('right')},
    paws: {left: openPaw(arms.left, Y), right: openPaw(arms.right, Y)},
  });
  return hop > 0 ? shifted(s, Y.clone().multiplyScalar(hop)) : s;
}

export function pose(frame: AnimationFrame): Skeleton {
  return lowJackPose(frame.progress, hopAt(frame));
}

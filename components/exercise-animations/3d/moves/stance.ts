import * as THREE from 'three';
import {lerp} from '@/lib/exercise-animation';
import {FOOT, RIG, X, Y, Z, armTo, bodyFrame, flatFoot, frontalSwing, legTo, openPaw, toesOut, v, type Body, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * The standing stance the squats and hinges share: facing +x, the ankles
 * planted either side of the origin with the toes turned out a little, and
 * the legs and torso set by three angles.
 */

/** How far each planted ankle sits out from the middle. */
export const STANCE = 0.2;
/** The planted ankles; the feet stay flat. */
export const ANKLES = {
  left: v(0, FOOT.ankle, STANCE),
  right: v(0, FOOT.ankle, -STANCE),
} satisfies Record<Side, THREE.Vector3>;
/** The middle of the foot. */
export const MIDFOOT_X = FOOT.forward;

/** In degrees: the shin forward of vertical, the thigh back from vertical (90 = level), the torso forward. */
export type ChainAngles = {shin: number; thigh: number; lean: number};

const rad = THREE.MathUtils.degToRad;

/**
 * The body from the planted ankles up, seen side-on: the shin leans
 * forward, the thigh back to the hips, the torso forward.
 */
export function legChain({shin, thigh, lean}: ChainAngles): Body {
  const knee = v(Math.sin(rad(shin)) * RIG.shin, FOOT.ankle + Math.cos(rad(shin)) * RIG.shin, 0);
  const hip = knee.clone().add(v(-Math.sin(rad(thigh)) * RIG.thigh, Math.cos(rad(thigh)) * RIG.thigh, 0));
  return bodyFrame(hip, v(Math.sin(rad(lean)), Math.cos(rad(lean)), 0), X);
}

/** The angles at a point in the rep, between the top and bottom keyframes. */
export function chainAt(keyframes: {top: ChainAngles; bottom: ChainAngles}, progress: number): ChainAngles {
  const {top, bottom} = keyframes;
  return {
    shin: lerp(top.shin, bottom.shin, progress),
    thigh: lerp(top.thigh, bottom.thigh, progress),
    lean: lerp(top.lean, bottom.lean, progress),
  };
}

/** Both legs down to the planted ankles, the knees out over the toes, and the feet flat. */
export function plantedLegs(body: Body): Pick<Skeleton, 'legs' | 'feet'> {
  const leg = (side: Side) => legTo(body.hipOf(side), ANKLES[side], toesOut(X, side));
  const foot = (side: Side) => flatFoot(ANKLES[side], toesOut(X, side));
  return {
    legs: {left: leg('left'), right: leg('right')},
    feet: {left: foot('left'), right: foot('right')},
  };
}

/**
 * Standing facing +z on straight legs, each spread `spread` degrees from
 * vertical, the middle of the hips over the origin and the toes turned out
 * a little; `hop` lifts the whole body off the floor.
 */
export function frontStance(spread: number, hop = 0): Pick<Skeleton, 'legs' | 'feet'> & {body: Body} {
  const leg = RIG.thigh + RIG.shin;
  // The hips drop as the legs spread, so the feet stay on the floor.
  const body = bodyFrame(v(0, FOOT.ankle + leg * Math.cos(rad(spread)) + hop, 0), Y, Z);
  const legOf = (side: Side) => {
    const hip = body.hipOf(side);
    return legTo(hip, hip.clone().addScaledVector(frontalSwing(body, side, spread), leg), toesOut(Z, side));
  };
  const legs = {left: legOf('left'), right: legOf('right')};
  const foot = (side: Side) => {
    const contact = flatFoot(legs[side].ankle, toesOut(Z, side));
    contact.at.y += hop;
    return contact;
  };
  return {body, legs, feet: {left: foot('left'), right: foot('right')}};
}

/** A jack's arms: their swing from hanging down at the start and its range up to overhead, and the forearms' extra turn in, in degrees. */
export const JACK_ARMS = {startDeg: 8, rangeDeg: 157, forearmExtraDeg: 7} as const;

/**
 * Both arms of a body facing +z swung out to the sides and up, as in a
 * jack: 0 = hanging by the hips, 1 = overhead.
 */
export function jackArms(body: Body, progress: number): Pick<Skeleton, 'arms' | 'paws'> {
  const upper = JACK_ARMS.startDeg + JACK_ARMS.rangeDeg * progress;
  const lower = upper + JACK_ARMS.forearmExtraDeg * progress;
  const arm = (side: Side) => {
    const shoulder = body.shoulderOf(side);
    const wrist = shoulder.clone()
      .addScaledVector(frontalSwing(body, side, upper), RIG.upperArm)
      .addScaledVector(frontalSwing(body, side, lower), RIG.forearm);
    // The forearm swings further round than the upper arm, so the elbow trails behind on the arc.
    return armTo(shoulder, wrist, frontalSwing(body, side, upper - 90));
  };
  const arms = {left: arm('left'), right: arm('right')};
  return {arms, paws: {left: openPaw(arms.left, body.forward), right: openPaw(arms.right, body.forward)}};
}

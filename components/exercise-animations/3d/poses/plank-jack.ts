import * as THREE from 'three';
import type {AnimationFrame} from '@/lib/exercise-animation';
import {ANKLES, HIGH_PLANK, proneBody, proneLegs, pushUpWith} from '../moves/prone';
import {FOOT, HIP_HALF, RIG, SIDE_SIGN, v, legTo, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * A high plank, face down with the head towards +x:
 * the body and hands hold still while the feet jump out wide and back in.
 */

export const BODY = proneBody(HIGH_PLANK.deg.top);
/** How far each foot lands out beyond hip-width. */
export const SPREAD = 0.35;
/** Highest point of each jump, for the feet. */
export const HOP = 0.1;

/** The hop at a frame: a smooth arc through each jump out and in, none while landed. */
export function hopAt(frame: AnimationFrame): number {
  const moving = frame.phase.from !== frame.phase.to;
  return moving ? HOP * Math.sin(Math.PI * frame.phaseT) : 0;
}

/** The ankle on `side`, `amount` of the way out and `hop` off the floor, the leg kept straight from its hip. */
export function ankleOf(side: Side, amount: number, hop = 0): THREE.Vector3 {
  const hip = BODY.hipOf(side);
  const y = FOOT.ankle + hop;
  const z = -SIDE_SIGN[side] * (HIP_HALF + SPREAD * amount);
  // A straight leg reaching wider sits its foot a little nearer the hands.
  const reach = Math.sqrt((RIG.thigh + RIG.shin) ** 2 - (hip.y - y) ** 2 - (hip.z - z) ** 2);
  return v(hip.x - reach, y, z);
}

/** The rabbit at a point in the rep: 0 = feet together, 1 = feet wide. `hop` lifts the feet off the floor. */
export function plankJackPose(progress: number, hop = 0): Skeleton {
  const plank = pushUpWith(HIGH_PLANK, 0);
  const tucked = proneLegs(BODY).feet;
  const leg = (s: Side) => legTo(BODY.hipOf(s), ankleOf(s, progress, hop), BODY.forward);
  const legs = {left: leg('left'), right: leg('right')};
  // Each foot keeps its tucked shape, carried with the ankle.
  const foot = (s: Side) => ({...tucked[s], at: tucked[s].at.add(legs[s].ankle.clone().sub(ANKLES[s]))});
  return {...plank, legs, feet: {left: foot('left'), right: foot('right')}};
}

export function pose(frame: AnimationFrame): Skeleton {
  return plankJackPose(frame.progress, hopAt(frame));
}

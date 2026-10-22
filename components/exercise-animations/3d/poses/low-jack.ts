import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {jackArms} from '../moves/stance';
import {FOOT, HIP_HALF, SIDE_SIGN, Y, Z, alternate, bodyFrame, flatFoot, legTo, skeleton, toesOut, v, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +z, the hips over the origin: a jack without the jump, one foot stepping out at a time. */

/** The hips sink a little on soft knees as the foot steps out. */
export const HIP_Y = {in: 1.3, out: 1.22};
/** How far the stepping foot goes out beyond hip-width, and how high it lifts on the way. */
export const STEP_OUT = 0.5;
export const STEP_LIFT = 0.08;

/** The ankle on `side`: under its hip, or stepped `amount` of the way out. */
export function ankleOf(side: Side, stepping: boolean, amount: number): THREE.Vector3 {
  if (!stepping) return v(SIDE_SIGN[side] * HIP_HALF, FOOT.ankle, 0);
  return v(SIDE_SIGN[side] * (HIP_HALF + STEP_OUT * amount), FOOT.ankle + STEP_LIFT * Math.sin(Math.PI * amount), 0);
}

/** The rabbit at a point in the rep: the left foot steps out and in (0 to 0.5), then the right; the arms rise overhead with each step. */
export function lowJackPose(progress: number): Skeleton {
  const {side, amount} = alternate(progress);
  const body = bodyFrame(v(0, lerp(HIP_Y.in, HIP_Y.out, amount), 0), Y, Z);
  const leg = (s: Side) => legTo(body.hipOf(s), ankleOf(s, s === side, amount), toesOut(Z, s));
  const legs = {left: leg('left'), right: leg('right')};
  const foot = (s: Side) => {
    const contact = flatFoot(legs[s].ankle, toesOut(Z, s));
    contact.at.y += legs[s].ankle.y - FOOT.ankle;
    return contact;
  };
  return skeleton(body, {
    ...jackArms(body, amount),
    legs,
    feet: {left: foot('left'), right: foot('right')},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return lowJackPose(frame.progress);
}

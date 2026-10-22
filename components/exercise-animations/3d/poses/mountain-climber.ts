import type {AnimationFrame} from '@/lib/exercise-animation';
import {ANKLES, HIGH_PLANK, proneBody, proneLegs, pushUpWith} from '../moves/prone';
import {RIG, Z, alternate, legTo, turn, type Body, type Side} from '../rig';
import type {Leg3D, Skeleton} from '../skeleton';

/**
 * A high plank, face down with the head towards +x and the toes planted
 * either side of the origin; the knees drive in to the chest in turn.
 */

export const BODY = proneBody(HIGH_PLANK.deg.top);
/** The driving leg at full drive, in degrees: the hip flexed from the plank, the knee bent. */
export const DRIVE = {hip: 120, knee: 140};

/** A leg driven `amount` of the way in. The knee bends ahead of the hip, so the foot clears the floor. */
export function drivenLeg(body: Body, side: Side, amount: number): Leg3D {
  const hip = body.hipOf(side);
  // Flexing the hip turns the thigh forward from pointing back along the body.
  const thigh = turn(body.up.clone().negate(), Z, DRIVE.hip * amount);
  const shin = turn(thigh, Z, -DRIVE.knee * Math.sin((Math.PI / 2) * Math.min(1, 1.4 * amount)));
  const knee = hip.clone().addScaledVector(thigh, RIG.thigh);
  const ankle = knee.clone().addScaledVector(shin, RIG.shin);
  return legTo(hip, ankle, knee.clone().sub(hip.clone().lerp(ankle, 0.5)));
}

/** The rabbit at a point in the rep: the left knee drives in and back (0 to 0.5), then the right. */
export function mountainClimberPose(progress: number): Skeleton {
  const plank = pushUpWith(HIGH_PLANK, 0);
  const {side, amount} = alternate(progress);
  const leg = drivenLeg(BODY, side, amount);
  // The foot keeps its tucked shape, carried with the ankle.
  const foot = proneLegs(BODY).feet[side];
  foot.at.add(leg.ankle.clone().sub(ANKLES[side]));
  return {...plank, legs: {...plank.legs, [side]: leg}, feet: {...plank.feet, [side]: foot}};
}

export function pose(frame: AnimationFrame): Skeleton {
  return mountainClimberPose(frame.progress);
}

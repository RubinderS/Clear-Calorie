import * as THREE from 'three';
import {lerp} from '@/lib/exercise-animation';
import {
  FOOT,
  HIP_HALF,
  RIG,
  X,
  bodyFrame,
  legTo,
  levelHead,
  pitchedFoot,
  sideSwing,
  skeleton,
  swungArm,
  v,
  type Body,
  type Side,
} from '../rig';
import type {Contact3D, Leg3D, Skeleton} from '../skeleton';

/**
 * Standing on the spot facing +x, the ankles hip-width either side of the
 * origin, working one leg at a time in the side plane while the arms swing.
 * High knees, butt kicks, the running man and standing hamstring curls
 * share it.
 */

/** The planted ankles, under the hips; a standing foot stays flat. */
export const ANKLES = {
  left: v(0, FOOT.ankle, HIP_HALF),
  right: v(0, FOOT.ankle, -HIP_HALF),
} satisfies Record<Side, THREE.Vector3>;
/** The hips over the ankles, the knees soft. */
export const HIP_Y = 1.34;

/** In degrees: the thigh forward of hanging down, the knee's bend, and how far the foot points beyond square to the shin. */
export type LegAngles = {thigh: number; knee: number; point: number};

const SOFT = THREE.MathUtils.radToDeg(Math.acos((HIP_Y - FOOT.ankle) / (RIG.thigh + RIG.shin)));
/** The standing leg: the thigh forward and the shin back by the same angle, so the ankle is under the hip. */
export const STANDING: LegAngles = {thigh: SOFT, knee: 2 * SOFT, point: 0};

export function lerpLeg(a: LegAngles, b: LegAngles, t: number): LegAngles {
  return {thigh: lerp(a.thigh, b.thigh, t), knee: lerp(a.knee, b.knee, t), point: lerp(a.point, b.point, t)};
}

/** Standing on the spot, the torso leaning `lean` degrees forward. */
export function spotBody(lean = 0): Body {
  const rad = THREE.MathUtils.degToRad(lean);
  return bodyFrame(v(0, HIP_Y, 0), v(Math.sin(rad), Math.cos(rad), 0), X);
}

/** A leg set by its angles; at `STANDING` it's planted with the foot flat. */
export function legAt(body: Body, side: Side, {thigh, knee, point}: LegAngles): {leg: Leg3D; foot: Contact3D} {
  const hip = body.hipOf(side);
  const ankle = hip.clone()
    .addScaledVector(sideSwing(thigh), RIG.thigh)
    .addScaledVector(sideSwing(thigh - knee), RIG.shin);
  // The knee bends forward, square to the thigh.
  const leg = legTo(hip, ankle, sideSwing(thigh + 90));
  // The foot stays square to the shin as the knee bends, then points.
  return {leg, foot: pitchedFoot(leg.ankle, X, knee - thigh - SOFT + point)};
}

/**
 * Arms pumping against the legs, as in running: each swings back as its own
 * thigh comes up and forward as the other one does, `gain` degrees of swing
 * for each degree of thigh, the elbows bent `bend` degrees.
 */
export function pumpingArms(body: Body, legs: Record<Side, LegAngles>, gain: number, bend = 90) {
  const drive = (side: Side) => legs[side].thigh - STANDING.thigh;
  return {
    left: swungArm(body, 'left', gain * (drive('right') - drive('left')), bend),
    right: swungArm(body, 'right', gain * (drive('left') - drive('right')), bend),
  };
}

/** The rabbit on the spot: the legs at their angles, the arms from `swungArm`. */
export function onTheSpot(
  body: Body,
  legs: Record<Side, LegAngles>,
  arms: Record<Side, ReturnType<typeof swungArm>>,
): Skeleton {
  const left = legAt(body, 'left', legs.left);
  const right = legAt(body, 'right', legs.right);
  return skeleton(body, {
    head: levelHead(body),
    arms: {left: arms.left.arm, right: arms.right.arm},
    paws: {left: arms.left.paw, right: arms.right.paw},
    legs: {left: left.leg, right: right.leg},
    feet: {left: left.foot, right: right.foot},
  });
}

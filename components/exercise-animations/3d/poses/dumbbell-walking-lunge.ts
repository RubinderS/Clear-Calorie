import * as THREE from 'three';
import {easeInOut, lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {carryingArms} from '../moves/carry';
import {FOOT, HIP_HALF, X, Y, bodyFrame, legTo, levelHead, pitchedFoot, skeleton, v} from '../rig';
import type {Skeleton} from '../skeleton';

/**
 * Facing +x, the hips over the origin. The front foot is the left (near
 * side), the back foot the right, each in line with its hip. Each move ends
 * stepping the back foot through to the front, into the lunge on the other
 * leg, which the scene plays as this one mirrored (see `sided` in specs).
 */

/** Planted front ankle, foot flat. */
export const FRONT_ANKLE = v(0.8, FOOT.ankle, HIP_HALF);
/** The back foot up on its toes behind. */
export const BACK_ANKLE = v(-0.78, 0.28, -HIP_HALF);
/** How far the back heel lifts: the foot's tip forward of flat, in degrees. */
export const BACK_FOOT_PITCH = 40;
/** The hips drop straight down between the feet: from the stepped-out lunge to the back knee just above the floor. */
export const HIP_Y = {top: 1.04, bottom: 0.76};
/** The torso a touch forward of upright, in degrees. */
const LEAN_DEG = 1.7;
/** Stepping through: how high the swinging foot clears the floor, and the hips rise as the legs pass under them. */
export const STEP = {lift: 0.22, rise: 0.1};

/** Where each foot ends the step-through: the right in front, the left up on its toes behind. */
const NEXT_FRONT_ANKLE = v(FRONT_ANKLE.x, FRONT_ANKLE.y, -HIP_HALF);
const NEXT_BACK_ANKLE = v(BACK_ANKLE.x, BACK_ANKLE.y, HIP_HALF);

/**
 * The rabbit at a point in the rep: 0 = top of the lunge, 1 = back knee just
 * above the floor. `step` is how far through stepping the back foot through
 * to the front it is, at the top: 0 = left foot in front, 1 = the right.
 */
export function walkingLungePose(progress: number, step = 0): Skeleton {
  const lean = THREE.MathUtils.degToRad(LEAN_DEG);
  const passing = Math.sin(Math.PI * step);
  const hipY = lerp(HIP_Y.top, HIP_Y.bottom, progress) + STEP.rise * passing;
  const body = bodyFrame(v(0, hipY, 0), v(Math.sin(lean), Math.cos(lean), 0), X);
  // The planted foot rolls back onto its toes as the back foot swings through, lifted clear.
  const planted = FRONT_ANKLE.clone().lerp(NEXT_BACK_ANKLE, step);
  const swinging = BACK_ANKLE.clone().lerp(NEXT_FRONT_ANKLE, step).addScaledVector(Y, STEP.lift * passing);
  // The front knee bends forward over the foot; the back knee drops towards the floor.
  const backKnee = X.clone().addScaledVector(Y, -2);
  const legs = {
    left: legTo(body.hipOf('left'), planted, X.clone().lerp(backKnee, step)),
    right: legTo(body.hipOf('right'), swinging, backKnee.clone().lerp(X, step)),
  };
  return skeleton(body, {
    head: levelHead(body),
    ...carryingArms(body),
    legs,
    feet: {
      left: pitchedFoot(planted, X, BACK_FOOT_PITCH * step),
      right: pitchedFoot(swinging, X, BACK_FOOT_PITCH * (1 - step)),
    },
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  const step = frame.phase.name === 'step' ? easeInOut(frame.phaseT) : 0;
  return walkingLungePose(frame.progress, step);
}

import * as THREE from 'three';
import type {AnimationFrame} from '@/lib/exercise-animation';
import {MIDFOOT_X, chainAt, legChain, plantedLegs} from '../moves/stance';
import {RIG, SIDE_SIGN, armTo, grippingPaw, levelHead, skeleton, type Side} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +x, the middle of the planted ankles at the origin. */

/** Where the bar sits on the upper back: a little down the torso from the shoulders, behind it. */
export const BAR_ON_BACK = {down: 0.08, back: 0.3} as const;
/** How far each hand grips out from the middle of the bar: just outside the shoulders. */
export const GRIP_HALF = 0.45;
/** How far the elbows flare out, as a share of pointing straight down. */
const ELBOW_FLARE = 0.5;
/**
 * Joint angles at the top and bottom (see `ChainAngles`). The thighs go
 * just below level at the bottom. The lean here is only a guide: the squat
 * sets it each frame to keep the bar over the mid-foot.
 */
export const SQUAT = {
  top: {shin: 4, thigh: 4, lean: 18},
  bottom: {shin: 32, thigh: 95, lean: 35},
};

/**
 * The squat's angles at a point in the rep. The legs follow the keyframes;
 * the torso leans just enough to keep the bar straight over the mid-foot.
 */
export function squatAngles(progress: number) {
  const angles = chainAt(SQUAT, progress);
  const {hip} = legChain(angles);
  // The bar is `reach` from the hips at `offset` behind the line of the torso.
  const up = RIG.torso - BAR_ON_BACK.down;
  const reach = Math.hypot(up, BAR_ON_BACK.back);
  const offset = Math.atan2(BAR_ON_BACK.back, up);
  const lean = offset + Math.asin((MIDFOOT_X - hip.x) / reach);
  return {...angles, lean: THREE.MathUtils.radToDeg(lean)};
}

/** The middle of the bar on the upper back at a point in the rep. */
export function squatBarAt(progress: number): THREE.Vector3 {
  return legChain(squatAngles(progress)).at(0, RIG.torso - BAR_ON_BACK.down, -BAR_ON_BACK.back);
}

/** The rabbit at a point in the rep: 0 = standing tall, 1 = thighs just below level. */
export function barbellSquatPose(progress: number): Skeleton {
  const body = legChain(squatAngles(progress));
  const bar = squatBarAt(progress);
  const hand = (side: Side) => bar.clone().addScaledVector(body.right, SIDE_SIGN[side] * GRIP_HALF);
  // The elbows point down under the bar, a little back and flared out to the sides.
  const elbows = (side: Side) => body.up.clone().negate()
    .addScaledVector(body.forward, -0.3)
    .addScaledVector(body.right, SIDE_SIGN[side] * ELBOW_FLARE);
  const arm = (side: Side) => armTo(body.shoulderOf(side), hand(side), elbows(side));
  const arms = {left: arm('left'), right: arm('right')};
  // Palms forward behind the bar, fingers over the top.
  const paw = (side: Side) => grippingPaw(arms[side].wrist, body.right, body.forward.clone().negate(), body.up);
  return skeleton(body, {
    // Eyes forward: the head stays level as the torso leans.
    head: levelHead(body),
    arms,
    ...plantedLegs(body),
    paws: {left: paw('left'), right: paw('right')},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  return barbellSquatPose(frame.progress);
}

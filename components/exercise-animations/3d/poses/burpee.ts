import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {ANKLES as PRONE_ANKLES, proneBody, proneLegs} from '../moves/prone';
import {chainAt, legChain, type ChainAngles} from '../moves/stance';
import {SIZES} from '../rabbit-3d';
import {
  FOOT,
  RIG,
  SIDE_SIGN,
  SIDES,
  X,
  Y,
  armTo,
  bodyFrame,
  flatFoot,
  legTo,
  levelHead,
  openPaw,
  shifted,
  sideSwing,
  skeleton,
  slerp,
  swungArm,
  toesOut,
  v,
  type Body,
  type Side,
} from '../rig';
import type {Contact3D, Skeleton} from '../skeleton';

/**
 * Facing +x, the ankles either side of the origin: squat and plant the hands
 * ahead of the feet, jump the feet back to a high plank and in again, stand,
 * then jump reaching overhead.
 */

/** Rep progress at each key pose. */
export const KEY = {reach: 0, stand: 0.2, squat: 0.45, plank: 1} as const;
/** The feet a little wider than the hips, toes turned out, so the knees open round the chest in the squat. */
export const ANKLES = {
  left: v(0, FOOT.ankle, 0.28),
  right: v(0, FOOT.ankle, -0.28),
} satisfies Record<Side, THREE.Vector3>;
const TOE_OUT = 20;
/** Standing tall, and squatting with the hands down (see `ChainAngles`). */
export const STAND: ChainAngles = {shin: 10, thigh: 10, lean: 3};
export const SQUAT: ChainAngles = {shin: 45, thigh: 110, lean: 50};
/** Where the hands are planted, ahead of the feet: how far forward, and out from the middle. */
export const HANDS = {x: 1.1, out: 0.3};
/** The plank's angle above the floor: heels to head in a line, the shoulders over the hands. */
export const PLANK_DEG = 27.8;
/** Standing arms, swung forward of hanging down, in degrees: by the sides, then up and out in a V overhead. */
const ARMS = {down: 5, overhead: 165, bend: 10, out: {down: 0.12, overhead: 0.5}};
/** How far the hips pop up, and the feet lift, as the feet jump back and in. */
const HIP_RISE = 0.3;
const FEET_LIFT = 0.15;
/** Highest point of the jump at the top. */
export const HOP = 0.25;

const rad = THREE.MathUtils.degToRad;

export function handOf(side: Side): THREE.Vector3 {
  return v(HANDS.x, SIZES.paw, -SIDE_SIGN[side] * HANDS.out);
}
const HAND_MIDDLE = v(HANDS.x, SIZES.paw, 0);

/** The plank, the toes far enough behind the hands to put the shoulders over them. */
const PLANK_SHIFT = v(HANDS.x - (RIG.thigh + RIG.shin + RIG.torso) * Math.cos(rad(PLANK_DEG)), 0, 0);
export const PLANK: Body = (() => {
  const body = proneBody(PLANK_DEG);
  return bodyFrame(body.hip.add(PLANK_SHIFT), body.up, body.forward);
})();
const PLANK_ANKLES = {
  left: PRONE_ANKLES.left.clone().add(PLANK_SHIFT),
  right: PRONE_ANKLES.right.clone().add(PLANK_SHIFT),
};

/** Planted hands: the elbows bend back towards the feet, out and up, as in a push-up. */
function plantedPole(body: Body, side: Side): THREE.Vector3 {
  return X.clone().negate().addScaledVector(body.right, SIDE_SIGN[side] * 0.6).addScaledVector(Y, 0.5);
}

/** Eyes level standing, looking a little ahead along the floor as the body tips forward, as in a push-up. */
function head(body: Body) {
  const rise = THREE.MathUtils.radToDeg(Math.asin(body.up.y));
  return levelHead(body, ((8 - PLANK_DEG) * (90 - rise)) / (90 - PLANK_DEG));
}

/** The standing legs: to the planted ankles, the knees out over the toes, the feet flat. */
function standingLegs(body: Body): Pick<Skeleton, 'legs' | 'feet'> {
  const leg = (side: Side) => legTo(body.hipOf(side), ANKLES[side], toesOut(X, side, TOE_OUT));
  const foot = (side: Side) => flatFoot(ANKLES[side], toesOut(X, side, TOE_OUT));
  return {legs: {left: leg('left'), right: leg('right')}, feet: {left: foot('left'), right: foot('right')}};
}

/** Standing tall: 0 = arms by the sides, 1 = reaching up overhead. */
function standing(t: number): Skeleton {
  const body = legChain(STAND);
  const arm = (side: Side) =>
    swungArm(body, side, lerp(ARMS.down, ARMS.overhead, t), ARMS.bend, lerp(ARMS.out.down, ARMS.out.overhead, t));
  const left = arm('left');
  const right = arm('right');
  return skeleton(body, {
    head: head(body),
    arms: {left: left.arm, right: right.arm},
    paws: {left: left.paw, right: right.paw},
    ...standingLegs(body),
  });
}

/** Squatting down: 0 = standing, 1 = squatting with the hands planted. */
function squatting(t: number): Skeleton {
  const body = legChain(chainAt({top: STAND, bottom: SQUAT}, t));
  const arm = (side: Side) => {
    // The hands reach from by the sides down to the floor ahead of the feet.
    const hanging = swungArm(body, side, ARMS.down, ARMS.bend).arm.wrist;
    const pole = sideSwing(ARMS.down - 90).lerp(plantedPole(body, side), t);
    return armTo(body.shoulderOf(side), hanging.lerp(handOf(side), t), pole);
  };
  const arms = {left: arm('left'), right: arm('right')};
  const outward = (side: Side) => body.right.clone().multiplyScalar(SIDE_SIGN[side]);
  return skeleton(body, {
    head: head(body),
    arms,
    paws: {left: openPaw(arms.left, outward('left')), right: openPaw(arms.right, outward('right'))},
    ...standingLegs(body),
  });
}

/** In the side plane: the point `ra` from `a` and `rb` from `b`, above the line between them. */
function meet(a: THREE.Vector3, ra: number, b: THREE.Vector3, rb: number): THREE.Vector3 {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const along = (ra * ra - rb * rb + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ra * ra - along * along));
  const ux = (b.x - a.x) / d;
  const uy = (b.y - a.y) / d;
  const up = ux >= 0 ? 1 : -1;
  return v(a.x + ux * along - up * uy * h, a.y + uy * along + up * ux * h, 0);
}

/** Where a foot sits from its ankle, and which way it points: flat in the squat, toes tucked in the plank. */
function footFrom(ankle: THREE.Vector3, foot: Contact3D) {
  return {offset: foot.at.clone().sub(ankle), forward: foot.forward, up: foot.up};
}

/** Jumping the feet back: 0 = squatting with the hands planted, 1 = the plank. */
function jumpingBack(t: number): Skeleton {
  const squat = legChain(SQUAT);
  // The hips pop up on the way, and the torso runs from them to where the arms reach the hands.
  const hip = squat.hip.clone().lerp(PLANK.hip, t).addScaledVector(Y, HIP_RISE * Math.sin(Math.PI * t));
  const reach = lerp(squat.shoulder.distanceTo(HAND_MIDDLE), PLANK.shoulder.distanceTo(HAND_MIDDLE), t);
  const body = bodyFrame(hip, meet(hip, RIG.torso, HAND_MIDDLE, reach).sub(hip), X);
  const arm = (side: Side) => armTo(body.shoulderOf(side), handOf(side), plantedPole(body, side));
  const arms = {left: arm('left'), right: arm('right')};
  const tucked = proneLegs(proneBody(PLANK_DEG)).feet;
  const parts = SIDES.map((side) => {
    const ankle = ANKLES[side].clone().lerp(PLANK_ANKLES[side], t).addScaledVector(Y, FEET_LIFT * Math.sin(Math.PI * t));
    // The knees point ahead over the toes, then straighten into the plank.
    const leg = legTo(body.hipOf(side), ankle, toesOut(X, side, TOE_OUT));
    const from = footFrom(ANKLES[side], flatFoot(ANKLES[side], toesOut(X, side, TOE_OUT)));
    const to = footFrom(PRONE_ANKLES[side], tucked[side]);
    const foot: Contact3D = {
      at: leg.ankle.clone().add(from.offset.lerp(to.offset, t)),
      forward: slerp(from.forward, to.forward, t),
      up: slerp(from.up, to.up, t),
    };
    return {leg, foot};
  });
  const outward = (side: Side) => body.right.clone().multiplyScalar(SIDE_SIGN[side]);
  return skeleton(body, {
    head: head(body),
    arms,
    paws: {left: openPaw(arms.left, outward('left')), right: openPaw(arms.right, outward('right'))},
    legs: {left: parts[0].leg, right: parts[1].leg},
    feet: {left: parts[0].foot, right: parts[1].foot},
  });
}

/**
 * The rabbit at a point in the rep: 0 = standing reaching overhead, 0.2 =
 * standing, 0.45 = squatting with the hands planted, 1 = the plank.
 */
export function burpeePose(progress: number): Skeleton {
  if (progress <= KEY.stand) return standing(1 - progress / KEY.stand);
  if (progress <= KEY.squat) return squatting((progress - KEY.stand) / (KEY.squat - KEY.stand));
  return jumpingBack((progress - KEY.squat) / (KEY.plank - KEY.squat));
}

/** The jump at a frame: rising through the jump, falling through the landing. */
export function hopAt(frame: AnimationFrame): number {
  if (frame.phase.name === 'jump') return HOP * Math.sin((Math.PI / 2) * frame.phaseT);
  if (frame.phase.name === 'land') return HOP * Math.cos((Math.PI / 2) * frame.phaseT);
  return 0;
}

export function pose(frame: AnimationFrame): Skeleton {
  const hop = hopAt(frame);
  const s = burpeePose(frame.progress);
  // The ears bounce a little higher than the head on the jump.
  return hop > 0 ? {...shifted(s, Y.clone().multiplyScalar(hop)), earLift: hop * 0.15} : s;
}

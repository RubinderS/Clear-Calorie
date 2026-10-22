import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {ANKLES} from '../moves/on-the-spot';
import {FOOT, X, bodyFrame, legTo, levelHead, pitchedFoot, skeleton, swungArm, v, type Side} from '../rig';
import {SIZES} from '../rabbit-3d';
import type {Skeleton} from '../skeleton';

/**
 * Facing +x on the spot, the middle of the ankles at the origin: running in
 * place, hopping from one foot to the other. Each foot lands under its hip
 * and pushes off its toes as the other knee drives up; both are off the
 * floor between strides. The arms pump against the legs.
 */

/** The hips: lowest halfway through each foot's time on the floor, highest in the air between strides. */
export const HIP_Y = {low: 1.27, high: 1.37};
/** Degrees the torso leans forward, as in running. */
export const LEAN = 10;
/** Degrees each arm swings forward and back of hanging down, and the elbows' bend. */
const ARM = {swing: 45, bend: 85};

/** A point in one leg's stride: the ankle along and above the floor, and the foot's tip toes-down. */
type Key = {x: number; y: number; pitch: number};

const rad = THREE.MathUtils.degToRad;
const {radius, scale} = SIZES.foot;

/** How high the ankle sits with the foot tipped `pitch` toes-down, so its lowest point just touches the floor. */
export function onToes(pitch: number): number {
  const p = rad(pitch);
  const lowest = Math.hypot(radius * scale[2] * Math.sin(p), radius * scale[1] * Math.cos(p));
  // The foot's middle sits ahead of and below the ankle, as in `pitchedFoot`.
  const middle = FOOT.forward * Math.sin(p) + (FOOT.ankle - FOOT.height) * Math.cos(p);
  return middle + lowest + (FOOT.height - radius * scale[1]);
}

/** Where the foot lands, just ahead of the hip, and where it pushes off, just behind on its toes. */
export const LAND: Key = {x: 0.08, y: FOOT.ankle, pitch: 0};
export const PUSH_OFF: Key = {x: -0.12, y: onToes(30), pitch: 30};
/** How much of each stride the foot is on the floor; the rest of the half stride, both are in the air. */
export const STANCE = 0.4;
/** The heel stays down this far through the foot's time on the floor, then peels up. */
const HEEL_DOWN = 0.5;

/** The swing, evenly spaced from push-off to landing: the heel kicks up behind, the knee drives up to the stomach, the foot reaches down. */
const SWING: Key[] = [
  PUSH_OFF,
  {x: -0.3, y: 0.45, pitch: 60},
  {x: 0.05, y: 0.8, pitch: 55},
  {x: 0.45, y: 0.92, pitch: 30},
  {x: 0.3, y: 0.42, pitch: 10},
  LAND,
];

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3);
}

/** A smooth curve through the swing's keys, `t` from 0 (leaving the floor) to 1 (landing). */
function swingAt(t: number): Key {
  const span = SWING.length - 1;
  const i = Math.min(span - 1, Math.floor(t * span));
  const local = t * span - i;
  const key = (j: number) => SWING[THREE.MathUtils.clamp(j, 0, span)];
  const along = (k: keyof Key) => catmullRom(key(i - 1)[k], key(i)[k], key(i + 1)[k], key(i + 2)[k], local);
  return {x: along('x'), y: along('y'), pitch: along('pitch')};
}

/**
 * One leg `u` of the way through its stride: on the floor from landing
 * until it pushes off (0 to `STANCE`), then swinging through with the knee
 * driving up and landing again at 1.
 */
export function strideAt(u: number): Key {
  if (u >= STANCE) return swingAt((u - STANCE) / (1 - STANCE));
  const t = u / STANCE;
  const peel = THREE.MathUtils.smoothstep(t, HEEL_DOWN, 1);
  const pitch = lerp(LAND.pitch, PUSH_OFF.pitch, peel);
  return {x: lerp(LAND.x, PUSH_OFF.x, t), y: onToes(pitch), pitch};
}

/** Each leg's place in its stride: the left knee drives up a quarter of the way through the rep, the right three quarters. */
export function strideOf(side: Side, progress: number): number {
  return (progress + (side === 'left' ? 0.5 : 0)) % 1;
}

/** The rabbit at a point in the rep: on the right foot as the left knee drives up (0 to 0.5), then the other way round. */
export function runningManPose(progress: number): Skeleton {
  // Two bounces a rep: down through each foot's time on the floor, up in the air after it pushes off.
  const flight = (STANCE + 0.5) / 2;
  const rise = (1 + Math.cos(4 * Math.PI * (progress - flight))) / 2;
  const hipY = lerp(HIP_Y.low, HIP_Y.high, rise);
  const body = bodyFrame(v(0, hipY, 0), v(Math.sin(rad(LEAN)), Math.cos(rad(LEAN)), 0), X);
  const stride = (side: Side) => {
    const {x, y, pitch} = strideAt(strideOf(side, progress));
    const ankle = v(x, y, ANKLES[side].z);
    // The knee bends forward.
    return {leg: legTo(body.hipOf(side), ankle, X), foot: pitchedFoot(ankle, X, pitch)};
  };
  const left = stride('left');
  const right = stride('right');
  // Each arm swings forward as the other side's knee drives up.
  const swing = ARM.swing * Math.sin(2 * Math.PI * progress);
  const arms = {left: swungArm(body, 'left', -swing, ARM.bend), right: swungArm(body, 'right', swing, ARM.bend)};
  return skeleton(body, {
    head: levelHead(body),
    // The ears lag a little on the way up.
    earLift: 0.4 * (hipY - HIP_Y.low),
    arms: {left: arms.left.arm, right: arms.right.arm},
    paws: {left: arms.left.paw, right: arms.right.paw},
    legs: {left: left.leg, right: right.leg},
    feet: {left: left.foot, right: right.foot},
  });
}

export function pose(frame: AnimationFrame): Skeleton {
  // Running doesn't pause between strides, so the rep runs on at an even pace rather than easing at each phase.
  const {from, to} = frame.phase;
  return runningManPose(lerp(from, to, frame.phaseT));
}

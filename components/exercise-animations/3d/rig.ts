import * as THREE from 'three';
import type {Arm3D, Contact3D, Grip, Leg3D, Skeleton} from './skeleton';

/**
 * The maths every native 3D pose shares: segment lengths, two-bone IK and
 * the body's own frame. Poses are in scene units, the floor at y = 0. A
 * side-type exercise faces +x, a front-type one +z.
 */

/**
 * Segment lengths, in scene units. One set for every exercise: the 2D front
 * view drew the arms and torso shorter because they were seen head-on, but in
 * 3D the camera does the foreshortening, so the rabbit is the same everywhere.
 */
export const RIG = {torso: 1.2, upperArm: 0.62, forearm: 0.56, thigh: 0.605, shin: 0.605} as const;
/** How far each shoulder and hip joint sits out from the body's middle. */
export const SHOULDER_HALF = 0.28;
export const HIP_HALF = 0.15;
/** Middle of the shoulders to the centre of the head: up the torso, and back. */
export const HEAD = {up: 0.42, back: 0.04} as const;
/** A flat foot: the ankle's height, and how far forward and up its middle sits from it. */
export const FOOT = {ankle: 0.15, forward: 0.12, height: 0.08} as const;

export type Side = 'left' | 'right';
export const SIDES = ['left', 'right'] as const;
/** Which way each side lies along the body's `right` axis. */
export const SIDE_SIGN = {left: -1, right: 1} as const;

export const X = new THREE.Vector3(1, 0, 0);
export const Y = new THREE.Vector3(0, 1, 0);
export const Z = new THREE.Vector3(0, 0, 1);

export function v(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

export function lerp3(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  return a.clone().lerp(b, t);
}

/** Turns unit direction `a` towards `b` at an even rate, `t` of the way. */
export function slerp(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const turn = new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
  return a.clone().normalize().applyQuaternion(new THREE.Quaternion().slerp(turn, t));
}

/** `direction` turned `deg` degrees about `axis` (right-handed). */
export function turn(direction: THREE.Vector3, axis: THREE.Vector3, deg: number): THREE.Vector3 {
  return direction.clone().applyAxisAngle(axis.clone().normalize(), THREE.MathUtils.degToRad(deg));
}

/** The part of `direction` square to `axis`, as a unit vector. */
function across(direction: THREE.Vector3, axis: THREE.Vector3): THREE.Vector3 {
  return direction.clone().addScaledVector(axis, -direction.dot(axis)).normalize();
}

/**
 * Two-bone IK in 3D: the middle joint (elbow or knee) for segments `l1` and
 * `l2` from `root` towards `target`. It bends towards `pole`, a direction, so
 * pick the one that bends the joint the anatomically right way. A target out
 * of reach is pulled in, so `end` can differ from `target`; the segments never
 * stretch.
 */
export function solveTwoBone(
  root: THREE.Vector3,
  target: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
): {joint: THREE.Vector3; end: THREE.Vector3} {
  const offset = target.clone().sub(root);
  const reach = offset.length();
  const d = THREE.MathUtils.clamp(reach, Math.abs(l1 - l2) + 1e-9, l1 + l2);
  const along = reach > 1e-9 ? offset.divideScalar(reach) : across(pole, Y);
  const end = root.clone().addScaledVector(along, d);
  // From the root along the line to the foot of the joint, then out towards the pole.
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let bend = across(pole, along);
  if (!Number.isFinite(bend.x)) bend = across(Math.abs(along.y) < 0.9 ? Y : X, along);
  return {joint: root.clone().addScaledVector(along, a).addScaledVector(bend, h), end};
}

/** The body's own frame: hips, the torso's up, the chest's forward and the body's right. */
export type Body = {
  hip: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  /** The middle of the shoulders, a torso's length up from the hips. */
  shoulder: THREE.Vector3;
  /** A point `right`, `up` and `forward` of the hips in this frame. */
  at(right: number, up: number, forward: number): THREE.Vector3;
  shoulderOf(side: Side): THREE.Vector3;
  hipOf(side: Side): THREE.Vector3;
};

/**
 * The frame from the middle of the hips, the way the torso runs and roughly
 * the way the chest faces (made square to `up`). `right` is up × forward, the
 * `right` side in `Skeleton`.
 */
export function bodyFrame(hip: THREE.Vector3, up: THREE.Vector3, forward: THREE.Vector3): Body {
  const u = up.clone().normalize();
  const f = across(forward, u);
  const r = new THREE.Vector3().crossVectors(u, f);
  const at = (x: number, y: number, z: number) =>
    hip.clone().addScaledVector(r, x).addScaledVector(u, y).addScaledVector(f, z);
  return {
    hip: hip.clone(),
    up: u,
    forward: f,
    right: r,
    shoulder: at(0, RIG.torso, 0),
    at,
    shoulderOf: (side) => at(SIDE_SIGN[side] * SHOULDER_HALF, RIG.torso, 0),
    hipOf: (side) => at(SIDE_SIGN[side] * HIP_HALF, 0, 0),
  };
}

/** A limb's direction `deg` round from hanging straight down, swung out to `side` across the front of the body. */
export function frontalSwing(body: Body, side: Side, deg: number): THREE.Vector3 {
  const rad = THREE.MathUtils.degToRad(deg);
  return body.right.clone().multiplyScalar(SIDE_SIGN[side] * Math.sin(rad)).addScaledVector(body.up, -Math.cos(rad));
}

/** An arm from `shoulder` with the wrist at `wrist`, the elbow bent towards `pole`. */
export function armTo(shoulder: THREE.Vector3, wrist: THREE.Vector3, pole: THREE.Vector3): Arm3D {
  const {joint, end} = solveTwoBone(shoulder, wrist, RIG.upperArm, RIG.forearm, pole);
  return {shoulder: shoulder.clone(), elbow: joint, wrist: end};
}

/** A leg from `hip` with the ankle at `ankle`, the knee bent towards `pole`. */
export function legTo(hip: THREE.Vector3, ankle: THREE.Vector3, pole: THREE.Vector3): Leg3D {
  const {joint, end} = solveTwoBone(hip, ankle, RIG.thigh, RIG.shin, pole);
  return {hip: hip.clone(), knee: joint, ankle: end};
}

/**
 * The head on top of the torso, facing `forward` with its top towards `up`
 * (the body's own by default). `ahead` moves it forward of where it sits on
 * the neck, to rest it on a pad behind.
 */
export function headOn(body: Body, look: {forward?: THREE.Vector3; up?: THREE.Vector3; ahead?: number} = {}) {
  const headUp = (look.up ?? body.up).clone().normalize();
  return {
    head: body.shoulder.clone().addScaledVector(body.up, HEAD.up).addScaledVector(body.forward, look.ahead ?? -HEAD.back),
    headUp,
    headForward: across(look.forward ?? body.forward, headUp),
  };
}

/**
 * The head with the eyes level, looking the way the body faces along the
 * floor, nodded `nod` degrees down. For a body that's upright or leaning.
 */
export function levelHead(body: Body, nod = 0, ahead?: number) {
  const level = across(body.forward, Y);
  const side = new THREE.Vector3().crossVectors(Y, level);
  return headOn(body, {forward: turn(level, side, nod), up: turn(Y, side, nod), ahead});
}

/**
 * The head of a body lying back (on a flat or inclined bench, head towards
 * -x), the eyes looking `deg` above level towards +x, so a tucked chin
 * looks at the feet. `ahead` rests it on the pad, as in `headOn`.
 */
export function lookingUp(body: Body, deg: number, ahead?: number) {
  const rad = THREE.MathUtils.degToRad(deg);
  const forward = X.clone().multiplyScalar(Math.cos(rad)).addScaledVector(Y, Math.sin(rad));
  const up = X.clone().multiplyScalar(-Math.sin(rad)).addScaledVector(Y, Math.cos(rad));
  return headOn(body, {forward, up, ahead});
}

/** How far a relaxed stance turns the toes out, in degrees. */
export const TOE_OUT = 10;

/** `forward` along the floor, turned `deg` out to `side`: the way that foot's toes point. */
export function toesOut(forward: THREE.Vector3, side: Side, deg = TOE_OUT): THREE.Vector3 {
  // About up, a positive turn swings forward towards the body's right.
  return turn(across(forward, Y), Y, SIDE_SIGN[side] * deg);
}

/** A foot flat on the floor, toes along `toes`, its middle in front of the ankle. */
export function flatFoot(ankle: THREE.Vector3, toes: THREE.Vector3): Contact3D {
  const forward = across(toes, Y);
  const at = ankle.clone().addScaledVector(forward, FOOT.forward);
  at.y = FOOT.height;
  return {at, forward, up: Y.clone()};
}

/**
 * A foot tipped `pitch` degrees toes-down from flat, its middle where it
 * sits from the ankle on a flat foot: up on the toes, or laces down.
 */
export function pitchedFoot(ankle: THREE.Vector3, toes: THREE.Vector3, pitch: number): Contact3D {
  const ahead = across(toes, Y);
  const side = new THREE.Vector3().crossVectors(Y, ahead);
  const forward = turn(ahead, side, pitch);
  const up = turn(Y, side, pitch);
  const at = ankle.clone().addScaledVector(forward, FOOT.forward).addScaledVector(up, FOOT.height - FOOT.ankle);
  return {at, forward, up};
}

/** An open paw at the end of the arm, pointing along the forearm. */
export function openPaw(arm: Arm3D, up: THREE.Vector3): Contact3D {
  const forward = arm.wrist.clone().sub(arm.elbow).normalize();
  return {at: arm.wrist.clone(), forward, up: across(up, forward)};
}

/**
 * A paw closed round a bar at `at` running along `bar`. The fingers wrap
 * over the side `over` points to, usually on along the forearm, and the
 * palm sits on the side of the bar `palm` points to; the paw lines up with
 * the bar and `over`, so `palm` only picks the side.
 */
export function grippingPaw(at: THREE.Vector3, bar: THREE.Vector3, palm: THREE.Vector3, over: THREE.Vector3): Contact3D {
  const axis = bar.clone().normalize();
  const fingers = across(over, axis);
  // The fingers run palm × axis, so the palm is axis × fingers, or the other way with the bar flipped.
  const p = new THREE.Vector3().crossVectors(axis, fingers);
  if (p.dot(palm) < 0) {
    p.negate();
    axis.negate();
  }
  const grip: Grip = {axis, palm: p};
  return {at: at.clone(), forward: p.clone(), up: fingers, grip};
}

/** The whole skeleton moved by `by`, as one rigid piece. */
export function shifted(s: Skeleton, by: THREE.Vector3): Skeleton {
  const move = (p: THREE.Vector3) => p.clone().add(by);
  const contact = (c: Contact3D): Contact3D => ({...c, at: move(c.at)});
  const arm = (a: Arm3D): Arm3D => ({shoulder: move(a.shoulder), elbow: move(a.elbow), wrist: move(a.wrist)});
  const leg = (l: Leg3D): Leg3D => ({hip: move(l.hip), knee: move(l.knee), ankle: move(l.ankle)});
  return {
    ...s,
    hip: move(s.hip),
    shoulder: move(s.shoulder),
    head: move(s.head),
    arms: {left: arm(s.arms.left), right: arm(s.arms.right)},
    legs: {left: leg(s.legs.left), right: leg(s.legs.right)},
    feet: {left: contact(s.feet.left), right: contact(s.feet.right)},
    paws: {left: contact(s.paws.left), right: contact(s.paws.right)},
  };
}

/** Puts the parts together into a skeleton. */
export function skeleton(
  body: Body,
  parts: {
    head?: ReturnType<typeof headOn>;
    earLift?: number;
    arms: Skeleton['arms'];
    legs: Skeleton['legs'];
    feet: Skeleton['feet'];
    paws: Skeleton['paws'];
  },
): Skeleton {
  const head = parts.head ?? headOn(body);
  return {
    hip: body.hip.clone(),
    shoulder: body.shoulder.clone(),
    forward: body.forward.clone(),
    ...head,
    earLift: parts.earLift ?? 0,
    arms: parts.arms,
    legs: parts.legs,
    feet: parts.feet,
    paws: parts.paws,
  };
}

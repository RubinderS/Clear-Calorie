import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import * as THREE from 'three';
import {SPECS} from '@/components/exercise-animations/3d/specs';
import {createKit} from '@/components/exercise-animations/3d/kit';
import {SHORTS, SIZES, createRabbit3D} from '@/components/exercise-animations/3d/rabbit-3d';
import {FOOT, RIG, SHOULDER_HALF, SIDES, SIDE_SIGN, X, Y, Z, type Side} from '@/components/exercise-animations/3d/rig';
import type {Skeleton} from '@/components/exercise-animations/3d/skeleton';
import * as facePull from '@/components/exercise-animations/3d/poses/band-face-pull';
import * as extension from '@/components/exercise-animations/3d/poses/band-triceps-extension';
import * as pushdown from '@/components/exercise-animations/3d/poses/band-triceps-pushdown';
import * as bench from '@/components/exercise-animations/3d/poses/barbell-bench-press';
import * as row from '@/components/exercise-animations/3d/poses/barbell-bent-over-row';
import * as squat from '@/components/exercise-animations/3d/poses/barbell-squat';
import * as splitSquat from '@/components/exercise-animations/3d/poses/bulgarian-split-squat';
import * as chinUp from '@/components/exercise-animations/3d/poses/chin-up';
import * as closeGrip from '@/components/exercise-animations/3d/poses/close-grip-push-up';
import * as calfRaise from '@/components/exercise-animations/3d/poses/dumbbell-calf-raise';
import * as curl from '@/components/exercise-animations/3d/poses/dumbbell-curl';
import * as fly from '@/components/exercise-animations/3d/poses/dumbbell-fly';
import * as lateralRaise from '@/components/exercise-animations/3d/poses/dumbbell-lateral-raise';
import * as press from '@/components/exercise-animations/3d/poses/dumbbell-shoulder-press';
import * as lunge from '@/components/exercise-animations/3d/poses/dumbbell-walking-lunge';
import * as wristCurl from '@/components/exercise-animations/3d/poses/dumbbell-wrist-curl';
import * as goblet from '@/components/exercise-animations/3d/poses/goblet-squat';
import * as kneeRaise from '@/components/exercise-animations/3d/poses/hanging-knee-raise';
import * as inclineCurl from '@/components/exercise-animations/3d/poses/incline-dumbbell-curl';
import * as inclinePress from '@/components/exercise-animations/3d/poses/incline-dumbbell-press';
import * as jumpingJack from '@/components/exercise-animations/3d/poses/jumping-jack';
import * as oneArmRow from '@/components/exercise-animations/3d/poses/one-arm-dumbbell-row';
import * as plank from '@/components/exercise-animations/3d/poses/plank';
import * as pullUp from '@/components/exercise-animations/3d/poses/pull-up';
import * as pushUp from '@/components/exercise-animations/3d/poses/push-up';
import * as rdl from '@/components/exercise-animations/3d/poses/romanian-deadlift';
import * as legCurl from '@/components/exercise-animations/3d/poses/sliding-leg-curl';
import * as benchMoves from '@/components/exercise-animations/3d/moves/bench';
import * as hanging from '@/components/exercise-animations/3d/moves/hanging';
import * as hinge from '@/components/exercise-animations/3d/moves/hinge';
import * as prone from '@/components/exercise-animations/3d/moves/prone';
import * as stance from '@/components/exercise-animations/3d/moves/stance';
import * as standing from '@/components/exercise-animations/3d/moves/standing';
import {cycleMs, frameAt, type AnimationFrame} from '@/lib/exercise-animation';
import {exerciseCatalog} from '@/lib/exercise-catalog';

// The self-check from docs/exercise-animation-prompt.md, run every 25 ms of
// a rep without a browser: the rig, the bends, planted points, grips, the
// form, and nothing passing through the equipment.

/** Every frame of a rep, 25 ms apart. */
function framesOf(id: string): AnimationFrame[] {
  const entry = exerciseCatalog.get(id)!;
  const total = cycleMs(entry.phases);
  return Array.from({length: Math.ceil(total / 25)}, (_, i) => frameAt(entry.phases, i * 25));
}

/** A frame at a point in the rep, ignoring the hop and phase. */
const at = (progress: number): AnimationFrame => ({
  phaseIndex: 0,
  phase: {name: '', durationMs: 1, from: progress, to: progress, cue: ''},
  phaseT: 0,
  progress,
});
const steps = Array.from({length: 41}, (_, i) => i / 40);

function joints(s: Skeleton): THREE.Vector3[] {
  return [
    s.hip, s.shoulder, s.head,
    ...SIDES.flatMap((side) => [
      s.arms[side].shoulder, s.arms[side].elbow, s.arms[side].wrist,
      s.legs[side].hip, s.legs[side].knee, s.legs[side].ankle,
      s.feet[side].at, s.paws[side].at,
    ]),
  ];
}

const close = (a: number, b: number, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;
const same = (a: THREE.Vector3, b: THREE.Vector3) => a.distanceTo(b) < 1e-9;
const up = (s: Skeleton) => s.shoulder.clone().sub(s.hip).normalize();
const rightOf = (s: Skeleton) => new THREE.Vector3().crossVectors(up(s), s.forward);
const outward = (s: Skeleton, side: Side) => rightOf(s).multiplyScalar(SIDE_SIGN[side]);
const between = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().lerp(b, 0.5);
const unit = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

/** Angle at `b` between `a` and `c`, in degrees. */
function jointAngle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  return THREE.MathUtils.radToDeg(a.clone().sub(b).angleTo(c.clone().sub(b)));
}

/** How far `joint` sits off the line from `root` to `end`, as a vector: the way it bends. */
function bendOf(root: THREE.Vector3, joint: THREE.Vector3, end: THREE.Vector3) {
  const along = end.clone().sub(root).normalize();
  const rel = joint.clone().sub(root);
  return rel.addScaledVector(along, -rel.dot(along));
}

// What each native exercise should do, written from the exercise rather
// than from its pose code.

type Expect = {
  /** The way each elbow should bend: it sits on this side of the line from shoulder to wrist. */
  elbow(s: Skeleton, side: Side, frame: AnimationFrame): THREE.Vector3;
  /** Points that stay put through the whole rep: planted feet, hands, knees. */
  planted?(s: Skeleton): THREE.Vector3[];
  /** For a paw closed round a handle or bar: which side of it the palm is on, and which way the fingers wrap; null for an open paw. */
  grip?(s: Skeleton, side: Side, frame: AnimationFrame): {palm: THREE.Vector3; over: THREE.Vector3} | null;
  /** How far the paw sits out along the hand from the wrist, when it isn't at the wrist. */
  hand?: number;
};

const plantedFeet = (s: Skeleton) => SIDES.flatMap((side) => [s.legs[side].ankle, s.feet[side].at]);
const forearm = (s: Skeleton, side: Side) => s.arms[side].wrist.clone().sub(s.arms[side].elbow).normalize();
/** The way the paw is moving at a frame as the rep goes on, from the poses either side. */
function pawMotion(id: string, side: Side, progress: number) {
  const pose = SPECS[id].pose;
  return pose(at(Math.min(1, progress + 1e-3))).paws[side].at.sub(pose(at(Math.max(0, progress - 1e-3))).paws[side].at);
}
/** The way the hand runs: on along the forearm, or from the wrist to the paw when the paw is out along the hand. */
function handOf(s: Skeleton, side: Side) {
  const {elbow, wrist} = s.arms[side];
  const paw = s.paws[side].at;
  return paw.distanceTo(wrist) > 1e-9 ? paw.clone().sub(wrist).normalize() : wrist.clone().sub(elbow).normalize();
}
/** Overhand on a hanging handle: palm to the thighs, so the palm is on the front (square to the forearm) and the fingers wrap under. */
const hangingOverhand = (s: Skeleton, side: Side) => {
  const f = forearm(s, side);
  return {palm: X.clone().addScaledVector(f, -f.x), over: f};
};
/** Underhand curl: the palm faces the way the hand curls, so it's on the inside of the handle. */
const underhandCurl = (id: string) => (s: Skeleton, side: Side, frame: AnimationFrame) => ({
  palm: pawMotion(id, side, frame.progress).normalize().negate(),
  over: handOf(s, side),
});
/** Palms down on a raise: the back of the hand leads, so the palm is on the side of the handle the hand moves to. */
const palmsLead = (id: string) => (s: Skeleton, side: Side, frame: AnimationFrame) => ({
  palm: pawMotion(id, side, frame.progress).normalize(),
  over: forearm(s, side),
});
const standingStill = (s: Skeleton) => [...plantedFeet(s), s.hip, s.shoulder, s.head];
/** A palm on the `toward` side of its bar, square to the forearm, the fingers wrapping on along it. */
const palmToward = (toward: (s: Skeleton) => THREE.Vector3) => (s: Skeleton, side: Side) => {
  const f = forearm(s, side);
  const way = toward(s);
  return {palm: way.addScaledVector(f, -way.dot(f)), over: f};
};
/** Lying back, palms towards the feet: the palm on the head's side of the bar (square to the forearm), fingers over the top. */
const palmsToFeet = (s: Skeleton, side: Side) => {
  const f = forearm(s, side);
  const headward = X.clone().negate();
  return {palm: headward.addScaledVector(f, -headward.dot(f)), over: f};
};
/** Pressing lying back: the elbows drop down, out to the sides and towards the hips. */
const pressElbows = (s: Skeleton, side: Side) => outward(s, side).add(X).sub(Y);
const backAndUp = unit(-1, 1, 0);
/** Neutral grip: palms facing in, so each palm is on the outside of its handle. */
const neutral = (s: Skeleton, side: Side) => ({palm: outward(s, side), over: forearm(s, side)});
const backAndDown = unit(-1, -1, 0);

const EXPECT: Record<string, Expect> = {
  'jumping-jack': {
    // The forearm swings further round than the upper arm, so the elbow trails on the hip's side.
    elbow: (s, side) => s.legs[side].hip.clone().sub(s.arms[side].shoulder),
  },
  'barbell-squat': {
    elbow: (s) => up(s).negate(),
    planted: plantedFeet,
    // Palms forward behind the bar, fingers over the top.
    grip: (s) => ({palm: s.forward.clone().negate(), over: up(s)}),
  },
  'goblet-squat': {
    elbow: () => Y.clone().negate(),
    planted: plantedFeet,
  },
  'romanian-deadlift': {elbow: () => X.clone().negate(), planted: plantedFeet, grip: hangingOverhand},
  'dumbbell-romanian-deadlift': {elbow: () => X.clone().negate(), planted: plantedFeet, grip: hangingOverhand},
  'bulgarian-split-squat': {elbow: () => X.clone().negate(), planted: plantedFeet},
  'dumbbell-walking-lunge': {elbow: () => X.clone().negate(), planted: plantedFeet, grip: neutral},
  'dumbbell-curl': {
    elbow: () => backAndDown,
    planted: (s) => [...plantedFeet(s), s.hip, s.shoulder, s.head, s.arms.left.elbow, s.arms.right.elbow],
    grip: underhandCurl('dumbbell-curl'),
  },
  'hammer-curl': {
    elbow: () => backAndDown,
    planted: (s) => [...plantedFeet(s), s.hip, s.shoulder, s.head, s.arms.left.elbow, s.arms.right.elbow],
    grip: neutral,
  },
  'dumbbell-shoulder-press': {
    elbow: (s, side) => outward(s, side),
    planted: standingStill,
    // Palms forward: the palm behind the handle, the fingers over the top.
    grip: (s, side) => ({palm: s.forward.clone().negate(), over: forearm(s, side)}),
  },
  'dumbbell-lateral-raise': {
    // Soft elbows, leading the lift: out by the thighs, up at the top.
    elbow: (s, side) => outward(s, side).add(Y),
    planted: standingStill,
    grip: palmsLead('dumbbell-lateral-raise'),
  },
  'band-triceps-pushdown': {
    elbow: () => backAndDown,
    planted: (s) => [...standingStill(s), s.arms.left.elbow, s.arms.right.elbow],
  },
  'band-triceps-extension': {
    // The working elbow points up; the other arm hangs.
    elbow: (_, side) => (side === 'left' ? unit(1, 1, 0) : backAndDown),
    planted: (s) => [...standingStill(s), s.arms.left.elbow],
  },
  'band-face-pull': {
    elbow: () => Y.clone().negate(),
    planted: standingStill,
  },
  'incline-dumbbell-curl': {
    elbow: () => backAndDown,
    planted: (s) => [...standingStill(s), s.arms.left.elbow, s.arms.right.elbow],
    grip: underhandCurl('incline-dumbbell-curl'),
  },
  'dumbbell-wrist-curl': {
    elbow: () => backAndDown,
    planted: (s) => [...standingStill(s), ...SIDES.flatMap((side) => [s.arms[side].elbow, s.arms[side].wrist])],
    grip: underhandCurl('dumbbell-wrist-curl'),
    hand: wristCurl.HAND,
  },
  'barbell-bench-press': {
    elbow: pressElbows,
    planted: standingStill,
    grip: palmsToFeet,
  },
  'dumbbell-fly': {
    // Soft elbows: the elbow sits on the side the arm opens to, out over the chest and down when wide.
    elbow: (s, side) => outward(s, side).sub(Y),
    planted: standingStill,
    grip: palmsLead('dumbbell-fly'),
  },
  'incline-dumbbell-press': {
    elbow: pressElbows,
    planted: standingStill,
    grip: palmsToFeet,
  },
  'barbell-bent-over-row': {
    elbow: () => backAndUp,
    planted: standingStill,
    grip: hangingOverhand,
  },
  'one-arm-dumbbell-row': {
    elbow: (_, side) => (side === 'left' ? backAndUp : X.clone().negate()),
    planted: (s) => [...standingStill(s), s.legs.right.knee, s.arms.right.wrist],
    grip: (s, side) => (side === 'left' ? neutral(s, side) : null),
  },
  'pull-up': {
    elbow: (s, side) => outward(s, side),
    planted: (s) => [s.arms.left.wrist, s.arms.right.wrist],
    // Overhand: palms facing away, so the palm is on the rabbit's side of the bar.
    grip: palmToward((s) => s.forward.clone().negate()),
  },
  'chin-up': {
    // The elbows come down in front of the body.
    elbow: () => X.clone(),
    planted: (s) => [s.arms.left.wrist, s.arms.right.wrist],
    // Underhand: palms facing the rabbit, so the palm is on the far side of the bar.
    grip: palmToward((s) => s.forward.clone()),
  },
  'hanging-knee-raise': {
    elbow: (s, side) => outward(s, side).sub(X),
    planted: (s) => [s.hip, s.shoulder, s.head, s.arms.left.wrist, s.arms.right.wrist],
    grip: palmToward((s) => s.forward.clone().negate()),
  },
  'push-up': {
    elbow: () => X.clone().negate(),
    planted: (s) => [...plantedFeet(s), ...SIDES.flatMap((side) => [s.arms[side].wrist, s.paws[side].at])],
  },
  'close-grip-push-up': {
    elbow: () => X.clone().negate(),
    planted: (s) => [...plantedFeet(s), ...SIDES.flatMap((side) => [s.arms[side].wrist, s.paws[side].at])],
  },
  plank: {
    elbow: () => backAndDown,
    // A hold: nothing moves.
    planted: joints,
  },
  'sliding-leg-curl': {
    elbow: () => Y.clone().negate(),
    planted: (s) => [s.shoulder, s.head, ...SIDES.flatMap((side) => [s.arms[side].elbow, s.arms[side].wrist])],
  },
  'dumbbell-calf-raise': {
    elbow: () => backAndDown,
    // Palms forward, as at the bottom of a curl.
    grip: (s, side) => ({palm: X.clone().negate(), over: forearm(s, side)}),
  },
};
const NATIVE = Object.keys(EXPECT);

// Collisions: the rabbit as spheres, the equipment as the shapes of its meshes.

type Ball = {at: THREE.Vector3; r: number; part: string};

/** Spheres `r` round every `step` along a segment. */
function along(from: THREE.Vector3, to: THREE.Vector3, r: number, part: string, step = 0.05): Ball[] {
  const n = Math.max(1, Math.ceil(from.distanceTo(to) / step));
  return Array.from({length: n + 1}, (_, i) => ({at: from.clone().lerp(to, i / n), r, part}));
}

/** The torso's oval as three rows of spheres its depth round, from the hips to the shoulders. */
function torsoBalls(s: Skeleton): Ball[] {
  const {torso} = SIZES;
  const depth = torso.radius * torso.depth;
  const halfWidth = torso.radius * torso.width - depth;
  return [-halfWidth, 0, halfWidth].flatMap((x) => {
    const offset = rightOf(s).multiplyScalar(x);
    return along(
      s.hip.clone().addScaledVector(up(s), torso.radius - torso.below).add(offset),
      s.shoulder.clone().addScaledVector(up(s), torso.above - torso.radius).add(offset),
      depth,
      'torso',
    );
  });
}

/**
 * Each ear as a flat column of spheres: it stands up off the top of the
 * head, tipped out a little, as in rabbit-3d.ts.
 */
function earBalls(s: Skeleton): Ball[] {
  const right = new THREE.Vector3().crossVectors(s.headUp, s.headForward);
  return SIDES.flatMap((side) => {
    const sign = SIDE_SIGN[side];
    const base = s.head.clone()
      .addScaledVector(right, sign * 0.17)
      .addScaledVector(s.headUp, 0.5 + s.earLift * 1.5)
      .addScaledVector(s.headForward, -0.02);
    const tilt = THREE.MathUtils.degToRad(10);
    const axis = s.headUp.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(right, sign * Math.sin(tilt));
    const across = right.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(s.headUp, -sign * Math.sin(tilt));
    return [-0.05, 0, 0.05].flatMap((x) =>
      along(base.clone().addScaledVector(axis, -0.27).addScaledVector(across, x), base.clone().addScaledVector(axis, 0.27).addScaledVector(across, x), 0.06, `${side} ear`),
    );
  });
}

/** The rabbit's body as spheres, a little inside its surface. */
function rabbitBalls(s: Skeleton): Ball[] {
  const {head} = SIZES;
  // The muzzle and nose stick out in front of the head, as in rabbit-3d.ts.
  const snout = (forward: number, down: number) =>
    s.head.clone().addScaledVector(s.headForward, forward).addScaledVector(s.headUp, -down);
  const balls = [
    ...torsoBalls(s),
    {at: s.head, r: head.radius * Math.min(...head.scale), part: 'head'},
    {at: snout(0.22, 0.13), r: 0.09, part: 'muzzle'},
    {at: snout(0.31, 0.07), r: 0.035, part: 'nose'},
    ...earBalls(s),
  ];
  for (const side of SIDES) {
    const {shoulder, elbow, wrist} = s.arms[side];
    const {hip, knee, ankle} = s.legs[side];
    const shorts = Math.min(1, (SHORTS * (RIG.thigh + RIG.shin)) / RIG.thigh);
    balls.push(
      ...along(shoulder.clone().lerp(elbow, 0.3), elbow, SIZES.upperArm, `${side} upper arm`),
      ...along(elbow, wrist, SIZES.forearm, `${side} forearm`),
      {at: s.paws[side].at, r: SIZES.paw, part: `${side} paw`},
      ...along(hip, hip.clone().lerp(knee, shorts), SIZES.shorts, `${side} shorts`),
      ...along(hip, knee, SIZES.leg, `${side} thigh`),
      ...along(knee, ankle, SIZES.leg, `${side} shin`),
    );
  }
  return balls;
}

/** Signed distance from `p` to a piece of equipment's mesh, from its geometry and place. */
function distanceTo(mesh: THREE.Mesh, p: THREE.Vector3): number {
  const local = p.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
  const scale = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
  const shrink = Math.min(scale.x, scale.y, scale.z);
  const g = mesh.geometry;
  if (g instanceof THREE.CylinderGeometry) {
    const {radiusTop: r, height} = g.parameters;
    const dx = Math.hypot(local.x, local.z) - r;
    const dy = Math.abs(local.y) - height / 2;
    return (Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0)) * shrink;
  }
  if (g instanceof THREE.BoxGeometry) {
    const {width, height, depth} = g.parameters;
    const q = new THREE.Vector3(Math.abs(local.x) - width / 2, Math.abs(local.y) - height / 2, Math.abs(local.z) - depth / 2);
    const outside = new THREE.Vector3(Math.max(q.x, 0), Math.max(q.y, 0), Math.max(q.z, 0)).length();
    return (outside + Math.min(Math.max(q.x, q.y, q.z), 0)) * shrink;
  }
  if (g instanceof THREE.SphereGeometry) return (local.length() - g.parameters.radius) * shrink;
  throw new Error(`No distance for ${g.type}`);
}

/** Paws holding something are inside it, so balls this close to a paw are skipped. */
const HOLD = 0.16;

/** Builds a spec's equipment and checks no part of the rabbit passes into it at any frame. */
function assertClear(id: string, allow = 0.005) {
  const spec = SPECS[id];
  const kit = createKit();
  const parent = new THREE.Group();
  const move = spec.equipment?.(kit, parent);
  for (const frame of framesOf(id)) {
    const s = spec.pose(frame);
    move?.(frame, s);
    parent.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    parent.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    const paws = SIDES.map((side) => s.paws[side].at);
    for (const ball of rabbitBalls(s)) {
      if (paws.some((paw) => paw.distanceTo(ball.at) < HOLD)) continue;
      for (const mesh of meshes) {
        // A band runs out of the fist along the forearm holding it, so that forearm may touch it.
        if (mesh.name === 'band' && ball.part.endsWith('forearm')) continue;
        const gap = distanceTo(mesh, ball.at) - ball.r;
        const where = `${mesh.geometry.type} at ${mesh.getWorldPosition(new THREE.Vector3()).toArray().map((n) => n.toFixed(2))}`;
        assert.ok(gap > -allow, `${id}: ${ball.part} ${(-gap).toFixed(3)} into the equipment (${where}) at ${frame.progress.toFixed(2)}`);
      }
      if (spec.floor !== false) {
        assert.ok(ball.at.y - ball.r > -allow, `${id}: ${ball.part} ${(ball.r - ball.at.y).toFixed(3)} into the floor at ${frame.progress.toFixed(2)}`);
      }
    }
    // The equipment stays above the floor too.
    if (spec.floor !== false) {
      for (const mesh of meshes) {
        const box = new THREE.Box3().setFromObject(mesh);
        assert.ok(box.min.y > -allow, `${id}: equipment ${(-box.min.y).toFixed(3)} into the floor at ${frame.progress.toFixed(2)}`);
      }
    }
  }
  kit.dispose();
}

// Every exercise.

test('every exercise has a 3D pose module, a spec and these checks, and nothing else does', () => {
  const ids = exerciseCatalog.all.map((entry) => entry.id).sort();
  assert.deepEqual(Object.keys(SPECS).sort(), ids);
  assert.deepEqual([...NATIVE].sort(), ids);
  const poses = path.join(process.cwd(), 'components/exercise-animations/3d/poses');
  for (const id of ids) assert.ok(existsSync(path.join(poses, `${id}.ts`)), `${id} has no pose module`);
});

test('the rabbit and each scene\'s equipment build and pose through a whole rep', () => {
  for (const [id, spec] of Object.entries(SPECS)) {
    const kit = createKit();
    const rabbit = createRabbit3D(kit, RIG);
    const parent = new THREE.Group();
    const move = spec.equipment?.(kit, parent);
    for (const frame of framesOf(id)) {
      const skeleton = spec.pose(frame);
      rabbit.update(skeleton);
      move?.(frame, skeleton);
    }
    const bounds = new THREE.Box3().setFromObject(rabbit.group).union(new THREE.Box3().setFromObject(parent));
    assert.ok(!bounds.isEmpty() && Number.isFinite(bounds.max.x), `${id}: nothing to frame`);
    kit.dispose();
  }
});

test('native skeletons keep every length, stay finite and keep off the floor', () => {
  for (const id of NATIVE) {
    const spec = SPECS[id];
    for (const frame of framesOf(id)) {
      const s = spec.pose(frame);
      const label = `${id} at ${frame.progress.toFixed(3)}`;
      for (const joint of joints(s)) {
        assert.ok([joint.x, joint.y, joint.z].every(Number.isFinite), `${label}: a joint isn't a number`);
        if (spec.floor !== false) assert.ok(joint.y >= 0, `${label}: a joint below the floor`);
      }
      if (spec.floor !== false) assert.ok(s.head.y >= SIZES.head.radius * SIZES.head.scale[1], `${label}: head in the floor`);
      assert.ok(close(s.hip.distanceTo(s.shoulder), RIG.torso), `${label}: torso`);
      for (const direction of [s.forward, s.headForward, s.headUp]) {
        assert.ok(close(direction.length(), 1), `${label}: a direction isn't unit length`);
      }
      assert.ok(close(s.forward.dot(up(s)), 0), `${label}: forward isn't square to the torso`);
      for (const side of SIDES) {
        const arm = s.arms[side];
        const leg = s.legs[side];
        assert.ok(close(arm.shoulder.distanceTo(arm.elbow), RIG.upperArm), `${label}: ${side} upper arm`);
        assert.ok(close(arm.elbow.distanceTo(arm.wrist), RIG.forearm), `${label}: ${side} forearm`);
        assert.ok(close(leg.hip.distanceTo(leg.knee), RIG.thigh), `${label}: ${side} thigh`);
        assert.ok(close(leg.knee.distanceTo(leg.ankle), RIG.shin), `${label}: ${side} shin`);
        // The shoulders sit across the top of the torso; the paws at the wrists.
        assert.ok(close(arm.shoulder.distanceTo(s.shoulder), SHOULDER_HALF), `${label}: ${side} shoulder`);
        assert.ok(close(arm.shoulder.clone().sub(s.shoulder).dot(up(s)), 0), `${label}: ${side} shoulder off the line`);
        const hand = EXPECT[id].hand ?? 0;
        assert.ok(close(s.paws[side].at.distanceTo(arm.wrist), hand, 1e-9), `${label}: ${side} paw off the wrist`);
      }
    }
  }
});

test('native knees bend the right way, and elbows the way each exercise bends them', () => {
  for (const id of NATIVE) {
    for (const frame of framesOf(id)) {
      const s = SPECS[id].pose(frame);
      const label = `${id} at ${frame.progress.toFixed(3)}`;
      for (const side of SIDES) {
        // A knee only folds one way: from the thigh to the shin it turns about the body's right, never its left.
        const {hip, knee, ankle} = s.legs[side];
        const fold = new THREE.Vector3().crossVectors(knee.clone().sub(hip), ankle.clone().sub(knee));
        assert.ok(fold.dot(rightOf(s)) >= -1e-9, `${label}: ${side} knee bends back`);
        const {shoulder, elbow, wrist} = s.arms[side];
        const way = EXPECT[id].elbow(s, side, frame);
        assert.ok(bendOf(shoulder, elbow, wrist).dot(way) >= -1e-9, `${label}: ${side} elbow bends the wrong way`);
      }
    }
  }
});

test('native planted points stay put through the rep', () => {
  for (const id of NATIVE) {
    const planted = EXPECT[id].planted;
    if (!planted) continue;
    const start = planted(SPECS[id].pose(framesOf(id)[0]));
    for (const frame of framesOf(id)) {
      planted(SPECS[id].pose(frame)).forEach((point, i) => {
        assert.ok(same(point, start[i]), `${id}: planted point ${i} moved at ${frame.progress.toFixed(3)}`);
      });
    }
  }
});

test('native paws close round their handles the right way, or stay open', () => {
  for (const id of NATIVE) {
    for (const frame of framesOf(id)) {
      const s = SPECS[id].pose(frame);
      const label = `${id} at ${frame.progress.toFixed(3)}`;
      for (const side of SIDES) {
        const grip = s.paws[side].grip;
        const expected = EXPECT[id].grip?.(s, side, frame);
        if (!expected) {
          assert.equal(grip, undefined, `${label}: ${side} paw grips nothing`);
          continue;
        }
        assert.ok(grip, `${label}: ${side} paw isn't gripping`);
        assert.ok(close(grip.palm.dot(grip.axis), 0, 1e-9), `${label}: ${side} palm along the handle`);
        // Within about 25°, round the bar: the palm on the expected side, the fingers wrapping the expected way.
        const round = (v: THREE.Vector3) => v.clone().addScaledVector(grip.axis, -v.dot(grip.axis)).normalize();
        assert.ok(grip.palm.dot(round(expected.palm)) > 0.9, `${label}: ${side} palm on the wrong side`);
        const fingers = new THREE.Vector3().crossVectors(grip.palm, grip.axis);
        assert.ok(fingers.dot(round(expected.over)) > 0.9, `${label}: ${side} fingers wrap the wrong way`);
      }
    }
  }
});

test('nothing passes through the equipment or the floor', () => {
  for (const id of NATIVE) assertClear(id);
});

test('elbows and paws stay outside the body', () => {
  for (const id of NATIVE) {
    for (const frame of framesOf(id)) {
      const s = SPECS[id].pose(frame);
      const body = torsoBalls(s);
      for (const side of SIDES) {
        for (const [part, point] of [['elbow', s.arms[side].elbow], ['paw', s.paws[side].at]] as const) {
          for (const ball of body) {
            assert.ok(point.distanceTo(ball.at) > ball.r, `${id}: ${side} ${part} inside the torso at ${frame.progress.toFixed(3)}`);
          }
          assert.ok(point.distanceTo(s.head) > SIZES.head.radius, `${id}: ${side} ${part} inside the head at ${frame.progress.toFixed(3)}`);
        }
      }
    }
  }
});

test('arms pass beside the head, not through it', () => {
  for (const id of NATIVE) {
    for (const frame of framesOf(id)) {
      const s = SPECS[id].pose(frame);
      const head = rabbitBalls(s).filter((ball) => ['head', 'muzzle', 'nose'].includes(ball.part) || ball.part.endsWith('ear'));
      for (const side of SIDES) {
        const {shoulder, elbow, wrist} = s.arms[side];
        const arm = [
          ...along(shoulder.clone().lerp(elbow, 0.3), elbow, SIZES.upperArm, `${side} upper arm`),
          ...along(elbow, wrist, SIZES.forearm, `${side} forearm`),
          {at: s.paws[side].at, r: SIZES.paw, part: `${side} paw`},
        ];
        for (const a of arm) {
          for (const h of head) {
            const gap = a.at.distanceTo(h.at) - a.r - h.r;
            assert.ok(gap > -0.005, `${id}: ${a.part} ${(-gap).toFixed(3)} into the ${h.part} at ${frame.progress.toFixed(3)}`);
          }
        }
      }
    }
  }
});

// Jumping jack.

const jumpingJackPose = (frame: AnimationFrame) => SPECS['jumping-jack'].pose(frame);

test('jumping jack: both sides mirror; the elbows stay in the body\'s plane', () => {
  for (const frame of framesOf('jumping-jack')) {
    const s = jumpingJackPose(frame);
    const mirror = (p: THREE.Vector3) => new THREE.Vector3(-p.x, p.y, p.z);
    for (const part of ['shoulder', 'elbow', 'wrist'] as const) {
      assert.ok(same(mirror(s.arms.left[part]), s.arms.right[part]), `${part} at ${frame.progress}`);
    }
    for (const part of ['hip', 'knee', 'ankle'] as const) {
      assert.ok(same(mirror(s.legs.left[part]), s.legs.right[part]), `${part} at ${frame.progress}`);
    }
    for (const side of SIDES) {
      const {shoulder, elbow, wrist} = s.arms[side];
      assert.ok(Math.abs(bendOf(shoulder, elbow, wrist).dot(Z)) < 1e-9, `${side} elbow out of the plane at ${frame.progress}`);
    }
  }
});

test('jumping jack: feet stay on the floor unless hopping, together then wide', () => {
  const entry = exerciseCatalog.get('jumping-jack')!;
  for (const frame of framesOf('jumping-jack')) {
    const s = jumpingJackPose(frame);
    const landed = frame.phase.from === frame.phase.to;
    for (const side of SIDES) {
      if (landed) {
        assert.ok(close(s.legs[side].ankle.y, FOOT.ankle, 1e-9), `${side} ankle up at ${frame.progress}`);
        assert.ok(close(s.feet[side].at.y, FOOT.height, 1e-9), `${side} foot up at ${frame.progress}`);
      }
      // Off the floor by exactly the hop.
      assert.ok(close(s.feet[side].at.y, FOOT.height + jumpingJack.hopAt(frame), 1e-9));
    }
  }
  // Landed poses hold still.
  const wide = entry.phases.findIndex((phase) => phase.name === 'wide');
  const start = entry.phases.slice(0, wide).reduce((sum, phase) => sum + phase.durationMs, 0);
  const first = jumpingJackPose(frameAt(entry.phases, start + 1));
  const last = jumpingJackPose(frameAt(entry.phases, start + entry.phases[wide].durationMs - 1));
  for (const side of SIDES) assert.ok(same(first.feet[side].at, last.feet[side].at));
  const gap = (progress: number) => {
    const s = jumpingJackPose(at(progress));
    return s.feet.left.at.distanceTo(s.feet.right.at);
  };
  assert.ok(gap(0) < 0.5 && gap(1) > 1, `feet ${gap(0).toFixed(2)} -> ${gap(1).toFixed(2)}`);
});

test('jumping jack: hops only while jumping out or in', () => {
  const entry = exerciseCatalog.get('jumping-jack')!;
  for (const frame of framesOf('jumping-jack')) {
    const hop = jumpingJack.hopAt(frame);
    const moving = frame.phase.from !== frame.phase.to;
    assert.ok(moving ? hop >= 0 && hop <= jumpingJack.HOP : hop === 0, `hop ${hop} at ${frame.progress}`);
  }
  assert.ok(close(jumpingJack.hopAt(frameAt(entry.phases, 225)), jumpingJack.HOP, 1e-4), 'top of the jump out');
});

test('jumping jack: arms go from the sides to overhead, clear of the head', () => {
  const down = jumpingJackPose(at(0));
  const top = jumpingJackPose(at(1));
  for (const side of SIDES) {
    assert.ok(down.arms[side].wrist.y < down.hip.y + 0.2, 'hands by the hips');
    // Above the top of the head, either side of the ears.
    assert.ok(top.arms[side].wrist.y > top.head.y + 0.3, 'hands overhead');
    assert.ok(Math.abs(top.arms[side].wrist.x) - SIZES.paw > 0.35, 'paws clear of the ears');
  }
});

// Squats and hinges.

test('barbell squat: bar over mid-foot on the upper back; knees out over the toes', () => {
  for (const t of steps) {
    const s = squat.barbellSquatPose(t);
    for (const side of SIDES) {
      // Knees forward of the ankles, bending out over the toes rather than caving in.
      const {hip, knee, ankle} = s.legs[side];
      assert.ok(knee.x >= stance.ANKLES[side].x, `${side} knee behind the ankle at ${t}`);
      assert.ok(bendOf(hip, knee, ankle).z * Math.sign(ankle.z) >= -1e-9, `${side} knee caves in at ${t}`);
    }
    const bar = between(s.paws.left.at, s.paws.right.at);
    assert.ok(same(bar, squat.squatBarAt(t)));
    assert.ok(close(bar.x, stance.MIDFOOT_X, 1e-9), `bar ${(bar.x - stance.MIDFOOT_X).toFixed(3)} off mid-foot at ${t}`);
    // The barbell lies along z, so the paws only differ along z.
    const span = s.paws.left.at.clone().sub(s.paws.right.at);
    assert.ok(Math.abs(span.x) < 1e-9 && Math.abs(span.y) < 1e-9, `paws off the bar at ${t}`);
    // Behind the neck, below the top of the shoulders, and the elbows under it.
    assert.ok(bar.clone().sub(s.shoulder).dot(s.forward) < -0.2, `bar not on the back at ${t}`);
    assert.ok(bar.clone().sub(s.shoulder).dot(up(s)) < 0, `bar above the shoulders at ${t}`);
    for (const side of SIDES) assert.ok(s.arms[side].elbow.y < bar.y, `${side} elbow above the bar at ${t}`);
  }
  const knee = (s: Skeleton) => jointAngle(s.legs.left.hip, s.legs.left.knee, s.legs.left.ankle);
  const start = squat.barbellSquatPose(0);
  assert.ok(knee(start) > 165, `standing tall: ${knee(start).toFixed(1)}°`);
  // Thighs just below level: hips lower than the knees.
  const bottom = squat.barbellSquatPose(1);
  const below = bottom.legs.left.knee.y - bottom.legs.left.hip.y;
  assert.ok(below > 0 && below < 0.15, `hips ${below.toFixed(3)} below the knees`);
  assert.ok(bottom.hip.x < -0.2, 'hips back');
});

test('goblet squat: deep squat with the dumbbell held at the chest, elbows down', () => {
  for (const t of steps) {
    const s = goblet.gobletSquatPose(t);
    const hands = between(s.paws.left.at, s.paws.right.at);
    assert.ok(same(hands, goblet.gobletAt(t)));
    // In front of the chest, below the chin, the elbows under the hands.
    assert.ok(hands.clone().sub(s.shoulder).dot(s.forward) > 0.3, `dumbbell off the chest at ${t}`);
    assert.ok(hands.y < s.head.y - 0.4, `dumbbell at the chin at ${t}`);
    for (const side of SIDES) assert.ok(s.arms[side].elbow.y < hands.y, `${side} elbow up at ${t}`);
  }
  const bottom = goblet.gobletSquatPose(1);
  assert.ok(bottom.hip.y < bottom.legs.left.knee.y, 'below parallel');
  // More upright than the back squat.
  assert.ok(goblet.GOBLET.bottom.lean < squat.SQUAT.bottom.lean);
});

test('Romanian deadlifts: soft knees held; hips back; the weight slides down the legs to the knees', () => {
  for (const id of ['romanian-deadlift', 'dumbbell-romanian-deadlift']) {
    const poseAt = (t: number) => SPECS[id].pose(at(t));
    for (const t of steps) {
      const s = poseAt(t);
      for (const side of SIDES) {
        const {hip, knee, ankle} = s.legs[side];
        // The knee angle stays about the same: a hinge, not a squat.
        const angle = jointAngle(hip, knee, ankle);
        assert.ok(angle >= 149.9 && angle <= 172, `${id}: knee at ${angle.toFixed(1)}° at ${t}`);
        // The weight hangs straight down the front of the legs once it's below the waist, and just in front of the waist above.
        const hand = s.paws[side].at;
        const onLine = close(hand.x, hinge.WEIGHT_X, 1e-9);
        const onWaist = close(hand.clone().sub(s.hip).dot(s.forward), hinge.WAIST_FRONT, 1e-6);
        assert.ok(hand.x >= hinge.WEIGHT_X - 1e-9 && (onLine || onWaist), `${id}: weight away from the legs at ${t}`);
        const {shoulder, elbow, wrist} = s.arms[side];
        assert.ok(jointAngle(shoulder, elbow, wrist) > 155, `${id}: arms bent at ${t}`);
      }
    }
    const top = poseAt(0);
    const bottom = poseAt(1);
    assert.ok(top.paws.left.at.y > top.legs.left.knee.y + 0.4, `${id}: weight at the thighs`);
    assert.ok(bottom.paws.left.at.y < bottom.legs.left.knee.y + 0.05, `${id}: weight down to the knees`);
    assert.ok(bottom.hip.x < top.hip.x - 0.25, `${id}: hips pushed back`);
  }
  // The barbell runs along z between the paws.
  for (const t of steps) {
    const s = rdl.romanianDeadliftPose(t);
    const span = s.paws.left.at.clone().sub(s.paws.right.at);
    assert.ok(Math.abs(span.x) < 1e-9 && Math.abs(span.y) < 1e-9, `paws off the bar at ${t}`);
  }
});

test('Bulgarian split squat: back foot on the bench; hips straight down; front thigh about level', () => {
  for (const t of steps) {
    const s = splitSquat.bulgarianSplitSquatPose(t);
    assert.ok(same(s.legs.left.ankle, splitSquat.FRONT_ANKLE) && same(s.legs.right.ankle, splitSquat.BACK_ANKLE));
    assert.equal(s.hip.x, 0);
    // Front knee forward over the foot; back knee bends down and stays off the floor.
    assert.ok(s.legs.left.knee.x > s.hip.x, `front knee at ${t}`);
    assert.ok(s.legs.right.knee.y < s.legs.right.hip.y && s.legs.right.knee.y > SIZES.leg + 0.03, `back knee at ${t}`);
  }
  // The back foot rests on the bench.
  const {feet} = splitSquat.bulgarianSplitSquatPose(0);
  assert.ok(close(feet.right.at.y - FOOT.height, splitSquat.BENCH.top, 1e-9));
  assert.ok(feet.right.at.x > splitSquat.BENCH.back && feet.right.at.x < splitSquat.BENCH.front);
  const bottom = splitSquat.bulgarianSplitSquatPose(1);
  const thigh = bottom.legs.left.knee.clone().sub(bottom.hip);
  const slope = THREE.MathUtils.radToDeg(Math.atan2(thigh.y, Math.hypot(thigh.x, thigh.z)));
  assert.ok(Math.abs(slope) < 30, `front thigh about level: ${slope.toFixed(1)}°`);
});

test('walking lunge: front foot flat, back on its toes; the back knee drops to just above the floor', () => {
  for (const t of steps) {
    const s = lunge.walkingLungePose(t);
    assert.ok(same(s.legs.left.ankle, lunge.FRONT_ANKLE) && same(s.legs.right.ankle, lunge.BACK_ANKLE));
    // Torso upright, dumbbells hanging under the shoulders.
    assert.ok(Math.abs(s.shoulder.x - s.hip.x) < 0.05);
    for (const side of SIDES) assert.ok(close(s.paws[side].at.x, s.arms[side].shoulder.x, 1e-9), `${side} dumbbell swings at ${t}`);
    // The back knee never touches the floor.
    assert.ok(s.legs.right.knee.y > SIZES.leg + 0.03, `back knee on the floor at ${t}`);
  }
  // At the bottom the back knee is close to the floor.
  assert.ok(lunge.walkingLungePose(1).legs.right.knee.y < 0.3, 'deep enough');
});

// Curls and the calf raise.

test('dumbbell curl: elbows pinned; arms long at the bottom, curled to the shoulders at the top', () => {
  for (const t of steps) {
    const s = curl.curlPose(t);
    for (const side of SIDES) {
      assert.ok(same(s.arms[side].elbow, standing.elbowOf(side)), `${side} elbow moved at ${t}`);
      // The forearm swings in front of the body, never behind it.
      assert.ok(s.arms[side].wrist.x > s.arms[side].elbow.x, `${side} wrist behind at ${t}`);
    }
  }
  const start = curl.curlPose(0);
  const knee = jointAngle(start.legs.left.hip, start.legs.left.knee, start.legs.left.ankle);
  assert.ok(knee > 160, `knees soft: ${knee.toFixed(1)}°`);
  // The upper arm hangs close to vertical.
  assert.ok(Math.abs(start.arms.left.elbow.x - start.arms.left.shoulder.x) < 0.06);
  const elbowAt = (t: number) => {
    const {shoulder, elbow, wrist} = curl.curlPose(t).arms.left;
    return jointAngle(shoulder, elbow, wrist);
  };
  assert.ok(elbowAt(0) > 160, `arms long: ${elbowAt(0).toFixed(1)}°`);
  assert.ok(elbowAt(1) < 50, `curled: ${elbowAt(1).toFixed(1)}°`);
  assert.ok(curl.curlPose(1).arms.left.wrist.y > standing.elbowOf('left').y + 0.35, 'dumbbell up by the shoulder');
});

test('hammer curl: the same curl, with the handle square to the forearm', () => {
  for (const t of steps) {
    const s = SPECS['hammer-curl'].pose(at(t));
    const c = curl.curlPose(t);
    for (const side of SIDES) {
      assert.ok(same(s.arms[side].wrist, c.arms[side].wrist) && same(s.arms[side].elbow, c.arms[side].elbow));
      const axis = s.paws[side].grip!.axis;
      assert.ok(close(axis.dot(forearm(s, side)), 0, 0.2), `${side} handle not square at ${t}`);
      assert.ok(close(axis.dot(rightOf(s)), 0, 1e-9), `${side} handle turned across at ${t}`);
    }
  }
});

test('calf raise: the feet turn about the toes; the whole body rises without bending', () => {
  const start = calfRaise.calfRaisePose(0);
  const toes = (s: Skeleton, side: Side) => new THREE.Vector3(calfRaise.TOES_X, 0, s.legs[side].ankle.z);
  for (const t of steps) {
    const s = calfRaise.calfRaisePose(t);
    const lift = calfRaise.liftAt(t);
    // Everything above the feet moves together.
    for (const [a, b] of [[s.hip, start.hip], [s.head, start.head], [s.arms.left.wrist, start.arms.left.wrist]]) {
      assert.ok(same(a.clone().sub(b), lift), `body bends at ${t}`);
    }
    // The ankles stay the same distance from the toes, which stay on the floor.
    for (const side of SIDES) {
      assert.ok(close(s.legs[side].ankle.distanceTo(toes(s, side)), start.legs[side].ankle.distanceTo(toes(start, side)), 1e-9));
    }
  }
  assert.ok(calfRaise.liftAt(1).y > 0.08, `heels up: ${calfRaise.liftAt(1).y.toFixed(3)}`);
  const pitch = THREE.MathUtils.radToDeg(Math.asin(-calfRaise.calfRaisePose(1).feet.left.forward.y));
  assert.ok(close(pitch, calfRaise.HEEL_LIFT_DEG, 1e-6), `feet at ${pitch.toFixed(1)}°`);
});

// Shoulders and arms.

/** Both sides mirror across the body's middle: x = 0 facing +z, z = 0 facing +x. */
function assertMirrored(s: Skeleton, label: string) {
  const facingZ = Math.abs(s.forward.z) > 0.5;
  const mirror = (p: THREE.Vector3) => (facingZ ? new THREE.Vector3(-p.x, p.y, p.z) : new THREE.Vector3(p.x, p.y, -p.z));
  for (const part of ['shoulder', 'elbow', 'wrist'] as const) {
    assert.ok(same(mirror(s.arms.left[part]), s.arms.right[part]), `${part} ${label}`);
  }
  for (const part of ['hip', 'knee', 'ankle'] as const) {
    assert.ok(same(mirror(s.legs.left[part]), s.legs.right[part]), `${part} ${label}`);
  }
}
const elbowAngle = (s: Skeleton, side: Side = 'right') =>
  jointAngle(s.arms[side].shoulder, s.arms[side].elbow, s.arms[side].wrist);

test('shoulder press: from the shoulders with elbows out under the wrists to locked out overhead', () => {
  for (const t of steps) {
    const s = press.shoulderPressPose(t);
    assertMirrored(s, `at ${t}`);
    assert.ok(same(s.paws.right.at, press.handAt(t, 'right')));
  }
  const bottom = press.shoulderPressPose(0);
  const top = press.shoulderPressPose(1);
  assert.ok(elbowAngle(bottom) < 100, `elbows bent at the bottom: ${elbowAngle(bottom).toFixed(1)}°`);
  assert.ok(elbowAngle(top) > 160, `locked out: ${elbowAngle(top).toFixed(1)}°`);
  const {shoulder, elbow, wrist} = bottom.arms.right;
  assert.ok(wrist.y > shoulder.y, 'dumbbells above the shoulders');
  assert.ok(Math.abs(elbow.x - wrist.x) < 0.15, 'forearms upright');
  assert.ok(elbow.x > shoulder.x && elbow.y < wrist.y, 'elbows out and down');
  // At the top the hands are well over the head.
  assert.ok(top.arms.right.wrist.y > top.head.y + 0.6);
});

test('lateral raise: soft elbows held; from by the thighs up to shoulder height, elbows leading', () => {
  let last = -Infinity;
  for (const t of steps) {
    const s = lateralRaise.lateralRaisePose(t);
    assertMirrored(s, `at ${t}`);
    assert.ok(close(elbowAngle(s), 180 - lateralRaise.ELBOW_LEAD_DEG, 1e-6), `elbow at ${t}`);
    assert.ok(s.arms.right.wrist.y > last, `the hands drop at ${t}`);
    last = s.arms.right.wrist.y;
  }
  const start = lateralRaise.lateralRaisePose(0);
  assert.ok(start.arms.right.wrist.y < start.hip.y + 0.1, 'dumbbells by the thighs');
  const top = lateralRaise.lateralRaisePose(1).arms.right;
  assert.ok(Math.abs(top.wrist.y - top.shoulder.y) < 0.2, `shoulder height: ${(top.wrist.y - top.shoulder.y).toFixed(3)}`);
  assert.ok(top.wrist.y <= top.shoulder.y + 0.05, 'not above the shoulders');
  assert.ok(top.elbow.y >= top.wrist.y, 'elbows lead');
});

test('triceps pushdown: the forearms push from chest height to straight, the band up to the anchor', () => {
  for (const t of steps) {
    const s = pushdown.tricepsPushdownPose(t);
    for (const side of SIDES) {
      const hand = s.paws[side].at;
      assert.ok(hand.x < pushdown.ANCHOR.x && hand.y < pushdown.ANCHOR.y, `band slack at ${t}`);
      assert.ok(same(s.arms[side].elbow, standing.elbowOf(side)), `elbow moved at ${t}`);
    }
  }
  const start = pushdown.tricepsPushdownPose(0);
  assert.ok(elbowAngle(start) < 95, `bent at the start: ${elbowAngle(start).toFixed(1)}°`);
  assert.ok(elbowAngle(pushdown.tricepsPushdownPose(1)) > 170, 'straight at the end');
  // Hands start about chest height, in front of the body.
  const {elbow, wrist} = start.arms.right;
  assert.ok(wrist.y > elbow.y && wrist.x > elbow.x + 0.4, 'hands at the chest');
});

test('band triceps extension: the elbow stays up by the head; the forearm straightens overhead', () => {
  const start = extension.bandTricepsExtensionPose(0);
  const end = extension.bandTricepsExtensionPose(1);
  // The upper arm points up, above the shoulder and beside the head.
  assert.ok(extension.ELBOW.y > start.arms.left.shoulder.y + 0.55);
  assert.ok(elbowAngle(start, 'left') < 50, `hand behind the head: ${elbowAngle(start, 'left').toFixed(1)}°`);
  assert.ok(elbowAngle(end, 'left') > 170, `arm straight: ${elbowAngle(end, 'left').toFixed(1)}°`);
  assert.ok(start.paws.left.at.x < start.head.x, 'hand behind the head');
  assert.ok(end.paws.left.at.y > end.head.y + 0.6, 'hand high overhead');
  // The band is held under the heel.
  assert.ok(extension.ANCHOR.y < FOOT.height);
});

test('face pull: elbows at shoulder height; arms long to the anchor, then hands by the ears with elbows wide', () => {
  let stretch = -Infinity;
  for (const t of steps) {
    const s = facePull.facePullPose(t);
    assertMirrored(s, `at ${t}`);
    for (const side of SIDES) assert.ok(close(s.arms[side].elbow.y, s.arms[side].shoulder.y, 1e-9), `elbow dropped at ${t}`);
    // The band stretches steadily as the hands come back.
    const length = s.paws.left.at.distanceTo(facePull.ANCHOR);
    assert.ok(length > stretch, `band slack at ${t}`);
    stretch = length;
  }
  const start = facePull.facePullPose(0).arms.left;
  assert.ok(close(start.wrist.x - start.shoulder.x, RIG.upperArm + RIG.forearm, 1e-9), 'arms long');
  const end = facePull.facePullPose(1);
  const arm = end.arms.left;
  assert.ok(close(arm.elbow.x, arm.shoulder.x, 1e-9), 'elbows out to the side');
  assert.ok(close(arm.wrist.y - arm.elbow.y, RIG.forearm, 1e-9), 'forearms up');
  assert.ok(Math.abs(arm.wrist.y - end.head.y) < 0.3, 'hands by the ears');
});

test('incline curl: the upper arms hang still behind the body; a full stretch, then curled up', () => {
  const start = inclineCurl.inclineCurlPose(0);
  const back = THREE.MathUtils.radToDeg(Math.atan2(start.shoulder.y - start.hip.y, start.hip.x - start.shoulder.x));
  assert.ok(close(back, inclineCurl.INCLINE_DEG, 1e-9) && back >= 45 && back <= 60);
  for (const side of SIDES) {
    const {shoulder, elbow} = start.arms[side];
    assert.ok(close(elbow.x, shoulder.x, 1e-9), 'upper arm hangs straight down');
    assert.ok(elbow.clone().sub(start.hip).dot(start.forward) < 0, 'elbow behind the body');
  }
  const knee = jointAngle(start.hip, start.legs.left.knee, start.legs.left.ankle);
  assert.ok(knee > 90 && knee < 125, `knees at ${knee.toFixed(1)}°`);
  assert.ok(elbowAngle(start) > 170, `full stretch: ${elbowAngle(start).toFixed(1)}°`);
  assert.ok(elbowAngle(inclineCurl.inclineCurlPose(1)) < 60, 'curled');
});

test('wrist curl: forearms rest level across the knees; only the hands turn at the wrist', () => {
  const start = wristCurl.wristCurlPose(0);
  for (const side of SIDES) {
    const {elbow, wrist} = start.arms[side];
    const {knee} = start.legs[side];
    assert.ok(close(elbow.y, wrist.y, 1e-9), 'forearm level');
    assert.ok(elbow.x < knee.x + 0.05 && wrist.x > knee.x, 'forearm across the knee');
  }
  const {wrist} = start.arms.left;
  assert.ok(start.paws.left.at.y < wrist.y - 0.05, 'hand bent down');
  assert.ok(wristCurl.wristCurlPose(1).paws.left.at.y > wrist.y + 0.05, 'hand curled up');
});

// Benches and rows.

/** How far `p` sits out of the back (positive) or in front of the chest (negative), from the line of the torso. */
const outOfBack = (s: Skeleton, p: THREE.Vector3) => -p.clone().sub(s.hip).dot(s.forward);
const DEPTH = SIZES.torso.radius * SIZES.torso.depth;

test('bench press: lying flat on the pad; locked out over the shoulders, the bar down to the lower chest', () => {
  const start = bench.benchPressPose(0);
  // Torso level, the back and head resting on the pad.
  assert.ok(close(start.hip.y, start.shoulder.y, 1e-9));
  assert.ok(Math.abs(start.hip.y - DEPTH - benchMoves.FLAT_BENCH.top) < 0.03, 'back on the bench');
  assert.ok(Math.abs(start.head.y - SIZES.head.radius - benchMoves.FLAT_BENCH.top) < 0.08, 'head on the bench');
  const knee = jointAngle(start.hip, start.legs.left.knee, start.legs.left.ankle);
  assert.ok(knee > 90 && knee < 125, `knees at ${knee.toFixed(1)}°`);
  assert.ok(start.legs.left.knee.y > start.legs.left.ankle.y + RIG.shin * 0.9, 'shin roughly upright');
  assert.ok(elbowAngle(start) > 160, `locked out: ${elbowAngle(start).toFixed(1)}°`);
  const bottom = bench.benchPressPose(1);
  assert.ok(elbowAngle(bottom) < 90, `elbows bent at the bottom: ${elbowAngle(bottom).toFixed(1)}°`);
  assert.ok(Math.abs(bench.BAR.top.x - start.shoulder.x) < 0.05, 'bar over the shoulders');
  // The bar touches the chest, a little towards the hips from the shoulders.
  assert.ok(close(bench.BAR.bottom.y - start.shoulder.y - DEPTH, 0.035, 1e-9), 'bar on the chest');
  assert.ok(bench.BAR.bottom.x > start.shoulder.x + 0.2, 'lower chest');
  for (const t of steps) {
    const s = bench.benchPressPose(t);
    for (const side of SIDES) assert.ok(s.arms[side].elbow.x >= s.shoulder.x, `elbow towards the head at ${t}`);
    const span = s.paws.left.at.clone().sub(s.paws.right.at);
    assert.ok(Math.abs(span.x) < 1e-9 && Math.abs(span.y) < 1e-9, `paws off the bar at ${t}`);
  }
  // At the bottom the elbows sit below the chest.
  assert.ok(bottom.arms.left.elbow.y < bottom.shoulder.y);
});

test('dumbbell fly: a fixed soft elbow; together over the chest, open wide to chest level', () => {
  let wide = -Infinity;
  for (const t of steps) {
    const s = fly.dumbbellFlyPose(t);
    assertMirrored(s, `at ${t}`);
    assert.ok(Math.abs(180 - elbowAngle(s) - fly.ELBOW_BEND_DEG) < 1.5, `elbow bend at ${t}: ${(180 - elbowAngle(s)).toFixed(1)}°`);
    const out = s.paws.left.at.clone().sub(s.shoulder).dot(outward(s, 'left'));
    assert.ok(out > wide, `the arms close at ${t}`);
    wide = out;
  }
  const top = fly.dumbbellFlyPose(0);
  const shoulderOut = SHOULDER_HALF;
  const handOut = top.paws.left.at.clone().sub(top.shoulder).dot(outward(top, 'left'));
  assert.ok(handOut < shoulderOut && handOut > shoulderOut - 0.25, `hands together: ${handOut.toFixed(3)}`);
  assert.ok(top.paws.left.at.y > top.shoulder.y + 1, 'arms up over the chest');
  const bottom = fly.dumbbellFlyPose(1);
  const rise = bottom.paws.left.at.y - bottom.shoulder.y;
  assert.ok(bottom.paws.left.at.clone().sub(bottom.shoulder).dot(outward(bottom, 'left')) > 1.28, 'arms wide');
  assert.ok(rise > 0 && rise < 0.4, `chest level: ${rise.toFixed(3)}`);
});

test('incline press: on the inclined pad; pressed straight up over the shoulders, down to the upper chest', () => {
  const start = inclinePress.inclinePressPose(0);
  const incline = THREE.MathUtils.radToDeg(Math.atan2(start.shoulder.y - start.hip.y, start.hip.x - start.shoulder.x));
  assert.ok(close(incline, inclinePress.INCLINE_DEG, 1e-9) && incline >= 30 && incline <= 45);
  assert.ok(start.hip.x > inclinePress.SEAT.left && start.hip.x < inclinePress.SEAT.right, 'hips on the seat');
  const knee = jointAngle(start.hip, start.legs.left.knee, start.legs.left.ankle);
  assert.ok(knee > 90 && knee < 125, `knees at ${knee.toFixed(1)}°`);
  assert.ok(elbowAngle(start) > 160, `locked out: ${elbowAngle(start).toFixed(1)}°`);
  const bottom = inclinePress.inclinePressPose(1);
  assert.ok(elbowAngle(bottom) < 90, `elbows bent at the bottom: ${elbowAngle(bottom).toFixed(1)}°`);
  // A vertical press: the top is straight above the shoulders; the bottom just off the upper chest.
  assert.ok(Math.abs(inclinePress.DUMBBELLS.top.x - start.shoulder.x) < 0.05);
  const low = inclinePress.DUMBBELLS.bottom.clone().sub(start.hip);
  assert.ok(close(low.dot(start.forward), 0.34, 1e-9) && low.dot(up(start)) > 0.8, 'upper chest');
  for (const t of steps) {
    const s = inclinePress.inclinePressPose(t);
    for (const side of SIDES) {
      assert.ok(s.arms[side].elbow.x >= s.shoulder.x - 1e-9, `elbow towards the head at ${t}`);
    }
  }
  // At the bottom the elbows drop to just behind the back.
  assert.ok(outOfBack(bottom, bottom.arms.left.elbow) > 0);
});

test('bent-over row: flat back held; arms long at the bottom; elbows drive back past the back at the top', () => {
  const start = row.bentOverRowPose(0);
  const back = THREE.MathUtils.radToDeg(Math.atan2(start.shoulder.y - start.hip.y, start.shoulder.x - start.hip.x));
  assert.ok(close(back, row.BACK_DEG, 1e-9), `flat back at ${back.toFixed(1)}°`);
  const knee = jointAngle(start.hip, start.legs.left.knee, start.legs.left.ankle);
  assert.ok(knee > 140 && knee < 170, `knees at ${knee.toFixed(1)}°`);
  assert.ok(elbowAngle(start) > 150, `arms long: ${elbowAngle(start).toFixed(1)}°`);
  const top = row.bentOverRowPose(1);
  assert.ok(elbowAngle(top) < 90, `elbows bent at the top: ${elbowAngle(top).toFixed(1)}°`);
  for (const t of steps) {
    const s = row.bentOverRowPose(t);
    for (const side of SIDES) assert.ok(s.arms[side].elbow.x <= s.shoulder.x, `elbow forward at ${t}`);
    assert.ok(same(between(s.paws.left.at, s.paws.right.at), row.barAt(t)));
  }
  // At the top the elbows are above the back, and the bar sits against the belly.
  assert.ok(outOfBack(top, top.arms.left.elbow) > 0.23, 'elbow above the back');
  assert.ok(close(-outOfBack(top, row.BAR.top), DEPTH + 0.035, 1e-9), 'bar at the belly');
});

test('one-arm row: knee, shin and hand on the bench, foot on the floor; the elbow drives back past the back', () => {
  const start = oneArmRow.oneArmRowPose(0);
  const back = THREE.MathUtils.radToDeg(Math.atan2(start.shoulder.y - start.hip.y, start.shoulder.x - start.hip.x));
  assert.ok(close(back, oneArmRow.BACK_DEG, 1e-9) && back <= 25, `flat back at ${back.toFixed(1)}°`);
  const {knee, ankle} = start.legs.right;
  assert.ok(close(knee.y - SIZES.leg, oneArmRow.BENCH.top, 1e-9), 'knee on the bench');
  assert.ok(close(ankle.y, knee.y, 1e-9), 'shin flat on the bench');
  assert.ok(close(start.paws.right.at.y - SIZES.paw, oneArmRow.BENCH.top, 1e-9), 'hand on the bench');
  assert.ok(close(start.legs.left.ankle.y, FOOT.ankle, 1e-9), 'foot on the floor');
  // Beside the bench, not on it.
  assert.ok(start.feet.left.at.z - SIZES.foot.radius > oneArmRow.BENCH.z + 0.55 / 2, 'standing foot clear of the bench');
  assert.ok(elbowAngle(start, 'right') > 140, `support arm at ${elbowAngle(start, 'right').toFixed(1)}°`);
  assert.ok(elbowAngle(start, 'left') > 150, `arm long: ${elbowAngle(start, 'left').toFixed(1)}°`);
  const top = oneArmRow.oneArmRowPose(1);
  assert.ok(elbowAngle(top, 'left') < 100, `elbow bent at the top: ${elbowAngle(top, 'left').toFixed(1)}°`);
  for (const t of steps) {
    assert.ok(oneArmRow.oneArmRowPose(t).arms.left.elbow.x <= start.shoulder.x, `elbow forward at ${t}`);
  }
  assert.ok(outOfBack(top, top.arms.left.elbow) > 0.23, 'elbow above the back');
});

// Hanging.

/** How far the chin (the bottom of the head) is above `y`. */
const chinAbove = (s: Skeleton, y: number) => s.head.y - SIZES.head.radius * SIZES.head.scale[1] - y;

test('pull-up: wide overhand grip; from a dead hang to the chin over the bar, elbows out', () => {
  for (const t of steps) {
    const s = pullUp.pullUpPose(t);
    assertMirrored(s, `at ${t}`);
    for (const side of SIDES) {
      assert.ok(same(s.paws[side].at, pullUp.handOnBar(side)), `${side} hand off the bar at ${t}`);
      // Legs hang straight under the hips.
      assert.ok(close(s.legs[side].hip.y - s.legs[side].ankle.y, RIG.thigh + RIG.shin, 0.01), `${side} legs bent at ${t}`);
    }
  }
  const start = pullUp.pullUpPose(0);
  assert.ok(pullUp.handOnBar('right').x > start.arms.right.shoulder.x + 0.3, 'wide grip');
  assert.ok(elbowAngle(start) > 150, `dead hang: ${elbowAngle(start).toFixed(1)}°`);
  const top = pullUp.pullUpPose(1);
  assert.ok(elbowAngle(top) < 70, `pulled up: ${elbowAngle(top).toFixed(1)}°`);
  assert.ok(chinAbove(top, pullUp.BAR.y) > 0, 'chin over the bar');
  assert.ok(chinAbove(start, pullUp.BAR.y) < -0.5, 'dead hang');
});

test('chin-up: underhand; the body hangs straight; from a dead hang to the chin at the bar, elbows in front', () => {
  const start = chinUp.chinUpPose(0);
  const legs = (s: Skeleton) => s.legs.left.ankle.clone().sub(s.hip);
  for (const t of steps) {
    const s = chinUp.chinUpPose(t);
    assert.ok(close(s.hip.x, s.shoulder.x, 1e-9) && close(s.hip.z, s.shoulder.z, 1e-9), `torso leans at ${t}`);
    // The legs keep their shape and ride with the hips.
    assert.ok(same(legs(s), legs(start)), `legs move at ${t}`);
    for (const side of SIDES) assert.ok(s.arms[side].elbow.x >= s.shoulder.x, `${side} elbow behind at ${t}`);
  }
  assert.ok(elbowAngle(start) > 150, `dead hang: ${elbowAngle(start).toFixed(1)}°`);
  const top = chinUp.chinUpPose(1);
  assert.ok(elbowAngle(top) < 70, `pulled up: ${elbowAngle(top).toFixed(1)}°`);
  assert.ok(chinAbove(top, hanging.BAR.y) > -0.12, `chin at the bar: ${chinAbove(top, hanging.BAR.y).toFixed(3)}`);
});

test('hanging knee raise: a still dead hang; the knees come up above the hips', () => {
  const start = kneeRaise.hangingKneeRaisePose(0);
  for (const t of steps) {
    const s = kneeRaise.hangingKneeRaisePose(t);
    for (const side of SIDES) {
      assert.ok(same(s.arms[side].elbow, start.arms[side].elbow), `arms move at ${t}`);
      assert.ok(s.legs[side].knee.x >= s.hip.x - 1e-9, `${side} knee behind at ${t}`);
    }
  }
  assert.ok(elbowAngle(start) > 150, `arms straight: ${elbowAngle(start).toFixed(1)}°`);
  const top = kneeRaise.hangingKneeRaisePose(1);
  assert.ok(top.legs.left.knee.y > top.hip.y, 'knees above the hips');
  const knee = jointAngle(top.legs.left.hip, top.legs.left.knee, top.legs.left.ankle);
  assert.ok(knee > 70 && knee < 100, `knees bent at the top: ${knee.toFixed(1)}°`);
});

// Floor work.

test('push-ups: the body stays straight; the elbows bend back from long arms to deep', () => {
  for (const [id, poseAt] of [
    ['push-up', pushUp.pushUpPose],
    ['close-grip-push-up', closeGrip.closeGripPushUpPose],
  ] as const) {
    for (const t of steps) {
      const s = poseAt(t);
      const {hip, knee, ankle} = s.legs.left;
      assert.ok(close(jointAngle(ankle, knee, hip), 180, 0.01), `${id}: knees bent at ${t}`);
      // Heels, hips and shoulders in one line: no sag or pike.
      assert.ok(close(up(s).dot(hip.clone().sub(ankle).normalize()), 1, 1e-6), `${id}: body bent at ${t}`);
      for (const side of SIDES) {
        const angle = elbowAngle(s, side);
        assert.ok(angle >= 35 && angle <= 170, `${id}: elbow ${angle.toFixed(1)}° at ${t}`);
        assert.ok(s.arms[side].elbow.x <= s.shoulder.x, `${id}: elbow forward at ${t}`);
        // Paws flat on the floor.
        assert.ok(close(s.paws[side].at.y, SIZES.paw, 1e-9));
      }
    }
    assert.ok(elbowAngle(poseAt(0)) > 140, `${id}: arms long at the top: ${elbowAngle(poseAt(0)).toFixed(1)}°`);
    assert.ok(elbowAngle(poseAt(1)) < 70, `${id}: deep at the bottom: ${elbowAngle(poseAt(1)).toFixed(1)}°`);
    // The chest gets close to the floor at the bottom without touching it.
    const chest = poseAt(1).shoulder.y - DEPTH;
    assert.ok(chest > 0 && chest < 0.25, `${id}: chest ${chest.toFixed(3)} off the floor`);
  }
  // Close grip: the hands closer together, under the chest, and the elbows tucked along the ribs.
  assert.ok(closeGrip.CLOSE_GRIP.hands.out < pushUp.PUSH_UP.hands.out);
  const bottom = closeGrip.closeGripPushUpPose(1);
  const hand = prone.handOf(closeGrip.CLOSE_GRIP, 'left');
  assert.ok(hand.x < bottom.shoulder.x - 0.25 && hand.x > bottom.hip.x, 'hands under the chest');
  const tuck = (s: Skeleton) => s.arms.left.elbow.clone().sub(s.shoulder).dot(outward(s, 'left'));
  assert.ok(tuck(bottom) < tuck(pushUp.pushUpPose(1)), 'elbows tucked closer than a regular push-up');
  assert.ok(tuck(bottom) < SHOULDER_HALF + 0.12, `elbows out ${tuck(bottom).toFixed(3)}`);
});

test('plank: forearms flat, elbows under the shoulders, heels to head in one line', () => {
  const s = plank.plankPose();
  const {hip, knee, ankle} = s.legs.left;
  assert.ok(close(jointAngle(ankle, knee, hip), 180, 0.01));
  assert.ok(close(up(s).dot(hip.clone().sub(ankle).normalize()), 1, 1e-6), 'body bent');
  for (const side of SIDES) {
    const {shoulder, elbow, wrist} = s.arms[side];
    assert.ok(close(elbow.x, shoulder.x, 1e-9) && close(elbow.y, plank.ELBOW_Y, 1e-9), 'elbow under the shoulder, on the floor');
    assert.ok(close(wrist.y, elbow.y, 1e-9), 'forearm flat');
    assert.ok(close(elbowAngle(s, side), 90, 0.01), `elbow at ${elbowAngle(s, side).toFixed(2)}°`);
  }
  assert.ok(plank.BODY_DEG > 8 && plank.BODY_DEG < 20, `body at ${plank.BODY_DEG.toFixed(1)}°`);
  // A hold: every phase stays at the start pose.
  const entry = exerciseCatalog.get('plank')!;
  assert.equal(entry.type, 'TIME');
  assert.ok(entry.phases.every((phase) => phase.from === 0 && phase.to === 0));
});

test('sliding leg curl: shoulders down, heels sliding on the floor; hips rise as the heels pull in', () => {
  for (const t of steps) {
    const s = legCurl.slidingLegCurlPose(t);
    for (const side of SIDES) {
      assert.ok(same(s.legs[side].ankle, legCurl.heelAt(t, side)), `${side} heel off its line at ${t}`);
      assert.ok(close(s.legs[side].ankle.y, FOOT.ankle, 1e-9), `${side} heel off the floor at ${t}`);
    }
  }
  const start = legCurl.slidingLegCurlPose(0);
  const end = legCurl.slidingLegCurlPose(1);
  const knee = (s: Skeleton) => jointAngle(s.legs.left.hip, s.legs.left.knee, s.legs.left.ankle);
  assert.ok(knee(start) > 170, `legs long: ${knee(start).toFixed(1)}°`);
  assert.ok(knee(end) < 100, `knees bent: ${knee(end).toFixed(1)}°`);
  assert.ok(end.hip.y > start.hip.y + 0.4, 'hips rise');
  // Hips always off the floor.
  assert.ok(start.hip.y - SIZES.torso.radius * SIZES.torso.depth > 0);
});

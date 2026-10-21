import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {
  FOOT,
  HIP_HALF,
  RIG,
  SHOULDER_HALF,
  X,
  Y,
  Z,
  bodyFrame,
  flatFoot,
  grippingPaw,
  headOn,
  lerp3,
  slerp,
  solveTwoBone,
  toesOut,
  turn,
  v,
} from '@/components/exercise-animations/3d/rig';

// The 3D rig helpers every native pose is built from.

const close = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
const closeTo = (a: THREE.Vector3, b: THREE.Vector3, tolerance = 1e-9) => a.distanceTo(b) <= tolerance;

/** A repeatable spread of points: no randomness, so a failure always comes back. */
function points(count: number, scale = 1) {
  return Array.from({length: count}, (_, i) =>
    v(Math.sin(i * 1.7) * scale, Math.cos(i * 2.3) * scale, Math.sin(i * 0.9 + 1) * scale),
  );
}

/** How far `joint` sits off the line from `root` to `end`, as a vector. */
function offLine(root: THREE.Vector3, joint: THREE.Vector3, end: THREE.Vector3) {
  const along = end.clone().sub(root).normalize();
  const rel = joint.clone().sub(root);
  return rel.addScaledVector(along, -rel.dot(along));
}

test('two-bone IK keeps both lengths and bends towards the pole', () => {
  const root = v(0.1, 1.2, -0.3);
  for (const [i, offset] of points(40, 0.6).entries()) {
    const target = root.clone().add(offset);
    const pole = points(40)[(i * 7 + 3) % 40];
    const {joint, end} = solveTwoBone(root, target, 0.62, 0.56, pole);
    assert.ok(close(root.distanceTo(joint), 0.62, 1e-9), `upper length at ${i}`);
    assert.ok(close(joint.distanceTo(end), 0.56, 1e-9), `lower length at ${i}`);
    assert.ok(closeTo(end, target), `reaches a target in range at ${i}`);
    // The joint sits in the plane of the line and the pole, on the pole's side.
    const off = offLine(root, joint, end);
    const along = end.clone().sub(root).normalize();
    const poleAcross = pole.clone().addScaledVector(along, -pole.dot(along)).normalize();
    assert.ok(off.dot(poleAcross) > 0, `bends towards the pole at ${i}`);
    assert.ok(close(off.clone().normalize().dot(poleAcross), 1, 1e-9), `in the pole's plane at ${i}`);
  }
});

test('two-bone IK pulls in a target out of reach, and pushes out one too close, without stretching', () => {
  const root = v(0, 1, 0);
  const far = solveTwoBone(root, v(3, 1, 0), 0.62, 0.56, Y);
  assert.ok(closeTo(far.end, v(1.18, 1, 0)), 'straight at full reach');
  assert.ok(close(root.distanceTo(far.joint), 0.62) && close(far.joint.distanceTo(far.end), 0.56));
  const near = solveTwoBone(root, v(0.01, 1, 0), 0.62, 0.56, Y);
  assert.ok(close(root.distanceTo(near.joint), 0.62) && close(near.joint.distanceTo(near.end), 0.56));
  // Exactly straight, and a pole along the limb: still a joint, not NaN.
  for (const pole of [Y, X]) {
    const straight = solveTwoBone(root, v(1.18, 1, 0), 0.62, 0.56, pole);
    assert.ok([straight.joint.x, straight.joint.y, straight.joint.z].every(Number.isFinite));
    assert.ok(close(root.distanceTo(straight.joint), 0.62, 1e-6));
  }
});

test('the body frame is square, right-handed and puts the joints at their half-widths', () => {
  const body = bodyFrame(v(0.3, 0.9, 0.1), v(0.4, 1, 0), v(1, 0.5, 0.2));
  for (const axis of [body.up, body.forward, body.right]) assert.ok(close(axis.length(), 1));
  assert.ok(close(body.up.dot(body.forward), 0) && close(body.up.dot(body.right), 0) && close(body.forward.dot(body.right), 0));
  assert.ok(closeTo(new THREE.Vector3().crossVectors(body.up, body.forward), body.right));
  assert.ok(close(body.shoulder.distanceTo(body.hip), RIG.torso));
  assert.ok(close(body.shoulderOf('left').distanceTo(body.shoulderOf('right')), SHOULDER_HALF * 2));
  assert.ok(close(body.hipOf('right').distanceTo(body.hip), HIP_HALF));
  // Left is the -right side, as in Skeleton.
  assert.ok(body.hipOf('left').clone().sub(body.hip).dot(body.right) < 0);
  // Facing +x upright, the body's right is -z; facing +z, it's +x.
  assert.ok(closeTo(bodyFrame(v(0, 1, 0), Y, X).right, Z.clone().negate()));
  assert.ok(closeTo(bodyFrame(v(0, 1, 0), Y, Z).right, X));
});

test('lerp, slerp and turn', () => {
  assert.ok(closeTo(lerp3(v(0, 0, 0), v(2, 4, 6), 0.25), v(0.5, 1, 1.5)));
  assert.ok(closeTo(slerp(X, Y, 0), X) && closeTo(slerp(X, Y, 1), Y));
  const half = slerp(X, Y, 0.5);
  assert.ok(close(half.length(), 1) && closeTo(half, v(Math.SQRT1_2, Math.SQRT1_2, 0)));
  assert.ok(closeTo(turn(Z, Y, 90), X));
});

test('feet, toes, heads and grips', () => {
  const foot = flatFoot(v(0, FOOT.ankle, 0.2), v(1, -0.3, 0));
  assert.ok(close(foot.at.y, FOOT.height) && close(foot.forward.y, 0) && close(foot.forward.length(), 1));
  // Toes turn outwards on each side: facing +x, the left (+z) foot turns to +z.
  assert.ok(toesOut(X, 'left').z > 0 && toesOut(X, 'right').z < 0);
  const body = bodyFrame(v(0, 1, 0), Y, X);
  const {head, headForward, headUp} = headOn(body);
  assert.ok(head.y > body.shoulder.y && close(headForward.dot(headUp), 0));
  // The fingers wrap over the side asked for, whichever way the bar is given.
  for (const bar of [Z, Z.clone().negate()]) {
    const paw = grippingPaw(v(0, 1, 0), bar, X.clone().negate(), Y);
    const {axis, palm} = paw.grip!;
    assert.ok(close(axis.dot(palm), 0));
    assert.ok(new THREE.Vector3().crossVectors(palm, axis).dot(Y) > 0.99);
  }
});

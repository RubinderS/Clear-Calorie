import * as THREE from 'three';
import type {Kit} from './kit';
import type {Contact3D, Grip, Skeleton} from './skeleton';

/**
 * The rabbit mascot in 3D, built from simple rounded shapes with toon
 * shading. It's posed from a `Skeleton`, so it can stand, lie, hinge or hang.
 */

const COLOURS = {
  fur: '#EDE6DA',
  innerEar: '#F4C0D1',
  blush: '#ED93B1',
  nose: '#D4537E',
  white: '#FFFFFF',
  eye: '#2C2C2A',
  shirt: '#1D9E75',
  shorts: '#185FA5',
};

/**
 * The sizes of the rabbit's parts, in scene units, for anything that needs
 * to keep clear of them. The torso is a capsule from `below` the hips to
 * `above` the shoulders, `radius` round, stretched to `width` across and
 * squashed to `depth` front to back.
 */
export const SIZES = {
  torso: {radius: 0.3, width: 1.05, depth: 0.72, below: 0.07, above: 0.18},
  head: {radius: 0.3, scale: [1.03, 0.93, 0.95]},
  leg: 0.1,
  shorts: 0.17,
  upperArm: 0.09,
  sleeve: 0.115,
  forearm: 0.085,
  paw: 0.1,
  foot: {radius: 0.12, scale: [1, 0.6, 1.7]},
} as const;

const SLEEVE = 0.42;
/** How far down the legs the shorts reach, as a share of hip to ankle. */
export const SHORTS = 0.32;
/** A closed paw: how far the fingers sit from the bar's middle, and the spread of the four fingers along it. */
const GRIP = {reach: 0.07, finger: 0.021, spread: [-0.051, -0.017, 0.017, 0.051]};

/** A capsule `length` long between its end centres, lying along +y so it can be pointed between two joints. */
class Limb {
  readonly mesh: THREE.Mesh;
  private readonly length: number;

  constructor(radius: number, length: number, material: THREE.Material) {
    this.length = length;
    this.mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 14), material);
    this.mesh.castShadow = true;
  }

  /** Lays the limb from `from` towards `to`, covering `share` of the way (the full limb by default). */
  place(from: THREE.Vector3, to: THREE.Vector3, share = 1) {
    const direction = to.clone().sub(from);
    const span = Math.max(1e-4, direction.length() * share);
    this.mesh.position.copy(from).addScaledVector(direction.normalize(), span / 2);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.mesh.scale.set(1, span / this.length, 1);
  }
}

/** Turns `object` so its +y points along `up` and its +z as near `forward` as it can. */
function orient(object: THREE.Object3D, up: THREE.Vector3, forward: THREE.Vector3) {
  const y = up.clone().normalize();
  const z = forward.clone().addScaledVector(y, -forward.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** A curl of `tube` thickness round the bar's axis (local x), from `from` degrees for `arc` degrees; 0 is the palm side (+z), 90 the top (+y). */
function curl(radius: number, tube: number, from: number, arc: number, material: THREE.Material) {
  const geometry = new THREE.TorusGeometry(radius, tube, 8, 20, THREE.MathUtils.degToRad(arc));
  geometry.rotateZ(THREE.MathUtils.degToRad(from));
  geometry.rotateY(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

/**
 * A paw closed round a bar, built with the bar along local x and the palm on
 * the +z side: the palm under the bar on that side, four fingers curled up
 * over the top and down the far side, and the thumb wrapped the other way,
 * under the bar. `thumb` moves the thumb to the inner end of the hand.
 */
function grippingPaw(kit: Kit, fur: THREE.Material, fingers: THREE.Material, pads: THREE.Material) {
  const group = new THREE.Group();
  const palmAngle = THREE.MathUtils.degToRad(-50);
  const palm = kit.ball(0.06, fur, [1.5, 1, 0.55]);
  palm.position.set(0, Math.sin(palmAngle) * GRIP.reach, Math.cos(palmAngle) * GRIP.reach);
  palm.rotation.x = -palmAngle;
  group.add(palm);
  // Where the fingertips finish: down the far side of the bar.
  const tip = THREE.MathUtils.degToRad(-20 + 215);
  for (const x of GRIP.spread) {
    const finger = curl(GRIP.reach, GRIP.finger, -20, 215, fingers);
    finger.position.x = x;
    // A pink pad on each fingertip shows which side the fingers close on.
    const pad = kit.ball(0.019, pads, [1, 1, 0.7], [10, 8]);
    const out = GRIP.reach + GRIP.finger * 0.6;
    pad.position.set(x, Math.sin(tip) * out, Math.cos(tip) * out);
    group.add(finger, pad);
  }
  const thumb = curl(GRIP.reach, 0.023, -175, 125, fingers);
  group.add(thumb);
  return {group, thumb};
}

/** Turns a closed paw so the bar runs along `grip.axis` with the palm toward `grip.palm`. */
function orientGrip(object: THREE.Object3D, grip: Grip) {
  const x = grip.axis.clone().normalize();
  const z = grip.palm.clone().addScaledVector(x, -grip.palm.dot(x)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export type Rabbit3D = {
  group: THREE.Group;
  /** Moves every part to `skeleton`. */
  update(skeleton: Skeleton): void;
};

/**
 * Builds the rabbit once; call `update` with each frame's skeleton.
 * `torso`, `upperArm`, `forearm`, `thigh` and `shin` are the rig's lengths
 * in scene units (`RIG` in rig.ts), which the limbs are built to.
 */
export function createRabbit3D(
  kit: Kit,
  {torso: L, upperArm, forearm, thigh, shin}: {torso: number; upperArm: number; forearm: number; thigh: number; shin: number},
): Rabbit3D {
  const fur = kit.toon(COLOURS.fur);
  const shirt = kit.toon(COLOURS.shirt);
  const shorts = kit.toon(COLOURS.shorts);
  const white = kit.toon(COLOURS.white);
  const innerEar = kit.toon(COLOURS.innerEar);
  const dark = kit.toon(COLOURS.eye);
  const nose = kit.toon(COLOURS.nose);
  const blush = kit.toon(COLOURS.blush);
  // Fingers are small, so a finer outline keeps them from looking heavy.
  const fingers = kit.toon(COLOURS.fur, 0.005);
  const ball = kit.ball;

  const group = new THREE.Group();

  // The body: torso, shorts and tail, one rigid piece from the hips (origin) up +y, facing +z.
  const body = new THREE.Group();
  group.add(body);
  const {radius, width, depth, below, above} = SIZES.torso;
  const top = L + above;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(radius, top - below - radius * 2, 8, 20), shirt);
  torso.scale.set(width, 1, depth);
  torso.position.set(0, (top + below) / 2, 0);
  torso.castShadow = true;
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.31, 0.28, 24), shorts);
  waist.scale.set(1, 1, 0.74);
  waist.position.set(0, 0.07, 0);
  waist.castShadow = true;
  const tail = ball(0.1, white);
  tail.position.set(0, 0.06, -0.24);
  body.add(torso, waist, tail);

  // Head: its own piece so it can nod. Built facing +z, top +y.
  const head = new THREE.Group();
  group.add(head);
  const skull = ball(SIZES.head.radius, fur, [...SIZES.head.scale]);
  const muzzle = ball(0.13, white, [1.15, 0.72, 0.7]);
  muzzle.position.set(0, -0.13, 0.22);
  const noseTip = ball(0.04, nose, [1.2, 0.85, 0.9]);
  noseTip.position.set(0, -0.07, 0.31);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), white);
  tooth.position.set(0, -0.19, 0.29);
  head.add(skull, muzzle, noseTip, tooth);
  for (const side of [-1, 1]) {
    const eye = ball(0.045, dark);
    eye.position.set(side * 0.12, 0.04, 0.25);
    const shine = ball(0.014, white);
    shine.position.set(side * 0.12 + 0.015, 0.058, 0.29);
    const cheek = ball(0.05, blush, [1, 0.8, 0.4]);
    cheek.position.set(side * 0.2, -0.1, 0.2);
    head.add(eye, shine, cheek);
  }
  // Ears stand up from the top of the head, tipped out a little; they bounce on a hop.
  const ears = new THREE.Group();
  head.add(ears);
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.17, 0.5, -0.02);
    ear.rotation.z = -side * THREE.MathUtils.degToRad(10);
    const outer = ball(0.11, fur, [1, 3.1, 0.55]);
    const inner = ball(0.05, innerEar, [1, 5, 0.4]);
    inner.position.set(0, 0.02, 0.045);
    ear.add(outer, inner);
    ears.add(ear);
  }

  // Limbs, posed every frame.
  const leg = () => ({
    thigh: new Limb(SIZES.leg, thigh, fur),
    shin: new Limb(SIZES.leg, shin, fur),
    shorts: new Limb(SIZES.shorts, (thigh + shin) * SHORTS, shorts),
    foot: ball(SIZES.foot.radius, fur, [...SIZES.foot.scale]),
  });
  const arm = () => ({
    upper: new Limb(SIZES.upperArm, upperArm, fur),
    sleeve: new Limb(SIZES.sleeve, upperArm * SLEEVE, shirt),
    fore: new Limb(SIZES.forearm, forearm, fur),
    paw: ball(SIZES.paw, fur),
    // Shown instead of the round paw when it holds a bar.
    grip: grippingPaw(kit, fur, fingers, blush),
  });
  const legs = {left: leg(), right: leg()};
  const arms = {left: arm(), right: arm()};
  for (const side of ['left', 'right'] as const) {
    const l = legs[side];
    const a = arms[side];
    group.add(l.thigh.mesh, l.shin.mesh, l.shorts.mesh, l.foot, a.upper.mesh, a.sleeve.mesh, a.fore.mesh, a.paw, a.grip.group);
  }

  const place = (object: THREE.Object3D, contact: Contact3D) => {
    object.position.copy(contact.at);
    orient(object, contact.up, contact.forward);
  };

  return {
    group,
    update(s) {
      const up = s.shoulder.clone().sub(s.hip).normalize();
      body.position.copy(s.hip);
      orient(body, up, s.forward);
      head.position.copy(s.head);
      orient(head, s.headUp, s.headForward);
      ears.position.y = s.earLift * 1.5;
      // The body's own right, for putting the thumbs on the inner end of a gripping paw.
      const right = new THREE.Vector3().crossVectors(up, s.forward).normalize();
      for (const side of ['left', 'right'] as const) {
        const l = legs[side];
        const a = arms[side];
        const legPose = s.legs[side];
        const armPose = s.arms[side];
        l.thigh.place(legPose.hip, legPose.knee);
        l.shin.place(legPose.knee, legPose.ankle);
        l.shorts.place(legPose.hip, legPose.knee, Math.min(1, ((thigh + shin) * SHORTS) / thigh));
        place(l.foot, s.feet[side]);
        a.upper.place(armPose.shoulder, armPose.elbow);
        a.sleeve.place(armPose.shoulder, armPose.elbow, SLEEVE);
        a.fore.place(armPose.elbow, armPose.wrist);
        const paw = s.paws[side];
        a.paw.visible = !paw.grip;
        a.grip.group.visible = Boolean(paw.grip);
        if (paw.grip) {
          a.grip.group.position.copy(paw.at);
          orientGrip(a.grip.group, paw.grip);
          // The thumb sits at the end of the hand toward the body's middle.
          const inward = right.dot(paw.grip.axis) * (side === 'left' ? 1 : -1);
          a.grip.thumb.position.x = Math.sign(inward || 1) * 0.07;
        } else {
          place(a.paw, paw);
        }
      }
    },
  };
}

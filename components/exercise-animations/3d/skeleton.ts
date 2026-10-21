import * as THREE from 'three';

/**
 * The 3D rabbit's pose: every joint in scene units, the floor at y = 0.
 * Sides are the body's own: `left` is -x in the body's frame (x = up ×
 * forward), `right` is +x. Facing the camera (+z) that's screen left and
 * right; side-on (facing +x), `left` is the near side (+z) and `right` the
 * far side. Poses are built with the helpers in rig.ts.
 */
export type Arm3D = {shoulder: THREE.Vector3; elbow: THREE.Vector3; wrist: THREE.Vector3};
export type Leg3D = {hip: THREE.Vector3; knee: THREE.Vector3; ankle: THREE.Vector3};
/**
 * A paw closed round a bar: the bar runs along `axis` through the contact
 * point, and `palm` points from the bar to the side the palm is on. The
 * fingers wrap from the palm round palm × axis to the other side; the thumb
 * wraps the other way.
 */
export type Grip = {axis: THREE.Vector3; palm: THREE.Vector3};
/** A foot or paw: where it sits and which way it points; a paw can grip a bar. */
export type Contact3D = {at: THREE.Vector3; forward: THREE.Vector3; up: THREE.Vector3; grip?: Grip};

export type Skeleton = {
  /** The middle of the hips and of the shoulders: the torso line. */
  hip: THREE.Vector3;
  shoulder: THREE.Vector3;
  /** The way the chest faces. */
  forward: THREE.Vector3;
  head: THREE.Vector3;
  headForward: THREE.Vector3;
  headUp: THREE.Vector3;
  /** Extra lift of the ears on a hop. */
  earLift: number;
  arms: {left: Arm3D; right: Arm3D};
  legs: {left: Leg3D; right: Leg3D};
  feet: {left: Contact3D; right: Contact3D};
  paws: {left: Contact3D; right: Contact3D};
};

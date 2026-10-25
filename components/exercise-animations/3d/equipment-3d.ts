import * as THREE from 'three';
import type {Kit} from './kit';

/**
 * Equipment in 3D, in the same outlined toon style as the rabbit. Each piece
 * is built once; the moving ones have an `update` to follow the paws.
 */

const COLOURS = {
  bar: '#B4B2A9',
  plate: '#5F5E5A',
  plateFar: '#444441',
  hub: '#D3D1C7',
  pad: '#444441',
  frame: '#5F5E5A',
  band: '#D85A30',
  slider: '#B4B2A9',
  wall: '#D3D1C7',
};

const Y = new THREE.Vector3(0, 1, 0);

function cylinder(kit: Kit, radius: number, length: number, colour: string, outline: number | false = 0.008) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 28), kit.toon(colour, outline));
  mesh.castShadow = true;
  return mesh;
}

function box(kit: Kit, size: [number, number, number], colour: string, outline: number | false = 0.008) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), kit.toon(colour, outline));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A barbell lying across the body (along z), centred on the bar's middle. */
export function barbell(kit: Kit, {length = 2.2, plateRadius = 0.38, plateSpread = 0.66} = {}) {
  const group = new THREE.Group();
  const bar = cylinder(kit, 0.025, length, COLOURS.bar, 0.005);
  bar.rotation.x = Math.PI / 2;
  group.add(bar);
  for (const side of [-1, 1]) {
    for (const [offset, radius] of [[0, plateRadius], [0.085, plateRadius * 0.8]]) {
      const plate = cylinder(kit, radius, 0.07, side > 0 ? COLOURS.plate : COLOURS.plateFar);
      plate.rotation.x = Math.PI / 2;
      plate.position.z = side * (plateSpread + offset);
      group.add(plate);
    }
    const hub = cylinder(kit, 0.07, 0.1, COLOURS.hub, 0.005);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = side * (plateSpread - 0.08);
    group.add(hub);
  }
  return {
    object: group,
    update(centre: THREE.Vector3) {
      group.position.copy(centre);
    },
  };
}

/**
 * A dumbbell's size: rabbit-sized plates, and a handle long enough that the
 * forearm passes between them from a closed paw.
 */
export const DUMBBELL = {radius: 0.14, handle: 0.32} as const;

/** A dumbbell: a handle with a round plate at each end, its handle along `axis`. */
export function dumbbell(kit: Kit, {radius = DUMBBELL.radius, handle = DUMBBELL.handle}: {radius?: number; handle?: number} = {}) {
  const group = new THREE.Group();
  const grip = cylinder(kit, 0.025, handle, COLOURS.bar, 0.005);
  group.add(grip);
  for (const side of [-1, 1]) {
    const plate = cylinder(kit, radius, 0.08, COLOURS.plate);
    plate.position.y = side * (handle / 2 - 0.02);
    group.add(plate);
  }
  return {
    object: group,
    update(centre: THREE.Vector3, axis: THREE.Vector3) {
      group.position.copy(centre);
      group.quaternion.setFromUnitVectors(Y, axis.clone().normalize());
    },
  };
}

/** A flat bench: a pad on two legs. `left`..`right` along x, `top` and `bottom` heights, `z` its middle across. */
export function flatBench(
  kit: Kit,
  {left, right, top, bottom, z = 0, width = 0.55}: {left: number; right: number; top: number; bottom: number; z?: number; width?: number},
) {
  const group = new THREE.Group();
  const pad = box(kit, [right - left, top - bottom, width], COLOURS.pad);
  pad.position.set((left + right) / 2, (top + bottom) / 2, z);
  group.add(pad);
  for (const x of [left + 0.28, right - 0.3]) {
    const post = box(kit, [0.1, bottom, 0.1], COLOURS.frame);
    post.position.set(x, bottom / 2, z);
    const foot = box(kit, [0.12, 0.06, width * 0.9], COLOURS.frame);
    foot.position.set(x, 0.03, z);
    group.add(post, foot);
  }
  return {object: group};
}

/** An incline bench's back pad: along the torso from just below the hips to past the head, and its width. */
const BACK_PAD = {start: -0.12, end: 1.72, width: 0.55};

/**
 * An incline bench: a pad along the torso, a seat and the frame. `hip` is
 * the rabbit's hips at the pad's low end; `along` runs up the pad and
 * `back` from the torso into it (out of the back sitting back on it, out of
 * the chest lying face down on it), both in the x-y plane. `pad` runs
 * `start` to `end` along the torso; without a `seat` the frame stands under
 * the pad's low end.
 */
export function inclineBench(
  kit: Kit,
  {hip, along, back, seat, pad = BACK_PAD}: {
    hip: THREE.Vector3;
    along: THREE.Vector3;
    back: THREE.Vector3;
    seat?: {left: number; right: number; top: number; bottom: number};
    pad?: {start: number; end: number; width: number};
  },
) {
  const group = new THREE.Group();
  const width = 0.55;
  // The pad sits a torso's half-width off the line of the body.
  const padThickness = 0.14;
  const padCentre = hip.clone()
    .addScaledVector(along, (pad.start + pad.end) / 2)
    .addScaledVector(back, 0.26 + padThickness / 2);
  const padBox = box(kit, [pad.end - pad.start, padThickness, pad.width], COLOURS.pad);
  padBox.position.copy(padCentre);
  padBox.rotation.z = Math.atan2(along.y, along.x);
  group.add(padBox);
  // Posts up to the pad's underside near its top, and to the seat or the pad's low end.
  const under = (at: number) => hip.clone().addScaledVector(along, at).addScaledVector(back, 0.26 + padThickness);
  const brace = under(pad.end - 0.42);
  const low = seat ? new THREE.Vector3((seat.left + seat.right) / 2, seat.bottom, 0) : under(pad.start + 0.25);
  if (seat) {
    const seatBox = box(kit, [seat.right - seat.left, seat.top - seat.bottom, width], COLOURS.pad);
    seatBox.position.set((seat.left + seat.right) / 2, (seat.top + seat.bottom) / 2, 0);
    group.add(seatBox);
  }
  for (const [x, height] of [[brace.x, brace.y], [low.x, low.y]]) {
    const post = box(kit, [0.1, height, 0.1], COLOURS.frame);
    post.position.set(x, height / 2, 0);
    const foot = box(kit, [0.12, 0.06, width * 0.9], COLOURS.frame);
    foot.position.set(x, 0.03, 0);
    group.add(post, foot);
  }
  return {object: group};
}

/** An upright post on the floor with a band tied on at `anchor`. */
export function post(kit: Kit, anchor: THREE.Vector3) {
  const group = new THREE.Group();
  const height = anchor.y + 0.4;
  const pole = box(kit, [0.1, height, 0.1], COLOURS.frame);
  pole.position.set(anchor.x + 0.07, height / 2, anchor.z);
  const foot = box(kit, [0.44, 0.06, 0.44], COLOURS.frame);
  foot.position.set(anchor.x + 0.07, 0.03, anchor.z);
  const knot = kit.ball(0.05, kit.toon(COLOURS.band, 0.005));
  knot.position.copy(anchor);
  group.add(pole, foot, knot);
  return {object: group};
}

/** A wall standing on the floor, `width` across, centred at `centre`, its face towards +x. */
export function wall(kit: Kit, {centre, height, width, thickness}: {centre: THREE.Vector3; height: number; width: number; thickness: number}) {
  const slab = box(kit, [thickness, height, width], COLOURS.wall);
  slab.position.copy(centre);
  return {object: slab};
}

/** A stretch of resistance band between two points. */
export function band(kit: Kit) {
  const mesh = cylinder(kit, 0.018, 1, COLOURS.band, 0.004);
  mesh.name = 'band';
  return {
    object: mesh,
    update(from: THREE.Vector3, to: THREE.Vector3) {
      const direction = to.clone().sub(from);
      mesh.position.copy(from).addScaledVector(direction, 0.5);
      mesh.quaternion.setFromUnitVectors(Y, direction.clone().normalize());
      mesh.scale.set(1, Math.max(1e-4, direction.length()), 1);
    },
  };
}

/** A pull-up bar, `length` long along `axis`, centred at `centre`, with brackets at each end. */
export function pullUpBar(kit: Kit, {centre, axis, length}: {centre: THREE.Vector3; axis: THREE.Vector3; length: number}) {
  const group = new THREE.Group();
  const bar = cylinder(kit, 0.04, length, COLOURS.bar, 0.006);
  group.add(bar);
  for (const side of [-1, 1]) {
    const bracket = box(kit, [0.1, 0.1, 0.1], COLOURS.frame);
    bracket.position.y = side * (length / 2);
    group.add(bracket);
  }
  group.position.copy(centre);
  group.quaternion.setFromUnitVectors(Y, axis.clone().normalize());
  return {object: group};
}

/** A flat slider disc under a heel. */
export function slider(kit: Kit) {
  const disc = cylinder(kit, 0.16, 0.03, COLOURS.slider, 0.005);
  disc.receiveShadow = true;
  return {
    object: disc,
    update(at: THREE.Vector3) {
      disc.position.set(at.x, 0.015, at.z);
    },
  };
}

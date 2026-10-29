'use client';

import {useEffect, useId, useRef, useSyncExternalStore} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {OutlineEffect} from 'three/addons/effects/OutlineEffect.js';
import {frameAt, cycleMs, type AnimationFrame, type ExerciseScene} from '@/lib/exercise-animation';
import {exerciseCatalog} from '@/lib/exercise-catalog';
import {cn} from '@/lib/utils';
import type {Side} from '@/lib/workout';
import {createKit, type Kit} from './kit';
import {createRabbit3D, type Rabbit3D} from './rabbit-3d';
import {RIG} from './rig';
import type {Skeleton} from './skeleton';

/**
 * Plays an exercise in 3D (Three.js): its pose for each frame, drawn as a
 * toon-shaded rabbit seen from three-quarters on. Drag to turn the camera.
 * Where WebGL isn't available it says so and lists the steps instead.
 */

export type Spec3D = {
  /** The rabbit's skeleton at a frame of the rep. */
  pose(frame: AnimationFrame): Skeleton;
  /** Adds the equipment to `parent`, returning what to move each frame. */
  equipment?(kit: Kit, parent: THREE.Group): ((frame: AnimationFrame, skeleton: Skeleton) => void) | void;
  /** `aspect` is the scene's width over height, 1 by default. */
  camera?: {aspect?: number};
  /** Hanging exercises have no floor in view. */
  floor?: boolean;
  /**
   * An exercise done one side at a time, posed with the near leg working,
   * which reads as the right. The left side, and the preview and rests
   * before it, play it mirrored near side to far, so the rabbit faces the
   * same way with the other leg doing the work.
   */
  sided?: boolean;
};

let webGL: boolean | undefined;
/** Whether this browser can draw WebGL; checked once. */
function canUseWebGL(): boolean {
  if (webGL === undefined) {
    const canvas = document.createElement('canvas');
    webGL = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  }
  return webGL;
}
const noSubscription = () => () => {};

/** Where the camera looks from, relative to the rabbit: three-quarters on to the face (front, facing +z) or the near side (side, facing +x). */
const VIEW_DIRECTION = {
  front: new THREE.Vector3(0.34, 0.24, 1).normalize(),
  side: new THREE.Vector3(0.9, 0.32, 1).normalize(),
};
const FOV = 30;

/**
 * Every point the scene reaches over a whole rep: the rabbit's joints, its
 * head and ears, and the equipment.
 */
function repBounds(spec: Spec3D, id: string, update: (frame: AnimationFrame) => void, objects: THREE.Object3D): THREE.Box3 {
  const entry = exerciseCatalog.get(id);
  const bounds = new THREE.Box3();
  const total = entry ? cycleMs(entry.phases) : 0;
  const frames = entry
    ? Array.from({length: 24}, (_, i) => frameAt(entry.phases, (total * i) / 24))
    : [{phaseIndex: 0, phase: {name: '', durationMs: 1, from: 0, to: 0, cue: ''}, phaseT: 0, progress: 0}];
  for (const frame of frames) {
    update(frame);
    objects.updateMatrixWorld(true);
    bounds.union(new THREE.Box3().setFromObject(objects));
  }
  return bounds;
}

/** Places the camera along `direction` so `bounds` fills the view at `aspect`. */
function frame(camera: THREE.PerspectiveCamera, bounds: THREE.Box3, direction: THREE.Vector3, aspect: number) {
  const centre = bounds.getCenter(new THREE.Vector3());
  const back = direction.clone().normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), back).normalize();
  const up = new THREE.Vector3().crossVectors(back, right);
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const tanH = tanV * aspect;
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const offset = new THREE.Vector3(x, y, z).sub(centre);
        const depth = offset.dot(back);
        distance = Math.max(distance, depth + Math.abs(offset.dot(right)) / tanH, depth + Math.abs(offset.dot(up)) / tanV);
      }
    }
  }
  camera.aspect = aspect;
  camera.position.copy(centre).addScaledVector(back, distance * 1.06);
  camera.updateProjectionMatrix();
  return centre;
}

type Stage = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  pose(frame: AnimationFrame): void;
  setSide(side: Side | undefined): void;
  fit(aspect: number): void;
  render(): void;
  dispose(): void;
};

function createStage(host: HTMLElement, spec: Spec3D, id: string, view: 'front' | 'side'): Stage {
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  Object.assign(renderer.domElement.style, {display: 'block', width: '100%', height: '100%', touchAction: 'pan-y'});
  host.appendChild(renderer.domElement);
  // Dark outlines, for the cartoon look.
  const effect = new OutlineEffect(renderer, {defaultThickness: 0.01, defaultColor: [0.17, 0.17, 0.16]});
  const kit = createKit();

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9b2a6', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  // Everything that moves or should be framed: the rabbit and its equipment.
  const subject = new THREE.Group();
  scene.add(subject);
  const rabbit: Rabbit3D = createRabbit3D(kit, RIG);
  subject.add(rabbit.group);
  const equipment = new THREE.Group();
  subject.add(equipment);
  const move = spec.equipment?.(kit, equipment);
  const pose = (f: AnimationFrame) => {
    const skeleton = spec.pose(f);
    rabbit.update(skeleton);
    move?.(f, skeleton);
  };

  const bounds = repBounds(spec, id, pose, subject);
  const centre = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  // The floor only shows the shadow and a faint ring, so the page's own background shows through.
  if (spec.floor !== false) {
    const reach = Math.max(size.x, size.z) * 0.75 + 0.8;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(reach, 48), new THREE.ShadowMaterial({opacity: 0.18}));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(centre.x, 0, centre.z);
    floor.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(reach * 0.62, reach * 0.62 + 0.02, 64),
      new THREE.MeshBasicMaterial({color: '#888780', transparent: true, opacity: 0.35}),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(centre.x, 0.002, centre.z);
    scene.add(floor, ring);
  }
  // The light follows the subject so its shadow always lands on the floor in view.
  sun.position.copy(centre).add(new THREE.Vector3(2.5, 6, 4));
  sun.target.position.copy(centre);
  const shadowReach = Math.max(size.x, size.y, size.z) / 2 + 1;
  Object.assign(sun.shadow.camera, {left: -shadowReach, right: shadowReach, top: shadowReach, bottom: -shadowReach, far: 30});
  sun.shadow.camera.updateProjectionMatrix();

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = THREE.MathUtils.degToRad(20);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(88);

  const render = () => {
    renderer.clear();
    effect.render(scene, camera);
  };
  controls.addEventListener('change', render);
  return {
    renderer,
    camera,
    controls,
    pose,
    setSide(side) {
      // Mirrored about the middle of the rep, so the framing and floor still fit.
      // three.js flips the face winding itself for a mirrored object.
      const mirrored = spec.sided === true && side !== 'right';
      subject.scale.z = mirrored ? -1 : 1;
      subject.position.z = mirrored ? 2 * centre.z : 0;
    },
    fit(aspect) {
      controls.target.copy(frame(camera, bounds, VIEW_DIRECTION[view], aspect));
      controls.update();
    },
    render,
    dispose() {
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      kit.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** Shown instead of the scene without WebGL: a note, and the rep's steps with the current one marked. */
function NoWebGL({id, frame: current}: {id: string; frame: AnimationFrame}) {
  const phases = exerciseCatalog.get(id)?.phases ?? [];
  return (
    <div role="note" className="w-full rounded-md border border-dashed p-4 text-sm">
      <p className="font-medium">This animation needs 3D graphics, which this browser can&apos;t show.</p>
      <ol aria-label="Steps" className="mt-2 list-decimal space-y-0.5 pl-5 text-muted-foreground">
        {phases.map((phase, i) => (
          <li
            key={phase.name}
            aria-current={i === current.phaseIndex ? 'step' : undefined}
            className={cn(i === current.phaseIndex && 'font-semibold text-foreground')}
          >
            {phase.cue}
          </li>
        ))}
      </ol>
    </div>
  );
}

const scenes = new Map<string, ExerciseScene>();

/** The 3D scene for an exercise, made once per id. */
export function scene3D(id: string, spec: Spec3D): ExerciseScene {
  const existing = scenes.get(id);
  if (existing) return existing;
  const entry = exerciseCatalog.get(id);
  const view = entry?.view ?? 'side';
  const aspect = spec.camera?.aspect ?? 1;
  const label = `${entry?.name ?? 'Exercise'}: the rabbit in 3D`;
  function Scene3D({frame: current, side}: {frame: AnimationFrame; side?: Side}) {
    const descId = useId();
    const hostRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Stage | null>(null);
    const sideRef = useRef(side);
    // The server can't tell, so it renders the 3D host and the browser decides.
    const supported = useSyncExternalStore(noSubscription, canUseWebGL, () => true);

    // Set up the renderer once; it lives as long as the scene is shown.
    useEffect(() => {
      const host = hostRef.current;
      if (!host || !supported) return;
      const stage = createStage(host, spec, id, view);
      stage.setSide(sideRef.current);
      stageRef.current = stage;
      const resize = () => {
        const {width, height} = host.getBoundingClientRect();
        if (!width || !height) return;
        stage.renderer.setSize(width, height, false);
        stage.fit(width / height);
        stage.render();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      return () => {
        observer.disconnect();
        stage.dispose();
        stageRef.current = null;
      };
    }, [supported]);

    // Pose the rabbit for each frame the player hands over, on the side it's working.
    useEffect(() => {
      sideRef.current = side;
      const stage = stageRef.current;
      if (!stage) return;
      stage.setSide(side);
      stage.pose(current);
      stage.render();
    }, [current, side]);

    if (!supported) return <NoWebGL id={id} frame={current} />;
    return (
      <div
        ref={hostRef}
        role="img"
        aria-label={label}
        aria-describedby={descId}
        className="w-full cursor-grab active:cursor-grabbing"
        style={{aspectRatio: `${aspect}`}}
      >
        <span id={descId} className="sr-only">
          Drag to turn the view.
        </span>
      </div>
    );
  }
  Scene3D.displayName = `Scene3D(${id})`;
  scenes.set(id, Scene3D);
  return Scene3D;
}

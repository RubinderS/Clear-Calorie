import * as THREE from 'three';
import type {ExerciseScene} from '@/lib/exercise-animation';
import {band, barbell, dumbbell, flatBench, inclineBench, post, pullUpBar, slider} from './equipment-3d';
import {FLAT_BENCH} from './moves/bench';
import * as hanging from './moves/hanging';
import * as facePull from './poses/band-face-pull';
import * as tricepsExtension from './poses/band-triceps-extension';
import * as pushdown from './poses/band-triceps-pushdown';
import * as bench from './poses/barbell-bench-press';
import * as row from './poses/barbell-bent-over-row';
import * as barbellSquat from './poses/barbell-squat';
import * as splitSquat from './poses/bulgarian-split-squat';
import * as burpee from './poses/burpee';
import * as buttKicks from './poses/butt-kicks';
import * as chestSupportedRow from './poses/chest-supported-dumbbell-row';
import * as chinUp from './poses/chin-up';
import * as closeGrip from './poses/close-grip-push-up';
import * as calfRaise from './poses/dumbbell-calf-raise';
import * as curl from './poses/dumbbell-curl';
import * as fly from './poses/dumbbell-fly';
import * as lateralRaise from './poses/dumbbell-lateral-raise';
import * as dumbbellRdl from './poses/dumbbell-romanian-deadlift';
import * as shoulderPress from './poses/dumbbell-shoulder-press';
import * as lunge from './poses/dumbbell-walking-lunge';
import * as wristCurl from './poses/dumbbell-wrist-curl';
import * as goblet from './poses/goblet-squat';
import * as hammer from './poses/hammer-curl';
import * as kneeRaise from './poses/hanging-knee-raise';
import * as highKnees from './poses/high-knees';
import * as inclineCurl from './poses/incline-dumbbell-curl';
import * as inclinePress from './poses/incline-dumbbell-press';
import * as jumpSquat from './poses/jump-squat';
import * as jumpingJack from './poses/jumping-jack';
import * as plankJack from './poses/plank-jack';
import * as mountainClimber from './poses/mountain-climber';
import * as oneArmRow from './poses/one-arm-dumbbell-row';
import * as plank from './poses/plank';
import * as pullUp from './poses/pull-up';
import * as pushUp from './poses/push-up';
import * as rdl from './poses/romanian-deadlift';
import * as runningMan from './poses/running-man';
import * as shadowBoxing from './poses/shadow-boxing';
import * as legCurl from './poses/sliding-leg-curl';
import * as hamstringCurl from './poses/standing-hamstring-curl';
import {X, Y, Z, type Body} from './rig';
import {scene3D, type Spec3D} from './scene-3d';

/**
 * Every exercise in 3D: its pose module in poses/ and the equipment that
 * follows it. `camera.aspect` keeps each scene the shape it's always had,
 * so the page doesn't jump.
 */

type Gear = NonNullable<Spec3D['equipment']>;

/** A dumbbell closed in each paw, its handle along the paw's grip. */
function dumbbellsInGrips(size?: {radius?: number; handle?: number}): Gear {
  return (kit, parent) => {
    const pair = [dumbbell(kit, size), dumbbell(kit, size)];
    for (const d of pair) parent.add(d.object);
    return (_, skeleton) => {
      pair[0].update(skeleton.paws.left.at, skeleton.paws.left.grip!.axis);
      pair[1].update(skeleton.paws.right.at, skeleton.paws.right.grip!.axis);
    };
  };
}

/** A barbell held in the paws, centred between them; `size` as for `barbell`. */
function barbellInPaws(size?: Parameters<typeof barbell>[1]): Gear {
  return (kit, parent) => {
    const bar = barbell(kit, size);
    parent.add(bar.object);
    return (_, skeleton) => bar.update(skeleton.paws.left.at.clone().lerp(skeleton.paws.right.at, 0.5));
  };
}

/** A band from each paw in `paws` to `anchor`, tied to a post or (without one) held under a foot. */
function bandsToAnchor(
  anchor: THREE.Vector3,
  {paws = ['left', 'right'], onPost = true}: {paws?: readonly ('left' | 'right')[]; onPost?: boolean} = {},
): Gear {
  return (kit, parent) => {
    if (onPost) {
      parent.add(post(kit, anchor).object);
    } else {
      const knot = kit.ball(0.05, kit.toon('#D85A30', 0.005));
      knot.position.copy(anchor);
      parent.add(knot);
    }
    const bands = paws.map(() => band(kit));
    for (const b of bands) parent.add(b.object);
    return (_, skeleton) => paws.forEach((side, i) => bands[i].update(skeleton.paws[side].at, anchor));
  };
}

/** An incline bench behind a body sitting back on it, with dumbbells in the paws. */
function inclineWithDumbbells(body: Body, seat: {left: number; right: number; top: number; bottom: number}): Gear {
  return (kit, parent) => {
    parent.add(inclineBench(kit, {hip: body.hip, along: body.up, back: body.forward.clone().negate(), seat}).object);
    return dumbbellsInGrips()(kit, parent);
  };
}

/** A pull-up bar along `axis` through `centre`. */
function bar(centre: THREE.Vector3, axis: THREE.Vector3, length: number): Gear {
  return (kit, parent) => {
    parent.add(pullUpBar(kit, {centre, axis, length}).object);
  };
}

export const SPECS: Record<string, Spec3D> = {
  'band-face-pull': {
    pose: facePull.pose,
    equipment: bandsToAnchor(facePull.ANCHOR),
    camera: {aspect: 428 / 394},
  },
  'band-triceps-extension': {
    pose: tricepsExtension.pose,
    // One end under the working heel, the other in the working paw.
    equipment: bandsToAnchor(tricepsExtension.ANCHOR, {paws: ['left'], onPost: false}),
    camera: {aspect: 308 / 405},
  },
  'band-triceps-pushdown': {
    pose: pushdown.pose,
    equipment: bandsToAnchor(pushdown.ANCHOR),
    camera: {aspect: 308 / 398},
  },
  'barbell-bench-press': {
    pose: bench.pose,
    equipment: (kit, parent) => {
      parent.add(flatBench(kit, FLAT_BENCH).object);
      return barbellInPaws({length: 2.4, plateSpread: bench.PLATE_SPREAD})(kit, parent);
    },
    camera: {aspect: 419 / 283},
  },
  'barbell-bent-over-row': {
    pose: row.pose,
    equipment: barbellInPaws(),
    camera: {aspect: 398 / 347},
  },
  'barbell-squat': {
    pose: barbellSquat.pose,
    equipment: barbellInPaws(),
    camera: {aspect: 358 / 388},
  },
  'bulgarian-split-squat': {
    pose: splitSquat.pose,
    equipment: (kit, parent) => {
      const {back, front, top, bottom, z} = splitSquat.BENCH;
      parent.add(flatBench(kit, {left: back, right: front, top, bottom, z}).object);
    },
    camera: {aspect: 378 / 368},
  },
  'burpee': {
    pose: burpee.pose,
    camera: {aspect: 440 / 300},
  },
  'butt-kicks': {
    pose: buttKicks.pose,
    camera: {aspect: 308 / 400},
  },
  'chest-supported-dumbbell-row': {
    pose: chestSupportedRow.pose,
    equipment: (kit, parent) => {
      // Face down on the incline pad, the toes on the floor behind it: no seat in the way of the legs.
      const {hip, up, forward} = chestSupportedRow.BODY;
      parent.add(inclineBench(kit, {hip, along: up, back: forward, pad: chestSupportedRow.PAD}).object);
      return dumbbellsInGrips()(kit, parent);
    },
    camera: {aspect: 420 / 330},
  },
  'chin-up': {
    pose: chinUp.pose,
    equipment: bar(hanging.BAR, Z, hanging.BAR_LENGTH),
    camera: {aspect: 198 / 464},
    floor: false,
  },
  'close-grip-push-up': {
    pose: closeGrip.pose,
    camera: {aspect: 404 / 261},
  },
  'dumbbell-calf-raise': {
    pose: calfRaise.pose,
    equipment: dumbbellsInGrips(),
    camera: {aspect: 308 / 406},
  },
  'dumbbell-curl': {
    pose: curl.pose,
    equipment: dumbbellsInGrips(),
    camera: {aspect: 308 / 394},
  },
  'dumbbell-fly': {
    pose: fly.pose,
    equipment: (kit, parent) => {
      parent.add(flatBench(kit, FLAT_BENCH).object);
      return dumbbellsInGrips()(kit, parent);
    },
    camera: {aspect: 419 / 259},
  },
  'dumbbell-lateral-raise': {
    pose: lateralRaise.pose,
    equipment: dumbbellsInGrips(),
    camera: {aspect: 328 / 391},
  },
  'dumbbell-romanian-deadlift': {
    pose: dumbbellRdl.pose,
    equipment: dumbbellsInGrips(),
    camera: {aspect: 361 / 397},
  },
  'dumbbell-shoulder-press': {
    pose: shoulderPress.pose,
    equipment: dumbbellsInGrips(),
    camera: {aspect: 308 / 390},
  },
  'dumbbell-walking-lunge': {
    pose: lunge.pose,
    equipment: dumbbellsInGrips(),
    camera: {aspect: 358 / 364},
  },
  'dumbbell-wrist-curl': {
    pose: wristCurl.pose,
    equipment: (kit, parent) => {
      const {left, right, top, bottom} = wristCurl.BENCH;
      parent.add(flatBench(kit, {left, right, top, bottom}).object);
      return dumbbellsInGrips(wristCurl.DUMBBELL)(kit, parent);
    },
    camera: {aspect: 398 / 308},
  },
  'goblet-squat': {
    pose: goblet.pose,
    equipment: (kit, parent) => {
      // One dumbbell held upright against the chest, its top plate resting on the paws.
      const d = dumbbell(kit, goblet.DUMBBELL);
      parent.add(d.object);
      return (_, skeleton) => {
        const paws = skeleton.paws.left.at.clone().lerp(skeleton.paws.right.at, 0.5);
        d.update(paws.addScaledVector(Y, goblet.DUMBBELL_ABOVE_PAWS), Y);
      };
    },
    camera: {aspect: 358 / 395},
  },
  'hammer-curl': {
    pose: hammer.pose,
    equipment: dumbbellsInGrips(),
    camera: {aspect: 308 / 394},
  },
  'hanging-knee-raise': {
    pose: kneeRaise.pose,
    equipment: bar(hanging.BAR, Z, hanging.BAR_LENGTH),
    camera: {aspect: 228 / 421},
    floor: false,
  },
  'high-knees': {
    pose: highKnees.pose,
    camera: {aspect: 330 / 400},
  },
  'incline-dumbbell-curl': {
    pose: inclineCurl.pose,
    equipment: inclineWithDumbbells(inclineCurl.BODY, inclineCurl.SEAT),
    camera: {aspect: 398 / 329},
  },
  'incline-dumbbell-press': {
    pose: inclinePress.pose,
    equipment: inclineWithDumbbells(inclinePress.BODY, inclinePress.SEAT),
    camera: {aspect: 409 / 330},
  },
  'jump-squat': {
    pose: jumpSquat.pose,
    camera: {aspect: 358 / 420},
  },
  'jumping-jack': {
    pose: jumpingJack.pose,
    camera: {aspect: 308 / 406},
  },
  'plank-jack': {
    pose: plankJack.pose,
    camera: {aspect: 418 / 230},
  },
  'mountain-climber': {
    pose: mountainClimber.pose,
    camera: {aspect: 418 / 230},
  },
  'one-arm-dumbbell-row': {
    pose: oneArmRow.pose,
    equipment: (kit, parent) => {
      // The bench sits under the kneeling knee and the support hand; the standing foot is beside it.
      parent.add(flatBench(kit, oneArmRow.BENCH).object);
      const d = dumbbell(kit);
      parent.add(d.object);
      return (_, skeleton) => d.update(skeleton.paws.left.at, skeleton.paws.left.grip!.axis);
    },
    camera: {aspect: 398 / 292},
  },
  plank: {
    pose: plank.pose,
    camera: {aspect: 418 / 188},
  },
  'pull-up': {
    pose: pullUp.pose,
    equipment: bar(new THREE.Vector3(0, pullUp.BAR.y, pullUp.BAR.z), X, pullUp.BAR.length),
    camera: {aspect: 248 / 471},
    floor: false,
  },
  'push-up': {
    pose: pushUp.pose,
    camera: {aspect: 405 / 249},
  },
  'romanian-deadlift': {
    pose: rdl.pose,
    equipment: barbellInPaws(),
    camera: {aspect: 361 / 397},
  },
  'running-man': {
    pose: runningMan.pose,
    camera: {aspect: 340 / 400},
  },
  'shadow-boxing': {
    pose: shadowBoxing.pose,
    camera: {aspect: 400 / 380},
  },
  'sliding-leg-curl': {
    pose: legCurl.pose,
    equipment: (kit, parent) => {
      // A slider under each heel.
      const discs = [slider(kit), slider(kit)];
      for (const d of discs) parent.add(d.object);
      return (_, skeleton) => {
        discs[0].update(skeleton.legs.left.ankle);
        discs[1].update(skeleton.legs.right.ankle);
      };
    },
    camera: {aspect: 459 / 187},
  },
  'standing-hamstring-curl': {
    pose: hamstringCurl.pose,
    camera: {aspect: 360 / 400},
  },
};

/** The 3D scene for an exercise. */
export function scene3DFor(id: string): ExerciseScene {
  const spec = SPECS[id];
  if (!spec) throw new Error(`No 3D scene for "${id}"`);
  return scene3D(id, spec);
}

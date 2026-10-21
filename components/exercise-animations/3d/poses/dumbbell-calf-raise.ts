import * as THREE from 'three';
import {lerp, type AnimationFrame} from '@/lib/exercise-animation';
import {ANKLES, curlWith, underhandPaw} from '../moves/standing';
import {X, Z, pitchedFoot, shifted, v} from '../rig';
import type {Skeleton} from '../skeleton';

/** Facing +x, standing as at the start of a curl, the dumbbells hanging. */

/** The balls of the feet: the feet pivot about here as the heels rise. */
export const TOES_X = ANKLES.left.x + 0.3;
/** How far the heels lift, as the feet's turn about the toes, in degrees. */
export const HEEL_LIFT_DEG = 25;

/** How far the whole body rises at a point in the rep, carried up by the ankles turning about the toes. */
export function liftAt(progress: number): THREE.Vector3 {
  const toes = v(TOES_X, 0, 0);
  const ankle = v(ANKLES.left.x, ANKLES.left.y, 0);
  // Heel up: the foot turns toes-down about the side axis, which facing +x is -z.
  const turned = ankle.clone().sub(toes).applyAxisAngle(Z, -THREE.MathUtils.degToRad(lerp(0, HEEL_LIFT_DEG, progress))).add(toes);
  return turned.sub(ankle);
}

/** The rabbit at a point in the rep: 0 = heels down, 1 = up on the balls of the feet. */
export function calfRaisePose(progress: number): Skeleton {
  // Standing tall with the dumbbells hanging; the whole body rises rigidly.
  const s = shifted(curlWith(0, underhandPaw), liftAt(progress));
  const pitch = lerp(0, HEEL_LIFT_DEG, progress);
  return {
    ...s,
    feet: {
      left: pitchedFoot(s.legs.left.ankle, X, pitch),
      right: pitchedFoot(s.legs.right.ankle, X, pitch),
    },
  };
}

export function pose(frame: AnimationFrame): Skeleton {
  return calfRaisePose(frame.progress);
}

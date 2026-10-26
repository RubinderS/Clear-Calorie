import * as THREE from 'three';
import type {AnimationFrame} from '@/lib/exercise-animation';
import {LYING, lyingOnBench} from '../moves/bench';
import {SIDE_SIGN, X, Y, armTo, grippingPaw, lerp3, skeleton, v, type Side} from '../rig';
import {SIZES} from '../rabbit-3d';
import type {Skeleton} from '../skeleton';

/** Lying on the flat bench, head towards -x: pressing a dumbbell in each hand from beside the chest. */

/** How far each hand is out from the middle: a little wider than the bar, so the inner plates clear the chest. */
export const HAND_HALF = 0.42;
/** The middle of the hands: locked out over the shoulders, down beside the middle of the chest. */
export const DUMBBELLS = {
  top: LYING.shoulder.clone().add(v(0.03, 1.17, 0)),
  bottom: LYING.shoulder.clone().add(v(0.24, SIZES.torso.radius * SIZES.torso.depth + 0.12, 0)),
};

/** The middle of the hands at a point in the rep: 0 = arms locked out, 1 = dumbbells at the chest. */
export function dumbbellsAt(progress: number): THREE.Vector3 {
  return lerp3(DUMBBELLS.top, DUMBBELLS.bottom, progress);
}

/** The rabbit at a point in the rep: 0 = arms locked out, 1 = dumbbells at the chest. */
export function dumbbellBenchPressPose(progress: number): Skeleton {
  const hands = dumbbellsAt(progress);
  // Elbows drop below the bench, out wide of the pad and a little towards the hips.
  const elbows = (side: Side) => Y.clone().negate()
    .addScaledVector(LYING.right, SIDE_SIGN[side] * 1.2)
    .addScaledVector(X, 0.3);
  const arm = (side: Side) =>
    armTo(LYING.shoulderOf(side), hands.clone().addScaledVector(LYING.right, SIDE_SIGN[side] * HAND_HALF), elbows(side));
  const arms = {left: arm('left'), right: arm('right')};
  // Palms towards the feet: the handle across, square to the forearm, the palm on the head's side
  // and the fingers over the top.
  const paw = (side: Side) => {
    const {elbow, wrist} = arms[side];
    const along = wrist.clone().sub(elbow).normalize();
    const across = LYING.right.clone().addScaledVector(along, -LYING.right.dot(along));
    return grippingPaw(wrist, across, X.clone().negate(), along);
  };
  return skeleton(LYING, {...lyingOnBench(), arms, paws: {left: paw('left'), right: paw('right')}});
}

export function pose(frame: AnimationFrame): Skeleton {
  return dumbbellBenchPressPose(frame.progress);
}

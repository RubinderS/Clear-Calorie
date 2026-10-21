import * as THREE from 'three';
import type {AnimationFrame} from '@/lib/exercise-animation';
import {LYING, lyingOnBench} from '../moves/bench';
import {SIDE_SIGN, X, Y, Z, armTo, grippingPaw, lerp3, skeleton, v, type Side} from '../rig';
import {SIZES} from '../rabbit-3d';
import type {Skeleton} from '../skeleton';

/** Lying on the flat bench, head towards -x: pressing a barbell from the chest. */

/** How far each hand grips out from the middle of the bar. */
export const GRIP_HALF = 0.42;
/** The plates sit a little wider on this bar than the others, so the forearms pass inside them as the elbows drop. */
export const PLATE_SPREAD = 0.75;
/** How far the elbows flare out to the sides, against tucking towards the hips: clear of the plates. */
const ELBOW_FLARE = 1;
/** The middle of the bar: locked out over the shoulders, down to touch the lower chest. */
export const BAR = {
  top: LYING.shoulder.clone().add(v(0.03, 1.17, 0)),
  bottom: LYING.shoulder.clone().add(v(0.3, SIZES.torso.radius * SIZES.torso.depth + 0.035, 0)),
};

/** The middle of the bar at a point in the rep: 0 = locked out, 1 = bar on the chest. */
export function barAt(progress: number): THREE.Vector3 {
  return lerp3(BAR.top, BAR.bottom, progress);
}

/** The rabbit at a point in the rep: 0 = arms locked out, 1 = bar on the chest. */
export function benchPressPose(progress: number): Skeleton {
  const bar = barAt(progress);
  // Elbows drop below the bench, tucked about halfway between out to the sides and down towards the hips.
  const elbows = (side: Side) => Y.clone().negate().addScaledVector(LYING.right, SIDE_SIGN[side] * ELBOW_FLARE).addScaledVector(X, 1);
  const arm = (side: Side) =>
    armTo(LYING.shoulderOf(side), bar.clone().addScaledVector(LYING.right, SIDE_SIGN[side] * GRIP_HALF), elbows(side));
  const arms = {left: arm('left'), right: arm('right')};
  // Palms towards the feet: the palm on the head's side of the bar, the fingers over the top.
  const paw = (side: Side) => {
    const {elbow, wrist} = arms[side];
    return grippingPaw(wrist, Z, LYING.up, wrist.clone().sub(elbow));
  };
  return skeleton(LYING, {...lyingOnBench(), arms, paws: {left: paw('left'), right: paw('right')}});
}

export function pose(frame: AnimationFrame): Skeleton {
  return benchPressPose(frame.progress);
}

import type {ExerciseScene} from '@/lib/exercise-animation';

/** Loads an exercise's 3D scene; without WebGL it lists the steps instead. */
const scene3D = (id: string) => import('./3d/specs').then((m) => ({default: m.scene3DFor(id)}));

/**
 * Each built-in exercise's animation by catalog id, loaded only when shown.
 * Every exercise plays in 3D: its pose in 3d/poses/<id>.ts and its entry in
 * 3d/specs.ts. Add one line per exercise, e.g.
 *
 *   'barbell-back-squat': () => scene3D('barbell-back-squat'),
 */
export const EXERCISE_ANIMATIONS: Record<
  string,
  () => Promise<{default: ExerciseScene}>
> = {
  'band-face-pull': () => scene3D('band-face-pull'),
  'band-triceps-extension': () => scene3D('band-triceps-extension'),
  'band-triceps-pushdown': () => scene3D('band-triceps-pushdown'),
  'barbell-bench-press': () => scene3D('barbell-bench-press'),
  'barbell-bent-over-row': () => scene3D('barbell-bent-over-row'),
  'barbell-squat': () => scene3D('barbell-squat'),
  'bulgarian-split-squat': () => scene3D('bulgarian-split-squat'),
  'burpee': () => scene3D('burpee'),
  'butt-kicks': () => scene3D('butt-kicks'),
  'chest-supported-dumbbell-row': () => scene3D('chest-supported-dumbbell-row'),
  'chin-up': () => scene3D('chin-up'),
  'close-grip-push-up': () => scene3D('close-grip-push-up'),
  'dumbbell-calf-raise': () => scene3D('dumbbell-calf-raise'),
  'dumbbell-curl': () => scene3D('dumbbell-curl'),
  'dumbbell-fly': () => scene3D('dumbbell-fly'),
  'dumbbell-lateral-raise': () => scene3D('dumbbell-lateral-raise'),
  'dumbbell-romanian-deadlift': () => scene3D('dumbbell-romanian-deadlift'),
  'dumbbell-shoulder-press': () => scene3D('dumbbell-shoulder-press'),
  'dumbbell-walking-lunge': () => scene3D('dumbbell-walking-lunge'),
  'dumbbell-wrist-curl': () => scene3D('dumbbell-wrist-curl'),
  'goblet-squat': () => scene3D('goblet-squat'),
  'hammer-curl': () => scene3D('hammer-curl'),
  'hanging-knee-raise': () => scene3D('hanging-knee-raise'),
  'high-knees': () => scene3D('high-knees'),
  'incline-dumbbell-curl': () => scene3D('incline-dumbbell-curl'),
  'incline-dumbbell-press': () => scene3D('incline-dumbbell-press'),
  'jump-squat': () => scene3D('jump-squat'),
  'jumping-jack': () => scene3D('jumping-jack'),
  'plank-jack': () => scene3D('plank-jack'),
  'mountain-climber': () => scene3D('mountain-climber'),
  'one-arm-dumbbell-row': () => scene3D('one-arm-dumbbell-row'),
  'plank': () => scene3D('plank'),
  'pull-up': () => scene3D('pull-up'),
  'push-up': () => scene3D('push-up'),
  'romanian-deadlift': () => scene3D('romanian-deadlift'),
  'running-man': () => scene3D('running-man'),
  'shadow-boxing': () => scene3D('shadow-boxing'),
  'sliding-leg-curl': () => scene3D('sliding-leg-curl'),
  'standing-hamstring-curl': () => scene3D('standing-hamstring-curl'),
};

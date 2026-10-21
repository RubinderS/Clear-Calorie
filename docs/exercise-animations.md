# Built-in exercises

The coach can only plan exercises from the built-in list, and each one comes with a
how-to animation and the body areas it works. The list starts empty; add exercises
one at a time.

Where things live:

- `lib/exercise-catalog/entries.ts`: the list. Each entry is the animation config plus
  the exercise type, aliases and body areas.
- `lib/exercise-catalog/<id>.json`: the config: phases, cues, form tips, common mistakes.
- `components/exercise-animations/3d/`: every exercise plays in 3D (Three.js):
  - `poses/<id>.ts`: the exercise's pose: the rabbit's skeleton at each frame, built
    natively in 3D. It holds only what's particular to that exercise: one file per
    exercise, and no pose imports another. `poses/barbell-squat.ts` (side-on) and
    `poses/jumping-jack.ts` (facing the camera) are the templates new exercises follow.
  - `moves/`: movements several exercises share, by body position: `stance.ts` (the
    squat and hinge leg chain, and standing facing the camera), `standing.ts` (standing
    tall with the elbows by the sides: curls and band work), `hinge.ts` (the Romanian
    deadlift), `bench.ts` (lying on a flat bench, sitting back on an incline),
    `hanging.ts` (from a bar) and `prone.ts` (push-up position).
  - `rig.ts`: the helpers poses are built from: segment lengths, 3D two-bone IK, the
    body's frame, heads, feet and gripping paws.
  - `specs.ts`: one entry per exercise: its pose, its equipment and the scene's shape.
  - `skeleton.ts` (the pose's type), `rabbit-3d.ts` (draws the rabbit), `equipment-3d.ts`
    (the equipment) and `scene-3d.tsx` (the camera, light and floor). Without WebGL a
    scene says so and lists the rep's steps.
- `components/exercise-animations/index.ts`: maps each id to its scene.
- `components/exercise-animation.tsx`: the player. It runs every animation's clock,
  Play/Pause, reduced motion and workout tempo sync. The how-to lists the phases' cues as
  steps.
- `lib/exercise-animation.ts`: the frame and timing helpers the player and poses use.
- `docs/exercise-animation-prompt.md`: the prompt for making an exercise.

## Adding an exercise

1. **Make it.** Follow `docs/exercise-animation-prompt.md` with `{EXERCISE}` replaced by
   the exercise, e.g. "Barbell back squat". Write the pose to
   `components/exercise-animations/3d/poses/<id>.ts` and the config to
   `lib/exercise-catalog/<id>.json`. The id is permanent: never rename or reuse it.
2. **Register the scene** in `components/exercise-animations/index.ts`:

   ```ts
   'barbell-back-squat': () => scene3D('barbell-back-squat'),
   ```

   and add its entry to `components/exercise-animations/3d/specs.ts`: the pose, its
   equipment (bars and dumbbells follow the paws, bands run from the paws to an anchor)
   and the scene's aspect.

3. **Add it to the list** in `lib/exercise-catalog/entries.ts`:

   ```ts
   import barbellBackSquat from './barbell-back-squat.json';
   // ...
   {
     config: barbellBackSquat,
     type: 'STRENGTH', // or 'TIME' for holds and cardio
     aliases: ['squat', 'back squat'], // names people already use for it
     areas: {primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core']},
   },
   ```

   Areas come from `BODY_AREAS` in `lib/exercise-catalog/index.ts`. Aliases must not
   match another exercise's name or aliases; the tests catch clashes.
4. **Review the animation** against the prompt's self-check (section 6): add the
   exercise's `EXPECT` entry and form block to `lib/exercise-animations-3d.test.ts`.
   Then render the start, middle and end of the rep in headless Chromium
   (`--use-angle=swiftshader`) in light and dark mode, drag the view round, and check the
   form is correct and nothing passes through anything.
5. **Check tempo sync.** In a workout for a linked exercise, each rep's lift should
   start on its beat, follow tempo changes, and hold the start pose during the count-in
   and rests.
6. **Run the tests:** `npm test`. They check the config, the file names, that every
   exercise has a pose module, a spec and an `EXPECT` entry, and every 25 ms of the rep:
   exact limb lengths, bends, planted points, grips, the form ranges, and nothing passing
   through the floor, the equipment, the body or the head.

Existing exercises aren't linked automatically. Users ask the coach to match them:
it compares their exercises with the list, even when the names differ, and proposes
the links on one card to confirm. New exercises saved under a built-in name are
linked as they're saved.

To remove an exercise, mark it `retired: true` instead of deleting it, so existing links
still resolve.

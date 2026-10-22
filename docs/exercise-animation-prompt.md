Create a 3D animated demonstration of the exercise: {EXERCISE}

Write it in this project as a native 3D pose plus a JSON config describing the exercise
(format at the bottom):
- `components/exercise-animations/3d/poses/<id>.ts`: the pose module (section 4).
- an entry in `components/exercise-animations/3d/specs.ts`: the pose, its equipment and
  the scene's shape (section 3).
- `lib/exercise-catalog/<id>.json`: the config.
No new libraries, images, fonts or network requests, so it works offline.

**Follow a template.** `poses/barbell-squat.ts` is the template for side-type exercises
(facing +x) and `poses/jumping-jack.ts` for front-type ones (facing +z). Then build on
the shared movements in `3d/moves/` for the body position: `stance.ts` for squats,
hinges and standing facing the camera, `standing.ts` for standing arm work (curls,
bands), `hinge.ts` for Romanian deadlifts, `bench.ts` for lying on a flat bench or
sitting back on an incline, `hanging.ts` for hanging from a bar, `prone.ts` for
push-up position, `on-the-spot.ts` for standing cardio that works one leg at a time
(high knees, butt kicks). For moves that alternate sides, `alternate` in `rig.ts` splits
the rep into a left half and a right half.

**Keep the pose module to what's particular to the exercise.** A pose never imports
another pose (a test checks): if two exercises need the same movement, move it into
the right file in `moves/` (or a new one for a new body position) and import it from
both.

## 1. Analyse the exercise first (briefly, before the code)
- The plane the main movement happens in, and so which way the rabbit faces: side-type
  (rows, squats, deadlifts, curls, presses, push-ups, lunges) faces +x and the camera
  looks at its left side; front-type (lateral raises, shoulder press, jumping jacks,
  pull-ups) faces +z, towards the camera. This is the config's `view`.
- Starting body position: standing, hinged, seated on a bench, lying, kneeling,
  plank, or hanging.
- Equipment: dumbbells, barbell, band, bench, pull-up bar, or none.
- Which joints move and their range in degrees (e.g. a squat moves hip, knee and ankle;
  a curl moves the elbow only).
- What stays still (e.g. torso angle in a row, upper arm in a curl) and what stays
  planted (feet on the floor, hands on the floor in a push-up, back on the bench).
- Where the hands and feet really go across the body: grip width, stance width, which
  way the palms face (overhand, underhand, neutral), the bar in front of the face.
- 3–5 key form cues and the common mistakes to avoid.

## 2. The rabbit and the scene
The rabbit (`3d/rabbit-3d.ts`), its toon shading and outlines, the camera, the floor
and the lighting are shared; an exercise only gives the rabbit's pose each frame and its
equipment. Never change the rabbit's look for one exercise. If a pose needs something it
can't show yet (as the gripping paw once was), add it as an option without changing how
existing poses look, and check the screenshots of a few existing exercises.

Units and axes, the same for every exercise:
- Scene units: the rabbit's torso is 1.2 long. The floor is y = 0, y is up.
- Side-type faces +x; its `left` side is +z, towards the camera. Front-type faces +z;
  its `left` is −x, screen left.
- `left` and `right` are the body's own: `right` is up × forward (see `Body` in
  `rig.ts`), so they stay the same whichever way the body lies.

## 3. The spec
Add one entry to `SPECS` in `3d/specs.ts`:

```ts
'barbell-squat': {
  pose: barbellSquat.pose,
  equipment: barbellInPaws(),
  camera: {aspect: 358 / 388},
},
```

- `pose(frame)`: the module's pose.
- `equipment(kit, parent)`: adds the equipment and returns what to move each frame,
  from the skeleton. Equipment follows the pose: bars at the paws' midpoint
  (`barbellInPaws`), dumbbells at each paw along its grip (`dumbbellsInGrips`), bands
  from the paws to an anchor (`bandsToAnchor`). Pieces are in `3d/equipment-3d.ts`;
  fixed ones (benches, posts, pull-up bars) are added once.
- `camera.aspect`: the scene's width over height. The camera frames the whole rep
  automatically; pick the aspect that fits it (tall for standing, wide for lying).
- `floor: false` for hanging exercises.

Without WebGL the scene shows a short note and the rep's steps instead; nothing to do
per exercise.

## 4. The pose module
Export `pose(frame: AnimationFrame): Skeleton`, plus a named pose function of progress
(0 = start pose, 1 = end pose, e.g. `barbellSquatPose(progress)`) and the constants the
tests need: planted points, equipment paths and anchors, ranges.

Build the skeleton with the helpers in `3d/rig.ts`, never by hand:
- **Lengths:** `RIG` (torso 1.2, upper arm 0.62, forearm 0.56, thigh 0.605, shin 0.605),
  `SHOULDER_HALF` 0.28 and `HIP_HALF` 0.15 either side of the middle. Every limb is
  exactly these lengths; nothing stretches.
- **The body:** `bodyFrame(hip, up, forward)` gives the torso's frame, the shoulders and
  hips (`shoulderOf(side)`, `hipOf(side)`) and `at(right, up, forward)` for points on
  the body.
- **Limbs:** place each hand and foot where the exercise puts it, then solve the elbow
  or knee with `armTo(shoulder, wrist, pole)` / `legTo(hip, ankle, pole)`. The pole is a
  direction the joint bends towards: elbows back, out or down depending on the
  exercise, knees forward over the toes. If a joint is pinned (the curl's elbow), pole
  towards where it's pinned. A target out of reach is pulled in, which moves a planted
  hand: keep targets within reach.
- **Heads:** `levelHead(body, nod)` for upright or leaning bodies (eyes level, nodded
  down); `lookingUp(body, deg, ahead)` for lying back on a bench; `ahead` rests the head
  on a pad behind it.
- **Feet:** `flatFoot(ankle, toes)` with `toesOut(forward, side)`; `pitchedFoot` for up
  on the toes or pointed.
- **Paws:** `openPaw(arm, up)`, or `grippingPaw(at, bar, palm, over)` round a bar or
  handle: `palm` says which side of it the palm is on, `over` which way the fingers wrap
  (usually on along the forearm). For a dumbbell, make the handle square to the forearm
  so the forearm passes between the plates.
- **Putting it together:** `skeleton(body, {head, arms, legs, feet, paws, earLift})`.
- Also: `lerp3`, `slerp`, `turn`, `frontalSwing` (a limb swung out to the side) and
  `shifted` (move a whole skeleton, as the calf raise rises).

Drive it the way that fits each part, and combine them where needed:
a) Joint-angle keyframes: an angle per moving joint at the start and end, interpolated
   with `lerp`. Squats, curls, raises (`stance.ts`'s `legChain` and `chainAt`).
b) End-effector paths + IK: move a hand or foot along a path and solve the middle joint.
   Bar paths (bench, row, deadlift) and planted contacts (feet while the hips move,
   hands in a push-up).
c) Root motion: move the hips or pivot the whole body (the push-up pivots about the
   toes) and re-solve the planted limbs with IK every frame.

Keep it a pure function of `frame`: no state, timers or globals. Drive every moving part
from `frame.progress`; use `frame.phase` or `frame.phaseT` only for extras timed by
phase, like the jumping jack's hop (`HOP * sin(π · phaseT)` through each moving phase,
none while landed).

Then register the exercise in `components/exercise-animations/index.ts`:

```ts
'barbell-squat': () => scene3D('barbell-squat'),
```

## 5. Tempo and phases
Define the rep as phases in the JSON config, each with a duration, the start and end
progress, and a cue label. Use a controlled, realistic tempo by default:
1. Concentric (lifting): ~1000–1500 ms
2. Hold/squeeze at the peak: ~300–500 ms
3. Eccentric (lowering): ~1500–2500 ms, slower than the lift
4. Reset at the start position: ~400–500 ms
Order them the way the rep starts: the push-up starts at the top, so it lowers first.
The player (`components/exercise-animation.tsx`) runs the clock, Play/Pause, reduced
motion and workout tempo sync, eases each moving phase and loops forever, so the pose
doesn't time anything itself. The cues become the numbered steps in the how-to (and
the no-WebGL fallback), so write each as a short, specific instruction that reads well
in order, e.g. "Lower — elbows about 45° back", "Push the floor away".

## 6. Self-check before finishing
Add the exercise to `lib/exercise-animations-3d.test.ts`. Every check runs every 25 ms
of the rep:
- **An `EXPECT` entry**, written from the exercise, not copied from the pose code:
  - `elbow`: the way each elbow should bend (the generic test checks the elbow sits on
    that side of the shoulder–wrist line; knees are checked for every exercise);
  - `planted`: points that mustn't move (feet, hands, a knee on a bench);
  - `grip`: for each closed paw, the side of the bar the palm is on and the way the
    fingers wrap (overhand, underhand, neutral); `null` for an open paw.
- **The generic checks then cover it:** exact segment lengths, finite joints, nothing
  below the floor, bends, planted points, grips, nothing passing through the equipment
  or the floor (the rabbit as spheres against each equipment mesh's shape), elbows and
  paws outside the body, and arms beside the head rather than through it.
- **A test block for the form**, like the squat's: ranges at the start and end (e.g.
  thighs just below level, chin over the bar, elbows at shoulder height), what stays
  still, and the equipment's path (bar over mid-foot).

Then look at it: render the start, middle and end of the rep in headless Chromium
(`--use-angle=swiftshader`), in light and dark mode, and drag the view round to see it
from behind or above. Check the form matches the cues and nothing passes through
anything. The tests catch geometry; only the screenshots catch a pose that's valid but
wrong.

## 7. Config output
{
  "id": "kebab-case-name",
  "name": "Exercise Name",
  "view": "side" | "front",
  "equipment": ["barbell"],
  "phases": [
    { "name": "lift", "durationMs": 1200, "from": 0, "to": 1, "cue": "..." },
    { "name": "hold", "durationMs": 400, "from": 1, "to": 1, "cue": "..." },
    { "name": "lower", "durationMs": 2200, "from": 1, "to": 0, "cue": "..." },
    { "name": "rest", "durationMs": 500, "from": 0, "to": 0, "cue": "..." }
  ],
  "formTips": ["...", "...", "..."],
  "commonMistakes": ["...", "..."]
}
Each phase's from/to is a progress value from 0 to 1 that the pose turns into the pose.
The motion itself lives only in the pose module; the config holds the timing and the
words.

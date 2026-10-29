import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {
  animationConfigSchema,
  createCatalog,
  exerciseCatalog,
  normalizeExerciseName,
  type CatalogSource,
} from '@/lib/exercise-catalog';
import {EXERCISE_ANIMATIONS} from '@/components/exercise-animations';

function source(
  id: string,
  name: string,
  overrides: Partial<CatalogSource> = {},
  equipment = ['barbell'],
): CatalogSource {
  return {
    config: {
      id,
      name,
      view: 'side',
      equipment,
      phases: [
        {name: 'lift', durationMs: 1200, from: 0, to: 1, cue: 'Lift'},
        {name: 'lower', durationMs: 2300, from: 1, to: 0, cue: 'Lower slowly'},
      ],
      formTips: ['Brace'],
      commonMistakes: ['Bouncing'],
    },
    type: 'STRENGTH',
    areas: {primary: ['chest']},
    ...overrides,
  };
}

const fixture = createCatalog([
  source('barbell-bench-press', 'Barbell bench press', {
    aliases: ['bench', 'bench press', 'flat bench'],
    areas: {primary: ['chest'], secondary: ['triceps', 'shoulders']},
  }),
  source('barbell-back-squat', 'Barbell back squat', {
    aliases: ['squat', 'back squat'],
    areas: {primary: ['quads', 'glutes']},
  }),
  source(
    'dumbbell-curl',
    'Dumbbell curl',
    {aliases: ['bicep curl'], areas: {primary: ['biceps']}},
    ['dumbbells'],
  ),
  source('old-press', 'Old press', {retired: true}),
]);

test('normalizeExerciseName ignores case, punctuation, abbreviations and plurals', () => {
  assert.equal(normalizeExerciseName('  DB Curls! '), 'dumbbell curl');
  assert.equal(normalizeExerciseName('Bench-Press'), 'bench press');
  assert.equal(normalizeExerciseName('Lunges'), 'lunge');
  assert.equal(normalizeExerciseName('Abs'), 'abs');
});

test('entries come from the config with the total phase time as the cycle', () => {
  const bench = fixture.get('barbell-bench-press');
  assert.equal(bench?.name, 'Barbell bench press');
  assert.equal(bench?.cycleMs, 3500);
  assert.deepEqual(bench?.areas, {primary: ['chest'], secondary: ['triceps', 'shoulders']});
  assert.equal(fixture.get('missing'), null);
  assert.equal(fixture.get(null), null);
});

test('linkFor matches only the catalog name, including retired entries', () => {
  assert.equal(fixture.linkFor('barbell bench press')?.id, 'barbell-bench-press');
  assert.equal(fixture.linkFor('Bench'), null);
  assert.equal(fixture.linkFor('Old press')?.id, 'old-press');
});

test('search ranks name words over aliases and filters by area', () => {
  assert.deepEqual(
    fixture.search('bar').map((entry) => entry.id),
    ['barbell-back-squat', 'barbell-bench-press'],
  );
  assert.deepEqual(fixture.search('chest').map((entry) => entry.id), ['barbell-bench-press']);
  assert.deepEqual(
    fixture.search('', {area: 'triceps'}).map((entry) => entry.id),
    ['barbell-bench-press'],
  );
  assert.equal(fixture.search('', {limit: 2}).length, 2);
  assert.deepEqual(fixture.search('rowing'), []);
  assert.ok(!fixture.entries.some((entry) => entry.id === 'old-press'));
});

test('createCatalog refuses duplicate ids, ambiguous aliases and missing areas', () => {
  assert.throws(() => createCatalog([source('a', 'A'), source('a', 'B')]), /Duplicate/);
  assert.throws(
    () =>
      createCatalog([
        source('a', 'Bench press'),
        source('b', 'Dumbbell press', {aliases: ['bench press']}),
      ]),
    /matches both/,
  );
  assert.throws(() => createCatalog([source('a', 'A', {areas: {primary: []}})]));
});

const configDir = path.join(process.cwd(), 'lib', 'exercise-catalog');
const poseDir = path.join(process.cwd(), 'components', 'exercise-animations', '3d', 'poses');
const filesIn = (dir: string, ext: string) =>
  existsSync(dir)
    ? readdirSync(dir).filter((file) => file.endsWith(ext)).map((file) => path.basename(file, ext))
    : [];

test('every config file is valid, named by its id and listed in entries.ts', () => {
  const ids = filesIn(configDir, '.json');
  for (const id of ids) {
    const config = animationConfigSchema.parse(
      JSON.parse(readFileSync(path.join(configDir, `${id}.json`), 'utf8')),
    );
    assert.equal(config.id, id);
  }
  assert.deepEqual(
    [...ids].sort(),
    exerciseCatalog.all.map((entry) => entry.id).sort(),
  );
});

test('every exercise has an animation and a 3D pose module, and every pose module an exercise', () => {
  const ids = exerciseCatalog.all.map((entry) => entry.id).sort();
  assert.deepEqual(Object.keys(EXERCISE_ANIMATIONS).sort(), ids);
  assert.deepEqual(filesIn(poseDir, '.ts').sort(), ids);
});

test('pose modules share movements through moves/, never by importing each other', () => {
  for (const id of filesIn(poseDir, '.ts')) {
    const source = readFileSync(path.join(poseDir, `${id}.ts`), 'utf8');
    assert.doesNotMatch(source, /(from|import) '\.\//, `${id} imports another pose; move what it shares to moves/`);
  }
});

test('exercises done one side at a time say how they switch', () => {
  const sides = (id: string) => exerciseCatalog.get(id)?.sides;
  assert.equal(sides('bulgarian-split-squat'), 'each');
  assert.equal(sides('dumbbell-bulgarian-split-squat'), 'each');
  assert.equal(sides('one-arm-dumbbell-row'), 'each');
  assert.equal(sides('dumbbell-walking-lunge'), 'alternate');
  assert.equal(sides('goblet-squat'), 'both');
});

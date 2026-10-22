import assert from 'node:assert/strict';
import {test} from 'node:test';
import {dayFocus} from '@/lib/day-focus';
import {createCatalog, type CatalogSource} from '@/lib/exercise-catalog';

function source(id: string, primary: CatalogSource['areas']['primary']): CatalogSource {
  return {
    config: {
      id,
      name: id,
      view: 'side',
      equipment: [],
      phases: [{name: 'lift', durationMs: 1000, from: 0, to: 1, cue: 'Lift'}],
      formTips: [],
      commonMistakes: [],
    },
    type: 'STRENGTH',
    areas: {primary},
  };
}

test('names the day after the group most exercises work', () => {
  assert.equal(
    dayFocus(['barbell-bench-press', 'dumbbell-fly', 'band-triceps-pushdown']),
    'Chest day',
  );
  assert.equal(
    dayFocus(['pull-up', 'barbell-bent-over-row', 'dumbbell-curl']),
    'Back day',
  );
  assert.equal(
    dayFocus(['barbell-squat', 'romanian-deadlift', 'dumbbell-calf-raise']),
    'Leg day',
  );
  assert.equal(dayFocus(['dumbbell-curl', 'band-triceps-pushdown']), 'Arm day');
  assert.equal(
    dayFocus(['dumbbell-shoulder-press', 'dumbbell-lateral-raise']),
    'Shoulder day',
  );
});

test('ignores core, cardio and full body finishers unless the day is only those', () => {
  assert.equal(dayFocus(['barbell-squat', 'goblet-squat', 'plank']), 'Leg day');
  assert.equal(dayFocus(['plank', 'hanging-knee-raise']), 'Core day');
  assert.equal(dayFocus(['jumping-jack']), 'Cardio day');
  assert.equal(dayFocus(['pull-up', 'jumping-jack']), 'Back day');
  assert.equal(
    dayFocus(['low-jack', 'running-man', 'standing-hamstring-curl', 'jump-squat', 'burpee']),
    'Cardio day',
  );
  assert.equal(
    dayFocus(['high-knees', 'mountain-climber', 'shadow-boxing', 'butt-kicks']),
    'Cardio day',
  );
  assert.equal(dayFocus(['barbell-squat', 'goblet-squat', 'jump-squat']), 'Leg day');
});

test('gives an exercise its whole vote for the main group it works alongside a finisher', () => {
  const catalog = createCatalog([
    source('crunch-thrust', ['core', 'glutes']),
    source('press', ['chest']),
  ]);
  assert.equal(dayFocus(['crunch-thrust', 'crunch-thrust', 'press'], catalog), 'Leg day');
});

test('falls back to push, pull, upper body and full body splits', () => {
  assert.equal(
    dayFocus(['barbell-bench-press', 'dumbbell-shoulder-press', 'dumbbell-lateral-raise', 'push-up']),
    'Push day',
  );
  assert.equal(dayFocus(['pull-up', 'dumbbell-curl']), 'Pull day');
  assert.equal(dayFocus(['pull-up', 'band-face-pull', 'dumbbell-curl']), 'Pull day');
  assert.equal(dayFocus(['barbell-bench-press', 'pull-up']), 'Upper body day');
  assert.equal(dayFocus(['barbell-bench-press', 'dumbbell-curl']), 'Upper body day');
  assert.equal(dayFocus(['barbell-bench-press', 'barbell-squat']), 'Full body day');
});

test('needs at least half the exercises to be built-in', () => {
  assert.equal(dayFocus([null, 'unknown', undefined]), null);
  assert.equal(dayFocus([null, 'pull-up']), 'Back day');
  assert.equal(dayFocus([null, null, 'barbell-bench-press']), null);
  assert.equal(dayFocus([null, null, null, null, 'barbell-bench-press']), null);
});

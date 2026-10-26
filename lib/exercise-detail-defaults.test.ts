import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  EMPTY_EXERCISE_DETAILS,
  withDefaultMode,
  type ExerciseDetailValues,
} from '@/components/exercise-detail-fields';
import {exerciseCatalog} from '@/lib/exercise-catalog';

const modes = (value: ExerciseDetailValues) => value.sets.map((set) => set.mode);

test('a built-in exercise sets blank sets for a time or for reps, as it is done', () => {
  assert.deepEqual(modes(withDefaultMode(EMPTY_EXERCISE_DETAILS, exerciseCatalog.get('plank'))), ['time']);
  assert.deepEqual(modes(withDefaultMode(EMPTY_EXERCISE_DETAILS, exerciseCatalog.get('meditation'))), ['time']);
  const timed = withDefaultMode(EMPTY_EXERCISE_DETAILS, exerciseCatalog.get('wall-sit'));
  assert.deepEqual(modes(withDefaultMode(timed, exerciseCatalog.get('push-up'))), ['reps']);
});

test('the default never changes sets the user has typed in, or an unknown exercise', () => {
  const typed: ExerciseDetailValues = {sets: [{mode: 'reps', reps: '10', time: '', weight: ''}]};
  assert.equal(withDefaultMode(typed, exerciseCatalog.get('plank')), typed);
  const weighted: ExerciseDetailValues = {sets: [{mode: 'reps', reps: '', time: '', weight: '20'}]};
  assert.equal(withDefaultMode(weighted, exerciseCatalog.get('plank')), weighted);
  assert.equal(withDefaultMode(EMPTY_EXERCISE_DETAILS, null), EMPTY_EXERCISE_DETAILS);
});

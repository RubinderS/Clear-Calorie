import assert from 'node:assert/strict';
import {test} from 'node:test';
import {countClip, voiceClip} from './workout-sound';
import {
  FIRST_LEAD_IN_BEATS,
  LEAD_IN_BEATS,
  LEAD_IN_BEAT_MS,
} from './workout';

// "seventy-seven" runs long; every other clip is short.
const lengths = (name: string) => (name === '77' ? 900 : 400);
const notLoaded = () => undefined;

test('countClip says the whole number when it fits the beat', () => {
  assert.equal(countClip(77, 3_000, lengths), '77');
  assert.equal(countClip(21, 1_000, lengths), '21');
});

test('countClip shortens to the last digit when the clip would run over', () => {
  assert.equal(countClip(77, 1_000, lengths), '7');
});

test('countClip keeps single digits and round tens whole', () => {
  assert.equal(countClip(7, 1_000, notLoaded), '7');
  assert.equal(countClip(70, 1_000, notLoaded), '70');
  assert.equal(countClip(100, 1_000, notLoaded), '100');
});

test('countClip falls back to the last digit before the full count loads', () => {
  assert.equal(countClip(42, 3_000, notLoaded), '2');
});

test('voiceClip starts a countdown at the beat being counted', () => {
  const beats = FIRST_LEAD_IN_BEATS;
  assert.deepEqual(voiceClip({type: 'leadIn', n: 5}, 3_000, beats, lengths), {
    name: 'countdown-5',
    offsetMs: 0,
  });
  assert.deepEqual(voiceClip({type: 'leadIn', n: 2}, 3_000, beats, lengths), {
    name: 'countdown-5',
    offsetMs: 3 * LEAD_IN_BEAT_MS,
  });
  assert.deepEqual(voiceClip({type: 'go'}, 3_000, LEAD_IN_BEATS, lengths), {
    name: 'countdown-3',
    offsetMs: LEAD_IN_BEATS * LEAD_IN_BEAT_MS,
  });
});

test('voiceClip picks the set-end phrase', () => {
  assert.equal(
    voiceClip({type: 'setEnd', lastSet: false}, 3_000, 3, lengths).name,
    'and-rest',
  );
  assert.equal(
    voiceClip({type: 'setEnd', lastSet: true}, 3_000, 3, lengths).name,
    'great-work',
  );
});

test('voiceClip plays reps from the start of their clip', () => {
  assert.deepEqual(voiceClip({type: 'rep', n: 12}, 3_000, 3, lengths), {
    name: '12',
    offsetMs: 0,
  });
});

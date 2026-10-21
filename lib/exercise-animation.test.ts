import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  cycleMs,
  easeInOut,
  frameAt,
  lerp,
  scalePhases,
  type AnimationPhase,
} from '@/lib/exercise-animation';

const phases: AnimationPhase[] = [
  {name: 'lift', durationMs: 1200, from: 0, to: 1, cue: 'Lift'},
  {name: 'hold', durationMs: 400, from: 1, to: 1, cue: 'Squeeze'},
  {name: 'lower', durationMs: 2000, from: 1, to: 0, cue: 'Lower slowly'},
  {name: 'rest', durationMs: 400, from: 0, to: 0, cue: 'Reset'},
];

test('easeInOut runs 0 to 1 through the midpoint', () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(0.5), 0.5);
  assert.equal(easeInOut(1), 1);
  assert.ok(easeInOut(0.25) < 0.25);
});

test('frameAt finds the phase and eases progress within it', () => {
  assert.deepEqual(
    {...frameAt(phases, 0), phase: undefined},
    {phaseIndex: 0, phase: undefined, phaseT: 0, progress: 0},
  );
  assert.equal(frameAt(phases, 600).progress, 0.5);
  assert.equal(frameAt(phases, 1400).phase.cue, 'Squeeze');
  assert.equal(frameAt(phases, 1400).progress, 1);
  assert.equal(frameAt(phases, 2600).progress, 0.5);
  // Loops, and the end of one rep meets the start of the next.
  assert.equal(frameAt(phases, 4000 + 600).progress, 0.5);
  assert.equal(frameAt(phases, 3999).progress, 0);
});

test('scalePhases keeps the ratios and fits the new rep time', () => {
  const scaled = scalePhases(phases, 2000);
  assert.equal(cycleMs(scaled), 2000);
  assert.equal(scaled[0].durationMs, 600);
  assert.equal(frameAt(scaled, 300).progress, 0.5);
});

test('lerp runs from a to b', () => {
  assert.equal(lerp(10, 20, 0), 10);
  assert.equal(lerp(10, 20, 0.25), 12.5);
  assert.equal(lerp(10, 20, 1), 20);
});

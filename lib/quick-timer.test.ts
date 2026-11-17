import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  adjustQuickTimer,
  formatQuickTimer,
  quickTimerDone,
  quickTimerLeftMs,
  quickTimerRunning,
  quickTimerSeconds,
  startQuickTimer,
  toggleQuickTimer,
} from './quick-timer';

test('counts down from when it was started', () => {
  const timer = startQuickTimer(15, 1_000);
  assert.equal(quickTimerRunning(timer), true);
  assert.equal(quickTimerLeftMs(timer, 1_000), 15_000);
  assert.equal(quickTimerLeftMs(timer, 6_000), 10_000);
  assert.equal(quickTimerSeconds(timer, 6_001), 10);
  assert.equal(quickTimerDone(timer, 15_999), false);
  assert.equal(quickTimerDone(timer, 16_000), true);
  assert.equal(quickTimerLeftMs(timer, 30_000), 0);
});

test('pausing keeps the time left until resumed', () => {
  const paused = toggleQuickTimer(startQuickTimer(10, 0), 4_000);
  assert.equal(quickTimerRunning(paused), false);
  assert.equal(quickTimerLeftMs(paused, 60_000), 6_000);
  const resumed = toggleQuickTimer(paused, 60_000);
  assert.equal(quickTimerLeftMs(resumed, 62_000), 4_000);
});

test('a finished timer does not pause or resume', () => {
  const timer = startQuickTimer(10, 0);
  assert.equal(toggleQuickTimer(timer, 10_000), timer);
});

test('adding time grows the total, taking it off never ends the timer', () => {
  const timer = startQuickTimer(10, 0);
  const longer = adjustQuickTimer(timer, 5_000, 2_000);
  assert.equal(quickTimerLeftMs(longer, 2_000), 13_000);
  assert.equal(longer.totalMs, 13_000);

  const shorter = adjustQuickTimer(timer, -5_000, 7_000);
  assert.equal(quickTimerLeftMs(shorter, 7_000), 1_000);
  assert.equal(shorter.totalMs, 10_000);

  // Under a second left, − leaves it alone.
  assert.equal(quickTimerLeftMs(adjustQuickTimer(timer, -5_000, 9_500), 9_500), 500);
});

test('adjusts a paused timer without starting it', () => {
  const paused = toggleQuickTimer(startQuickTimer(30, 0), 10_000);
  const longer = adjustQuickTimer(paused, 5_000, 99_000);
  assert.equal(quickTimerRunning(longer), false);
  assert.equal(quickTimerLeftMs(longer, 200_000), 25_000);
});

test('formats as m:ss', () => {
  assert.equal(formatQuickTimer(0), '0:00');
  assert.equal(formatQuickTimer(9), '0:09');
  assert.equal(formatQuickTimer(75), '1:15');
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {dailyRollingAverages} from './body-metrics';
import {foodWeeklyAverages} from './food-trend';

const food = (date: string, calories: number, protein = 0, carbs = 0, fat = 0, saturatedFat = 0) => ({
  date,
  calories,
  protein,
  carbs,
  fat,
  saturatedFat,
});

test('food weekly averages total each day, average the days logged and skip today', () => {
  const entries = [
    food('2026-10-19', 500, 50), // today, still being logged
    food('2026-10-18', 1200, 60, 100, 30, 10),
    food('2026-10-18', 800, 40, 100, 20, 5), // same day: 2000 kcal, 100 g protein
    food('2026-10-12', 1800, 80, 150, 60, 15.5), // first day of the newest window
    // 2026-10-13 to 17 have nothing logged and don't count
    food('2026-10-11', 2200, 120), // last day of the window before
    food('2026-10-05', 2400, 140),
    // 2026-09-28 to 10-04 has nothing logged
    food('2026-09-27', 2600, 90),
    food('2026-08-01', 9000), // older than four weeks, ignored
  ];
  const weeks = foodWeeklyAverages(entries, '2026-10-19', 4);
  assert.deepEqual(weeks, [
    {
      start: '2026-10-12',
      end: '2026-10-18',
      days: 2,
      avg: {calories: 1900, protein: 90, carbs: 175, fat: 55, saturatedFat: 15.25},
    },
    {
      start: '2026-10-05',
      end: '2026-10-11',
      days: 2,
      avg: {calories: 2300, protein: 130, carbs: 0, fat: 0, saturatedFat: 0},
    },
    {start: '2026-09-28', end: '2026-10-04', days: 0, avg: null},
    {
      start: '2026-09-21',
      end: '2026-09-27',
      days: 1,
      avg: {calories: 2600, protein: 90, carbs: 0, fat: 0, saturatedFat: 0},
    },
  ]);

  // The newest two weeks match the calorie rolling average.
  const calories = entries.map(({date, calories: value}) => ({date, value}));
  assert.deepEqual(dailyRollingAverages(calories, '2026-10-19'), {
    avg: weeks[0].avg?.calories,
    prevAvg: weeks[1].avg?.calories,
  });

  // Weeks older than the oldest entry are left out, and today alone is none.
  assert.equal(foodWeeklyAverages(entries.slice(0, 3), '2026-10-19', 4).length, 1);
  assert.deepEqual(foodWeeklyAverages(entries.slice(0, 1), '2026-10-19', 4), []);
  assert.deepEqual(foodWeeklyAverages([], '2026-10-19'), []);
});

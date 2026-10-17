import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  computeBodyMetricSummaries,
  computeStrengthProgress,
  computeTopIssues,
  computeWeekMetrics,
  currentWeekStart,
  evaluateFocus,
  lastCompletedWeekStart,
  parseFocusProposals,
  planAdherence,
  weekDates,
  type FocusItem,
  type ReportExercise,
  type ReportFood,
  type WeekInput,
} from './weekly-report-metrics';

const goals = {
  calorieGoal: 1800,
  proteinGoal: 140,
  carbsGoal: 185,
  fatGoal: 55,
  saturatedFatGoal: 14,
};

function food(date: string, name: string, values: Partial<ReportFood> = {}): ReportFood {
  return {
    date,
    name,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    saturatedFat: 0,
    healthAlertLevel: null,
    ...values,
  };
}

function exercise(date: string, values: Partial<ReportExercise> = {}): ReportExercise {
  return {
    date,
    name: 'Cardio',
    type: 'TIME',
    calories: 0,
    durationMin: 0,
    weight: null,
    exerciseGoalId: null,
    goalDate: null,
    ...values,
  };
}

const dates = weekDates('2026-10-05');

function input(overrides: Partial<WeekInput> = {}): WeekInput {
  return {
    dates,
    goals,
    food: [],
    exercise: [],
    weights: [],
    previousWeights: [],
    plannedCounts: new Map(),
    ...overrides,
  };
}

test('weeks run Monday to Sunday in the user timezone', () => {
  assert.deepEqual(weekDates('2026-10-05'), [
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
    '2026-10-09',
    '2026-10-10',
    '2026-10-11',
  ]);
  // Sunday 23:30 in Sydney is Sunday 12:30 UTC: the week is not over yet.
  const sundayNight = new Date('2026-10-11T12:30:00Z');
  assert.equal(lastCompletedWeekStart('Australia/Sydney', sundayNight), '2026-09-28');
  // 00:30 Monday in Sydney: the week of Oct 5 has just finished there...
  const mondayEarly = new Date('2026-10-11T13:30:00Z');
  assert.equal(lastCompletedWeekStart('Australia/Sydney', mondayEarly), '2026-10-05');
  assert.equal(currentWeekStart('Australia/Sydney', mondayEarly), '2026-10-12');
  // ...but it is still Sunday in UTC.
  assert.equal(lastCompletedWeekStart('UTC', mondayEarly), '2026-09-28');
});

test('nutrition averages only count days with food logged', () => {
  const metrics = computeWeekMetrics(
    input({
      food: [
        food('2026-10-05', 'Eggs', {calories: 1000, protein: 150, saturatedFat: 20}),
        food('2026-10-05', 'Toast', {calories: 1000, protein: 0, saturatedFat: 0}),
        food('2026-10-06', 'Rice', {calories: 1000, protein: 100, saturatedFat: 4}),
      ],
    }),
  );
  assert.equal(metrics.daysLogged, 2);
  assert.equal(metrics.avgCalories, 1500);
  assert.equal(metrics.avgProtein, 125);
  assert.equal(metrics.avgSaturatedFat, 12);
  // 2000 kcal is more than 5% over 1800; 1000 is not.
  assert.equal(metrics.calorieDaysOver, 1);
  assert.equal(metrics.proteinDaysHit, 1);
  assert.equal(metrics.satFatDaysOver, 1);
});

test('exercise metrics count cardio minutes, strength days and plan ticks', () => {
  const metrics = computeWeekMetrics(
    input({
      exercise: [
        exercise('2026-10-05', {durationMin: 20, calories: 150, goalDate: '2026-10-05'}),
        exercise('2026-10-06', {type: 'STRENGTH', calories: 20, goalDate: '2026-10-06'}),
        exercise('2026-10-06', {type: 'STRENGTH', calories: 20}),
        exercise('2026-10-08', {durationMin: 5, calories: 37}),
      ],
      plannedCounts: new Map([
        ['2026-10-05', 1],
        ['2026-10-06', 3],
      ]),
    }),
  );
  assert.equal(metrics.cardioMinutes, 25);
  assert.equal(metrics.strengthSessions, 1);
  assert.equal(metrics.exerciseCalories, 227);
  assert.equal(metrics.exercisesPlanned, 4);
  assert.equal(metrics.exercisesDone, 2);
  assert.equal(planAdherence(metrics), 50);
  assert.equal(planAdherence({...metrics, exercisesPlanned: 0}), null);
});

test('weight compares this week’s average with the previous one', () => {
  const metrics = computeWeekMetrics(
    input({
      weights: [
        {date: '2026-10-05', weight: 70},
        {date: '2026-10-07', weight: 69.6},
        {date: '2026-10-09', weight: 69.5},
      ],
      previousWeights: [
        {date: '2026-09-29', weight: 70.4},
        {date: '2026-10-02', weight: 70.1},
      ],
    }),
  );
  assert.equal(metrics.weighInCount, 3);
  assert.equal(metrics.weightAvg, 69.7);
  assert.equal(metrics.prevWeightAvg, 70.3);
  const none = computeWeekMetrics(input());
  assert.equal(none.weightAvg, null);
  assert.equal(none.prevWeightAvg, null);
});

test('top issues rank same-named foods for nutrients over goal', () => {
  const week = input({
    food: [
      food('2026-10-05', 'Paneer bhurji', {saturatedFat: 16, calories: 600}),
      food('2026-10-06', ' paneer bhurji ', {saturatedFat: 14, calories: 600}),
      food('2026-10-06', 'Eggs', {saturatedFat: 6, calories: 600}),
      food('2026-10-05', 'Apple', {saturatedFat: 0, calories: 80}),
    ],
  });
  const issues = computeTopIssues(week, computeWeekMetrics(week));
  assert.deepEqual(
    issues.map((issue) => issue.nutrient),
    ['saturatedFat'],
  );
  assert.deepEqual(issues[0].sources, [
    {name: 'Paneer bhurji', entries: 2, amount: 30, share: 0.83},
    {name: 'Eggs', entries: 1, amount: 6, share: 0.17},
  ]);
});

test('strength progress compares to the most recent earlier session', () => {
  const progress = computeStrengthProgress(
    [
      exercise('2026-10-09', {name: 'Incline press', type: 'STRENGTH', weight: 9, exerciseGoalId: 'g1'}),
      exercise('2026-10-11', {name: 'Incline press', type: 'STRENGTH', weight: 12, exerciseGoalId: 'g1'}),
      exercise('2026-10-10', {name: 'Squats', type: 'STRENGTH', weight: 9}),
    ],
    [
      exercise('2026-09-20', {name: 'Incline press', type: 'STRENGTH', weight: 10, exerciseGoalId: 'g1'}),
      exercise('2026-09-30', {name: 'Incline press', type: 'STRENGTH', weight: 7.5, exerciseGoalId: 'g1'}),
    ],
    new Map([['g1', 12]]),
  );
  assert.deepEqual(progress, [
    {exercise: 'Incline press', fromWeight: 7.5, toWeight: 12, goalWeight: 12},
    {exercise: 'Squats', fromWeight: null, toWeight: 9, goalWeight: null},
  ]);
});

test('focus proposals are validated against the allowed metrics', () => {
  const week = input({
    food: [
      food('2026-10-05', 'Roti, paneer bhurji', {protein: 100}),
      food('2026-10-06', 'Paneer sabzi', {protein: 120}),
    ],
  });
  const metrics = computeWeekMetrics(week);
  const items = parseFocusProposals(
    [
      {text: 'Limit paneer to one meal', metric: 'foodMeals', food: 'Paneer', target: 1, direction: 'max'},
      {text: 'Hit protein', metric: 'avgProtein', target: '140', direction: 'max'},
      {text: 'Unknown', metric: 'happiness', target: 10},
      {text: 'Bad range', metric: 'satFatDaysOver', target: 9},
      {text: 'No direction', metric: 'avgCalories', target: 1800},
      {text: 'Duplicate', metric: 'avgProtein', target: 150},
      {text: 'Fourth valid', metric: 'cardioMinutes', target: 150},
      {text: 'Over the limit', metric: 'weighInCount', target: 3},
    ],
    metrics,
    week.food,
  );
  assert.deepEqual(items, [
    {
      id: 'foodMeals:paneer',
      text: 'Limit paneer to one meal',
      metric: 'foodMeals',
      food: 'paneer',
      target: 1,
      direction: 'max',
      baseline: 2,
    },
    // The fixed direction wins over the AI's.
    {
      id: 'avgProtein',
      text: 'Hit protein',
      metric: 'avgProtein',
      target: 140,
      direction: 'min',
      baseline: 110,
    },
    {
      id: 'cardioMinutes',
      text: 'Fourth valid',
      metric: 'cardioMinutes',
      target: 150,
      direction: 'min',
      baseline: 0,
    },
  ]);
  assert.deepEqual(parseFocusProposals('nope', metrics, week.food), []);
});

test('focus results report met, improved, missed and streaks', () => {
  const items: FocusItem[] = [
    {id: 'foodMeals:paneer', text: '', metric: 'foodMeals', food: 'paneer', target: 1, direction: 'max', baseline: 4},
    {id: 'avgProtein', text: '', metric: 'avgProtein', target: 140, direction: 'min', baseline: 116},
    {id: 'cardioMinutes', text: '', metric: 'cardioMinutes', target: 150, direction: 'min', baseline: 75},
    {id: 'avgFat', text: '', metric: 'avgFat', target: 55, direction: 'max', baseline: 61},
  ];
  const week = input({
    food: [
      food('2026-10-05', 'Paneer bhurji', {protein: 128, fat: 70}),
    ],
    exercise: [exercise('2026-10-05', {durationMin: 60})],
  });
  const previous = [
    {...items[1], actual: 110, status: 'missed' as const, streak: 2},
    {...items[2], actual: 160, status: 'met' as const, streak: 1},
  ];
  const results = evaluateFocus(items, computeWeekMetrics(week), week.food, previous);
  assert.deepEqual(
    results.map(({id, actual, status, streak}) => ({id, actual, status, streak})),
    [
      {id: 'foodMeals:paneer', actual: 1, status: 'met', streak: 1},
      {id: 'avgProtein', actual: 128, status: 'improved', streak: 3},
      {id: 'cardioMinutes', actual: 60, status: 'missed', streak: 1},
      {id: 'avgFat', actual: 70, status: 'missed', streak: 1},
    ],
  );

  const empty = evaluateFocus(items.slice(1, 2), computeWeekMetrics(input()), [], null);
  assert.deepEqual(
    empty.map(({status, streak}) => ({status, streak})),
    [{status: 'no-data', streak: 0}],
  );
});

test('body metric summaries average the week beside the previous one', () => {
  const waist = {key: 'waist', label: 'Waist', unit: 'cm', direction: 'down', decimals: 1};
  const summaries = computeBodyMetricSummaries([
    {...waist, values: [84.2, 83.9], previousValues: [85, 85.4]},
    // Only logged before this week: still shown, as a gap to mention
    {...waist, key: null, label: 'Bicep', values: [], previousValues: [36]},
    // Never logged: left out
    {...waist, key: 'hips', label: 'Hips', values: [], previousValues: []},
  ]);
  assert.deepEqual(summaries, [
    {...waist, count: 2, avg: 84.1, prevAvg: 85.2},
    {...waist, key: null, label: 'Bicep', count: 0, avg: null, prevAvg: 36},
  ]);
});

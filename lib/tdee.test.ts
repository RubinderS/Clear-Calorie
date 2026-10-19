import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  adaptiveTdee,
  ageFromBirthYear,
  birthYearForAge,
  buildDailyLogs,
  calculateBmr,
  calculateMaintenance,
  formulaTdee,
  goalTargets,
  katchMcArdleBmr,
  mifflinStJeorBmr,
  profileSchema,
  type DailyLog,
} from './tdee';

const MAN = {sex: 'male', age: 30, heightCm: 180, weightKg: 80} as const;
const WOMAN = {sex: 'female', age: 25, heightCm: 165, weightKg: 60} as const;

/** Consecutive days from 2026-10-01 with the given weights and intake. */
function logs(weights: (number | null)[], calories: number | null = 2500): DailyLog[] {
  return weights.map((weightKg, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    weightKg,
    calories,
  }));
}

test('Mifflin-St Jeor adds 5 for men and subtracts 161 for women', () => {
  // 800 + 1125 - 150 + 5
  assert.equal(mifflinStJeorBmr(MAN), 1780);
  // 600 + 1031.25 - 125 - 161
  assert.equal(mifflinStJeorBmr(WOMAN), 1345.25);
});

test('Katch-McArdle uses lean mass only, without float drift', () => {
  // Lean mass 64 kg: 370 + 21.6 * 64
  assert.equal(katchMcArdleBmr({weightKg: 80, bodyFatPct: 20}), 1752.4);
  // Same lean mass, same BMR, whatever the total weight
  assert.equal(
    katchMcArdleBmr({weightKg: 100, bodyFatPct: 36}),
    katchMcArdleBmr({weightKg: 80, bodyFatPct: 20}),
  );
});

test('BMR uses Katch-McArdle only when body fat is given', () => {
  assert.equal(calculateBmr(MAN).formula, 'mifflin-st-jeor');
  assert.equal(calculateBmr({...MAN, bodyFatPct: null}).formula, 'mifflin-st-jeor');
  const withFat = calculateBmr({...MAN, bodyFatPct: 20});
  assert.equal(withFat.formula, 'katch-mcardle');
  assert.equal(withFat.bmr, 1752.4);
});

test('formula TDEE multiplies BMR by the activity level', () => {
  assert.equal(formulaTdee(1000, 'sedentary'), 1200);
  assert.equal(formulaTdee(1000, 'light'), 1375);
  assert.equal(formulaTdee(1000, 'moderate'), 1550);
  assert.equal(formulaTdee(1000, 'very'), 1725);
  assert.equal(formulaTdee(1000, 'extreme'), 1900);
});

test('adaptive TDEE needs 14 days with both weight and calories', () => {
  assert.equal(adaptiveTdee([]), null);
  assert.equal(adaptiveTdee(logs(Array(13).fill(80))), null);
  // 14 days, but one has no food logged
  const gap = logs(Array(14).fill(80));
  gap[5] = {...gap[5], calories: null};
  assert.equal(adaptiveTdee(gap), null);
  assert.notEqual(adaptiveTdee(logs(Array(14).fill(80))), null);
});

test('adaptive TDEE is intake when the weekly averages are flat', () => {
  // Day-to-day swings that average out, like water weight
  const result = adaptiveTdee(logs([80, 81, 79, 80, 81, 79, 80, 81, 79, 80, 81, 79, 80, 80]));
  assert.ok(result);
  assert.equal(result.firstWeekAvg, 80);
  assert.equal(result.lastWeekAvg, 80);
  assert.equal(result.tdee, 2500);
});

test('adaptive TDEE adds back energy from weight lost between weekly averages', () => {
  // -0.7 kg over 7 days between the week midpoints: 0.7 * 7700 / 7 = 770 kcal/day
  const result = adaptiveTdee(logs([...Array(7).fill(80), ...Array(7).fill(79.3)]));
  assert.ok(result);
  assert.equal(result.days, 14);
  assert.equal(result.avgIntake, 2500);
  assert.equal(result.tdee, 3270);
});

test('adaptive TDEE subtracts energy stored as weight gained, over the logged span', () => {
  // 21 days: span is 14 days. +0.5 kg * 7700 / 14 = 275 kcal/day
  const result = adaptiveTdee(
    logs([...Array(7).fill(70), ...Array(7).fill(70.25), ...Array(7).fill(70.5)], 3000),
  );
  assert.ok(result);
  assert.equal(result.tdee, 2725);
});

test('adaptive TDEE ignores days missing either value and sorts by date', () => {
  const days = logs([...Array(7).fill(80), ...Array(7).fill(79.3)]).reverse();
  days.push({date: '2026-10-20', weightKg: 50, calories: null});
  days.push({date: '2026-10-21', weightKg: null, calories: 9000});
  assert.equal(adaptiveTdee(days)!.tdee, 3270);
});

test('daily logs sum food and average same-day weigh-ins', () => {
  assert.deepEqual(
    buildDailyLogs(
      [
        {date: '2026-10-02', calories: 500},
        {date: '2026-10-01', calories: 700},
        {date: '2026-10-02', calories: 1200.5},
      ],
      [
        {date: '2026-10-02', weight: 80},
        {date: '2026-10-02', weight: 81},
        {date: '2026-10-03', weight: 79},
      ],
    ),
    [
      {date: '2026-10-01', calories: 700, weightKg: null},
      {date: '2026-10-02', calories: 1700.5, weightKg: 80.5},
      {date: '2026-10-03', calories: null, weightKg: 79},
    ],
  );
});

test('maintenance is the rounded formula estimate without enough logs', () => {
  const result = calculateMaintenance({...WOMAN, activityLevel: 'light'}, logs(Array(5).fill(60)));
  assert.deepEqual(result, {
    bmr: 1345,
    bmrFormula: 'mifflin-st-jeor',
    // 1345.25 * 1.375 = 1849.71875
    formulaTdee: 1850,
    adaptive: null,
    maintenance: 1850,
    isEstimate: true,
    loggedDays: 5,
  });
});

test('maintenance switches to the adaptive TDEE with 14+ days', () => {
  const result = calculateMaintenance(
    {...MAN, bodyFatPct: 20, activityLevel: 'moderate'},
    logs([...Array(7).fill(80), ...Array(7).fill(79.3)]),
  );
  assert.equal(result.bmrFormula, 'katch-mcardle');
  assert.equal(result.bmr, 1752);
  // 1752.4 * 1.55 = 2716.22
  assert.equal(result.formulaTdee, 2716);
  assert.deepEqual(result.adaptive, {
    tdee: 3270,
    days: 14,
    avgIntake: 2500,
    weightChangeKg: -0.7,
  });
  assert.equal(result.maintenance, 3270);
  assert.equal(result.isEstimate, false);
  assert.equal(result.loggedDays, 14);
});

test('goal targets adjust calories and scale protein with weight', () => {
  // -20% = 2207.2, rounded to tens
  assert.deepEqual(goalTargets('lose_fat', 2759, 80, 'male'), {calories: 2210, protein: 160});
  // -10% = 2483.1
  assert.deepEqual(goalTargets('recomp', 2759, 80, 'male'), {calories: 2480, protein: 175});
  assert.deepEqual(goalTargets('maintain', 2759, 80, 'male'), {calories: 2760, protein: 130});
  // +10% = 3034.9
  assert.deepEqual(goalTargets('build_muscle', 2759, 80, 'male'), {calories: 3030, protein: 145});
  assert.deepEqual(goalTargets('general_health', 2759, 80, 'male'), {calories: 2760, protein: 110});
});

test('deficits are capped and never go below the floor', () => {
  // 20% of 4000 is 800; capped at 750
  assert.equal(goalTargets('lose_fat', 4000, 100, 'male').calories, 3250);
  // 20% off 1800 is 1440: held at the 1500 floor for men
  assert.equal(goalTargets('lose_fat', 1800, 60, 'male').calories, 1500);
  // 1200 for women
  assert.equal(goalTargets('lose_fat', 1450, 55, 'female').calories, 1200);
  // A floor above maintenance would be a surplus: stay at maintenance
  assert.equal(goalTargets('lose_fat', 1150, 45, 'female').calories, 1150);
});

test('profile input is validated against sensible ranges', () => {
  const valid = {...MAN, activityLevel: 'moderate', goal: 'recomp'};
  assert.deepEqual(profileSchema.parse(valid), {...valid, bodyFatPct: null});
  assert.equal(profileSchema.parse({...valid, bodyFatPct: '18.5'}).bodyFatPct, 18.5);

  for (const bad of [
    {age: 14},
    {age: 101},
    {age: 30.5},
    {heightCm: 99},
    {heightCm: 251},
    {weightKg: 29},
    {weightKg: 301},
    {bodyFatPct: 2},
    {bodyFatPct: 61},
    {sex: 'other'},
    {activityLevel: 'couch'},
    {goal: 'toString'},
    {weightKg: undefined},
  ]) {
    assert.equal(profileSchema.safeParse({...valid, ...bad}).success, false, JSON.stringify(bad));
  }
});

test('age round-trips through the stored birth year', () => {
  assert.equal(birthYearForAge(30, 2026), 1996);
  assert.equal(ageFromBirthYear(1996, 2026), 30);
});

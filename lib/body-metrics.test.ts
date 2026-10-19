import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  canConvertUnit,
  changeTone,
  convertUnitValue,
  formatMetricChange,
  formatMetricValue,
  isValidMetricValue,
  metricChange,
  metricLogSchema,
  parseMetricDefinition,
  rollingAverages,
} from './body-metrics';

test('presets take their definition from the catalog and the chosen unit', () => {
  assert.deepEqual(parseMetricDefinition({key: 'waist', unit: 'in'}), {
    key: 'waist',
    label: 'Waist',
    unit: 'in',
    direction: 'down',
    decimals: 1,
  });
  // Unit defaults to the preset's first
  assert.equal(parseMetricDefinition({key: 'body_fat'})?.unit, '%');
});

test('unknown presets, units the preset lacks and extra fields are rejected', () => {
  assert.equal(parseMetricDefinition({key: 'nope'}), null);
  assert.equal(parseMetricDefinition({key: 'toString'}), null);
  assert.equal(parseMetricDefinition({key: 'waist', unit: 'kg'}), null);
  assert.equal(parseMetricDefinition({key: 'waist', label: 'Belly'}), null);
});

test('custom metrics need a label, unit and direction', () => {
  assert.deepEqual(
    parseMetricDefinition({label: '  Bicep ', unit: 'cm', direction: 'up'}),
    {key: null, label: 'Bicep', unit: 'cm', direction: 'up', decimals: 1},
  );
  assert.equal(parseMetricDefinition({label: '', unit: 'cm', direction: 'up'}), null);
  assert.equal(parseMetricDefinition({label: 'Bicep', unit: 'cm'}), null);
  assert.equal(
    parseMetricDefinition({label: 'Bicep', unit: 'cm', direction: 'sideways'}),
    null,
  );
  assert.equal(
    parseMetricDefinition({label: 'x'.repeat(41), unit: 'cm', direction: 'up'}),
    null,
  );
});

test('values must be finite and inside the preset or custom range', () => {
  assert.equal(isValidMetricValue({key: 'body_fat'}, 22.5), true);
  assert.equal(isValidMetricValue({key: 'body_fat'}, 0), false);
  assert.equal(isValidMetricValue({key: 'body_fat'}, 80), false);
  assert.equal(isValidMetricValue({key: null}, 0), true);
  assert.equal(isValidMetricValue({key: null}, -1), false);
  assert.equal(isValidMetricValue({key: null}, Number.NaN), false);
  assert.equal(isValidMetricValue({key: null}, Infinity), false);
});

test('log entries need at least one value and one per metric', () => {
  assert.equal(metricLogSchema.safeParse({entries: []}).success, false);
  assert.equal(
    metricLogSchema.safeParse({
      entries: [
        {metricId: 'a', value: 1},
        {metricId: 'a', value: 2},
      ],
    }).success,
    false,
  );
  assert.equal(
    metricLogSchema.safeParse({entries: [{metricId: 'a', value: '1'}]}).success,
    false,
  );
  assert.equal(
    metricLogSchema.safeParse({entries: [{metricId: 'a', value: 1}]}).success,
    true,
  );
});

test('values and changes are formatted with the unit and decimals', () => {
  assert.equal(formatMetricValue(22.46, {unit: '%', decimals: 1}), '22.5%');
  assert.equal(formatMetricValue(84, {unit: 'cm', decimals: 1}), '84 cm');
  assert.equal(formatMetricValue(61.6, {unit: 'bpm', decimals: 0}), '62 bpm');
  assert.equal(formatMetricChange(-1.5, {unit: 'cm', decimals: 1}), '-1.5 cm');
  assert.equal(formatMetricChange(0.4, {unit: '%', decimals: 1}), '+0.4%');
});

test('change tone follows the metric direction', () => {
  assert.equal(changeTone(-1, 'down'), 'good');
  assert.equal(changeTone(1, 'down'), 'bad');
  assert.equal(changeTone(1, 'up'), 'good');
  assert.equal(changeTone(1, 'neutral'), 'neutral');
  assert.equal(changeTone(0, 'down'), 'neutral');
});

test('rolling averages cover the last seven days and the seven before', () => {
  const todayStart = new Date('2026-10-19T00:00:00Z');
  const at = (iso: string, value: number) => ({value, loggedAt: new Date(iso)});
  const entries = [
    at('2026-10-19T08:00:00Z', 80),
    at('2026-10-13T00:00:00Z', 82), // first day of this window
    at('2026-10-12T23:59:00Z', 84), // last day of the previous window
    at('2026-10-06T00:00:00Z', 86),
    at('2026-10-05T23:59:00Z', 100), // older, ignored
  ];
  assert.deepEqual(rollingAverages(entries, todayStart), {avg: 81, prevAvg: 85});
  assert.deepEqual(rollingAverages(entries.slice(2), todayStart), {
    avg: null,
    prevAvg: 85,
  });
  assert.deepEqual(rollingAverages([], todayStart), {avg: null, prevAvg: null});
});

test('rolling averages and their change use decimal arithmetic', () => {
  const todayStart = new Date('2026-10-19T00:00:00Z');
  const day = (daysAgo: number) =>
    new Date(todayStart.getTime() - daysAgo * 86_400_000 + 3_600_000);
  const {avg, prevAvg} = rollingAverages(
    [
      {value: 0.1, loggedAt: day(0)},
      {value: 0.2, loggedAt: day(1)},
      {value: 84.1, loggedAt: day(8)},
      {value: 84.2, loggedAt: day(9)},
      {value: 84.3, loggedAt: day(10)},
    ],
    todayStart,
  );
  assert.equal(avg, 0.15);
  assert.equal(prevAvg, 84.2);
  assert.equal(metricChange(84.3, 84.2, 1), 0.1);
  assert.equal(metricChange(70.15, 70, 1), 0.2);
  assert.equal(metricChange(84.3, null, 1), null);
  assert.equal(metricChange(null, 84.2, 1), null);
});

test('canConvertUnit allows only units of the same dimension', () => {
  assert.equal(canConvertUnit('cm', 'in'), true);
  assert.equal(canConvertUnit('lb', 'kg'), true);
  assert.equal(canConvertUnit('%', '%'), true);
  assert.equal(canConvertUnit('%', 'kg'), false);
  assert.equal(canConvertUnit('cm', 'kg'), false);
});

test('convertUnitValue converts exactly and rounds', () => {
  assert.equal(convertUnitValue(34, 'in', 'cm', 2), 86.36);
  assert.equal(convertUnitValue(85, 'cm', 'in', 2), 33.46);
  assert.equal(convertUnitValue(100, 'lb', 'kg', 2), 45.36);
  assert.equal(convertUnitValue(40, '%', '%', 2), 40);
});

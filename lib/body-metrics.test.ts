import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  changeTone,
  formatMetricChange,
  formatMetricValue,
  isValidMetricValue,
  metricLogSchema,
  parseMetricDefinition,
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

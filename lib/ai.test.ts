import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  ToolCallCollector,
  parseEstimate,
  parseSseData,
  parseWeeklyReportText,
} from './ai';

const base = {
  name: 'Bacon and eggs',
  calories: 512.4,
  protein: 30.04,
  carbs: 2,
  fat: 40.06,
  saturatedFat: 50,
  assumptions: '3 rashers, 2 eggs',
};

test('normalises nutrition values', () => {
  const estimate = parseEstimate(base);
  assert.ok(estimate);
  assert.equal(estimate.calories, 512);
  assert.equal(estimate.protein, 30);
  assert.equal(estimate.fat, 40.1);
  assert.equal(estimate.saturatedFat, 40.1);
  assert.equal(estimate.healthAlert, undefined);
});

test('keeps caution and avoid health alerts', () => {
  const estimate = parseEstimate({
    ...base,
    healthAlert: {level: 'Avoid', message: 'High in saturated fat.'},
  });
  assert.deepEqual(estimate?.healthAlert, {
    level: 'avoid',
    message: 'High in saturated fat.',
  });
});

test('drops ok or empty health alerts', () => {
  assert.equal(
    parseEstimate({...base, healthAlert: {level: 'ok', message: 'Fine.'}})
      ?.healthAlert,
    undefined,
  );
  assert.equal(
    parseEstimate({...base, healthAlert: {level: 'caution', message: ' '}})
      ?.healthAlert,
    undefined,
  );
});

test('malformed health alert does not fail the estimate', () => {
  const estimate = parseEstimate({...base, healthAlert: {level: 'danger'}});
  assert.ok(estimate);
  assert.equal(estimate.healthAlert, undefined);
  assert.ok(parseEstimate({...base, healthAlert: 'avoid'}));
});

test('truncates long health alert messages', () => {
  const estimate = parseEstimate({
    ...base,
    healthAlert: {level: 'caution', message: 'x'.repeat(500)},
  });
  assert.equal(estimate?.healthAlert?.message.length, 200);
});

test('rejects estimates without a name or calories', () => {
  assert.equal(parseEstimate({calories: 100}), null);
  assert.equal(parseEstimate({name: 'Apple'}), null);
});

const REPORT = {
  headline: 'A solid week',
  sections: [{title: 'Nutrition', points: ['Protein was on target.']}],
};

test('keeps up to four goal suggestions', () => {
  const report = parseWeeklyReportText({
    ...REPORT,
    goalSuggestions: [' Add a third strength day ', 'b', 'c', 'd', 'e'],
  });
  assert.deepEqual(report?.goalSuggestions, ['Add a third strength day', 'b', 'c', 'd']);
});

test('missing or malformed goal suggestions do not fail the report', () => {
  assert.deepEqual(parseWeeklyReportText(REPORT)?.goalSuggestions, []);
  const report = parseWeeklyReportText({...REPORT, goalSuggestions: 'eat more'});
  assert.equal(report?.headline, 'A solid week');
  assert.deepEqual(report?.goalSuggestions, []);
});

test('splits server-sent events and keeps the unfinished line', () => {
  const {data, rest} = parseSseData(
    'data: {"a":1}\n\n: keep-alive\ndata: [DONE]\r\ndata: {"b"',
  );
  assert.deepEqual(data, ['{"a":1}', '[DONE]']);
  assert.equal(rest, 'data: {"b"');
});

test('assembles streamed tool call fragments', () => {
  const collector = new ToolCallCollector();
  collector.add([
    {index: 0, id: 'call_1', function: {name: 'get_food_logs', arguments: ''}},
  ]);
  collector.add([{index: 0, function: {arguments: '{"from":'}}]);
  collector.add([
    {index: 1, id: 'call_2', function: {name: 'get_weight_history', arguments: '{}'}},
  ]);
  collector.add([{index: 0, function: {arguments: '"2026-10-01"}'}}]);
  assert.deepEqual(collector.result(), [
    {
      id: 'call_1',
      type: 'function',
      function: {name: 'get_food_logs', arguments: '{"from":"2026-10-01"}'},
    },
    {
      id: 'call_2',
      type: 'function',
      function: {name: 'get_weight_history', arguments: '{}'},
    },
  ]);
});

test('accepts whole tool calls without an index or id', () => {
  const collector = new ToolCallCollector();
  collector.add([
    {function: {name: 'get_profile_and_goals', arguments: '{}'}},
    {function: {name: 'get_exercise_plan', arguments: '{}'}},
  ]);
  assert.deepEqual(
    collector.result().map((call) => [call.id, call.function.name]),
    [
      ['call_0', 'get_profile_and_goals'],
      ['call_1', 'get_exercise_plan'],
    ],
  );
});

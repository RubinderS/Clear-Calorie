import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import type {FoodDataset} from './food-dataset';
import {normalisePhrase} from './food-match';

// The bundled file the app loads at startup, checked without a database.
const dataset = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'datasets', 'ausnut.json'), 'utf8'),
) as FoodDataset;

test('the bundled food database is credited to FSANZ', () => {
  assert.match(dataset.source, /^AUSNUT/);
  assert.equal(dataset.licence, 'CC BY 4.0');
  assert.match(dataset.attribution, /Food Standards Australia New Zealand/);
});

test('every bundled food is complete', () => {
  assert.ok(dataset.foods.length > 3000);
  const ids = new Set<string>();
  for (const food of dataset.foods) {
    assert.match(food.id, /^\d{8}$/);
    assert.ok(!ids.has(food.id), `duplicate ${food.id}`);
    ids.add(food.id);
    assert.ok(food.name && food.groupCode && food.groupName, food.id);
    assert.ok(food.energyKj >= 0 && food.saturatedFat <= food.fat, food.id);
    for (const measure of food.measures) assert.ok(measure.unit && measure.grams > 0, food.id);
  }
});

test('shared aliases are normalised and point at bundled foods', () => {
  const ids = new Set(dataset.foods.map((food) => food.id));
  assert.ok(dataset.aliases.length > 0);
  for (const {phrase, foodId} of dataset.aliases) {
    assert.equal(phrase, normalisePhrase(phrase));
    assert.ok(ids.has(foodId), `${phrase} → ${foodId}`);
  }
});

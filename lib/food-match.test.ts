import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {Food} from './data/types';
import {
  normalisePhrase,
  rankByCoverage,
  resolveGrams,
  roundNutrition,
  scaleFood,
} from './food-match';

const rice: Food = {
  id: '12102003',
  publicKey: null,
  name: 'Rice, white, cooked',
  groupCode: '12102',
  groupName: 'Rice and rice grain fractions',
  joinedWords: '',
  energyKj: 659,
  protein: 3.1,
  carbs: 34.7,
  fat: 0.2,
  saturatedFat: 0.04,
  sugars: 0.1,
  fibre: 0.8,
  sodiumMg: 0,
  density: 0.76,
  measures: [
    {unit: 'tablespoon', detail: null, grams: 15.2},
    {unit: 'cup', detail: 'large', grams: 250},
    {unit: 'cup', detail: null, grams: 190},
  ],
};

test('normalises phrases to their alias key', () => {
  assert.equal(normalisePhrase('2 Boiled Eggs'), 'boiled egg');
  assert.equal(normalisePhrase('Chawal'), 'chawal');
  assert.equal(normalisePhrase('200g  sandwiches'), 'sandwich');
  assert.equal(normalisePhrase('hummus'), 'hummus');
  assert.equal(normalisePhrase('cookies'), normalisePhrase('cookie'));
  assert.equal(normalisePhrase('potatoes'), normalisePhrase('potato'));
  assert.equal(normalisePhrase('a glass of milk'), 'glass milk');
});

test('resolves grams from units and measures', () => {
  assert.equal(resolveGrams(rice, 150, 'g', 100), 150);
  assert.equal(resolveGrams(rice, 0.2, 'kg', 100), 200);
  assert.equal(resolveGrams(rice, 100, 'ml', 50), 76);
  // The plain measure wins over a large one; plurals match.
  assert.equal(resolveGrams(rice, 2, 'Cups', 100), 380);
});

test("falls back to the AI's grams for unknown units or amounts", () => {
  assert.equal(resolveGrams(rice, 1, 'bowl', 220), 220);
  assert.equal(resolveGrams(rice, null, 'cup', 220), 220);
  assert.equal(resolveGrams(rice, 1, null, 220), 220);
});

test('scales per-100 g nutrients and rounds like an estimate', () => {
  const nutrition = roundNutrition(scaleFood(rice, 190));
  assert.deepEqual(nutrition, {
    calories: 299,
    protein: 5.9,
    carbs: 65.9,
    fat: 0.4,
    saturatedFat: 0.1,
  });
  assert.equal(roundNutrition({...nutrition, fat: 1, saturatedFat: 3}).saturatedFat, 1);
});

test('ranks names with more of the query words first, keeping search order among equals', () => {
  const foods = [
    {name: 'Egg, chicken, whole, raw'},
    {name: 'Egg, chicken, scrambled or omelette, with vegetables'},
    {name: 'Egg, chicken, whole, hard-boiled'},
    {name: "Egg, chicken, scrambled, with cow's milk, no fat added"},
  ];
  assert.deepEqual(
    rankByCoverage('scrambled eggs with milk', foods).map((food) => food.name),
    [
      "Egg, chicken, scrambled, with cow's milk, no fat added",
      'Egg, chicken, scrambled or omelette, with vegetables',
      'Egg, chicken, whole, raw',
      'Egg, chicken, whole, hard-boiled',
    ],
  );
});

// Pure helpers for matching estimated food items to the AUSNUT food database.
import type {Food} from '@/lib/data/types';

export type Nutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat: number;
};

const KJ_PER_KCAL = 4.184;
const round1 = (value: number) => Math.round(value * 10) / 10;

/** Rounds like an AI estimate: whole kcal, grams to 1 dp, saturated fat within fat. */
export function roundNutrition(values: Nutrition): Nutrition {
  const fat = round1(values.fat);
  return {
    calories: Math.round(values.calories),
    protein: round1(values.protein),
    carbs: round1(values.carbs),
    fat,
    saturatedFat: Math.min(round1(values.saturatedFat), fat),
  };
}

/** A food's nutrition for `grams` of it, unrounded. */
export function scaleFood(food: Food, grams: number): Nutrition {
  const factor = grams / 100;
  return {
    calories: (food.energyKj / KJ_PER_KCAL) * factor,
    protein: food.protein * factor,
    carbs: food.carbs * factor,
    fat: food.fat * factor,
    saturatedFat: food.saturatedFat * factor,
  };
}

export function sumNutrition(items: Nutrition[]): Nutrition {
  return items.reduce(
    (total, item) => ({
      calories: total.calories + item.calories,
      protein: total.protein + item.protein,
      carbs: total.carbs + item.carbs,
      fat: total.fat + item.fat,
      saturatedFat: total.saturatedFat + item.saturatedFat,
    }),
    {calories: 0, protein: 0, carbs: 0, fat: 0, saturatedFat: 0},
  );
}

// Words ending in these keep their s: "hummus", "glass", "chips" loses it.
const KEEPS_S = /(ss|us|is)$/;

function singular(word: string) {
  if (word.length <= 3 || !word.endsWith('s') || KEEPS_S.test(word)) return word;
  // "sandwiches", "potatoes", "glasses"; "cookies" and "slices" only lose the s.
  if (/(ch|sh|x|ss|o)es$/.test(word)) return word.slice(0, -2);
  return word.slice(0, -1);
}

const UNIT_WORDS = new Set([
  'g', 'gm', 'gms', 'gram', 'grams', 'kg', 'ml', 'l', 'x', 'of', 'a', 'an',
]);

/**
 * The key a phrase is stored under as an alias: lowercase letters only,
 * numbers and units dropped, words singular. "2 Boiled Eggs" -> "boiled egg".
 */
export function normalisePhrase(phrase: string) {
  return phrase
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !UNIT_WORDS.has(word))
    .map(singular)
    .join(' ')
    .slice(0, 100);
}

const words = (text: string) =>
  text.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 1);

/** Loosely the same word: "boiled" and "boil", "eggs" and "egg". */
const sameWord = (a: string, b: string) =>
  a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));

/**
 * Orders text search results by how many of the query's words each name has,
 * keeping the search order among equals. Text search ranks by word frequency,
 * which can bury the plain food under longer names that repeat common words.
 */
export function rankByCoverage<F extends {name: string}>(query: string, foods: F[]): F[] {
  const queryWords = [...new Set(words(query))];
  const coverage = (food: F) => {
    const nameWords = words(food.name);
    return queryWords.filter((word) => nameWords.some((name) => sameWord(word, name))).length;
  };
  return foods
    .map((food, index) => ({food, index, score: coverage(food)}))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({food}) => food);
}

function unitKey(unit: string) {
  return singular(unit.trim().toLowerCase().replace(/[^a-z ]/g, ''));
}

/** Prefers the measure a survey would call regular over small or large ones. */
function measureRank(detail: string | null) {
  if (!detail) return 0;
  if (/regular|medium/i.test(detail)) return 1;
  return 2;
}

/**
 * Grams for `amount` `unit` of `food`, from its measures (e.g. 2 egg -> 94 g).
 * Falls back to `estimatedGrams`, the AI's guess, when the unit isn't known.
 */
export function resolveGrams(
  food: Food,
  amount: number | null,
  unit: string | null,
  estimatedGrams: number,
): number {
  if (!amount || amount <= 0 || !unit) return estimatedGrams;
  const key = unitKey(unit);

  if (key === 'g' || key === 'gram' || key === 'gm') return amount;
  if (key === 'kg') return amount * 1000;
  if (key === 'ml') return amount * (food.density ?? 1);
  if (key === 'l' || key === 'litre' || key === 'liter') {
    return amount * 1000 * (food.density ?? 1);
  }

  const measure = food.measures
    .filter((m) => unitKey(m.unit) === key)
    .sort((a, b) => measureRank(a.detail) - measureRank(b.detail))[0];
  return measure ? amount * measure.grams : estimatedGrams;
}

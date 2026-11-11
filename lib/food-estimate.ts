// Food estimates grounded in the AUSNUT food database. The AI splits the meal
// into foods and estimates each one; each food is then matched to a database
// entry (a remembered alias, or the AI's pick from search results) and its
// nutrition worked out from that entry. Foods with no match keep the AI's
// numbers, so a meal can mix both.
import {
  estimateFood,
  pickFoods,
  type EstimatedItem,
  type FoodEstimate,
  type PickFoodsItem,
} from '@/lib/ai';
import {findAliases, findFoods, searchFoods} from '@/lib/data/foods';
import type {Food} from '@/lib/data/types';
import {
  normalisePhrase,
  rankByCoverage,
  resolveGrams,
  roundNutrition,
  scaleFood,
  sumNutrition,
  type Nutrition,
} from '@/lib/food-match';

const SEARCHED_PER_PHRASE = 25;
const PER_PHRASE = 8;
const SEARCH_LIMIT = 15;
const CANDIDATES_SHOWN = 6;

/**
 * Searches each phrase on its own and takes the results in turns, so one
 * phrase's common words (e.g. "chicken whole") can't crowd out another's.
 */
async function searchItem(item: EstimatedItem): Promise<Food[]> {
  const phrases = [...new Set([...item.search, item.food].map((p) => p.toLowerCase()))];
  const lists = await Promise.all(
    phrases.map(async (phrase) =>
      rankByCoverage(phrase, await searchFoods(phrase, SEARCHED_PER_PHRASE)).slice(0, PER_PHRASE),
    ),
  );
  const seen = new Map<string, Food>();
  for (let rank = 0; rank < PER_PHRASE; rank++) {
    for (const list of lists) {
      const food = list[rank];
      if (food && !seen.has(food.id)) seen.set(food.id, food);
    }
  }
  return [...seen.values()].slice(0, SEARCH_LIMIT);
}

/** A database food as it would be logged for one item. */
export type FoodChoice = {
  foodId: string;
  name: string;
  grams: number;
  nutrition: Nutrition;
};

export type EstimateItem = {
  label: string;
  /** The item's alias key, e.g. "chawal". */
  phrase: string;
  source: 'ausnut' | 'ai';
  /** The matched food, null when the AI's own numbers are used. */
  foodId: string | null;
  foodName: string | null;
  grams: number;
  nutrition: Nutrition;
  /** The AI's own estimate, to switch back to. */
  ai: {grams: number; nutrition: Nutrition};
  /** Database foods the user can switch to, the match first. */
  candidates: FoodChoice[];
};

/** Without items when the AI didn't list the foods separately. */
export type GroundedEstimate = Omit<FoodEstimate, 'items'> & {
  items?: EstimateItem[];
  /** The AI's own meal totals, for when no item uses the database. */
  aiTotals?: Nutrition;
};

function choiceFor(item: EstimatedItem, food: Food): FoodChoice {
  const grams = Math.round(resolveGrams(food, item.amount ?? null, item.unit ?? null, item.grams));
  return {
    foodId: food.id,
    name: food.name,
    grams,
    nutrition: roundNutrition(scaleFood(food, grams)),
  };
}

function aiNutrition(item: EstimatedItem): Nutrition {
  return roundNutrition(item);
}

/** Matches each item to a database food, or none. */
async function matchItems(userId: string, items: EstimatedItem[]): Promise<EstimateItem[]> {
  const phrases = items.map((item) => normalisePhrase(item.food));
  const [aliases, searched] = await Promise.all([
    findAliases(userId, phrases.filter(Boolean)),
    Promise.all(items.map(searchItem)),
  ]);
  const aliasFoods = new Map(
    (await findFoods([...new Set(aliases.values())])).map((food) => [food.id, food]),
  );

  // The aliased food leads the list even when search missed it.
  const candidates = items.map((_, index) => {
    const aliased = aliasFoods.get(aliases.get(phrases[index]) ?? '');
    const found = searched[index].filter((food) => food.id !== aliased?.id);
    return aliased ? [aliased, ...found] : found;
  });

  // Only items without an alias, and with something to pick from, go to the AI.
  const toPick = items
    .map((item, index) => ({item, index}))
    .filter(({index}) => !aliasFoods.has(aliases.get(phrases[index]) ?? '') && candidates[index].length);
  const picks = new Map<number, string | null>();
  if (toPick.length) {
    try {
      const request: PickFoodsItem[] = toPick.map(({item, index}) => ({
        label: item.label,
        food: item.food,
        otherFoods: items.filter((_, other) => other !== index).map((other) => other.food),
        candidates: candidates[index].map((food) => ({id: food.id, name: food.name})),
      }));
      const chosen = await pickFoods(request);
      toPick.forEach(({index}, position) => picks.set(index, chosen[position]));
    } catch (error) {
      // Unmatched items keep the AI's numbers.
      console.error('AI food matching failed:', error instanceof Error ? error.message : error);
    }
  }

  return items.map((item, index) => {
    const aliased = aliasFoods.get(aliases.get(phrases[index]) ?? '');
    const pickedId = aliased?.id ?? picks.get(index) ?? null;
    const options = candidates[index].map((food) => choiceFor(item, food));
    const match = options.find((option) => option.foodId === pickedId) ?? null;
    const ai = {grams: Math.round(item.grams), nutrition: aiNutrition(item)};
    return {
      label: item.label,
      phrase: phrases[index],
      source: match ? 'ausnut' : 'ai',
      foodId: match?.foodId ?? null,
      foodName: match?.name ?? null,
      grams: match?.grams ?? ai.grams,
      nutrition: match?.nutrition ?? ai.nutrition,
      ai,
      candidates: (match ? [match, ...options.filter((o) => o !== match)] : options).slice(
        0,
        CANDIDATES_SHOWN,
      ),
    };
  });
}

function aiOnly(item: EstimatedItem): EstimateItem {
  const ai = {grams: Math.round(item.grams), nutrition: aiNutrition(item)};
  return {
    label: item.label,
    phrase: normalisePhrase(item.food),
    source: 'ai',
    foodId: null,
    foodName: null,
    grams: ai.grams,
    nutrition: ai.nutrition,
    ai,
    candidates: [],
  };
}

/**
 * The meal's totals: the AI's own when nothing matched, so an all-AI estimate
 * reads as it did before; otherwise the sum of the items.
 */
export function totalOf(estimate: Nutrition, items: Pick<EstimateItem, 'source' | 'nutrition'>[]) {
  if (!items.some((item) => item.source === 'ausnut')) return roundNutrition(estimate);
  return roundNutrition(sumNutrition(items.map((item) => item.nutrition)));
}

/** Estimates the food, using the food database where it has the foods. */
export async function estimateFoodWithDatabase(
  userId: string,
  description: string,
  healthNotes?: string | null,
): Promise<GroundedEstimate> {
  const {items: estimated, ...estimate} = await estimateFood(description, healthNotes);
  if (!estimated?.length) return estimate;

  let items: EstimateItem[];
  try {
    items = await matchItems(userId, estimated);
  } catch (error) {
    console.error('Food database lookup failed:', error instanceof Error ? error.message : error);
    items = estimated.map(aiOnly);
  }
  return {...estimate, ...totalOf(estimate, items), items, aiTotals: roundNutrition(estimate)};
}

/** The aliases a logged estimate teaches: each matched item's phrase and food. */
export function aliasLinks(items: Pick<EstimateItem, 'phrase' | 'foodId'>[] = []) {
  return items.flatMap(({phrase, foodId}) => (foodId && phrase ? [{phrase, foodId}] : []));
}

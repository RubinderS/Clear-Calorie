import {db} from '@/lib/db';
import {toPlain, toPlainAll} from './plain';
import type {Food} from './types';

/**
 * Foods whose name best matches the words in `query`, best first. Uses the
 * text index, so word forms match ("boiled" finds "boil") but typos don't.
 */
export async function searchFoods(query: string, limit = 8): Promise<Food[]> {
  if (!query.trim()) return [];
  const {Food} = await db();
  const docs = await Food.find(
    {$text: {$search: query}},
    {score: {$meta: 'textScore'}},
  )
    .sort({score: {$meta: 'textScore'}})
    .limit(limit)
    .lean();
  // Drop the score the sort needed so it doesn't leak into the record.
  return toPlainAll(
    Food,
    docs.map((doc) => {
      const food: typeof doc & {score?: number} = {...doc};
      delete food.score;
      return food;
    }),
  );
}

export async function findFoods(ids: string[]): Promise<Food[]> {
  if (!ids.length) return [];
  const {Food} = await db();
  const docs = await Food.find({_id: {$in: ids}}).lean();
  return toPlainAll(Food, docs);
}

export async function findFood(id: string): Promise<Food | null> {
  const {Food} = await db();
  const doc = await Food.findById(id).lean();
  return doc && toPlain(Food, doc);
}

/**
 * The food each phrase means for this user: their own alias, else a shared
 * one. Phrases must already be normalised.
 */
export async function findAliases(
  userId: string,
  phrases: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!phrases.length) return result;
  const {FoodAlias} = await db();
  const docs = await FoodAlias.find({
    phrase: {$in: phrases},
    userId: {$in: [userId, null]},
  }).lean();
  // Shared first, so the user's own alias overwrites it.
  for (const doc of docs) if (doc.userId === null) result.set(doc.phrase, doc.foodId);
  for (const doc of docs) if (doc.userId !== null) result.set(doc.phrase, doc.foodId);
  return result;
}

/**
 * Remembers what each phrase meant when the user logged it. Repeating a match
 * counts it up; a different food replaces it. Unknown food ids are skipped.
 * `userId` null writes shared aliases (the import seeds these).
 */
export async function saveAliases(
  userId: string | null,
  links: {phrase: string; foodId: string}[],
) {
  const unique = new Map<string, string>();
  for (const {phrase, foodId} of links) if (phrase) unique.set(phrase, foodId);
  if (!unique.size) return;

  const {Food, FoodAlias} = await db();
  const known = new Set(
    (await Food.find({_id: {$in: [...unique.values()]}}, {_id: 1}).lean()).map(
      (doc) => doc._id,
    ),
  );
  const existing = new Map(
    (
      await FoodAlias.find({userId, phrase: {$in: [...unique.keys()]}}).lean()
    ).map((doc) => [doc.phrase, doc.foodId]),
  );

  const ops = [...unique]
    .filter(([, foodId]) => known.has(foodId))
    .map(([phrase, foodId]) => ({
      updateOne: {
        filter: {userId, phrase},
        update:
          existing.get(phrase) === foodId
            ? {$inc: {count: 1}}
            : {$set: {foodId, count: 1}},
        upsert: true,
      },
    }));
  if (ops.length) await FoodAlias.bulkWrite(ops, {ordered: false});
}

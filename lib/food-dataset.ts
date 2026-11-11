// The AUSNUT food database ships with the app as datasets/ausnut.json, built
// from the FSANZ spreadsheets by `npm run foods:build`. At startup it's loaded
// into the `foods` collection whenever the file differs from what was loaded.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {db} from '@/lib/db';
import {saveAliases} from '@/lib/data/foods';
import type {Food} from '@/lib/data/types';

export const DATASET_ID = 'ausnut';
export const DATASET_FILE = path.join('datasets', 'ausnut.json');

export type FoodDataset = {
  source: string;
  licence: string;
  attribution: string;
  /** Common names and the food they usually mean, shared by every user. */
  aliases: {phrase: string; foodId: string}[];
  foods: Food[];
};

export async function readFoodDataset(root = process.cwd()) {
  const text = await readFile(path.join(root, DATASET_FILE), 'utf8');
  // Line endings ignored, so a Windows checkout doesn't count as a new version.
  const version = createHash('sha256')
    .update(text.replace(/\r\n/g, '\n'))
    .digest('hex')
    .slice(0, 16);
  return {version, dataset: JSON.parse(text) as FoodDataset};
}

/**
 * Loads the bundled food database unless this version is already loaded.
 * Foods are replaced in place and users' aliases are kept.
 */
export async function syncFoodDatabase(root = process.cwd()) {
  const {version, dataset} = await readFoodDataset(root);
  const {Food, Dataset} = await db();
  const loaded = await Dataset.findById(DATASET_ID).lean();
  if (loaded?.version === version) return false;

  const ids = dataset.foods.map((food) => food.id);
  await Food.bulkWrite(
    dataset.foods.map(({id, ...food}) => ({
      replaceOne: {filter: {_id: id}, replacement: {_id: id, ...food}, upsert: true},
    })),
    {ordered: false},
  );
  await Food.deleteMany({_id: {$nin: ids}});
  await saveAliases(null, dataset.aliases);
  await Dataset.updateOne(
    {_id: DATASET_ID},
    {$set: {version, loadedAt: new Date()}},
    {upsert: true},
  );
  console.log(`Loaded ${dataset.foods.length} foods from ${dataset.source}`);
  return true;
}

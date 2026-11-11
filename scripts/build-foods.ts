// Builds datasets/ausnut.json, the food database the app ships with and loads
// at startup, from the AUSNUT 2023 spreadsheets. Only needed for a new AUSNUT
// release: download from FSANZ (foodstandards.gov.au, AUSNUT data files) into
// data/ausnut/ (or pass a folder):
//   - AUSNUT 2023 - Food details.xlsx
//   - AUSNUT 2023 - Food nutrient profiles.xlsx
//   - AUSNUT 2023 - Food measures.xlsx
// Then: npm run foods:build [-- <folder>], and commit the file.
import {readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type {Food, FoodMeasure} from '@/lib/data/types';
import {DATASET_FILE, type FoodDataset} from '@/lib/food-dataset';
import {normalisePhrase} from '@/lib/food-match';

/** Common names people type, and the AUSNUT food they usually mean. */
const SHARED_ALIASES: Record<string, string[]> = {
  'Curry, homemade, lentils (dhal)': ['daal', 'dal', 'dhal', 'dhal curry', 'lentil curry'],
  'Rice, white, cooked': ['chawal', 'rice', 'white rice', 'plain rice', 'steamed rice', 'boiled rice'],
  'Bread, flat, roti': ['roti'],
  'Bread, flat, chapatti': ['chapati', 'chapatti', 'phulka'],
  'Bread, flat, naan': ['naan', 'nan'],
  'Bread, flat, paratha': ['paratha', 'parantha'],
  'Ghee, clarified butter': ['ghee'],
  'Egg, chicken, whole, hard-boiled': ['boiled egg', 'hard boiled egg'],
  "Chicken, breast, lean, baked, roasted, fried, grilled or BBQ'd, no added fat": [
    'chicken breast',
    'chook breast',
    'grilled chicken breast',
  ],
  "Coffee, flat white/cappuccino/latte, single shot & cow's milk": [
    'flat white',
    'latte',
    'cappuccino',
  ],
};

type Row = Map<string, string>;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('text' in value) return String(value.text);
  }
  return String(value);
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The sheet's data rows keyed by header, starting below the row whose first
 * cell is "Survey ID". A header with sub-headings under it (e.g. a
 * classification's "Code" and "Food group name") is keyed "Header / Sub".
 */
async function readSheet(file: string, sheetName: RegExp): Promise<Row[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets.find((ws) => sheetName.test(ws.name));
  if (!sheet) throw new Error(`No sheet matching ${sheetName} in ${file}`);

  const rows: string[][] = [];
  sheet.eachRow({includeEmpty: true}, (row) => {
    const values: string[] = [];
    row.eachCell({includeEmpty: true}, (cell, col) => {
      values[col - 1] = clean(cellText(cell.value));
    });
    rows.push(values);
  });

  const headerIndex = rows.findIndex((row) => row[0] === 'Survey ID');
  if (headerIndex < 0) throw new Error(`No "Survey ID" header in ${file}`);
  const header = rows[headerIndex];
  const subHeader = rows[headerIndex + 1] ?? [];
  // A sub-heading row has no survey ID. Merged cells repeat their value in
  // every row and column they span, so a repeat is not a sub-heading.
  const hasSubHeader = !/^\d{8}$/.test(subHeader[0] ?? '');

  let group = '';
  const keys = Array.from({length: Math.max(header.length, subHeader.length)}, (_, col) => {
    if (header[col]) group = header[col];
    const sub = hasSubHeader && subHeader[col] !== header[col] ? subHeader[col] : '';
    return sub ? `${group} / ${sub}` : header[col] ?? '';
  });

  return rows
    .slice(headerIndex + 1)
    .filter((row) => /^\d{8}$/.test(row[0] ?? ''))
    .map((row) => new Map(keys.map((key, col) => [key, row[col] ?? ''])));
}

function column(row: Row, pattern: RegExp): string {
  for (const [key, value] of row) if (pattern.test(key)) return value;
  return '';
}

const number = (text: string) => {
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

/** Each pair of neighbouring words joined, so "sourdough" finds "sour dough". */
function joinedWords(name: string) {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.slice(1).map((word, index) => words[index] + word).join(' ');
}

function findFile(dir: string, pattern: RegExp) {
  const file = readdirSync(dir).find((name) => pattern.test(name) && name.endsWith('.xlsx'));
  if (!file) throw new Error(`No file matching ${pattern} in ${dir}`);
  return path.join(dir, file);
}

async function main() {
  const dir = path.resolve(process.argv[2] ?? 'data/ausnut');
  const [details, profiles, measureRows] = await Promise.all([
    readSheet(findFile(dir, /food[- ]details/i), /food details/i),
    readSheet(findFile(dir, /food[- ]nutrient[- ]profiles/i), /nutrient profiles/i),
    readSheet(findFile(dir, /food[- ]measures/i), /^(?!contents)/i),
  ]);

  const nutrients = new Map(profiles.map((row) => [row.get('Survey ID')!, row]));
  const measures = new Map<string, {density: number | null; list: FoodMeasure[]}>();
  for (const row of measureRows) {
    const id = row.get('Survey ID')!;
    const entry = measures.get(id) ?? {density: null, list: []};
    measures.set(id, entry);
    const unit = column(row, /^Descriptor 1/).toLowerCase();
    const quantity = number(column(row, /^Quantity/)) || 1;
    const grams = number(column(row, /^Gram amount/)) / quantity;
    if (!unit || !grams) continue;
    if (unit === 'density') {
      entry.density = Math.round(grams * 1000) / 1000;
      continue;
    }
    const detail =
      [2, 3, 4].map((n) => column(row, new RegExp(`^Descriptor ${n}`))).filter(Boolean).join(', ') ||
      null;
    if (!entry.list.some((m) => m.unit === unit && m.detail === detail)) {
      entry.list.push({unit, detail, grams: Math.round(grams * 10) / 10});
    }
  }

  const foods: Food[] = [];
  for (const row of details) {
    const id = row.get('Survey ID')!;
    const profile = nutrients.get(id);
    if (!profile) continue;
    const fat = number(column(profile, /^Total fat/));
    foods.push({
      id,
      publicKey: column(row, /^Public food key/) || null,
      name: column(row, /^Food name/),
      joinedWords: joinedWords(column(row, /^Food name/)),
      groupCode: column(row, /^2023 Food and dietary supplement classification \/ Code/),
      groupName: column(row, /^2023 Food and dietary supplement classification \/ Food group/),
      energyKj: number(column(profile, /^Energy with dietary fibre/)),
      protein: number(column(profile, /^Protein/)),
      carbs: number(column(profile, /^Available carbohydrate, with sugar alcohols/)),
      fat,
      saturatedFat: Math.min(number(column(profile, /^Total saturated fat/)), fat),
      sugars: number(column(profile, /^Total sugars/)),
      fibre: number(column(profile, /^Dietary fibre/)),
      sodiumMg: number(column(profile, /^Sodium/)),
      density: measures.get(id)?.density ?? null,
      measures: measures.get(id)?.list ?? [],
    });
  }
  const unnamed = foods.filter((food) => !food.name || !food.groupCode);
  if (unnamed.length) {
    throw new Error(`${unnamed.length} foods have no name or group, e.g. ${unnamed[0].id}`);
  }
  foods.sort((a, b) => a.id.localeCompare(b.id));

  const byName = new Map(foods.map((food) => [food.name, food.id]));
  const links = Object.entries(SHARED_ALIASES).flatMap(([name, phrases]) => {
    const foodId = byName.get(name);
    if (!foodId) {
      console.warn(`Skipped aliases for "${name}": not in this release`);
      return [];
    }
    return phrases.map((phrase) => ({phrase: normalisePhrase(phrase), foodId}));
  });

  const header: Omit<FoodDataset, 'foods'> = {
    source: 'AUSNUT 2023',
    licence: 'CC BY 4.0',
    attribution: '© Food Standards Australia New Zealand',
    aliases: links,
  };
  // One food per line, so a new release diffs readably.
  const json = JSON.stringify(header).slice(0, -1);
  const lines = foods.map((food) => JSON.stringify(food)).join(',\n');
  writeFileSync(DATASET_FILE, `${json},"foods":[\n${lines}\n]}\n`);
  console.log(`Wrote ${foods.length} foods and ${links.length} shared aliases to ${DATASET_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

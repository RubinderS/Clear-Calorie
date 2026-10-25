#!/usr/bin/env node
// Copies a ClearCalorie SQLite database (the Prisma-era Clear-Calorie.db or
// prisma/dev.db) into MongoDB, in the shape lib/models expects. Standalone:
// needs only Node >= 22.13 (built-in node:sqlite) and the mongoose package.
//
//   node scripts/migrate-sqlite-to-mongo.mjs --sqlite prisma/dev.db \
//     --mongo mongodb://localhost:27017/clearcalorie [--drop] [--dry-run] [--skip-tokens]
//
// Ids are kept, so links, sessions' user ids and bookmarked URLs stay valid.
// Run `npm run db:migrate` (migrate-mongo up) afterwards; in Docker the
// entrypoint does that on the next start.

import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {parseArgs} from 'node:util';

const {values: args} = parseArgs({
  options: {
    sqlite: {type: 'string', default: 'prisma/dev.db'},
    mongo: {type: 'string', default: process.env.MONGO_URL},
    drop: {type: 'boolean', default: false},
    'dry-run': {type: 'boolean', default: false},
    'skip-tokens': {type: 'boolean', default: false},
    help: {type: 'boolean', short: 'h', default: false},
  },
});

if (args.help) {
  console.log(
    'Usage: node scripts/migrate-sqlite-to-mongo.mjs --sqlite <file.db> --mongo <mongodb://host/db> [--drop] [--dry-run] [--skip-tokens]',
  );
  process.exit(0);
}

// SQLite table -> MongoDB collection, parents first. Keep in sync with the
// collection names in lib/models.
const TABLES = [
  ['User', 'users'],
  ['VerificationToken', 'verification_tokens'],
  ['Goal', 'goals'],
  ['Profile', 'profiles'],
  ['FoodLog', 'food_logs'],
  ['SavedFoodItem', 'saved_food_items'],
  ['ExerciseGoal', 'exercise_goals'],
  ['ExerciseLog', 'exercise_logs'],
  ['SavedExerciseItem', 'saved_exercise_items'],
  ['ExercisePlanDay', 'exercise_plan_days'],
  ['WeightLog', 'weight_logs'],
  ['BodyMetric', 'body_metrics'],
  ['BodyMetricLog', 'body_metric_logs'],
  ['WeeklyReport', 'weekly_reports'],
  ['ChatThread', 'chat_threads'],
  ['ChatMessage', 'chat_messages'],
  ['ChatAction', 'chat_actions'],
];
// Embedded in exercise_logs rather than copied as a collection.
const EMBEDDED = 'ExerciseSet';
// Unused with JWT sessions; their rows are counted and left behind.
const SKIPPED = ['Account', 'Session', '_prisma_migrations'];

// Unique indexes, created before inserting so duplicate data fails here
// instead of at app start. Mirrors lib/models; unnamed so the names match
// what Mongoose's syncIndexes generates.
const onlyStrings = (...fields) => ({
  partialFilterExpression: Object.fromEntries(
    fields.map((field) => [field, {$type: 'string'}]),
  ),
});
const UNIQUE_INDEXES = {
  users: [[{email: 1}]],
  verification_tokens: [[{token: 1}], [{identifier: 1, token: 1}]],
  goals: [[{userId: 1}]],
  profiles: [[{userId: 1}]],
  saved_food_items: [[{userId: 1, name: 1}]],
  saved_exercise_items: [[{userId: 1, name: 1}]],
  exercise_plan_days: [[{userId: 1, date: 1}]],
  // Nulls must not collide: ad-hoc logs have no goal, custom metrics no key,
  // and a user's first report no previous one.
  exercise_logs: [
    [
      {exerciseGoalId: 1, goalDate: 1},
      onlyStrings('exerciseGoalId', 'goalDate'),
    ],
  ],
  body_metrics: [[{userId: 1, key: 1}, onlyStrings('key')]],
  weekly_reports: [
    [{userId: 1, weekStart: 1}],
    [{previousReportId: 1}, onlyStrings('previousReportId')],
  ],
};

const BATCH_SIZE = 1000;
const SPOT_CHECKS = 5;

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

if (!existsSync(args.sqlite)) fail(`SQLite file not found: ${args.sqlite}`);
if (!args.mongo && !args['dry-run']) {
  fail('Pass --mongo mongodb://host:27017/<database> (or set MONGO_URL)');
}
const dbName = args.mongo ? new URL(args.mongo).pathname.slice(1) : '';
if (args.mongo && !dbName) {
  fail(
    'The --mongo URL must name the database, e.g. mongodb://localhost:27017/clearcalorie',
  );
}

const sqlite = new DatabaseSync(args.sqlite, {readOnly: true});
const tables = new Set(
  sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name),
);

/** Column name -> declared type, e.g. DATETIME, BOOLEAN. */
function columnTypes(table) {
  return new Map(
    sqlite
      .prepare(`PRAGMA table_info("${table}")`)
      .all()
      .map((column) => [column.name, String(column.type).toUpperCase()]),
  );
}

function readRows(table) {
  return tables.has(table)
    ? sqlite.prepare(`SELECT * FROM "${table}"`).all()
    : [];
}

/** Prisma stored DateTime as epoch ms; older rows may be ISO or "YYYY-MM-DD HH:MM:SS" text. */
function toDate(value, where) {
  if (value === null) return null;
  const date =
    typeof value === 'number' || typeof value === 'bigint'
      ? new Date(Number(value))
      : new Date(
          /^\d{4}-\d{2}-\d{2} /.test(value)
            ? `${value.replace(' ', 'T')}Z`
            : value,
        );
  if (Number.isNaN(date.getTime()))
    fail(`Unreadable date ${JSON.stringify(value)} in ${where}`);
  return date;
}

/** A row as a document: id -> _id, dates and booleans converted, nulls kept. */
function toDocument(table, types, row) {
  const doc = {};
  for (const [column, value] of Object.entries(row)) {
    const type = types.get(column);
    const key = column === 'id' ? '_id' : column;
    if (type === 'DATETIME') doc[key] = toDate(value, `${table}.${column}`);
    else if (type === 'BOOLEAN')
      doc[key] = value === null ? null : Boolean(value);
    else if (typeof value === 'bigint') doc[key] = Number(value);
    else doc[key] = value;
  }
  return doc;
}

function newId() {
  return randomBytes(16).toString('base64url');
}

// --- Read and transform everything first, so a bad row stops the run before any write.

const setsByLog = new Map();
const setTypes = columnTypes(EMBEDDED);
for (const row of readRows(EMBEDDED)) {
  // Sets are embedded without ids.
  const {exerciseLogId, ...set} = toDocument(EMBEDDED, setTypes, row);
  delete set._id;
  if (!setsByLog.has(exerciseLogId)) setsByLog.set(exerciseLogId, []);
  setsByLog.get(exerciseLogId).push(set);
}
let embeddedSets = 0;

const plan = [];
for (const [table, collection] of TABLES) {
  const types = columnTypes(table);
  let rows = readRows(table);
  let skipped = 0;
  if (table === 'VerificationToken') {
    const now = Date.now();
    const kept = rows.filter(
      (row) =>
        !args['skip-tokens'] &&
        toDate(row.expires, 'VerificationToken.expires') > now,
    );
    skipped = rows.length - kept.length;
    rows = kept;
  }
  const docs = rows.map((row, index) => {
    const doc = toDocument(table, types, row);
    if (table === 'VerificationToken') doc._id = newId();
    // SQLite returns rows in insertion order; seq keeps it for messages saved
    // in the same millisecond (see lib/data/chat.ts).
    if (table === 'ChatMessage') doc.seq = index;
    if (table === 'ExerciseLog') {
      const sets = (setsByLog.get(doc._id) ?? []).sort(
        (a, b) => a.position - b.position,
      );
      setsByLog.delete(doc._id);
      embeddedSets += sets.length;
      doc.exerciseSets = sets;
    }
    return doc;
  });
  plan.push({table, collection, docs, skipped});
}
const orphanSets = [...setsByLog.values()].reduce(
  (sum, sets) => sum + sets.length,
  0,
);

console.log(`Source: ${args.sqlite}`);
console.log(
  `Target: ${args.mongo?.replace(/\/\/[^@/]*@/, '//***@') ?? '(dry run)'}\n`,
);
for (const {table, collection, docs, skipped} of plan) {
  const note = skipped
    ? ` (${skipped} expired or skipped tokens left out)`
    : '';
  console.log(
    `  ${table.padEnd(18)} -> ${collection.padEnd(22)} ${String(docs.length).padStart(7)}${note}`,
  );
}
console.log(
  `  ${EMBEDDED.padEnd(18)} -> exercise_logs (embedded) ${String(embeddedSets).padStart(4)}`,
);
if (orphanSets)
  console.log(
    `  ! ${orphanSets} sets belong to no exercise log and are left out`,
  );
for (const table of SKIPPED.filter((name) => tables.has(name))) {
  const {n} = sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get();
  console.log(
    `  ${table.padEnd(18)}    not migrated           ${String(n).padStart(7)}`,
  );
}

if (args['dry-run']) {
  console.log('\nDry run: nothing was written.');
  process.exit(0);
}

// --- Write.

// The driver that ships with mongoose; loaded late so a dry run needs neither.
const {default: mongoose} = await import('mongoose');
const client = new mongoose.mongo.MongoClient(args.mongo);
await client.connect();
const db = client.db(dbName);

try {
  const existing = new Set(
    (await db.listCollections({}, {nameOnly: true}).toArray()).map(
      (c) => c.name,
    ),
  );
  const nonEmpty = [];
  for (const {collection} of plan) {
    if (
      existing.has(collection) &&
      (await db.collection(collection).estimatedDocumentCount()) > 0
    ) {
      nonEmpty.push(collection);
    }
  }
  if (nonEmpty.length && !args.drop) {
    fail(
      `These collections already have documents: ${nonEmpty.join(', ')}.\n` +
        'Pass --drop to replace them, or point --mongo at an empty database.',
    );
  }
  for (const collection of nonEmpty) {
    await db.collection(collection).drop();
    console.log(`\nDropped ${collection}`);
  }

  for (const [collection, indexes] of Object.entries(UNIQUE_INDEXES)) {
    for (const [keys, options = {}] of indexes) {
      await db
        .collection(collection)
        .createIndex(keys, {unique: true, ...options});
    }
  }

  console.log('\nCopying...');
  for (const {collection, docs} of plan) {
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      await db
        .collection(collection)
        .insertMany(docs.slice(i, i + BATCH_SIZE), {ordered: true});
    }
    console.log(
      `  ${collection.padEnd(22)} ${String(docs.length).padStart(7)}`,
    );
  }

  // --- Verify: counts, then a few random documents field by field.

  let mismatches = 0;
  console.log('\nVerifying...');
  for (const {table, collection, docs} of plan) {
    const count = await db.collection(collection).countDocuments();
    if (count !== docs.length) {
      mismatches++;
      console.error(
        `  ${collection}: expected ${docs.length} documents, found ${count}`,
      );
    }
    for (let n = 0; n < Math.min(SPOT_CHECKS, docs.length); n++) {
      const expected = docs[Math.floor(Math.random() * docs.length)];
      const actual = await db
        .collection(collection)
        .findOne({_id: expected._id});
      const same =
        actual &&
        JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
      if (!same) {
        mismatches++;
        console.error(
          `  ${collection}: document ${expected._id} doesn't match ${table}`,
        );
      }
    }
  }
  const [{n: storedSets = 0} = {}] = await db
    .collection('exercise_logs')
    .aggregate([{$group: {_id: null, n: {$sum: {$size: '$exerciseSets'}}}}])
    .toArray();
  if (storedSets !== embeddedSets) {
    mismatches++;
    console.error(
      `  exercise_logs: expected ${embeddedSets} embedded sets, found ${storedSets}`,
    );
  }

  if (mismatches) fail(`${mismatches} check(s) failed; see above.`);
  console.log('  All counts and spot checks match.');
  console.log(
    '\nDone. Next: run `npm run db:migrate` (Docker does this on start), then start the app.',
  );
} finally {
  await client.close();
}

/** Keys in a stable order, so documents compare regardless of field order. */
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted(value[key])]),
    );
  }
  return value;
}

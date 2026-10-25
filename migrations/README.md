# Data migrations

[migrate-mongo](https://github.com/seppevs/migrate-mongo) applies these in order and records each one in the `changelog` collection. The Docker entrypoint runs `migrate-mongo up` on every start, before the app builds its indexes. `e2e/scripts/prepare-db.ts` does too, so tests always run fully migrated.

```bash
npm run db:migrate:create -- rename-foo   # new timestamped file here
npm run db:migrate:status                 # applied vs pending
npm run db:migrate                        # apply pending
npm run db:migrate:down                   # undo the last one
```

## When you need one

Only for changes to **existing data**: renaming or retyping a field, backfilling a value, removing a field, moving data between an embedded array and its own collection, or deduplicating before adding a unique index.

You don't need one for:
- a new optional field: older documents read it as `null` (see `lib/data/plain.ts`)
- an index change: `syncIndexes` at startup adds and drops indexes to match `lib/models`

## Conventions

- Use the `db` handle migrate-mongo passes in (the native driver), never the Mongoose models: the models will change after the migration is written.
- Make `up` idempotent: filter on the old shape, e.g. `{oldField: {$exists: true}}`, so a rerun is a no-op.
- Rewrite large collections with `bulkWrite` in batches of about 1000.
- Write `down` when it's cheap. Otherwise throw `new Error('irreversible')` and rely on a `mongodump` backup taken before upgrading.
- Adding a unique index over existing data: dedupe in a migration. The index itself goes in `lib/models`, and `syncIndexes` builds it after the migrations have run.
- When a migration changes the data shape, update `lib/models`, `lib/data/types.ts` and the transform in `scripts/migrate-sqlite-to-mongo.mjs` in the same change. The SQLite import produces the shape from before the first migration, and `migrate-mongo up` takes it from there.

```js
// migrations/20270101000000-example.js
module.exports = {
  async up(db) {
    await db
      .collection('food_logs')
      .updateMany({kcal: {$exists: true}}, {$rename: {kcal: 'calories'}});
  },
  async down(db) {
    await db
      .collection('food_logs')
      .updateMany({calories: {$exists: true}}, {$rename: {calories: 'kcal'}});
  },
};
```

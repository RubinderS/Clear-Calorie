import path from 'node:path';

// migrate-mongo is ESM; its CommonJS entry exposes each export as a promise.
// It publishes no types, so these are the parts used here.
type MigrateMongo = {
  config: Promise<{set(config: object): void}>;
  database: Promise<{connect(): Promise<{db: unknown; client: {close(): Promise<void>}}>}>;
  up: Promise<(db: unknown, client: unknown) => Promise<string[]>>;
};

/** Applies pending migrations in migrations/ to `url`; returns the files applied. */
export async function runMigrations(url: string, root = process.cwd()) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const migrateMongo = require('migrate-mongo') as MigrateMongo;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = require(path.join(root, 'migrate-mongo-config.js'));
  (await migrateMongo.config).set({...config, mongodb: {...config.mongodb, url}});
  const {db, client} = await (await migrateMongo.database).connect();
  try {
    return await (await migrateMongo.up)(db, client);
  } finally {
    await client.close();
  }
}

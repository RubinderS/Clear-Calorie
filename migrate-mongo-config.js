// Config for migrate-mongo, which applies the data migrations in migrations/.
// Run with `npm run db:migrate`; the Docker entrypoint runs it on every start.
// CommonJS, as migrate-mongo loads it with require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path');

try {
  // Locally DATABASE_URL lives in .env; in Docker it's set in the environment.
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {}

module.exports = {
  mongodb: {
    // The database name comes from the URL.
    url: process.env.DATABASE_URL,
  },
  migrationsDir: path.join(__dirname, 'migrations'),
  changelogCollectionName: 'changelog',
  // No lock: migrate-mongo 14 doesn't await the lock's index creation, so
  // closing right after `up` can crash. One app runs per database; when
  // several share one, run `npm run db:migrate` once before starting them.
  lockCollectionName: 'changelog_lock',
  lockTtl: 0,
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'commonjs',
};

// Recreates a server's e2e database: empty, fully migrated, with the app's
// indexes. Runs inside the webServer command because Playwright starts web
// servers before globalSetup.
import {ROOT, SERVERS, dbUrl, type ServerName} from '../env';
import {resetDatabase} from '../fixtures/test-db';
import {runMigrations} from '../../lib/migrations';

const name = process.argv[2] as ServerName;
if (!(name in SERVERS)) {
  throw new Error(`Unknown server "${name}"`);
}

const url = dbUrl(SERVERS[name].dbName);
resetDatabase(url, () => runMigrations(url, ROOT)).catch((error) => {
  console.error(error);
  process.exit(1);
});

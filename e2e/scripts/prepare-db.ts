// Recreates a server's e2e database from the migrations. Runs inside the
// webServer command because Playwright starts web servers before globalSetup.
import {execSync} from 'node:child_process';
import {rmSync} from 'node:fs';
import path from 'node:path';
import {ROOT, SERVERS, dbUrl, type ServerName} from '../env';

const name = process.argv[2] as ServerName;
if (!(name in SERVERS)) {
  throw new Error(`Unknown server "${name}"`);
}

const {dbFile} = SERVERS[name];
for (const suffix of ['', '-journal', '-wal', '-shm']) {
  rmSync(path.join(ROOT, 'prisma', `${dbFile}${suffix}`), {force: true});
}

execSync('npx prisma migrate deploy', {
  cwd: ROOT,
  stdio: 'inherit',
  env: {...process.env, DATABASE_URL: dbUrl(dbFile)},
});

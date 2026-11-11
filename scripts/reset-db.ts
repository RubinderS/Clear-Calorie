// Empties the database in DATABASE_URL, then migrates, indexes and loads the
// food database the way a fresh install starts. `npm run db:reset` seeds the demo data after.
import {connectDb, disconnectDb} from '@/lib/db';
import {runMigrations} from '@/lib/migrations';
import {syncIndexes} from '@/lib/models';
import {syncFoodDatabase} from '@/lib/food-dataset';

async function main() {
  const {connection} = await connectDb();
  console.log(`Dropping ${connection.name}`);
  await connection.dropDatabase();
  const applied = await runMigrations(process.env.DATABASE_URL!);
  console.log(`Applied ${applied.length} migration(s)`);
  await syncIndexes();
  await syncFoodDatabase();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => disconnectDb());

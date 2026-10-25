import mongoose from 'mongoose';
import {getModels, type Models} from '@/lib/models';

const globalForMongoose = globalThis as unknown as {
  mongooseConnection: Promise<typeof mongoose> | undefined;
};

mongoose.set('strictQuery', true);

/** Connects once per process; dev reloads reuse the connection. */
export function connectDb() {
  globalForMongoose.mongooseConnection ??= (() => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    // Indexes are built by syncIndexes at startup, not on first use.
    return mongoose.connect(url, {autoIndex: false});
  })();
  return globalForMongoose.mongooseConnection;
}

/** The models on the app's connection, once it's open. */
export async function db(): Promise<Models> {
  await connectDb();
  return getModels();
}

/** Closes the connection so a script can exit. */
export async function disconnectDb() {
  if (!globalForMongoose.mongooseConnection) return;
  globalForMongoose.mongooseConnection = undefined;
  await mongoose.disconnect();
}

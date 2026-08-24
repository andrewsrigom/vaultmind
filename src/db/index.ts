import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '@/db/schema';
import { getDatabaseEnv } from '@/lib/env';

export function createDb() {
  const env = getDatabaseEnv();
  const client = postgres(env.DATABASE_URL, { max: 1 });

  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

let cachedDb: Db | null = null;

export function getDb(): Db {
  cachedDb ??= createDb();

  return cachedDb;
}

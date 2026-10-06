import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function poolSize() {
  const size = Number(process.env.DATABASE_POOL_MAX ?? 5);
  return Number.isInteger(size) && size >= 1 && size <= 20 ? size : 5;
}

function createDatabase(connectionString: string) {
  // Connections open on the first query, so builds need no live database.
  // Neon's PgBouncer pooler rejects startup options like statement_timeout.
  const isPooler = connectionString.includes('-pooler');
  const client = postgres(connectionString, {
    max: poolSize(), idle_timeout: 20, connect_timeout: 10, max_lifetime: 60 * 30,
    prepare: false,
    ...(isPooler ? {} : { connection: { options: '-c statement_timeout=30000 -c lock_timeout=10000' } }),
    onnotice: () => undefined,
  });
  return { client, db: drizzle(client, { schema }) };
}

type DatabaseState = ReturnType<typeof createDatabase>;
const globalDatabase = globalThis as typeof globalThis & { frankDatabase?: DatabaseState };
const connectionString = process.env.DATABASE_URL;
const state = connectionString
  ? globalDatabase.frankDatabase ?? (globalDatabase.frankDatabase = createDatabase(connectionString))
  : undefined;

export const db = state?.db ?? null;

export async function closeDatabase(): Promise<void> {
  if (!state) return;
  if (globalDatabase.frankDatabase === state) delete globalDatabase.frankDatabase;
  await state.client.end({ timeout: 5 });
}

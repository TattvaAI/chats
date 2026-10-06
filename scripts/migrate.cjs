/* eslint-disable @typescript-eslint/no-require-imports */
require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs');
const path = require('node:path');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { migrate } = require('drizzle-orm/postgres-js/migrator');

(async () => {
  const url = process.env.TEST_DATABASE_URL_FILE
    ? fs.readFileSync(process.env.TEST_DATABASE_URL_FILE, 'utf8').trim()
    : process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error('Set DATABASE_URL_UNPOOLED, or TEST_DATABASE_URL_FILE for an isolated database.');
  if (new URL(url).hostname.includes('-pooler')) throw new Error('Migrations require a direct database connection.');
  const client = postgres(url, {
    max: 1, connect_timeout: 10, idle_timeout: 10, prepare: false,
    connection: { options: '-c statement_timeout=120000 -c lock_timeout=15000' },
    onnotice: () => undefined,
  });
  try {
    // Serializes releases using the same journal. The direct connection keeps this session lock stable.
    await client`select pg_advisory_lock(hashtext('frank:schema:migrations'))`;
    await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, '..', 'drizzle') });
    console.log('Migrations applied successfully.');
  } finally {
    await client.end({ timeout: 5 });
  }
})().catch(() => {
  // Database exceptions can include SQL values and connection details.
  console.error('Migration failed. Check the direct database connection and migration state.');
  process.exitCode = 1;
});

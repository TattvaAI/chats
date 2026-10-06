/* eslint-disable @typescript-eslint/no-require-imports */
if (process.env.FRANK_WORKER_BUNDLED !== 'true') require('./register-ts.cjs');
require('@next/env').loadEnvConfig(process.cwd());
const { closeDatabase } = require('../lib/db/index.ts');
const { runWorkerTick } = require('../lib/ai/jobs.ts');
const { createWorkerHealth } = require('./worker-health.cjs');

const once = process.argv.includes('--once');
let stopping = false;
let wake;
const shutdown = () => { stopping = true; if (wake) wake(); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

(async () => {
  const health = await createWorkerHealth({ enabled: !once });
  try {
    do {
      try {
        const stats = await runWorkerTick();
        health.succeeded();
        console.log(JSON.stringify({ worker: 'analysis', ...stats }));
      } catch {
        health.failed();
        console.error('Worker tick failed. Check database and worker configuration.');
        process.exitCode = 1;
        stopping = true;
      }
      if (once || stopping) break;
      await new Promise(resolve => {
        const timer = setTimeout(() => { wake = undefined; resolve(); }, 10_000);
        wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
      });
    } while (!stopping);
  } finally {
    await health.close();
    try { await closeDatabase(); }
    catch { console.error('Worker could not close database connections.'); process.exitCode = 1; }
  }
})().catch(() => { console.error('Worker stopped unexpectedly.'); process.exitCode = 1; });

/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorkerHealth } = require('../scripts/worker-health.cjs');

test('worker health rejects startup, failed and stale processing and recovers after a successful tick', async () => {
  let time = 1_000;
  const health = await createWorkerHealth({ port: 0, hostname: '127.0.0.1', now: () => time });
  const url = `http://127.0.0.1:${health.port}/health`;
  try {
    assert.equal((await fetch(url)).status, 503);
    health.succeeded();
    const ok = await fetch(url);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await ok.json(), { status: 'ok' });
    assert.equal((await fetch(url, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${url}/private`)).status, 404);
    health.failed();
    assert.equal((await fetch(url)).status, 503);
    health.succeeded();
    time += 360_001;
    assert.equal((await fetch(url)).status, 503);
    health.succeeded();
    assert.equal((await fetch(url)).status, 200);
  } finally { await health.close(); }
  await assert.rejects(fetch(url));
});

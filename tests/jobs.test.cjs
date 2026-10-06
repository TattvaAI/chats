/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const { test, beforeEach, afterEach } = require('node:test');
require('../scripts/register-ts.cjs');
const load = Module._load;
let tickCalls = 0;
let cronTick = async () => { tickCalls++; return { completed: 0, failedRuns: 0 }; };
Module._load = function (request, parent, ...args) {
  if (request === '@/lib/db' || (request === './db' && parent?.filename.endsWith('/lib/requests.ts'))) return { db: null };
  if (request === '@/lib/ai/jobs' && parent?.filename.endsWith('/app/api/cron/jobs/route.ts')) return { runWorkerTick: () => cronTick() };
  return load.call(this, request, parent, ...args);
};
const { runAnalysisJob, runWorkerTick, jobLimits, jobsRunInline } = require('../lib/ai/jobs.ts');
const cron = require('../app/api/cron/jobs/route.ts');
let env;
beforeEach(() => { env = { ...process.env }; tickCalls = 0; cronTick = async () => { tickCalls++; return { completed: 0, failedRuns: 0 }; }; });
afterEach(() => { for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env); });

test('unconfigured storage fails job processing visibly instead of reporting success', async () => {
  await assert.rejects(runAnalysisJob('7988c3f0-7cff-4bf1-a11a-d2d6d4080834'), { status: 503 });
  await assert.rejects(runWorkerTick(), { status: 503 });
});

test('a dedicated worker disables web generation and invalid execution modes fail closed', () => {
  delete process.env.JOB_EXECUTION_MODE;
  assert.equal(jobsRunInline(), true);
  process.env.JOB_EXECUTION_MODE = 'worker';
  assert.equal(jobsRunInline(), false);
  process.env.JOB_EXECUTION_MODE = 'misspelled-worker';
  assert.throws(jobsRunInline, { status: 503 });
});

test('job cost and concurrency defaults stay finite under invalid configuration', () => {
  process.env.MAX_ACTIVE_JOBS = 'NaN'; process.env.MAX_CONCURRENT_JOBS = 'Infinity'; process.env.MAX_DAILY_REPORTS = '0';
  assert.deepEqual(jobLimits(), { active: 3, concurrent: 2, daily: 50 });
  process.env.MAX_ACTIVE_JOBS = '1'; process.env.MAX_CONCURRENT_JOBS = '8';
  assert.equal(jobLimits().concurrent, 1);
});

test('cron authentication is required before work and safe aggregate stats are returned', async () => {
  delete process.env.CRON_SECRET;
  assert.equal((await cron.GET(new Request('https://frank.test/api/cron/jobs'))).status, 503);
  process.env.CRON_SECRET = 'a'.repeat(64);
  for (const authorization of ['', 'Bearer wrong', `Bearer ${'b'.repeat(64)}`]) {
    assert.equal((await cron.GET(new Request('https://frank.test/api/cron/jobs', { headers: { authorization } }))).status, 401);
  }
  assert.equal(tickCalls, 0);
  const response = await cron.GET(new Request('https://frank.test/api/cron/jobs', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, completed: 0, failedRuns: 0 });
  assert.equal(tickCalls, 1);
  cronTick = async () => { throw Error('secret query or transcript'); };
  const failure = await cron.GET(new Request('https://frank.test/api/cron/jobs', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /secret|transcript|query/);
});

async function workerRun({ fail = false, once = true, signal = false }) {
  let ticks = 0, closes = 0;
  const handlers = {};
  const processMock = { env: {}, argv: once ? ['node', 'worker', '--once'] : ['node', 'worker'], cwd: () => '/', once: (name, fn) => { handlers[name] = fn; }, exitCode: undefined };
  const script = fs.readFileSync(path.join(__dirname, '../scripts/worker.cjs'), 'utf8');
  const log = [];
  await vm.runInNewContext(script, {
    require: request => {
      if (request === './register-ts.cjs') return {};
      if (request === './worker-health.cjs') return { createWorkerHealth: async () => ({ succeeded() {}, failed() {}, async close() {} }) };
      if (request === '@next/env') return { loadEnvConfig: () => {} };
      if (request === '../lib/db/index.ts') return { closeDatabase: async () => { closes++; } };
      if (request === '../lib/ai/jobs.ts') return { runWorkerTick: async () => { ticks++; if (signal) handlers.SIGTERM(); if (fail) throw Error('private database error'); return { completed: 0 }; } };
      throw new Error('Unexpected worker dependency');
    },
    process: processMock, setTimeout, clearTimeout,
    console: { log: line => log.push(line), error: line => log.push(line) },
  });
  return { ticks, closes, exitCode: processMock.exitCode || 0, log: log.join('\n') };
}

test('worker --once closes connections and exits nonzero on a failed tick', async () => {
  assert.deepEqual({ ...(await workerRun({})), log: undefined }, { ticks: 1, closes: 1, exitCode: 0, log: undefined });
  const result = await workerRun({ fail: true });
  assert.equal(result.ticks, 1); assert.equal(result.closes, 1); assert.equal(result.exitCode, 1);
  assert.doesNotMatch(result.log, /private database error/);
});

test('worker drains a current tick and closes connections on shutdown, or a daemon failure', async () => {
  const stopped = await workerRun({ once: false, signal: true });
  assert.equal(stopped.ticks, 1); assert.equal(stopped.closes, 1); assert.equal(stopped.exitCode, 0);
  const failed = await workerRun({ once: false, fail: true });
  assert.equal(failed.ticks, 1); assert.equal(failed.closes, 1); assert.equal(failed.exitCode, 1);
});

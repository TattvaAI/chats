/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID, randomBytes } = require('node:crypto');
const { test } = require('node:test');
require('../scripts/register-ts.cjs');
const { drizzle } = require('drizzle-orm/postgres-js');
const { migrate } = require('drizzle-orm/postgres-js/migrator');
const postgres = require('postgres');
const { eq, sql } = require('drizzle-orm');
const schema = require('../lib/db/schema.ts');
const { hashToken } = require('../lib/auth/session.ts');
const realGemini = require('../lib/ai/gemini.ts');
const realAnalyzer = require('../lib/ai/analyzer.ts');
const nextServer = require('next/server');
const { analysisJobs, conversations, followups, profiles, reports, requestLimits, sessions } = schema;
let database = null;
let reportCalls = 0, followupCalls = 0;
const reportData = { headline: 'Synthetic verified fixture', grandMetaphor: { intro: 'Synthetic report.' } };
let reportProvider = async () => ({ data: reportData, live: true });
let followupProvider = async () => ({ text: 'A saved synthetic answer.', finishReason: 'stop' });
const load = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === '@/lib/db' || (request === './db' && parent?.filename.endsWith('/lib/requests.ts'))) return { get db() { return database; } };
  if ((request === '@/lib/ai/analyzer' || request === './analyzer') && (parent?.filename.endsWith('/lib/ai/jobs.ts') || parent?.filename.endsWith('/app/api/analyze/route.ts'))) {
    return { ...realAnalyzer, generateFrankFullReportFull: (...values) => { reportCalls++; return reportProvider(...values); }, previewFromReport: () => ({ headline: 'Synthetic fixture' }) };
  }
  if (request === '@/lib/ai/gemini') return { ...realGemini, getGeminiModel: () => ({ modelId: 'mock-only' }) };
  if (request === 'ai' && parent?.filename.endsWith('/app/api/interrogate/route.ts')) return { generateText: (...values) => { followupCalls++; return followupProvider(...values); } };
  if (request === 'next/server' && parent?.filename.includes('/app/api/')) return { ...nextServer, after: () => {} };
  return load.call(this, request, parent, ...args);
};
const analyze = require('../app/api/analyze/route.ts');
const jobRoute = require('../app/api/jobs/[id]/route.ts');
const interrogate = require('../app/api/interrogate/route.ts');
const { runAnalysisJob, runWorkerTick } = require('../lib/ai/jobs.ts');

const chatInput = (id = randomUUID()) => ({ conversationId: id, category: 'friend', myName: 'Alex', messages: Array.from({ length: 8 }, (_, index) => ({ sender: index % 2 ? 'Jo' : 'Alex', content: index % 2 ? 'Coffee sounds good!' : 'Can we meet on Saturday?', at: new Date(Date.UTC(2026, 8, 1, 10, index)).toISOString() })) });
const post = (route, body, headers = {}) => new nextServer.NextRequest(`https://frank.test${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const tokenHeaders = token => ({ 'x-conversation-token': token });
const count = async table => (await database.select({ count: sql`count(*)::int` }).from(table))[0].count;
const latch = () => {
  let resolve, reject, timer;
  const promise = new Promise((yes, no) => {
    resolve = value => { clearTimeout(timer); yes(value); };
    reject = error => { clearTimeout(timer); no(error); };
    timer = setTimeout(() => no(Error('A mocked provider checkpoint was not reached in time')), 20_000);
    timer.unref();
  });
  return { promise, resolve, reject };
};

async function seedJob(changes = {}) {
  const input = chatInput();
  const token = randomBytes(32).toString('hex');
  await database.insert(conversations).values({ id: input.conversationId, title: 'Synthetic fixture', category: 'friend', source: 'whatsapp', participants: ['Alex', 'Jo'], deleteToken: token, expiresAt: new Date('2099-01-01T00:00:00Z') });
  await database.insert(analysisJobs).values({ id: input.conversationId, conversationId: input.conversationId, payload: input, ...changes });
  return { id: input.conversationId, input, token };
}
async function seedReport(reportNumber = 1, existing) {
  const fixture = existing || await seedJob({ status: 'completed', payload: null });
  await database.insert(reports).values({ conversationId: fixture.id, reportNumber, previewData: {}, fullReportData: { fullReport: { headline: `Saved report ${reportNumber}` }, stats: { reportNumber }, reportLanguage: reportNumber === 1 ? 'en' : 'fr' }, isUnlocked: true });
  return fixture;
}
async function seedAccount() {
  const id = randomUUID(), token = randomBytes(32).toString('hex');
  await database.insert(profiles).values({ id, email: `${id}@example.invalid` });
  await database.insert(sessions).values({ token: hashToken(token), profileId: id, authVersion: 1, expiresAt: new Date(Date.now() + 86_400_000) });
  return { id, headers: { cookie: `frank_session=${token}` } };
}

// Opt in only with an explicitly selected disposable database. Every fixture and
// migration lives in a unique schema; normal npm test performs no database work.
test('isolated Postgres job, admission and follow-up reliability', { skip: !process.env.JOBS_TEST_DATABASE_FILE }, async t => {
  const file = path.resolve(process.env.JOBS_TEST_DATABASE_FILE);
  const url = fs.readFileSync(file, 'utf8').trim();
  assert.match(url, /^postgres(?:ql)?:\/\//);
  assert.notEqual(url, process.env.DATABASE_URL, 'The disposable test URL must differ from a configured primary database');
  const environment = { ...process.env };
  const namespace = `jobs_test_${randomUUID().replaceAll('-', '')}`;
  const client = postgres(url, { max: 5, prepare: false, connect_timeout: 10, onnotice: () => {}, connection: { options: `-c search_path=${namespace} -c statement_timeout=10000 -c lock_timeout=5000` } });
  database = drizzle(client, { schema });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('Network fetches are forbidden in mocked job tests'); };
  try {
    const [settings] = await database.execute(sql`SELECT current_setting('search_path') AS path`);
    assert.equal(settings.path, namespace, 'Schema isolation must be active before any fixture mutations');
    await database.execute(sql`CREATE SCHEMA ${sql.identifier(namespace)}`);
    const [location] = await database.execute(sql`SELECT current_schema() AS name`);
    assert.equal(location.name, namespace, 'Migrations must target only the disposable test schema');
    await migrate(database, { migrationsFolder: path.resolve(__dirname, '../drizzle'), migrationsSchema: namespace });
    const check = async (name, fn) => t.test(name, async () => {
      await database.execute(sql`TRUNCATE TABLE profiles, conversations, reports, analysis_jobs, followups, sessions, request_limits RESTART IDENTITY CASCADE`);
      Object.assign(process.env, { REQUIRE_AUTH: 'false', TRUSTED_PROXY: 'vercel', MAX_ACTIVE_JOBS: '50', MAX_CONCURRENT_JOBS: '2', MAX_DAILY_REPORTS: '1000', MAX_REPORTS_PER_IP: '100', MAX_REPORTS_PER_ACCOUNT: '20', MAX_DAILY_FOLLOWUPS: '1000', MAX_FOLLOWUPS_PER_IP: '100', MAX_FOLLOWUPS_PER_ACCOUNT: '100' });
      reportCalls = 0; followupCalls = 0;
      reportProvider = async () => ({ data: reportData, live: true });
      followupProvider = async () => ({ text: 'A saved synthetic answer.', finishReason: 'stop' });
      await fn();
    });

    await check('concurrent guest replay creates one durable job and returns the premade capability', async () => {
      const input = chatInput(), token = randomBytes(32).toString('hex');
      const request = () => post('/api/analyze', input, tokenHeaders(token));
      const responses = await Promise.all([analyze.POST(request()), analyze.POST(request())]);
      assert.deepEqual(responses.map(response => response.status), [202, 202]);
      for (const response of responses) assert.equal((await response.json()).deleteToken, token);
      assert.equal(await count(conversations), 1); assert.equal(await count(analysisJobs), 1);
      assert.deepEqual((await database.select({ count: requestLimits.count }).from(requestLimits)).map(row => row.count), [1, 1]);
      const denied = await analyze.POST(post('/api/analyze', input, tokenHeaders('b'.repeat(64))));
      assert.equal(denied.status, 404); assert.equal(reportCalls, 0);
      assert.equal((await analyze.POST(post('/api/analyze', chatInput()))).status, 400);
    });

    await check('required auth and account ownership exclude guest tokens', async () => {
      process.env.REQUIRE_AUTH = 'true';
      const input = chatInput();
      assert.equal((await analyze.POST(post('/api/analyze', input, tokenHeaders('a'.repeat(64))))).status, 401);
      const account = await seedAccount();
      assert.equal((await analyze.POST(post('/api/analyze', input, { ...account.headers, ...tokenHeaders('a'.repeat(64)) }))).status, 202);
      const [conversation] = await database.select().from(conversations);
      assert.equal(conversation.userId, account.id); assert.equal(conversation.deleteToken, null);
      const other = await seedAccount();
      assert.equal((await analyze.POST(post('/api/analyze', input, other.headers))).status, 404);
    });

    await check('capacity and per-account cost limits hold across simultaneous requests and changed IPs', async () => {
      process.env.MAX_ACTIVE_JOBS = '1';
      const responses = await Promise.all([1, 2].map(() => analyze.POST(post('/api/analyze', chatInput(), tokenHeaders(randomBytes(32).toString('hex'))))));
      assert.deepEqual(responses.map(response => response.status).sort(), [202, 429]);
      assert.ok(responses.find(response => response.status === 429).headers.get('retry-after'));
      await database.delete(conversations); await database.delete(requestLimits);
      process.env.MAX_ACTIVE_JOBS = '50'; process.env.MAX_REPORTS_PER_ACCOUNT = '1';
      const account = await seedAccount();
      assert.equal((await analyze.POST(post('/api/analyze', chatInput(), { ...account.headers, 'x-vercel-forwarded-for': '203.0.113.1' }))).status, 202);
      assert.equal((await analyze.POST(post('/api/analyze', chatInput(), { ...account.headers, 'x-vercel-forwarded-for': '203.0.113.2' }))).status, 429);
      await database.delete(conversations);
      assert.equal((await analyze.POST(post('/api/analyze', chatInput(), { ...account.headers, 'x-vercel-forwarded-for': '203.0.113.3' }))).status, 429);
    });

    await check('simultaneous runners make one provider call and one committed report', async () => {
      const fixture = await seedJob(), started = latch(), release = latch();
      reportProvider = async () => { started.resolve(); await release.promise; return { data: reportData, live: true }; };
      const running = runAnalysisJob(fixture.id);
      await started.promise;
      assert.equal((await runAnalysisJob(fixture.id)).status, 'skipped');
      release.resolve();
      assert.equal((await running).status, 'completed');
      assert.equal(reportCalls, 1); assert.equal(await count(reports), 1);
      const [job] = await database.select().from(analysisJobs);
      assert.equal(job.status, 'completed'); assert.equal(job.attempts, 1); assert.equal(job.payload, null); assert.equal(job.leaseId, null);
      await runAnalysisJob(fixture.id); assert.equal(reportCalls, 1);
    });

    await check('only transient failures retry, with backoff and at most two paid attempts', async () => {
      const fixture = await seedJob();
      reportProvider = async () => { throw new realGemini.AIServiceError('AI_RATE_LIMITED', 'Try later.', 429); };
      assert.equal((await runAnalysisJob(fixture.id)).status, 'queued');
      assert.equal((await runAnalysisJob(fixture.id)).status, 'skipped');
      assert.equal(reportCalls, 1);
      await database.update(analysisJobs).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(analysisJobs.id, fixture.id));
      assert.equal((await runAnalysisJob(fixture.id)).status, 'failed');
      const [job] = await database.select().from(analysisJobs);
      assert.equal(job.attempts, 2); assert.equal(job.payload, null);
      await runAnalysisJob(fixture.id); assert.equal(reportCalls, 2);
    });

    await check('unknown generation failures are terminal and never expose private provider errors', async () => {
      const fixture = await seedJob();
      reportProvider = async () => { throw Error('private transcript in provider failure'); };
      assert.equal((await runAnalysisJob(fixture.id)).status, 'failed');
      const [job] = await database.select().from(analysisJobs);
      assert.equal(job.attempts, 1); assert.equal(job.payload, null); assert.equal(job.errorCode, 'AI_FAILED');
      assert.doesNotMatch(job.errorMessage, /private transcript/);
    });

    await check('worker cleans old payloads and exhausted leases without any polling browser', async () => {
      const expired = await seedJob({ createdAt: new Date(Date.now() - 86_400_001) });
      const exhausted = await seedJob({ status: 'running', attempts: 2, leaseId: randomUUID(), leaseUntil: new Date(Date.now() - 1000) });
      const missing = await seedJob({ status: 'completed', payload: null });
      const completed = await seedReport();
      await database.update(analysisJobs).set({ payload: chatInput(completed.id), status: 'failed' }).where(eq(analysisJobs.id, completed.id));
      await database.insert(followups).values({ id: randomUUID(), conversationId: completed.id, question: 'Synthetic pending question', updatedAt: new Date(Date.now() - 100_000) });
      await database.insert(requestLimits).values({ key: 'old-test-bucket', count: 1, expiresAt: new Date(Date.now() - 86_400_001) });
      const stats = await runWorkerTick();
      assert.equal(stats.expired, 1); assert.equal(stats.failed, 2); assert.equal(stats.recovered, 1); assert.equal(stats.staleFollowups, 1);
      assert.equal(reportCalls, 0); assert.equal(await count(requestLimits), 0);
      for (const id of [expired.id, exhausted.id, missing.id]) {
        const [job] = await database.select().from(analysisJobs).where(eq(analysisJobs.id, id)); assert.equal(job.status, 'failed'); assert.equal(job.payload, null);
      }
      const [job] = await database.select().from(analysisJobs).where(eq(analysisJobs.id, completed.id)); assert.equal(job.status, 'completed'); assert.equal(job.payload, null);
    });

    await check('worker reclaims an interrupted first attempt and completes the durable queue', async () => {
      const fixture = await seedJob({ status: 'running', attempts: 1, leaseId: randomUUID(), leaseUntil: new Date(Date.now() - 1000) });
      const result = await runWorkerTick();
      assert.equal(result.requeued, 1); assert.equal(result.completed, 1); assert.equal(reportCalls, 1);
      const [job] = await database.select().from(analysisJobs).where(eq(analysisJobs.id, fixture.id)); assert.equal(job.attempts, 2); assert.equal(job.payload, null);
    });

    await check('stale generation cannot overwrite another lease or revive a deleted conversation', async () => {
      const fixture = await seedJob(), started = latch(), release = latch();
      reportProvider = async () => { started.resolve(); await release.promise; return { data: reportData, live: true }; };
      const running = runAnalysisJob(fixture.id); await started.promise;
      const replacement = randomUUID();
      await database.update(analysisJobs).set({ leaseId: replacement, attempts: 2, leaseUntil: new Date(Date.now() + 270_000) }).where(eq(analysisJobs.id, fixture.id));
      release.resolve(); assert.equal((await running).status, 'skipped'); assert.equal(await count(reports), 0);
      const [job] = await database.select().from(analysisJobs); assert.equal(job.leaseId, replacement);
      await database.delete(conversations);
      const second = await seedJob(), startedAgain = latch(), releaseAgain = latch();
      reportProvider = async () => { startedAgain.resolve(); await releaseAgain.promise; return { data: reportData, live: true }; };
      const deletedRun = runAnalysisJob(second.id); await startedAgain.promise;
      await database.delete(conversations).where(eq(conversations.id, second.id));
      releaseAgain.resolve(); assert.equal((await deletedRun).status, 'skipped'); assert.equal(await count(reports), 0); assert.equal(await count(analysisJobs), 0);
    });

    await check('a failed database commit retries persistence without a second provider call', async () => {
      await database.execute(sql`CREATE SEQUENCE report_commit_attempt START 1`);
      await database.execute(sql`CREATE FUNCTION fail_first_report_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('report_commit_attempt') = 1 THEN RAISE EXCEPTION 'synthetic temporary persistence failure'; END IF; RETURN NEW; END $$`);
      await database.execute(sql`CREATE TRIGGER fail_first_report BEFORE INSERT ON reports FOR EACH ROW EXECUTE FUNCTION fail_first_report_insert()`);
      try {
        const fixture = await seedJob();
        assert.equal((await runAnalysisJob(fixture.id)).status, 'completed');
        assert.equal(reportCalls, 1); assert.equal(await count(reports), 1);
        const [attempt] = await database.execute(sql`SELECT last_value FROM report_commit_attempt`); assert.equal(Number(attempt.last_value), 2);
      } finally {
        await database.execute(sql`DROP TRIGGER fail_first_report ON reports`);
        await database.execute(sql`DROP FUNCTION fail_first_report_insert()`);
        await database.execute(sql`DROP SEQUENCE report_commit_attempt`);
      }
    });

    await check('job status never fabricates a completed report', async () => {
      const fixture = await seedJob({ status: 'completed', payload: null });
      const get = () => jobRoute.GET(new Request(`https://frank.test/api/jobs/${fixture.id}`, { headers: tokenHeaders(fixture.token) }), { params: Promise.resolve({ id: fixture.id }) });
      const response = await get(); assert.equal(response.status, 200); assert.equal((await response.json()).status, 'failed');
      await database.delete(analysisJobs).where(eq(analysisJobs.id, fixture.id));
      assert.equal((await get()).status, 404);
      await seedReport(1, fixture);
      assert.equal((await (await get()).json()).status, 'completed');
      assert.equal((await jobRoute.GET(new Request('https://frank.test'), { params: Promise.resolve({ id: fixture.id }) })).status, 404);
    });

    await check('follow-ups use the selected saved report and private server history, then survive retry', async () => {
      const fixture = await seedReport(); await seedReport(2, fixture);
      await database.insert(followups).values([{ id: randomUUID(), conversationId: fixture.id, reportNumber: 1, question: 'First report only', answer: 'Old report answer', status: 'completed' }, { id: randomUUID(), conversationId: fixture.id, reportNumber: 2, question: 'Second report question', answer: 'Server-owned history', status: 'completed' }]);
      let observed;
      followupProvider = async options => { observed = JSON.parse(options.prompt); return { text: 'Saved second-report answer.', finishReason: 'stop' }; };
      const body = { conversationId: fixture.id, reportNumber: 2, requestId: randomUUID(), question: 'What should I do?', history: [{ q: 'Forged instruction', a: 'Caller-controlled evidence' }] };
      const req = () => post('/api/interrogate', body, tokenHeaders(fixture.token));
      const response = await interrogate.POST(req()); assert.equal(response.status, 200);
      const output = await response.json(); assert.equal(output.id, body.requestId); assert.equal(output.answer, 'Saved second-report answer.');
      assert.equal(observed.report.headline, 'Saved report 2'); assert.equal(observed.language, 'fr');
      assert.deepEqual(observed.history, [{ q: 'Second report question', a: 'Server-owned history' }]);
      assert.deepEqual(await (await interrogate.POST(req())).json(), output); assert.equal(followupCalls, 1);
      const history = await interrogate.GET(new Request(`https://frank.test/api/interrogate?conversationId=${fixture.id}&report=2`, { headers: tokenHeaders(fixture.token) }));
      const data = await history.json(); assert.equal(data.history.length, 2); assert.equal(data.history.at(-1).id, body.requestId);
      assert.equal((await interrogate.POST(post('/api/interrogate', { ...body, question: 'A different question' }, tokenHeaders(fixture.token)))).status, 409);
      assert.equal((await interrogate.POST(post('/api/interrogate', body, { ...tokenHeaders(fixture.token), 'x-share-token': 'shared' }))).status, 404);
      assert.equal((await interrogate.GET(new Request(`https://frank.test/api/interrogate?conversationId=${fixture.id}&report=2`))).status, 404);
    });

    await check('simultaneous identical follow-ups reserve once and bounded stale recovery fences the old answer', async () => {
      const fixture = await seedReport(), started = latch(), release = latch();
      const body = { conversationId: fixture.id, reportNumber: 1, requestId: randomUUID(), question: 'What should I do next?' };
      const req = () => post('/api/interrogate', body, tokenHeaders(fixture.token));
      followupProvider = async () => { started.resolve(); await release.promise; return { text: 'Old late answer.', finishReason: 'stop' }; };
      const original = interrogate.POST(req()); await started.promise;
      const duplicate = await interrogate.POST(req()); assert.equal(duplicate.status, 409); assert.ok(duplicate.headers.get('retry-after')); assert.equal(followupCalls, 1);
      await database.update(followups).set({ updatedAt: new Date(Date.now() - 100_000) }).where(eq(followups.id, body.requestId));
      followupProvider = async () => ({ text: 'New recovered answer.', finishReason: 'stop' });
      const recovered = await interrogate.POST(req()); assert.equal(recovered.status, 200); assert.equal((await recovered.json()).answer, 'New recovered answer.');
      release.resolve(); const stale = await original; assert.equal(stale.status, 200); assert.equal((await stale.json()).answer, 'New recovered answer.');
      assert.equal(followupCalls, 2); const [stored] = await database.select().from(followups); assert.equal(stored.answer, 'New recovered answer.');
    });

    await check('failed and empty follow-ups remain retryable and never return unsaved fabricated answers', async () => {
      const fixture = await seedReport();
      const body = { conversationId: fixture.id, reportNumber: 1, requestId: randomUUID(), question: 'Can you explain?' };
      const req = () => post('/api/interrogate', body, tokenHeaders(fixture.token));
      followupProvider = async () => ({ text: '', finishReason: 'stop' });
      assert.equal((await interrogate.POST(req())).status, 502);
      let [row] = await database.select().from(followups); assert.equal(row.status, 'failed'); assert.equal(row.answer, null);
      followupProvider = async () => ({ text: 'The retry is saved.', finishReason: 'stop' });
      assert.equal((await interrogate.POST(req())).status, 200);
      [row] = await database.select().from(followups); assert.equal(row.status, 'completed'); assert.equal(row.answer, 'The retry is saved.');
      assert.equal(followupCalls, 2);
    });

    await check('follow-up limits count paid attempts while completed retries remain available', async () => {
      const fixture = await seedReport(); process.env.MAX_FOLLOWUPS_PER_ACCOUNT = '1';
      const body = { conversationId: fixture.id, reportNumber: 1, requestId: randomUUID(), question: 'Can you explain?' };
      const response = await interrogate.POST(post('/api/interrogate', body, tokenHeaders(fixture.token))); assert.equal(response.status, 200);
      assert.equal((await interrogate.POST(post('/api/interrogate', { ...body, requestId: randomUUID() }, tokenHeaders(fixture.token)))).status, 429);
      assert.equal((await interrogate.POST(post('/api/interrogate', body, tokenHeaders(fixture.token)))).status, 200); assert.equal(followupCalls, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key]; Object.assign(process.env, environment);
    try { await database.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(namespace)} CASCADE`); } finally { await client.end({ timeout: 5 }); database = null; }
  }
});

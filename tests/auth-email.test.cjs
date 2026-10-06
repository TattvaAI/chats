/* eslint-disable @typescript-eslint/no-require-imports */
require('../scripts/register-ts.cjs');
const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { randomUUID } = require('node:crypto');
const Module = require('node:module');
const { getTableColumns, getTableName } = require('drizzle-orm');
const { PgDialect } = require('drizzle-orm/pg-core');
const schema = require('../lib/db/schema.ts');
const owner = { id: randomUUID(), email: 'verified@example.invalid' };
const other = { id: randomUUID(), email: 'other@example.invalid' };
const conversationId = randomUUID();
const conversations = [{ id: conversationId, userId: owner.id }];
const reports = [2, 7].map(reportNumber => ({ id: randomUUID(), conversationId, reportNumber }));
let viewer, database, requestsMock, limits, queries, quotaError, storageError;

// Evaluate the actual generated equality predicates: dropping the owner condition
// would return the private row and fail the cross-account regression below.
function createDatabase() {
  return { select(fields) {
    assert.ok(fields, 'Metadata queries must explicitly select fields');
    let table, condition, ordering = [];
    return {
      from(value) { table = value; return this; },
      where(value) { condition = value; return this; },
      orderBy(...values) { ordering = values; return this; },
      async limit(count) {
        if (storageError) throw storageError;
        const columns = Object.fromEntries(Object.entries(getTableColumns(table)).map(([key, column]) => [column.name, key]));
        const tableName = getTableName(table);
        queries.push({ table: tableName, fields: Object.keys(fields) });
        let rows = table === schema.conversations ? [...conversations] : [...reports];
        if (condition) {
          const compiled = new PgDialect().sqlToQuery(condition);
          for (const match of compiled.sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)) {
            rows = rows.filter(row => row[columns[match[1]]] === compiled.params[Number(match[2]) - 1]);
          }
        }
        if (ordering.length) rows.sort((a, b) => b.reportNumber - a.reportNumber);
        return rows.slice(0, count).map(row => Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, row[columns[column.name]]])));
      },
    };
  } };
}
const load = Module._load;
Module._load = function(request, parent, ...args) {
  if (request === '@/lib/db' || (request === './db' && parent.filename.endsWith('/lib/requests.ts'))) return { get db() { return database; } };
  if (request === '@/lib/auth/access') return { currentProfile: async () => viewer, trustedOrigin: () => 'https://frank.example' };
  if (request === '@/lib/requests' && requestsMock) return requestsMock;
  return load.call(this, request, parent, ...args);
};
const realRequests = require('../lib/requests.ts');
requestsMock = { ...realRequests, rateLimit: async (_req, scope, limit, windowMs, options) => {
  limits.push({ scope, limit, windowMs, options });
  if (quotaError && scope === quotaError.scope) throw new realRequests.RequestError('Too many requests. Please try again later.', 429, 90);
} };
const route = require('../app/api/send-report-email/route.ts');
const request = (body = { conversationId }, headers = {}) => new Request('https://frank.example/api/send-report-email', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
let environment;
beforeEach(() => {
  environment = { ...process.env };
  process.env.RESEND_API_KEY = 'test-resend-secret'; process.env.EMAIL_FROM = 'reports@frank.example';
  viewer = owner; database = createDatabase(); limits = []; queries = []; quotaError = null; storageError = null;
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
});

test('report email sends only the verified owner a private latest-report link with bounded fetch and three quotas', async (t) => {
  let cancelled = false;
  const actualTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeout = t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 15_000); return actualTimeout(milliseconds);
  });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store'); assert.ok(options.signal);
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer test-resend-secret');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.to, [owner.email]);
    assert.equal(body.text, `Your private report is ready. Sign in to read it:\nhttps://frank.example/c/${conversationId}/reports/7`);
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 200 });
  });
  const response = await route.POST(request({ conversationId, email: 'attacker@example.invalid' }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { delivered: true });
  assert.equal(cancelled, true); assert.equal(timeout.mock.callCount(), 1);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.deepEqual(queries, [{ table: 'conversations', fields: ['id'] }, { table: 'reports', fields: ['id', 'reportNumber'] }]);
  assert.deepEqual(limits.map(item => item.scope), ['report-email', 'report-email-account', 'report-email-global']);
  assert.equal(limits[0].options, undefined); assert.equal(limits[1].options.identity, `account:${owner.id}`);
  assert.equal(limits[2].options.identity, 'global');
  for (const limit of limits) assert.ok(Number.isSafeInteger(limit.limit) && limit.limit > 0 && limit.limit <= 1000);
});

test('an explicit report number selects that stored report and nonexistent versions cannot send mail', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.ok(JSON.parse(options.body).text.endsWith('/reports/2')); return new Response(null, { status: 200 });
  });
  assert.equal((await route.POST(request({ conversationId, reportNumber: 2 }))).status, 200);
  assert.equal((await route.POST(request({ conversationId, reportNumber: 3 }))).status, 404);
  assert.equal(fetch.mock.callCount(), 1);
});

test('anonymous visitors, other accounts and stale guest tokens cannot email someone else’s report', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected provider call'); });
  viewer = null;
  assert.equal((await route.POST(request())).status, 401); assert.equal(queries.length, 0);
  viewer = other;
  assert.equal((await route.POST(request(undefined, { 'x-conversation-token': 'a'.repeat(64) }))).status, 404);
  assert.equal(fetch.mock.callCount(), 0); assert.equal(limits.length, 0);
});

test('shared mode remains read-only even when the browser also has an owner session', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected provider call'); });
  const response = await route.POST(request(undefined, { 'x-share-token': 'b'.repeat(64), cookie: 'frank_session=owner-cookie' }));
  assert.equal(response.status, 404); assert.equal(fetch.mock.callCount(), 0);
  assert.equal(queries.length, 0); assert.equal(limits.length, 0);
});

test('malformed IDs and report versions are client errors without any provider call', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected provider call'); });
  for (const body of [{ conversationId: 'bad' }, { conversationId, reportNumber: -1 }, { conversationId, reportNumber: 1.5 }, { conversationId, reportNumber: '2' }, { conversationId, reportNumber: 2_147_483_648 }]) {
    assert.equal((await route.POST(request(body))).status, 400);
  }
  assert.equal(fetch.mock.callCount(), 0); assert.equal(queries.length, 0);
});

test('provider timeout and redirect failures return safe errors without claiming delivery', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('private timeout detail', 'TimeoutError'); });
  let response = await route.POST(request());
  assert.equal(response.status, 504); assert.equal((await response.text()).includes('private timeout detail'), false);
  fetch.mock.mockImplementation(async () => { throw new Error('private redirect detail'); });
  response = await route.POST(request());
  assert.equal(response.status, 502); assert.equal((await response.text()).includes('private redirect detail'), false);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('HTTP provider rejection discards its body and never exposes provider data', async (t) => {
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('private provider response')); },
    cancel() { cancelled = true; },
  }), { status: 503 }));
  const response = await route.POST(request());
  assert.equal(response.status, 502); assert.equal(cancelled, true);
  const body = await response.json(); assert.equal(body.delivered, undefined); assert.equal(JSON.stringify(body).includes('private provider response'), false);
});

test('IP, account and global quota denials stop delivery and include a retry time', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected provider call'); });
  for (const scope of ['report-email', 'report-email-account', 'report-email-global']) {
    quotaError = { scope };
    const response = await route.POST(request());
    assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '90');
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('missing provider configuration and storage errors remain private and do not spend delivery quota', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected provider call'); });
  const logger = t.mock.method(console, 'error', () => {});
  delete process.env.RESEND_API_KEY;
  assert.equal((await route.POST(request())).status, 503);
  process.env.RESEND_API_KEY = 'test-resend-secret'; storageError = new Error('private SQL parameter');
  const response = await route.POST(request());
  assert.equal(response.status, 503); assert.equal((await response.text()).includes('private SQL parameter'), false);
  assert.equal(fetch.mock.callCount(), 0); assert.equal(limits.length, 0); assert.equal(logger.mock.callCount(), 0);
});

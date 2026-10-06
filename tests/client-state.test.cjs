/* eslint-disable @typescript-eslint/no-require-imports */
require('../scripts/register-ts.cjs');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const {
  BrowserStorageError, clearGuestCapabilities, clearLoginIntent, conversationHeaders, createGuestCapability,
  localClaims, migrateLegacyStorage, readLoginIntent, readShareToken, removeGuestCapability, reportHref,
  safeDestination, saveGuestCapability, saveLoginIntent,
} = require('../lib/store/access.ts');
const { cleanName, useChatStore } = require('../lib/store/useChatStore.ts');
const { fetchReportRecord } = require('../lib/hooks/report-client.ts');
const { announceSessionChange, refreshSession, useSessionState } = require('../lib/hooks/useSession.ts');

const ID = '12345678-1234-4234-8234-123456789abc';
const SECOND_ID = '12345678-1234-4234-8234-123456789def';
const TOKEN = 'a'.repeat(64);
class MemoryStorage {
  data = new Map();
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
  clear() { this.data.clear(); }
}
const realFetch = global.fetch;
const realWindow = global.window;
const realCrypto = global.crypto;
beforeEach(() => {
  global.window = { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage(), location: { hash: '' } };
  Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true });
  useChatStore.getState().reset();
});
afterEach(() => {
  global.fetch = realFetch;
  global.window = realWindow;
  Object.defineProperty(global, 'crypto', { value: realCrypto, configurable: true });
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const report = (number = 3) => ({ conversationId: ID, reportNumber: number, conversation: { title: 'Saved server title', category: 'friend', source: 'whatsapp' }, fullReport: { headline: 'Saved server result' }, stats: null, detailedStats: null, shared: false, savedToAccount: true, reportLanguage: 'fr', myName: 'Reader', availableReports: [{ reportNumber: number, createdAt: '2026-01-01T00:00:00Z' }] });

test('legacy report migration preserves only the guest capability and removes private indexes', () => {
  const storage = window.localStorage;
  storage.setItem(`frank:conv:${ID}`, JSON.stringify({ conversationId: ID, deleteToken: TOKEN, fullReport: { headline: 'secret report' }, stats: { names: ['private person'] }, email: 'private@example.com', userNote: 'private note' }));
  storage.setItem('brandon:reports_index', JSON.stringify([{ id: ID, title: 'private title' }]));
  storage.setItem(`brandon:conv:${SECOND_ID}`, JSON.stringify({ fullReport: { headline: 'unowned private report' } }));
  migrateLegacyStorage();
  assert.deepEqual(localClaims(), [{ id: ID, token: TOKEN }]);
  assert.equal(storage.length, 1);
  assert.deepEqual(JSON.parse(storage.getItem(`frank:guest:${ID}`)), { conversationId: ID, token: TOKEN });
  assert.equal([...storage.data.values()].join('').includes('secret'), false);
  assert.equal(storage.getItem(`brandon:conv:${SECOND_ID}`), null);
});

test('new guest storage contains only the UUID and a cryptographic capability', () => {
  const capability = createGuestCapability();
  assert.match(capability, /^[a-f0-9]{64}$/);
  assert.notEqual(capability, createGuestCapability());
  saveGuestCapability(ID, capability);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(`frank:guest:${ID}`)), { conversationId: ID, token: capability });
  assert.throws(() => saveGuestCapability(ID, 'weak'), /secure report identity/);
  removeGuestCapability(ID);
  assert.deepEqual(localClaims(), []);
});

test('blocked guest storage is actionable while account requests can rely on their session', () => {
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  assert.throws(() => saveGuestCapability(ID, TOKEN), BrowserStorageError);
  assert.throws(() => localClaims(), BrowserStorageError);
  assert.deepEqual(conversationHeaders(ID, null), {});
});

test('a share link takes priority over guest access and invalid shares cannot fall back to private access', () => {
  saveGuestCapability(ID, TOKEN);
  window.location.hash = '#share=' + 's'.repeat(64);
  assert.deepEqual(conversationHeaders(ID), { 'x-share-token': 's'.repeat(64) });
  assert.deepEqual(conversationHeaders(ID, null), { 'x-conversation-token': TOKEN });
  window.location.hash = '#share=';
  assert.equal(readShareToken(), 'invalid-share-token');
  assert.deepEqual(conversationHeaders(ID), { 'x-share-token': 'invalid-share-token' });
  assert.equal(reportHref(ID, '/stats?report=3', 's'.repeat(64)), `/c/${ID}/stats?report=3#share=${'s'.repeat(64)}`);
});

test('duplicated or conflicting share fragments cannot fall back to guest or account access', () => {
  saveGuestCapability(ID, TOKEN);
  const first = 'a'.repeat(64), second = 'b'.repeat(64);
  for (const fragment of [`#share=${first}#share=${first}`, `#share=${first}#share=${second}`, `#share=${first}&share=${first}`, `#share=${first}&share=${second}`]) {
    window.location.hash = fragment;
    assert.equal(readShareToken(), 'invalid-share-token');
    assert.deepEqual(conversationHeaders(ID), { 'x-share-token': 'invalid-share-token' });
  }
});

test('login intent stores explicit IDs and destination, never credentials or report contents', () => {
  saveGuestCapability(ID, TOKEN);
  saveLoginIntent([ID, ID, 'invalid'], `/c/${ID}`);
  const intent = readLoginIntent();
  assert.deepEqual(intent.ids, [ID]);
  assert.equal(intent.next, `/c/${ID}`);
  assert.equal(window.sessionStorage.getItem('frank:login-intent').includes(TOKEN), false);
  assert.deepEqual(Object.keys(intent).sort(), ['createdAt', 'ids', 'next']);
  clearLoginIntent();
  assert.equal(readLoginIntent(), null);
});

test('unsafe or looping sign-in destinations are rejected and relative report links are preserved', () => {
  for (const value of ['https://other.example/', '//other.example', '/\\other.example', 'javascript:alert(1)', '/login/complete?next=/login', '/login', '/hello\nworld']) assert.equal(safeDestination(value), '/account');
  assert.equal(safeDestination(`/c/${ID}/reports/3#share=xyz`), `/c/${ID}/reports/3#share=xyz`);
});

test('draft reset removes names, notes, old identities and language on a new upload', () => {
  const store = useChatStore.getState();
  store.setConversationId(ID); store.setDeleteToken(TOKEN); store.setUserNote('private note'); store.setMyName('Alice'); store.setReportLanguage('es');
  store.setNameMap({ Alice: 'A' });
  store.setCategory('friend');
  store.setUploadedChat('new.txt', 'new transcript');
  const next = useChatStore.getState();
  assert.equal(next.conversationId, ''); assert.equal(next.deleteToken, null); assert.equal(next.myName, '');
  assert.equal(next.userNote, ''); assert.equal(next.reportLanguage, 'en'); assert.deepEqual(next.nameMap, {});
  assert.equal(next.category, 'friend'); assert.equal(next.rawText, 'new transcript');
  assert.equal(window.localStorage.length, 0);
  next.reset(); assert.equal(useChatStore.getState().rawText, '');
});

test('participant names cannot read or overwrite inherited object properties', () => {
  for (const name of ['toString', '__proto__', 'constructor']) assert.equal(cleanName(name, {}), name);
  const names = Object.fromEntries([['__proto__', 'Alex'], ['toString', 'Jo']]);
  assert.equal(cleanName('__proto__', names), 'Alex'); assert.equal(cleanName('toString', names), 'Jo');
  useChatStore.getState().setNameAlias('__proto__', 'Reader');
  assert.equal(useChatStore.getState().cleanName('__proto__'), 'Reader');
  assert.equal({}.polluted, undefined);
});

test('report reads always fetch authorized server metadata with no-store and the requested report number', async () => {
  window.localStorage.setItem(`frank:conv:${ID}`, JSON.stringify({ deleteToken: TOKEN, fullReport: { headline: 'stale secret' } }));
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return json(report()); };
  const result = await fetchReportRecord(ID, '3', null);
  assert.equal(result.status, 'found'); assert.equal(result.data.fullReport.headline, 'Saved server result');
  assert.equal(result.data.reportLanguage, 'fr'); assert.equal(result.data.myName, 'Reader');
  assert.equal(calls.length, 1); assert.equal(calls[0].url, `/api/conversations/${ID}?report=3`);
  assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.headers['x-conversation-token'], TOKEN);
  assert.equal(window.localStorage.getItem(`frank:conv:${ID}`), null);
});

test('different report numbers and malformed saved results cannot render as the requested report', async () => {
  global.fetch = async () => json(report(1));
  assert.equal((await fetchReportRecord(ID, '3', null)).status, 'error');
  global.fetch = async () => json({ ...report(), fullReport: { headline: '' } });
  assert.equal((await fetchReportRecord(ID, '3', null)).status, 'error');
  global.fetch = async () => json({ ...report(), fullReport: { headline: 'Saved title', realTimeReactions: 'malformed collection' } });
  assert.equal((await fetchReportRecord(ID, '3', null)).status, 'error');
});

test('revoked shared links never query owner job status or show locally saved contents', async () => {
  saveGuestCapability(ID, TOKEN);
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return json({ error: 'Revoked' }, 404); };
  const result = await fetchReportRecord(ID, '3', 's'.repeat(64));
  assert.equal(result.status, 'missing'); assert.equal(result.data, null); assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers['x-conversation-token'], undefined);
  assert.match(result.message, /expired or been revoked/);
});

test('shared viewing stays read-only even if the server recognizes the signed-in owner', async () => {
  global.fetch = async () => json(report());
  const result = await fetchReportRecord(ID, undefined, 's'.repeat(64));
  assert.equal(result.data.shared, true);
});

test('queued, running and failed reports use the actual durable job result', async () => {
  for (const status of ['queued', 'running', 'failed']) {
    global.fetch = async url => url.includes('/api/jobs/') ? json({ status, stage: 'Analyzing saved text', error: 'Provider temporarily unavailable' }) : json({}, 404);
    const result = await fetchReportRecord(ID, undefined, null);
    assert.equal(result.status, status); assert.equal(result.data, null);
    assert.equal(result.message, status === 'failed' ? 'Provider temporarily unavailable' : 'Analyzing saved text');
  }
});

test('storage outages remain retryable errors instead of fake missing reports', async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; return json({ error: 'Storage unavailable' }, 503); };
  const result = await fetchReportRecord(ID, undefined, null);
  assert.equal(result.status, 'error'); assert.equal(result.data, null); assert.equal(result.message, 'Storage unavailable'); assert.equal(calls, 1);
});

test('malformed report URLs never trigger a private lookup', async () => {
  global.fetch = async () => { assert.fail('invalid IDs and report numbers must not reach fetch'); };
  assert.equal((await fetchReportRecord('../../elsewhere', undefined, null)).status, 'missing');
  assert.equal((await fetchReportRecord(ID, '0', null)).status, 'missing');
  assert.equal((await fetchReportRecord(ID, '9007199254740992', null)).status, 'missing');
});

test('an old session response cannot restore private account state after a session change', async () => {
  let finishJson;
  global.fetch = async () => ({ ok: true, status: 200, json: () => new Promise(resolve => { finishJson = resolve; }) });
  const first = refreshSession();
  await Promise.resolve();
  announceSessionChange();
  useSessionState.setState({ profile: null, status: 'guest' });
  finishJson({ id: 'old-user', email: 'old@example.com' });
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(useSessionState.getState().profile, null);
  assert.equal(useSessionState.getState().status, 'guest');
});

test('clearing browser access removes all report capabilities and explicit save intent', () => {
  saveGuestCapability(ID, TOKEN); saveGuestCapability(SECOND_ID, 'b'.repeat(64)); saveLoginIntent([ID], '/account');
  clearGuestCapabilities();
  assert.deepEqual(localClaims(), []); assert.equal(readLoginIntent(), null);
});

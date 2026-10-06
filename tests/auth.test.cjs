/* eslint-disable @typescript-eslint/no-require-imports */
require('../scripts/register-ts.cjs');
const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { createHash, randomUUID } = require('node:crypto');
const Module = require('node:module');
const load = Module._load;
Module._load = function(request, parent, ...args) {
  if (request === '@/lib/db' || (request === './db' && parent.filename.endsWith('/lib/requests.ts'))) return { db: null };
  return load.call(this, request, parent, ...args);
};
const { NextRequest } = require('next/server');
const { currentProfile, equalSecret, ownsConversationWithIdentity, requireAuthentication, safeNext, trustedOrigin } = require('../lib/auth/access.ts');
const { createSession, getSessionRawToken, hashToken, SESSION_COOKIE } = require('../lib/auth/session.ts');
const { createGoogleState, exchangeGoogleIdentity, verifyGoogleState } = require('../lib/auth/google.ts');
const { conversationPagination, encodeConversationCursor } = require('../lib/auth/pagination.ts');
const config = require('../app/api/auth/config/route.ts');
const me = require('../app/api/auth/me/route.ts');
const logout = require('../app/api/auth/logout/route.ts');
const google = require('../app/api/auth/google/route.ts');
const callback = require('../app/api/auth/callback/google/route.ts');
const conversation = require('../app/api/conversations/[id]/route.ts');
let environment;
beforeEach(() => {
  environment = { ...process.env };
  process.env.APP_URL = 'https://frank.example';
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.NODE_ENV = 'production';
  delete process.env.REQUIRE_AUTH;
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
});

test('production authentication defaults on and only explicit booleans override it', async () => {
  assert.equal(requireAuthentication(), true);
  process.env.REQUIRE_AUTH = 'false'; assert.equal(requireAuthentication(), false);
  process.env.REQUIRE_AUTH = '0'; assert.equal(requireAuthentication(), true);
  process.env.NODE_ENV = 'development'; assert.equal(requireAuthentication(), false);
  process.env.REQUIRE_AUTH = 'true'; assert.equal(requireAuthentication(), true);
  const response = config.GET();
  assert.deepEqual(await response.json(), { google: true, email: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM), requireAuth: true });
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('redirects remain on the configured origin and reject encoded controls and protocol-relative paths', () => {
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/%5Cevil.example', '/%2Fevil.example', '/%09/evil.example', '/bad%zz', '/a\n']) {
    assert.equal(safeNext(value), '/account', value);
  }
  assert.equal(safeNext('/c/abc/reports/2?x=1#share=abc'), '/c/abc/reports/2?x=1#share=abc');
  assert.equal(trustedOrigin(), 'https://frank.example');
  for (const value of ['http://frank.example', 'https://user:password@frank.example', 'https://frank.example/path', 'https://frank.example?x=1', 'javascript:alert(1)']) {
    process.env.APP_URL = value; assert.throws(trustedOrigin);
  }
  delete process.env.APP_URL; assert.throws(trustedOrigin);
  process.env.NODE_ENV = 'development'; assert.equal(trustedOrigin(), 'http://localhost:3000');
});

test('sessions are random, hash-only in storage, versioned, and reject ambiguous cookies', () => {
  const first = createSession(), second = createSession();
  assert.match(first.rawToken, /^[a-f0-9]{64}$/);
  assert.notEqual(first.rawToken, second.rawToken);
  assert.equal(first.token, hashToken(first.rawToken));
  assert.notEqual(first.rawToken, first.token);
  assert.equal(first.authVersion, 1);
  assert.ok(first.expiresAt.getTime() > Date.now() + 29 * 86_400_000);
  assert.equal(getSessionRawToken(`other=a; ${SESSION_COOKIE}=${first.rawToken}`), first.rawToken);
  for (const value of [null, `${SESSION_COOKIE}=wrong`, `${SESSION_COOKIE}=%zz`, `${SESSION_COOKIE}=${first.rawToken}; ${SESSION_COOKIE}=${second.rawToken}`]) {
    assert.equal(getSessionRawToken(value), null);
  }
});

test('guest capabilities cannot authorize owned reports or read-only shared mode', () => {
  const token = 'a'.repeat(64), identity = { id: randomUUID(), email: 'owner@example.test' };
  const guest = new Request('https://frank.example', { headers: { 'x-conversation-token': token } });
  assert.equal(ownsConversationWithIdentity(guest, { userId: null, deleteToken: token }, null), true);
  assert.equal(ownsConversationWithIdentity(guest, { userId: identity.id, deleteToken: token }, null), false);
  assert.equal(ownsConversationWithIdentity(guest, { userId: identity.id, deleteToken: token }, { ...identity, id: randomUUID() }), false);
  assert.equal(ownsConversationWithIdentity(guest, { userId: identity.id, deleteToken: null }, identity), true);
  const shared = new Request('https://frank.example', { headers: { 'x-conversation-token': token, 'x-share-token': 'b'.repeat(64) } });
  assert.equal(ownsConversationWithIdentity(shared, { userId: identity.id, deleteToken: token }, identity), false);
  assert.equal(equalSecret('abcd', 'éééé'), false);
});

test('Google state binds the callback, expires, and uses a fresh PKCE S256 verifier', () => {
  const state = createGoogleState('/account'), other = createGoogleState('/account');
  assert.notEqual(state.state, other.state); assert.notEqual(state.verifier, other.verifier);
  assert.equal(state.challenge, createHash('sha256').update(state.verifier).digest('base64url'));
  assert.match(state.state, /^[a-f0-9]{64}$/);
  assert.deepEqual(verifyGoogleState(state.state, state.cookieState, state.verifier), { next: '/account', verifier: state.verifier });
  const expired = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(state.cookieState, 'base64url')), issuedAt: Date.now() - 601_000 })).toString('base64url');
  for (const values of [[null, undefined, undefined], [state.state, other.cookieState, state.verifier], [state.state, state.cookieState, 'short'], [state.state, expired, state.verifier]]) {
    assert.throws(() => verifyGoogleState(...values), { code: 'google_state_invalid' });
  }
});

test('Google authorize uses APP_URL, secure temporary cookies, safe next, and PKCE', async () => {
  const response = await google.GET(new NextRequest('https://untrusted-host.example/api/auth/google?next=//evil.example'));
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://accounts.google.com');
  assert.equal(location.searchParams.get('redirect_uri'), 'https://frank.example/api/auth/callback/google');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  const cookieState = response.cookies.get('frank_oauth_state').value;
  const state = location.searchParams.get('state');
  const verifier = response.cookies.get('frank_oauth_verifier').value;
  assert.equal(verifyGoogleState(state, cookieState, verifier).next, '/account');
  assert.equal(location.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
  assert.match(response.headers.get('set-cookie'), /HttpOnly/); assert.match(response.headers.get('set-cookie'), /Secure/);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('invalid OAuth callback makes no provider call and clears state with a trusted error redirect', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  const response = await callback.GET(new NextRequest('https://untrusted.example/api/auth/callback/google?code=private-code&state=forged'));
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://frank.example'); assert.equal(location.searchParams.get('error'), 'google_state_invalid');
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('identity comes from verified Google UserInfo and token exchange includes the verifier and timeout', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(options.signal); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    if (url === 'https://oauth2.googleapis.com/token') {
      assert.equal(options.body.get('code_verifier'), 'test-verifier');
      assert.equal(options.body.get('redirect_uri'), 'https://frank.example/api/auth/callback/google');
      return Response.json({ access_token: 'test-token', token_type: 'Bearer' });
    }
    assert.equal(url, 'https://openidconnect.googleapis.com/v1/userinfo');
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer test-token');
    return Response.json({ sub: 'subject-123', email: 'Owner@example.test', email_verified: true });
  });
  assert.deepEqual(await exchangeGoogleIdentity('test-code', 'test-verifier', 'https://frank.example/api/auth/callback/google'), {
    sub: 'subject-123', email: 'owner@example.test', email_verified: true,
  });
});

test('unverified/missing Google subject, oversized responses and provider failures are rejected safely', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  for (const identity of [{ email: 'owner@example.test', email_verified: true }, { sub: 'x', email: 'owner@example.test', email_verified: false }]) {
    fetch.mock.mockImplementation(async (url) => url.includes('/token') ? Response.json({ access_token: 'test', token_type: 'Bearer' }) : Response.json(identity));
    await assert.rejects(exchangeGoogleIdentity('code', 'verifier', 'https://frank.example/callback'), { code: 'google_no_email' });
  }
  fetch.mock.mockImplementation(async () => new Response('x'.repeat(32_769)));
  await assert.rejects(exchangeGoogleIdentity('code', 'verifier', 'https://frank.example/callback'), { code: 'google_token_failed' });
  fetch.mock.mockImplementation(async () => { throw new Error('Private token data must not escape'); });
  await assert.rejects(exchangeGoogleIdentity('code', 'verifier', 'https://frank.example/callback'), { code: 'google_token_failed', message: 'google_token_failed' });
});

test('storage failure is distinguishable from sign-out and logout never claims unpersisted revocation', async () => {
  const anonymous = new Request('https://frank.example/api/auth/me');
  assert.equal((await me.GET(anonymous)).status, 401);
  const authenticated = new Request(anonymous.url, { headers: { cookie: `${SESSION_COOKIE}=${'a'.repeat(64)}` } });
  await assert.rejects(currentProfile(authenticated), { status: 503 });
  assert.equal((await me.GET(authenticated)).status, 503);
  const failedLogout = await logout.POST(authenticated);
  assert.equal(failedLogout.status, 503); assert.equal(failedLogout.headers.get('set-cookie'), null);
  assert.equal((await logout.POST(anonymous)).status, 200);
  assert.equal((await conversation.GET(anonymous, { params: Promise.resolve({ id: randomUUID() }) })).status, 503);
  assert.equal((await conversation.GET(anonymous, { params: Promise.resolve({ id: 'not-a-uuid' }) })).status, 400);
});

test('history pagination is bounded and preserves PostgreSQL timestamp precision', () => {
  const cursor = { id: randomUUID(), createdAt: '2026-10-04T12:00:00.123456Z' };
  const encoded = encodeConversationCursor(cursor);
  assert.deepEqual(conversationPagination(new URLSearchParams({ limit: '50', cursor: encoded })), { limit: 50, cursor });
  assert.deepEqual(conversationPagination(new URLSearchParams()), { limit: 20, cursor: null });
  for (const query of ['limit=0', 'limit=51', 'limit=-1', 'limit=1.5', 'limit=', 'cursor=bad', 'cursor=']) {
    assert.throws(() => conversationPagination(new URLSearchParams(query)), { status: 400 });
  }
});

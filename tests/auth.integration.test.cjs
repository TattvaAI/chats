/* eslint-disable @typescript-eslint/no-require-imports */
require('../scripts/register-ts.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test, before, after, beforeEach, afterEach } = require('node:test');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const Module = require('node:module');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { migrate } = require('drizzle-orm/postgres-js/migrator');
const schema = require('../lib/db/schema.ts');
const { NextRequest } = require('next/server');
const urlFile = process.env.TEST_DATABASE_URL_FILE;
let database = null, pool, admin;
const load = Module._load;
Module._load = function(request, parent, ...args) {
  if (request === '@/lib/db' || (request === './db' && parent.filename.endsWith('/lib/requests.ts'))) return { get db() { return database; } };
  return load.call(this, request, parent, ...args);
};
const access = require('../lib/auth/access.ts');
const { hashToken, SESSION_COOKIE } = require('../lib/auth/session.ts');
const { createGoogleState } = require('../lib/auth/google.ts');
const me = require('../app/api/auth/me/route.ts');
const logout = require('../app/api/auth/logout/route.ts');
const callback = require('../app/api/auth/callback/google/route.ts');
const sendCode = require('../app/api/auth/send-code/route.ts');
const verifyCode = require('../app/api/auth/verify-code/route.ts');
const claim = require('../app/api/conversations/claim/route.ts');
const listing = require('../app/api/conversations/route.ts');
const report = require('../app/api/conversations/[id]/route.ts');
const sharing = require('../app/api/conversations/[id]/share/route.ts');
const account = require('../app/api/account/route.ts');
const suffix = randomUUID().replaceAll('-', '');
const schemaName = `auth_test_${suffix}`;
const journalName = `${schemaName}_journal`;
const migrationsFolder = path.resolve(__dirname, '..', 'drizzle');
const integration = (name, fn) => test(name, { skip: !urlFile, timeout: 60_000 }, fn);
const token = () => randomBytes(32).toString('hex');
const request = (pathname, method = 'GET', body, headers = {}) => new Request(`https://frank.example${pathname}`, {
  method, headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const context = (id) => ({ params: Promise.resolve({ id }) });
const cookie = (identity) => ({ cookie: `${SESSION_COOKIE}=${identity.token}` });
let environment;
beforeEach(() => {
  environment = { ...process.env };
  process.env.NODE_ENV = 'test'; process.env.APP_URL = 'https://frank.example';
  process.env.GOOGLE_CLIENT_ID = 'test-client'; process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.RESEND_API_KEY = 'test-resend'; process.env.EMAIL_FROM = 'test@frank.example';
  delete process.env.TRUSTED_PROXY;
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
});
before(async () => {
  if (!urlFile) return;
  const url = fs.readFileSync(urlFile, 'utf8').trim();
  admin = postgres(url, { max: 1, connect_timeout: 10, prepare: false, onnotice: () => {} });
  await admin`create schema ${admin(schemaName)}`;
  pool = postgres(url, { max: 5, connect_timeout: 10, idle_timeout: 10, prepare: false, onnotice: () => {}, connection: {
    options: `-c search_path=${schemaName} -c statement_timeout=30000 -c lock_timeout=10000`,
  } });
  assert.equal((await pool`select current_schema() as schema`)[0].schema, schemaName, 'Test connection must use its isolated schema');
  await migrate(drizzle(pool), { migrationsFolder, migrationsSchema: journalName });
  database = drizzle(pool, { schema });
});
after(async () => {
  if (pool) await pool.end({ timeout: 5 });
  if (admin) {
    // Only this test's random schemas are removed; public data is never changed.
    await admin`drop schema if exists ${admin(schemaName)} cascade`;
    await admin`drop schema if exists ${admin(journalName)} cascade`;
    await admin.end({ timeout: 5 });
  }
});
async function identity(options = {}) {
  const id = randomUUID(), raw = token(), email = options.email ?? `${id}@example.invalid`;
  await pool`insert into profiles(id,email,google_sub) values(${id},${email},${options.googleSub ?? null})`;
  await pool`insert into sessions(token,profile_id,auth_version,expires_at) values(${hashToken(raw)},${id},${options.authVersion ?? 1},${(options.expiresAt ?? new Date(Date.now() + 86_400_000)).toISOString()})`;
  return { id, email, token: raw };
}
async function conversation(owner = null, options = {}) {
  const id = randomUUID(), guestToken = options.token ?? token();
  await pool`insert into conversations(id,user_id,title,category,source,delete_token,expires_at,created_at,file_url)
    values(${id},${owner?.id ?? null},${options.title ?? 'Synthetic conversation'},'friend','whatsapp',${guestToken},'2099-01-01',${options.createdAt ?? new Date().toISOString()},'messages.txt?private=FILE_SECRET')`;
  if (options.report !== false) await addReport(id, options.number ?? 1);
  return { id, token: guestToken };
}
async function addReport(id, number) {
  const envelope = {
    preview: { headline: `Preview ${number}`, teaserVerdict: 'Synthetic preview' },
    fullReport: { headline: `Report ${number}`, subheading: 'Synthetic report' },
    stats: { totalMessages: 5 }, reportLanguage: number === 1 ? 'fr' : 'en', myName: `Reader ${number}`,
    usage: { private: 'USAGE_SECRET' }, payload: 'RAW_PAYLOAD_SECRET', deleteToken: 'GUEST_SECRET',
  };
  await pool`insert into reports(conversation_id,report_number,preview_data,full_report_data,is_unlocked)
    values(${id},${number},${JSON.stringify(envelope)},${JSON.stringify(envelope)},true)`;
}
async function addChildren(conv, owner) {
  await pool`insert into analysis_jobs(id,conversation_id,status,payload) values(${conv.id},${conv.id},'queued',${JSON.stringify({ raw: 'PRIVATE_JOB_PAYLOAD' })})`;
  await pool`insert into report_shares(conversation_id,token_hash,expires_at) values(${conv.id},${hashToken(token())},now()+interval '1 day')`;
  await pool`insert into followups(id,conversation_id,question,answer,status) values(${randomUUID()},${conv.id},'A private question','A saved answer','completed')`;
  const [r] = await pool`select id from reports where conversation_id=${conv.id} limit 1`;
  await pool`insert into purchases(user_id,report_id,stripe_session_id,amount) values(${owner?.id ?? null},${r.id},${randomUUID()},0)`;
}

integration('fresh migration chain creates all tables, indexes and matching constraint names and is repeatable', async () => {
  const tables = await pool`select table_name from information_schema.tables where table_schema=${schemaName}`;
  assert.equal(tables.length, 12);
  const [version] = await pool`select column_default from information_schema.columns where table_schema=${schemaName} and table_name='sessions' and column_name='auth_version'`;
  assert.equal(version.column_default, '0');
  const indexes = new Set((await pool`select indexname from pg_indexes where schemaname=${schemaName}`).map((row) => row.indexname));
  const constraints = new Set((await pool`select conname from pg_constraint where connamespace=${schemaName}::regnamespace`).map((row) => row.conname));
  const snapshot = JSON.parse(fs.readFileSync(path.join(migrationsFolder, 'meta/0002_snapshot.json'), 'utf8'));
  for (const table of Object.values(snapshot.tables)) {
    for (const index of Object.values(table.indexes)) assert.ok(indexes.has(index.name), index.name);
    for (const constraint of [...Object.values(table.foreignKeys), ...Object.values(table.uniqueConstraints)]) assert.ok(constraints.has(constraint.name), constraint.name);
  }
  await migrate(drizzle(pool), { migrationsFolder, migrationsSchema: journalName });
  const records = await pool`select id from ${pool(journalName)}.__drizzle_migrations`;
  assert.equal(records.length, 3);
});

integration('legacy journal upgrade preserves reports and profiles while invalidating old sessions and guest tokens', async () => {
  const legacyName = `legacy_auth_${suffix}`, legacyJournal = `${legacyName}_journal`;
  await admin`create schema ${admin(legacyName)}`;
  const legacy = postgres(fs.readFileSync(urlFile, 'utf8').trim(), { max: 1, prepare: false, onnotice: () => {}, connection: { options: `-c search_path=${legacyName}` } });
  try {
    assert.equal((await legacy`select current_schema() as schema`)[0].schema, legacyName, 'Legacy test connection must use its isolated schema');
    for (const statement of fs.readFileSync(path.join(migrationsFolder, '0000_base_schema.sql'), 'utf8').split('--> statement-breakpoint')) await legacy.unsafe(statement);
    const profileId = randomUUID(), convId = randomUUID(), reportId = randomUUID(), oldToken = token();
    await legacy`insert into profiles(id,email) values(${profileId},'legacy@example.invalid')`;
    await legacy`insert into sessions(token,profile_id,expires_at) values(${hashToken(oldToken)},${profileId},now()+interval '1 day')`;
    await legacy`insert into conversations(id,user_id,title,category,source,delete_token,expires_at) values(${convId},${profileId},'Preserved','friend','whatsapp',${token()},'2099-01-01')`;
    await legacy`insert into reports(id,conversation_id,report_number,preview_data) values(${reportId},${convId},7,'{"headline":"Preserved report"}')`;
    const original = fs.readFileSync(path.join(migrationsFolder, '0000_readiness.sql'), 'utf8');
    for (const statement of original.split('--> statement-breakpoint')) await legacy.unsafe(statement);
    await legacy`create schema ${legacy(legacyJournal)}`;
    await legacy`create table ${legacy(legacyJournal)}.__drizzle_migrations(id serial primary key, hash text not null, created_at bigint)`;
    const oldEntry = JSON.parse(fs.readFileSync(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8')).entries.find((entry) => entry.tag === '0000_readiness');
    await legacy`insert into ${legacy(legacyJournal)}.__drizzle_migrations(hash,created_at) values(${createHash('sha256').update(original).digest('hex')},${oldEntry.when})`;
    await migrate(drizzle(legacy), { migrationsFolder, migrationsSchema: legacyJournal });
    const [saved] = await legacy`select r.id,r.preview_data,p.email,s.auth_version,c.delete_token from reports r join conversations c on c.id=r.conversation_id join profiles p on p.id=c.user_id join sessions s on s.profile_id=p.id where r.id=${reportId}`;
    assert.equal(saved.id, reportId); assert.equal(saved.preview_data.headline, 'Preserved report');
    assert.equal(saved.email, 'legacy@example.invalid'); assert.equal(saved.auth_version, 0); assert.equal(saved.delete_token, null);
    assert.equal((await legacy`select id from ${legacy(legacyJournal)}.__drizzle_migrations`).length, 2);
  } finally {
    await legacy.end({ timeout: 5 });
    await admin`drop schema ${admin(legacyName)} cascade`;
    await admin`drop schema if exists ${admin(legacyJournal)} cascade`;
  }
});

integration('only verified unexpired sessions return identity and account reports', async () => {
  const owner = await identity(), other = await identity(), old = await identity({ authVersion: 0 }), expired = await identity({ expiresAt: new Date(Date.now() - 1000) });
  const conv = await conversation(owner);
  const response = await me.GET(request('/api/auth/me', 'GET', undefined, cookie(owner)));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { id: owner.id, email: owner.email });
  for (const user of [old, expired]) assert.equal((await me.GET(request('/api/auth/me', 'GET', undefined, cookie(user)))).status, 401);
  for (const headers of [{}, cookie(other), { 'x-conversation-token': conv.token }, cookie(old)]) {
    assert.equal((await report.GET(request(`/api/conversations/${conv.id}`, 'GET', undefined, headers), context(conv.id))).status, 404);
    assert.equal((await report.DELETE(request(`/api/conversations/${conv.id}`, 'DELETE', undefined, headers), context(conv.id))).status, 404);
  }
  assert.equal((await listing.GET(request('/api/conversations?mine=1', 'GET', undefined, cookie(old)))).status, 401);
  assert.equal((await logout.POST(request('/api/auth/logout', 'POST', undefined, cookie(owner)))).status, 200);
  assert.equal((await me.GET(request('/api/auth/me', 'GET', undefined, cookie(owner)))).status, 401);
});

integration('guest claiming requires proof, survives lost success responses and invalidates stale capabilities', async () => {
  const owner = await identity(), other = await identity(), guest = await conversation();
  const body = { claims: [{ id: guest.id, token: guest.token }] };
  assert.equal((await report.GET(request(`/api/conversations/${guest.id}`, 'GET', undefined, { 'x-conversation-token': guest.token }), context(guest.id))).status, 200);
  assert.equal((await claim.POST(request('/api/conversations/claim', 'POST', body))).status, 401);
  let response = await claim.POST(request('/api/conversations/claim', 'POST', { claims: [{ id: guest.id, token: token() }] }, cookie(owner)));
  assert.deepEqual(await response.json(), { claimed: 0, claimedIds: [] });
  response = await claim.POST(request('/api/conversations/claim', 'POST', body, cookie(owner)));
  assert.deepEqual(await response.json(), { claimed: 1, claimedIds: [guest.id] });
  const [row] = await pool`select user_id,delete_token from conversations where id=${guest.id}`;
  assert.equal(row.user_id, owner.id); assert.equal(row.delete_token, null);
  assert.equal((await report.GET(request(`/api/conversations/${guest.id}`, 'GET', undefined, { 'x-conversation-token': guest.token }), context(guest.id))).status, 404);
  response = await claim.POST(request('/api/conversations/claim', 'POST', body, cookie(owner)));
  assert.deepEqual(await response.json(), { claimed: 1, claimedIds: [guest.id] });
  response = await claim.POST(request('/api/conversations/claim', 'POST', body, cookie(other)));
  assert.deepEqual(await response.json(), { claimed: 0, claimedIds: [] });
  assert.equal((await report.GET(request(`/api/conversations/${guest.id}`, 'GET', undefined, cookie(owner)), context(guest.id))).status, 200);
});

integration('simultaneous claims grant exactly one account and stale guest deletion cannot race past the claim', async () => {
  const first = await identity(), second = await identity(), guest = await conversation();
  const claims = [{ id: guest.id, token: guest.token }];
  const results = await Promise.all([access.claimConversations(first.id, claims), access.claimConversations(second.id, claims)]);
  assert.equal(results.reduce((sum, result) => sum + result.claimed, 0), 1);
  const [row] = await pool`select user_id,delete_token from conversations where id=${guest.id}`;
  assert.ok([first.id, second.id].includes(row.user_id)); assert.equal(row.delete_token, null);
  const raceGuest = await conversation();
  const [claimed, deleted] = await Promise.all([
    access.claimConversations(first.id, [{ id: raceGuest.id, token: raceGuest.token }]),
    report.DELETE(request(`/api/conversations/${raceGuest.id}`, 'DELETE', undefined, { 'x-delete-token': raceGuest.token }), context(raceGuest.id)),
  ]);
  const rows = await pool`select user_id from conversations where id=${raceGuest.id}`;
  if (claimed.claimed === 1) { assert.equal(deleted.status, 404); assert.equal(rows[0].user_id, first.id); }
  else { assert.equal(deleted.status, 200); assert.equal(rows.length, 0); }
});

integration('report selection exposes stored metadata without secrets and account pagination loses no microsecond timestamps', async () => {
  const owner = await identity(), other = await identity();
  await conversation(other);
  const ids = [], expected = new Map();
  const states = ['queued', 'running', 'failed', 'completed', 'completed', null, 'queued'];
  for (let index = 0; index < states.length; index++) {
    const hasReport = index === 3;
    const conv = await conversation(owner, { report: hasReport, title: `Saved ${index}`, createdAt: `2026-10-04T12:00:00.12345${index}Z` });
    ids.push(conv.id); expected.set(conv.id, hasReport ? 'completed' : ['queued', 'running'].includes(states[index]) ? states[index] : 'failed');
    if (states[index]) await pool`insert into analysis_jobs(id,conversation_id,status,stage,error_message) values(${conv.id},${conv.id},${states[index]},'Stored stage',${states[index] === 'failed' ? 'Safe stored error' : null})`;
    if (hasReport) {
      await addReport(conv.id, 2);
      const response = await report.GET(request(`/api/conversations/${conv.id}?report=1`, 'GET', undefined, cookie(owner)), context(conv.id));
      assert.equal(response.status, 200);
      const value = await response.json(), serialized = JSON.stringify(value);
      assert.equal(value.reportNumber, 1); assert.equal(value.fullReport.headline, 'Report 1');
      assert.equal(value.reportLanguage, 'fr'); assert.equal(value.myName, 'Reader 1'); assert.equal(value.savedToAccount, true);
      assert.equal(value.shared, false); assert.equal(value.conversation.title, 'Saved 3');
      assert.deepEqual(value.availableReports.map((item) => item.reportNumber), [2, 1]);
      for (const secret of ['USAGE_SECRET', 'RAW_PAYLOAD_SECRET', 'GUEST_SECRET', 'FILE_SECRET', 'userId', 'deleteToken', 'usage']) assert.equal(serialized.includes(secret), false, secret);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal((await report.GET(request(`/api/conversations/${conv.id}?report=999`, 'GET', undefined, cookie(owner)), context(conv.id))).status, 404);
      assert.equal((await report.GET(request(`/api/conversations/${conv.id}?report=999999999999999999`, 'GET', undefined, cookie(owner)), context(conv.id))).status, 400);
    }
  }
  const observed = []; let cursor = null;
  do {
    const query = new URLSearchParams({ mine: '1', limit: '2' }); if (cursor) query.set('cursor', cursor);
    const response = await listing.GET(request(`/api/conversations?${query}`, 'GET', undefined, cookie(owner)));
    assert.equal(response.status, 200);
    const value = await response.json(); assert.ok(value.conversations.length <= 2);
    for (const row of value.conversations) { assert.equal(row.status, expected.get(row.id)); observed.push(row.id); }
    cursor = value.nextCursor;
  } while (cursor);
  assert.equal(observed.length, ids.length); assert.equal(new Set(observed).size, ids.length);
  assert.deepEqual([...observed].sort(), [...ids].sort());
});

integration('shares are explicit, read-only, uncached, and immediately revoke or expire even for an owner cookie', async () => {
  const owner = await identity(), conv = await conversation(owner);
  const shareRequest = () => request(`/api/conversations/${conv.id}/share`, 'POST', undefined, cookie(owner));
  const first = await (await sharing.POST(shareRequest(), context(conv.id))).json();
  const sharedHeaders = { ...cookie(owner), 'x-share-token': first.token };
  let response = await report.GET(request(`/api/conversations/${conv.id}`, 'GET', undefined, sharedHeaders), context(conv.id));
  assert.equal(response.status, 200); assert.equal((await response.json()).shared, true); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await sharing.POST(request(`/api/conversations/${conv.id}/share`, 'POST', undefined, sharedHeaders), context(conv.id))).status, 404);
  const second = await (await sharing.POST(shareRequest(), context(conv.id))).json();
  assert.notEqual(first.token, second.token);
  assert.equal((await report.GET(request(`/api/conversations/${conv.id}`, 'GET', undefined, sharedHeaders), context(conv.id))).status, 404);
  await sharing.DELETE(request(`/api/conversations/${conv.id}/share`, 'DELETE', undefined, cookie(owner)), context(conv.id));
  response = await report.GET(request(`/api/conversations/${conv.id}`, 'GET', undefined, { 'x-share-token': second.token }), context(conv.id));
  assert.equal(response.status, 404);
  const third = await (await sharing.POST(shareRequest(), context(conv.id))).json();
  await pool`update report_shares set expires_at=now()-interval '1 second' where conversation_id=${conv.id}`;
  assert.equal((await report.GET(request(`/api/conversations/${conv.id}`, 'GET', undefined, { 'x-share-token': third.token }), context(conv.id))).status, 404);
});

integration('conversation deletion atomically cascades every private child table', async () => {
  const owner = await identity(), other = await identity(), conv = await conversation(owner);
  await addChildren(conv, owner);
  assert.equal((await report.DELETE(request(`/api/conversations/${conv.id}`, 'DELETE', undefined, cookie(other)), context(conv.id))).status, 404);
  assert.equal((await pool`select id from reports where conversation_id=${conv.id}`).length, 1);
  assert.equal((await report.DELETE(request(`/api/conversations/${conv.id}`, 'DELETE', undefined, cookie(owner)), context(conv.id))).status, 200);
  for (const table of ['reports', 'analysis_jobs', 'report_shares', 'followups']) {
    assert.equal((await pool`select * from ${pool(table)} where conversation_id=${conv.id}`).length, 0, table);
  }
  assert.equal((await pool`select id from purchases where user_id=${owner.id}`).length, 0);
  assert.equal((await pool`select id from profiles where id=${owner.id}`).length, 1);
});

integration('account deletion covers all server-owned reports plus proven guest data, with all-or-nothing authorization', async () => {
  const owner = await identity(), other = await identity();
  const known = await conversation(owner), serverOnly = await conversation(owner), guest = await conversation(), foreign = await conversation(other);
  await addChildren(known, owner); await addChildren(serverOnly, owner); await addChildren(guest, null);
  await pool`insert into purchases(user_id,stripe_session_id,amount) values(${owner.id},${randomUUID()},0)`;
  await pool`insert into otp_codes(email,code,expires_at) values(${owner.email},'hash',now()+interval '1 day')`;
  await pool`insert into feedback(kind,email,message) values('feedback',${owner.email},'Private feedback')`;
  await pool`insert into analytics_events(event_name,metadata) values('legacy',${JSON.stringify({ profileId: owner.id })}),('legacy',${JSON.stringify({ conversationId: guest.id })})`;
  const invalid = { claims: [{ id: guest.id, token: guest.token }, { id: foreign.id, token: foreign.token }] };
  assert.equal((await account.DELETE(request('/api/account', 'DELETE', invalid, cookie(owner)))).status, 404);
  assert.equal((await pool`select id from conversations where id in (${known.id},${serverOnly.id},${guest.id})`).length, 3);
  const response = await account.DELETE(request('/api/account', 'DELETE', { claims: [{ id: guest.id, token: guest.token }] }, cookie(owner)));
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await pool`select id from profiles where id=${owner.id}`).length, 0);
  assert.equal((await pool`select token from sessions where profile_id=${owner.id}`).length, 0);
  assert.equal((await pool`select id from conversations where id in (${known.id},${serverOnly.id},${guest.id})`).length, 0);
  assert.equal((await pool`select id from conversations where id=${foreign.id}`).length, 1);
  assert.equal((await pool`select id from purchases where user_id=${owner.id}`).length, 0);
  assert.equal((await pool`select email from otp_codes where email=${owner.email}`).length, 0);
  assert.equal((await pool`select id from feedback where email=${owner.email}`).length, 0);
  assert.equal((await pool`select id from analytics_events where metadata->>'profileId'=${owner.id} or metadata->>'conversationId'=${guest.id}`).length, 0);
});

integration('Google callback creates a hashed verified session, preserves subject identity across email changes, and blocks cross-subject merges', async (t) => {
  let googleIdentity = { sub: `google-${randomUUID()}`, email: `${randomUUID()}@example.invalid`, email_verified: true };
  t.mock.method(globalThis, 'fetch', async (url) => url === 'https://oauth2.googleapis.com/token'
    ? Response.json({ access_token: 'test-access', token_type: 'Bearer' }) : Response.json(googleIdentity));
  const signIn = async () => {
    const state = createGoogleState('/account');
    const req = new NextRequest(`https://frank.example/api/auth/callback/google?code=test&state=${state.state}`, { headers: {
      cookie: `frank_oauth_state=${state.cookieState}; frank_oauth_verifier=${state.verifier}`,
    } });
    return callback.GET(req);
  };
  const first = await signIn(); const firstLocation = new URL(first.headers.get('location'));
  assert.equal(firstLocation.pathname, '/login/complete', firstLocation.searchParams.get('error'));
  const raw = first.cookies.get(SESSION_COOKIE).value;
  const [session] = await pool`select profile_id,token,auth_version from sessions where token=${hashToken(raw)}`;
  assert.ok(session); assert.equal(session.auth_version, 1); assert.notEqual(session.token, raw);
  const conv = await conversation({ id: session.profile_id });
  googleIdentity = { ...googleIdentity, email: `${randomUUID()}@example.invalid` };
  const second = await signIn(); const [newSession] = await pool`select profile_id from sessions where token=${hashToken(second.cookies.get(SESSION_COOKIE).value)}`;
  assert.equal(newSession.profile_id, session.profile_id);
  assert.equal((await pool`select user_id from conversations where id=${conv.id}`)[0].user_id, session.profile_id);
  googleIdentity = { ...googleIdentity, sub: `different-${randomUUID()}` };
  const conflict = await signIn(); assert.equal(new URL(conflict.headers.get('location')).searchParams.get('error'), 'google_account_conflict');
  assert.equal(conflict.cookies.get(SESSION_COOKIE), undefined);
});

integration('email code verification is single-use, versioned, rate-limited, and never claims browser data implicitly', async () => {
  const email = `${randomUUID()}@example.invalid`, guest = await conversation();
  await pool`insert into otp_codes(email,code,expires_at) values(${email},${hashToken('123456')},now()+interval '15 minutes')`;
  const invalid = await verifyCode.POST(request('/api/auth/verify-code', 'POST', { email, code: '654321' }));
  assert.equal(invalid.status, 401); assert.equal((await pool`select attempts from otp_codes where email=${email}`)[0].attempts, 1);
  const body = { email, code: '123456', claims: [{ id: guest.id, token: guest.token }] };
  const responses = await Promise.all([verifyCode.POST(request('/api/auth/verify-code', 'POST', body)), verifyCode.POST(request('/api/auth/verify-code', 'POST', body))]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 401]);
  const success = responses.find((response) => response.status === 200), raw = success.cookies.get(SESSION_COOKIE).value;
  assert.equal((await pool`select auth_version from sessions where token=${hashToken(raw)}`)[0].auth_version, 1);
  assert.equal((await pool`select user_id from conversations where id=${guest.id}`)[0].user_id, null);
});

integration('email delivery uses a bounded provider call, cooldown, hashed OTP and truthful failure response', async (t) => {
  const email = `${randomUUID()}@example.invalid`;
  let sentCode;
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails'); assert.ok(options.signal); assert.equal(options.redirect, 'error');
    sentCode = JSON.parse(options.body).subject.match(/^\d{6}/)[0];
    return Response.json({ id: 'test-delivery' });
  });
  let response = await sendCode.POST(request('/api/auth/send-code', 'POST', { email }));
  assert.equal(response.status, 200);
  const [row] = await pool`select code from otp_codes where email=${email}`;
  assert.equal(row.code, hashToken(sentCode)); assert.notEqual(row.code, sentCode);
  response = await sendCode.POST(request('/api/auth/send-code', 'POST', { email }));
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60'); assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => Response.json({ error: 'private provider detail' }, { status: 500 }));
  const failedEmail = `${randomUUID()}@example.invalid`;
  response = await sendCode.POST(request('/api/auth/send-code', 'POST', { email: failedEmail }));
  assert.equal(response.status, 502); assert.equal((await pool`select email from otp_codes where email=${failedEmail}`).length, 0);
  assert.equal((await response.text()).includes('private provider detail'), false);
});

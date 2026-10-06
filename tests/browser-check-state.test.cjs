/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { safeDiagnostic, fixtureError, journalPath, validateJournal, writeJournal, readJournal, retryTransient } = require('../scripts/browser-check-state.cjs');

const fixture = () => {
  const conversationId = randomUUID();
  return { version: 1, runId: randomUUID().replaceAll('-', ''), databaseId: 'a'.repeat(64), profileIds: [randomUUID(), randomUUID()], conversationIds: [conversationId], guestConversationIds: [conversationId] };
};

test('browser diagnostics expose only classified names, codes and HTTP status', () => {
  const secret = 'https://private.example/report#share=PRIVATE_TOKEN';
  const raw = Object.assign(new Error(secret), { name: secret, code: secret, stack: secret, query: secret, status: 403 });
  assert.deepEqual(safeDiagnostic(raw), { name: 'Error', code: null, status: 403 });
  assert.equal(JSON.stringify(safeDiagnostic(raw)).includes('PRIVATE'), false);
  assert.deepEqual(safeDiagnostic(new Error(`strict mode violation: ${secret}`)), { name: 'Error', code: 'PLAYWRIGHT_STRICT_MODE' });
  assert.deepEqual(safeDiagnostic(new Error(secret, { cause: { code: '55P03', query: secret } })), { name: 'Error', code: '55P03' });
});

test('cleanup journals contain IDs only and refuse a different run, database, or path', () => {
  const journal = fixture();
  assert.deepEqual(validateJournal(journal, journal.runId, journal.databaseId), journal);
  for (const invalid of [
    { ...journal, token: 'PRIVATE_TOKEN' },
    { ...journal, conversationIds: ['not-an-id'] },
    { ...journal, conversationIds: [...journal.conversationIds, journal.conversationIds[0]] },
    { ...journal, guestConversationIds: [randomUUID()] },
  ]) assert.throws(() => validateJournal(invalid, journal.runId, journal.databaseId), { code: 'QA_JOURNAL_INVALID' });
  assert.throws(() => validateJournal(journal, 'b'.repeat(32), journal.databaseId), { code: 'QA_JOURNAL_INVALID' });
  assert.throws(() => validateJournal(journal, journal.runId, 'b'.repeat(64)), { code: 'QA_JOURNAL_INVALID' });
  assert.throws(() => journalPath('/tmp', '../private'), { code: 'QA_JOURNAL_INVALID' });
});

test('cleanup journals persist before replay with private file permissions', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frank-browser-state-'));
  try {
    const journal = fixture();
    const file = writeJournal(directory, journal);
    assert.deepEqual(readJournal(directory, journal.runId, journal.databaseId), journal);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(fs.readdirSync(directory), [`${journal.runId}.json`]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('cleanup retries only transient failures and stops after three attempts', async () => {
  let calls = 0;
  const waits = [];
  const result = await retryTransient(async () => {
    calls++;
    if (calls < 3) throw Object.assign(new Error('private detail'), { code: 'ECONNRESET' });
    return 'done';
  }, () => undefined, async ms => { waits.push(ms); });
  assert.equal(result, 'done'); assert.equal(calls, 3); assert.deepEqual(waits, [250, 1000]);
  calls = 0;
  await assert.rejects(retryTransient(async () => { calls++; throw fixtureError('QA_CLEANUP_OWNERSHIP'); }, () => undefined, async () => {}), { code: 'QA_CLEANUP_OWNERSHIP' });
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(retryTransient(async () => { calls++; throw Object.assign(new Error('private detail'), { code: '57014' }); }, () => undefined, async () => {}), { code: '57014' });
  assert.equal(calls, 3);
});

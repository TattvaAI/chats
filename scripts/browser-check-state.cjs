/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

const errorNames = new Set(['Error', 'AssertionError', 'TimeoutError', 'TypeError', 'RangeError', 'SyntaxError', 'AggregateError', 'PostgresError']);
const transientCodes = new Set(['08000', '08001', '08003', '08004', '08006', '08007', '08P01', '40001', '40P01', '55P03', '57014', '53300', '57P01', '57P02', '57P03', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN', 'CONNECTION_CLOSED', 'CONNECTION_DESTROYED', 'CONNECTION_ENDED', 'CONNECT_TIMEOUT', 'CONNECTION_TIMEOUT']);
const errorCodes = new Set([...transientCodes, '0A000', '22007', '22P02', '23502', '23503', '23505', '23514', '25006', '26000', '34000', '42501', '42601', '42703', '42804', '42P01', '28P01', '55000', 'ERR_ASSERTION', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE', 'ERR_INVALID_URL', 'ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'QA_API_HTTP_ERROR', 'QA_JOURNAL_INVALID', 'QA_CLEANUP_OWNERSHIP', 'QA_CLEANUP_UNTRACKED']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const runIdPattern = /^[a-f0-9]{32}$/;

function codeOf(error) {
  let current = error;
  for (let depth = 0; depth < 3 && current; depth++, current = current.cause) {
    if (errorCodes.has(current.code)) return current.code;
  }
  return null;
}

function safeDiagnostic(error) {
  const result = { name: errorNames.has(error?.name) ? error.name : 'Error', code: codeOf(error) };
  // Classify this familiar Playwright failure without returning its selector or page text.
  if (!result.code && typeof error?.message === 'string' && error.message.includes('strict mode violation')) result.code = 'PLAYWRIGHT_STRICT_MODE';
  if (Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599) result.status = error.status;
  return result;
}

function fixtureError(code) {
  const error = new Error('Browser fixture state requires attention.');
  error.code = code;
  return error;
}

function journalPath(directory, runId) {
  if (!runIdPattern.test(runId)) throw fixtureError('QA_JOURNAL_INVALID');
  return path.join(directory, `${runId}.json`);
}

function validateJournal(value, expectedRunId, expectedDatabaseId) {
  const keys = ['version', 'runId', 'databaseId', 'profileIds', 'conversationIds', 'guestConversationIds'];
  if (!value || Object.keys(value).sort().join(',') !== [...keys].sort().join(',') || value.version !== 1 || value.runId !== expectedRunId || !runIdPattern.test(value.runId) || value.databaseId !== expectedDatabaseId || !/^[a-f0-9]{64}$/.test(value.databaseId)) throw fixtureError('QA_JOURNAL_INVALID');
  for (const field of ['profileIds', 'conversationIds', 'guestConversationIds']) {
    const ids = value[field];
    if (!Array.isArray(ids) || ids.length > 1000 || ids.some(id => typeof id !== 'string' || !uuid.test(id)) || new Set(ids).size !== ids.length) throw fixtureError('QA_JOURNAL_INVALID');
  }
  if (value.profileIds.length !== 2 || value.conversationIds.some(id => value.profileIds.includes(id)) || value.guestConversationIds.some(id => !value.conversationIds.includes(id))) throw fixtureError('QA_JOURNAL_INVALID');
  return { version: 1, runId: value.runId, databaseId: value.databaseId, profileIds: [...value.profileIds], conversationIds: [...value.conversationIds], guestConversationIds: [...value.guestConversationIds] };
}

function writeJournal(directory, value) {
  const journal = validateJournal(value, value.runId, value.databaseId);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const destination = journalPath(directory, journal.runId);
  const temporary = `${destination}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(journal, null, 2), { mode: 0o600 });
    fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return destination;
}

function readJournal(directory, runId, databaseId) {
  const file = journalPath(directory, runId);
  if (fs.statSync(file).size > 256000) throw fixtureError('QA_JOURNAL_INVALID');
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw fixtureError('QA_JOURNAL_INVALID'); }
  return validateJournal(value, runId, databaseId);
}

async function retryTransient(task, onAttempt = () => undefined, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    onAttempt(attempt);
    try { return await task(); }
    catch (error) {
      if (attempt === 3 || !transientCodes.has(codeOf(error))) throw error;
      await pause(attempt === 1 ? 250 : 1000);
    }
  }
}

module.exports = { safeDiagnostic, fixtureError, journalPath, validateJournal, writeJournal, readJournal, retryTransient };

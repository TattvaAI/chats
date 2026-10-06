/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const Module = require('node:module');
const { test, beforeEach, afterEach } = require('node:test');
require('../scripts/register-ts.cjs');
const load = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === './db' && parent?.filename.endsWith('/lib/requests.ts')) return { db: null };
  return load.call(this, request, parent, ...args);
};
const { readJson, requestFailure, RequestError, trustedClientIp, positiveIntegerSetting } = require('../lib/requests.ts');
const { AnalysisInput, isMeaningfulMessage } = require('../lib/ai/input.ts');
const { proxy } = require('../proxy.ts');
const { NextRequest } = require('next/server');
const { z } = require('zod');
let env;
beforeEach(() => { env = { ...process.env }; });
afterEach(() => { for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env); });
const jsonRequest = (body, headers = {}) => new Request('https://frank.test/api', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });

test('JSON reader enforces MIME type, byte limits, UTF-8 and malformed JSON', async () => {
  assert.deepEqual(await readJson(jsonRequest('{"ok":true}')), { ok: true });
  assert.deepEqual(await readJson(jsonRequest('{"ok":true}', { 'content-type': 'application/problem+json; charset=UTF-8' })), { ok: true });
  await assert.rejects(readJson(jsonRequest('{}', { 'content-type': 'text/plain' })), { status: 415 });
  await assert.rejects(readJson(jsonRequest('{')), { status: 400 });
  await assert.rejects(readJson(jsonRequest('"ééééé"'), 8), { status: 413 });
  await assert.rejects(readJson(jsonRequest('"abcdefghijk"', { 'content-length': '2' }), 8), { status: 413 });
  await assert.rejects(readJson(jsonRequest('{}', { 'content-length': 'invalid' })), { status: 400 });
  await assert.rejects(readJson(jsonRequest(new Uint8Array([34, 0xff, 34]))), { status: 400 });
});

test('oversized streams cancel promptly without trusting content-length or awaiting cancellation', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(100)); },
    cancel() { cancelled = true; return new Promise(() => {}); },
  });
  const req = new Request('http://local', { method: 'POST', headers: { 'content-type': 'application/json' }, duplex: 'half', body });
  await assert.rejects(readJson(req, 20), { status: 413 });
  assert.equal(cancelled, true);
});

test('only explicitly trusted proxy headers can select an IP bucket', () => {
  const req = new Request('https://frank.test', { headers: { 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '203.0.113.5', 'cf-connecting-ip': '2001:0db8:0:0:0:0:0:1' } });
  delete process.env.TRUSTED_PROXY;
  assert.equal(trustedClientIp(req), 'unknown');
  process.env.TRUSTED_PROXY = 'vercel';
  assert.equal(trustedClientIp(req), '203.0.113.5');
  assert.equal(trustedClientIp(new Request('http://local', { headers: { 'x-vercel-forwarded-for': '198.51.100.1, 203.0.113.5' } })), 'unknown');
  assert.equal(trustedClientIp(new Request('http://local', { headers: { 'x-forwarded-for': '1.2.3.4' } })), 'unknown');
  process.env.TRUSTED_PROXY = 'cloudflare';
  assert.equal(trustedClientIp(req), '2001:db8::1');
  assert.equal(trustedClientIp(new Request('http://local', { headers: { 'cf-connecting-ip': 'not-an-ip' } })), 'unknown');
  process.env.TRUSTED_PROXY = 'railway';
  assert.equal(trustedClientIp(new Request('http://local', { headers: { 'x-real-ip': '203.0.113.8', 'x-forwarded-for': '1.2.3.4' } })), '203.0.113.8');
  assert.equal(trustedClientIp(req), 'unknown');
  assert.equal(trustedClientIp(new Request('http://local', { headers: { 'x-real-ip': '1.2.3.4, 5.6.7.8' } })), 'unknown');
});

test('invalid cost settings keep finite defaults and large values have a hard cap', () => {
  for (const value of ['NaN', 'Infinity', '-1', '0', '1e12', '0.5', '9999999999999999999999999']) {
    process.env.TEST_LIMIT = value;
    assert.equal(positiveIntegerSetting('TEST_LIMIT', 5, 100), 5);
  }
  process.env.TEST_LIMIT = '900'; assert.equal(positiveIntegerSetting('TEST_LIMIT', 5, 100), 100);
  process.env.TEST_LIMIT = '2'; assert.equal(positiveIntegerSetting('TEST_LIMIT', 5, 100), 2);
});

test('validation and storage failures are safe and rate-limit errors include Retry-After', async () => {
  const invalid = z.object({ private: z.number() }).safeParse({ private: 'secret input' });
  const validation = requestFailure(invalid.error);
  assert.equal(validation.status, 400);
  assert.doesNotMatch(await validation.text(), /secret input/);
  const failure = requestFailure(new Error('password, private transcript, SQL'));
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /password|transcript|SQL/);
  const limited = requestFailure(new RequestError('Try later.', 429, 12.2));
  assert.equal(limited.headers.get('retry-after'), '13');
  assert.match(limited.headers.get('cache-control'), /no-store/);
});

const input = () => ({ category: 'friend', conversationId: '7988c3f0-7cff-4bf1-a11a-d2d6d4080834', myName: 'Alex', messages: Array.from({ length: 8 }, (_, index) => ({ sender: index % 2 ? 'Jo' : 'Alex', content: index % 2 ? 'Coffee sounds good!' : 'Can we meet Saturday?', at: new Date(Date.UTC(2026, 8, 1, 10, index)).toISOString() })) });
test('analysis validation requires meaningful messages and distinct bounded participants', () => {
  assert.equal(AnalysisInput.safeParse(input()).success, true);
  for (const content of ['', '   ', '👍', '<Media omitted>', 'This message was deleted']) assert.equal(isMeaningfulMessage({ content }), false);
  assert.equal(isMeaningfulMessage({ content: 'We met yesterday.', isSystem: true }), false);
  assert.equal(isMeaningfulMessage({ content: 'Loved your message', isReaction: true }), false);
  let value = input(); value.messages.forEach(message => { message.content = '<Media omitted>'; });
  assert.equal(AnalysisInput.safeParse(value).success, false);
  value = input(); value.messages.forEach(message => { if (message.sender === 'Jo') message.sender = 'ＡＬＥＸ'; });
  assert.equal(AnalysisInput.safeParse(value).success, false);
  value = input(); value.myName = 'Someone else'; assert.equal(AnalysisInput.safeParse(value).success, false);
  value = input(); value.messages.push({ ...value.messages[0], at: '0001-01-01T00:00:00.000Z' }); assert.equal(AnalysisInput.safeParse(value).success, false);
  value = input(); value.messages.push({ ...value.messages[0], at: '2099-01-01T00:00:00.000Z' }); assert.equal(AnalysisInput.safeParse(value).success, false);
});

test('private routes enforce the configured public origin and never allow framing or caching', () => {
  process.env.NODE_ENV = 'production';
  process.env.APP_URL = 'https://frank.test';
  const allowed = proxy(new NextRequest('https://internal.host/api/analyze', { method: 'POST', headers: { origin: 'https://frank.test' } }));
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('x-frame-options'), 'DENY');
  assert.match(allowed.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(allowed.headers.get('cache-control'), /no-store/);
  for (const headers of [{}, { origin: 'https://attacker.test' }, { origin: 'https://frank.test', 'sec-fetch-site': 'cross-site' }]) {
    const result = proxy(new NextRequest('https://frank.test/api/analyze', { method: 'POST', headers }));
    assert.equal(result.status, 403);
    assert.match(result.headers.get('cache-control'), /no-store/);
  }
  delete process.env.APP_URL;
  assert.equal(proxy(new NextRequest('https://attacker.test/api/analyze', { method: 'POST', headers: { origin: 'https://attacker.test' } })).status, 503);
});

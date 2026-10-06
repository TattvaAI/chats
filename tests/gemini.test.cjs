/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test, beforeEach, afterEach } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

// Exercise the installed SDK and route handlers without a dev server or database.
require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(result.outputText, filename);
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, ...args);
};
const load = Module._load;
Module._load = function (request, ...args) {
  if (request === '@/lib/db') return { db: null };
  return load.call(this, request, ...args);
};

const { getGeminiModel, getGeminiModelId, toAIServiceError } = require('../lib/ai/gemini.ts');
const { generateFrankPreview, generateFrankFullReport, verifyReportEvidence } = require('../lib/ai/analyzer.ts');
const { computeChatMetrics } = require('../lib/forensics/metrics.ts');
const { FrankReportSchema } = require('../lib/ai/schemas.ts');
const { NextRequest } = require('next/server');
const interrogate = require('../app/api/interrogate/route.ts');

const messages = Array.from({ length: 8 }, (_, index) => ({
  id: String(index), sender: index % 2 ? 'Jo' : 'Alex', content: index % 2 ? 'See you there!' : 'Coffee on Saturday?',
  timestamp: new Date(Date.UTC(2026, 8, 1, 10, index)), isSystem: false,
}));
const stats = computeChatMetrics(messages);
const transcript = messages.map((message) => `${message.sender}: ${message.content}`).join('\n');
const preview = {
  headline: 'A Saturday worth making time for', subheading: 'You both show up.', verdictTag: 'Easy company',
  teaserVerdict: 'Alex, this is a simple plan you both seem happy to make.',
  previewHighlights: ['Both people reply to the coffee plan.'], lockedSections: [],
};
const report = {
  headline: preview.headline, subheading: preview.subheading, verdictTag: preview.verdictTag,
  grandMetaphor: { intro: 'Alex, you have a standing coffee table.', roleReader: 'You suggest the plan.', roleOther: 'Jo agrees.', dynamicSummary: 'Both make time.', closingPunchline: 'Keep the coffee warm.' },
  realTimeReactions: [{ number: 1, title: 'The plan', narrative: 'Alex asks about Saturday.', quotes: [{ sender: 'Alex', text: 'Coffee on Saturday?' }], reaction: 'A clear invitation.' }],
  metaphorSection: { emoji: '☕', title: 'The coffee table', tagline: 'Room for both', paragraphs: ['The replies make planning straightforward.'] },
  privateDialect: { emoji: '🔍', title: 'Your words', intro: 'This short sample has no clear inside jokes.', entries: [] },
  pairProfile: { emoji: '🪞', title: 'Both of you', profiles: ['Alex', 'Jo'].map((name) => ({ name, roleTitle: 'Coffee friend', theFacade: 'Comfortable making plans', theReality: 'The messages suggest interest in meeting.', signatureMove: 'A direct reply', vulnerabilityTell: 'There is too little evidence to say.' })) },
  yelpReview: { emoji: '⭐', title: 'Coffee plans', stars: 4, ambiance: 'Friendly', service: 'Direct replies', menu: 'Saturday coffee', verdict: 'An easy plan.' },
  turningPoints: { emoji: '🕰️', title: 'What changed', points: [] },
  practicalAdvice: { emoji: '🎟️', title: 'What next', directTake: 'Alex, confirm a time.', whatToText: 'Does 10 work?', whatToStopDoing: 'No problem behavior is evident here.', brandonClosing: 'Enjoy the coffee.' },
};

const geminiResponse = (data, finishReason = 'STOP') => new Response(JSON.stringify({
  candidates: [{ content: { role: 'model', parts: [{ text: typeof data === 'string' ? data : JSON.stringify(data) }] }, finishReason }],
  usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 30, totalTokenCount: 50 },
  modelVersion: 'gemini-3.8-flash',
}), { headers: { 'content-type': 'application/json' } });

let env;
beforeEach(() => {
  env = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (/^(VERTEX_API_KEY$|GEMINI_|GOOGLE_MODEL$|GOOGLE_GENERATIVE_AI_API_KEY$)/.test(key)) delete process.env[key];
  }
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
  Object.assign(process.env, env);
});

test('Gemini key alias reaches Google directly and requests native structured output', async (t) => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'old-google-key';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).origin, 'https://generativelanguage.googleapis.com');
    assert.match(String(url), /models\/gemini-3.8-flash:generateContent/);
    assert.equal(new Headers(options.headers).get('x-goog-api-key'), 'test-gemini-key');
    const request = JSON.parse(options.body);
    assert.equal(request.generationConfig.responseMimeType, 'application/json');
    assert.ok(request.generationConfig.responseSchema || request.generationConfig.responseJsonSchema);
    return geminiResponse(preview);
  });
  const result = await generateFrankPreview('friend', stats, null, transcript);
  assert.equal(result.live, true);
  assert.equal(result.data.headline, preview.headline);
});

test('Google SDK key name and per-task model overrides remain supported', () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  process.env.GOOGLE_MODEL = ' gemini-2.5-flash ';
  assert.equal(getGeminiModel('preview').modelId, 'gemini-2.5-flash');
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  process.env.GEMINI_REPORT_MODEL = 'models/gemini-3.1-pro-preview';
  assert.equal(getGeminiModelId('report'), 'gemini-3.1-pro-preview');
  assert.equal(getGeminiModelId('followup'), 'gemini-3.8-flash');
  process.env.GEMINI_MODEL = 'not-a-gemini-model';
  assert.throws(() => getGeminiModel('preview'), { code: 'AI_CONFIGURATION' });
});

test('full report preserves valid sections without duplicate legacy sections', async (t) => {
  process.env.GEMINI_API_KEY = 'test-key';
  t.mock.method(globalThis, 'fetch', async () => geminiResponse(report));
  const result = await generateFrankFullReport('friend', stats, null, transcript);
  assert.equal(result.live, true);
  assert.equal(FrankReportSchema.safeParse(result.data).success, true);
  assert.deepEqual(result.data.realTimeReactions, report.realTimeReactions);
  assert.equal(result.data.memberDossiers, undefined);
  assert.equal(result.data.brutalityScore, undefined);
  assert.equal(result.data.awardsAndSuperlatives, undefined);
});

test('missing key fails without sending chat data or inventing a report', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  await assert.rejects(generateFrankFullReport('friend', stats, null, transcript), { code: 'AI_NOT_CONFIGURED' });
  assert.equal(fetch.mock.callCount(), 0);
});

test('empty or truncated model output is rejected instead of filled with invented sections', async (t) => {
  process.env.GEMINI_API_KEY = 'test-key';
  const fetch = t.mock.method(globalThis, 'fetch', async () => geminiResponse({}));
  await assert.rejects(generateFrankFullReport('friend', stats, null, transcript), { code: 'AI_INVALID_OUTPUT' });
  fetch.mock.mockImplementation(async () => geminiResponse(report, 'MAX_TOKENS'));
  await assert.rejects(generateFrankFullReport('friend', stats, null, transcript), { code: 'AI_INCOMPLETE_OUTPUT' });
});

test('billing failure is safe and is never replaced with a report', async (t) => {
 process.env.GEMINI_API_KEY='test-secret';
 const fetch=t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:{code:402,status:'RESOURCE_EXHAUSTED',message:'private test-secret'}}),{status:402,headers:{'content-type':'application/json'}}));
 await assert.rejects(generateFrankFullReport('friend',stats,null,transcript),{code:'AI_BILLING_REQUIRED'});
 assert.equal(fetch.mock.callCount(),1);
});
test('unauthenticated follow-ups cannot use caller-provided chat statistics',async(t)=>{
 const fetch=t.mock.method(globalThis,'fetch',async()=>{throw Error('should not call Google');});
 const res=await interrogate.POST(new NextRequest('http://localhost/api/interrogate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:'What should I text?',stats})}));
 assert.equal(res.status,400);assert.equal(fetch.mock.callCount(),0);
});
test('Vertex Express key uses the Vertex endpoint and header',async(t)=>{
 process.env.GOOGLE_GENERATIVE_AI_API_KEY='AQ.test-vertex';
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(String(url),'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:generateContent');
  assert.equal(new Headers(options.headers).get('x-goog-api-key'),'AQ.test-vertex');return geminiResponse(preview);
 });
 assert.equal((await generateFrankPreview('friend',stats,null,transcript)).live,true);
});

test('ordinary Google Cloud keys in VERTEX_API_KEY still use the Vertex endpoint',async(t)=>{
 process.env.VERTEX_API_KEY='AIza-test-ordinary-vertex';
 process.env.GEMINI_API_KEY='test-developer-key';
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(String(url),'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:generateContent');
  assert.equal(new Headers(options.headers).get('x-goog-api-key'),'AIza-test-ordinary-vertex');
  return geminiResponse(preview);
 });
 assert.equal((await generateFrankPreview('friend',stats,null,transcript)).live,true);
});

test('quota, timeout, unavailable-model and wrapped HTTP failures have distinct safe errors', () => {
  assert.equal(toAIServiceError({ statusCode: 429 }).status, 429);
  assert.equal(toAIServiceError({ name: 'TimeoutError' }).status, 504);
  assert.equal(toAIServiceError({ statusCode: 404 }).code, 'AI_CONFIGURATION');
  assert.equal(toAIServiceError({ lastError: { statusCode: 402 } }).code, 'AI_BILLING_REQUIRED');
});

test('only explicit transient provider failures are retryable', () => {
  for (const statusCode of [408, 425, 500, 502, 503, 504]) assert.equal(toAIServiceError({ statusCode }).code, 'AI_UNAVAILABLE');
  for (const code of ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']) assert.equal(toAIServiceError({ cause: { code } }).code, 'AI_UNAVAILABLE');
  assert.equal(toAIServiceError(new Error('private unexpected failure')).code, 'AI_FAILED');
  assert.doesNotMatch(toAIServiceError(new Error('private unexpected failure')).message, /private unexpected failure/);
});

test('report evidence requires each supplied participant exactly once in short and long reports', () => {
  for (const length of [8, 100]) {
    const source = Array.from({ length }, (_, index) => ({
      sender: messages[index % messages.length].sender,
      content: messages[index % messages.length].content,
      at: new Date(Date.UTC(2026, 8, 1, 10, index)).toISOString(),
    }));
    const valid = structuredClone(report);
    valid.realTimeReactions[0].quotes[0].messageId = '1';
    if (length >= 100) {
      valid.realTimeReactions = Array.from({ length: 3 }, (_, index) => ({ ...structuredClone(valid.realTimeReactions[0]), number: index + 1 }));
      valid.metaphorSection.paragraphs = ['Alex suggests Saturday coffee.', 'Jo answers the invitation.', 'Both participants contribute to the plan.'];
    }
    assert.equal(verifyReportEvidence(valid, source), valid);
    assert.equal(valid.realTimeReactions[0].quotes[0].at, source[0].at);

    // Two known profiles still have the expected array length, but omit Jo.
    const duplicate = structuredClone(valid);
    duplicate.pairProfile.profiles = [structuredClone(valid.pairProfile.profiles[0]), structuredClone(valid.pairProfile.profiles[0])];
    assert.throws(() => verifyReportEvidence(duplicate, source), { code: 'AI_INVALID_PARTICIPANT' });

    const omitted = structuredClone(valid);
    omitted.pairProfile.profiles.pop();
    assert.throws(() => verifyReportEvidence(omitted, source), { code: 'AI_INVALID_PARTICIPANT' });

    const unknown = structuredClone(valid);
    unknown.pairProfile.profiles[1].name = 'Someone outside this chat';
    assert.throws(() => verifyReportEvidence(unknown, source), { code: 'AI_INVALID_PARTICIPANT' });
  }
});

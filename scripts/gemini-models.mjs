import nextEnv from '@next/env';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MODEL = 'gemini-3.8-flash';
const MODEL_RE = /^gemini-[a-z0-9.-]+$/;
const TEXT_MODEL_RE = /^gemini-(?:\d+(?:\.\d+)?-(?:flash-lite|flash|pro)(?:-preview(?:-[\d-]+)?)?|(?:flash-lite|flash|pro)-latest)$/;
const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_PROBE_MODELS = 10;
const PROBE_OUTPUT_TOKENS = 128;
const PROBE_TEXT = 'Reply with exactly OK. Do not explain.';
// Only names with HTTP 200 text responses in the existing local evidence file.
// Historical observations do not prove availability for the current credential.
const OBSERVED_TEXT_CANDIDATES = [
  'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash',
];
const HELP = `Usage: npm run ai:models -- [--probe --max-models N] [--timeout-ms N]

Routing matches lib/ai/gemini.ts:
  Key priority: VERTEX_API_KEY, GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY.
  VERTEX_API_KEY (including AIza Cloud keys) or an AQ. key selects Vertex.
  GEMINI_API=vertex|developer explicitly overrides that choice.
  Task model overrides, GEMINI_MODEL, and GOOGLE_MODEL remain supported.

Default:
  Vertex: no network request. Print configured and historically observed text
  candidates as UNVERIFIED; API-key model enumeration is unsupported.
  Developer API: list at most ${MAX_PAGES} pages of ${PAGE_SIZE} models. Listing does not
  establish generation access, quota, billing, or report quality.

Options:
  --help, -h          Show this help without loading credentials or calling APIs.
  --probe            Opt in to small generic text requests; these may use paid quota.
  --max-models N     Required with --probe; 1–${MAX_PROBE_MODELS} models, configured models first.
  --timeout-ms N     Per-request timeout: 1000–30000 ms; default 15000.

Probes use only a fixed OK prompt, at most ${PROBE_OUTPUT_TOKENS} output tokens each, no retries,
no chats or media, and stop on auth, billing, rate-limit or transport failure.
Safe audits are written to output/audit/gemini-models.json and, when requested,
output/audit/gemini-model-probes.json. Keys, error bodies and generated text are
never printed or saved. Historical candidate source: tmp/vertex/probes.json.
`;

class DiscoveryError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function parseArguments(args) {
  const options = { help: false, probe: false, maxModels: null, timeoutMs: 15_000 };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') { options.help = true; continue; }
    if (flag === '--probe') { options.probe = true; continue; }
    if (!['--max-models', '--timeout-ms'].includes(flag)) throw new DiscoveryError('ARGUMENTS', 'Unsupported arguments. Use --help.');
    const raw = args[++index];
    if (!/^\d+$/.test(raw || '')) throw new DiscoveryError('ARGUMENTS', 'Use an integer value for each numeric option. See --help.');
    const value = Number(raw);
    if (flag === '--max-models') {
      if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PROBE_MODELS) throw new DiscoveryError('ARGUMENTS', `--max-models must be between 1 and ${MAX_PROBE_MODELS}.`);
      options.maxModels = value;
    } else {
      if (!Number.isSafeInteger(value) || value < 1000 || value > 30_000) throw new DiscoveryError('ARGUMENTS', '--timeout-ms must be between 1000 and 30000.');
      options.timeoutMs = value;
    }
  }
  if (!options.help && options.probe && options.maxModels === null) throw new DiscoveryError('ARGUMENTS', '--probe requires an explicit --max-models limit.');
  if (!options.help && !options.probe && options.maxModels !== null) throw new DiscoveryError('ARGUMENTS', '--max-models is only used with --probe.');
  return options;
}

export function resolveConfiguration(env) {
  const vertexKey = env.VERTEX_API_KEY?.trim();
  const apiKey = vertexKey || env.GEMINI_API_KEY?.trim() || env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) throw new DiscoveryError('NOT_CONFIGURED', 'Set VERTEX_API_KEY, GEMINI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY.');
  const api = env.GEMINI_API?.trim() || (vertexKey || apiKey.startsWith('AQ.') ? 'vertex' : 'developer');
  if (!['vertex', 'developer'].includes(api)) throw new DiscoveryError('CONFIGURATION', 'GEMINI_API must be vertex or developer.');
  const configured = {};
  for (const task of ['report', 'preview', 'followup', 'summary']) {
    const model = [env[`GEMINI_${task.toUpperCase()}_MODEL`], env.GEMINI_MODEL, env.GOOGLE_MODEL]
      .map(value => value?.trim()).find(Boolean)?.replace(/^models\//, '') || DEFAULT_MODEL;
    if (!MODEL_RE.test(model)) throw new DiscoveryError('CONFIGURATION', 'A configured Gemini model name is invalid. Check the model environment variables.');
    configured[task] = model;
  }
  return { api, apiKey, configured };
}

function candidateMap(configured) {
  const rows = new Map();
  for (const [task, model] of Object.entries(configured)) {
    if (!rows.has(model)) rows.set(model, { model, sources: [], generationAccess: 'unverified', textProbeEligible: TEXT_MODEL_RE.test(model) });
    rows.get(model).sources.push(`configured:${task}`);
  }
  return rows;
}

async function requestJson(url, options, timeoutMs, fetchImpl) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, redirect: 'error', signal });
    if (!response.ok) {
      // Provider error bodies can echo keys, project IDs or request details.
      void response.body?.cancel().catch(() => undefined);
      return { status: response.status, body: null };
    }
    if (Number(response.headers.get('content-length') || 0) > MAX_RESPONSE_BYTES) throw new DiscoveryError('RESPONSE_TOO_LARGE', 'The API returned an oversized response.');
    const reader = response.body?.getReader();
    if (!reader) throw new DiscoveryError('INVALID_RESPONSE', 'The API returned an empty response.');
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) throw new DiscoveryError('RESPONSE_TOO_LARGE', 'The API returned an oversized response.');
        chunks.push(value);
      }
    } catch (error) {
      void reader.cancel().catch(() => undefined);
      throw error;
    } finally { reader.releaseLock(); }
    return { status: response.status, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch (error) {
    if (error instanceof DiscoveryError) throw error;
    throw new DiscoveryError(signal.aborted ? 'TIMEOUT' : 'REQUEST_FAILED', signal.aborted
      ? 'The API request timed out.' : 'The API request failed. Check connectivity and API access.');
  }
}

function finiteCount(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000 ? value : undefined; }
function stopReason(status) {
  if (status === 401 || status === 403) return 'auth_or_project_access';
  if (status === 402) return 'billing';
  if (status === 429) return 'rate_limit';
  return null;
}

/** Inject fetch for offline validation. Neither this export nor importing the file loads .env files. */
export async function discover(options, env, fetchImpl = globalThis.fetch) {
  const { api, apiKey, configured } = resolveConfiguration(env);
  const headers = { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' };
  const rows = candidateMap(configured);
  const inventory = {
    checkedAt: new Date().toISOString(), api, configured,
    mode: api === 'vertex' ? 'configured_candidates' : 'developer_listing',
    enumerationSupported: api === 'developer', verifiedTextModelCount: 0,
    pagesRead: 0, listingComplete: false, candidates: [],
    note: api === 'vertex'
      ? 'Vertex API-key model enumeration is unsupported. Candidate availability is unverified until an optional successful text probe. No listing request was made.'
      : 'Developer API listing metadata does not establish generation quota, billing access or report quality.',
  };
  let failure = null;
  if (api === 'vertex') {
    for (const model of OBSERVED_TEXT_CANDIDATES) {
      if (!rows.has(model)) rows.set(model, { model, sources: [], generationAccess: 'unverified', textProbeEligible: true });
      rows.get(model).sources.push('historical:tmp/vertex/probes.json');
    }
  } else {
    const tokens = new Set();
    let nextToken;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
        url.searchParams.set('pageSize', String(PAGE_SIZE));
        if (nextToken) url.searchParams.set('pageToken', nextToken);
        const response = await requestJson(url, { headers }, options.timeoutMs, fetchImpl);
        if (response.status !== 200) throw new DiscoveryError(`HTTP_${response.status}`, `Developer model listing failed (HTTP ${response.status}).`);
        if (!Array.isArray(response.body?.models) || response.body.models.length > PAGE_SIZE) throw new DiscoveryError('INVALID_RESPONSE', 'Developer API model metadata was invalid.');
        inventory.pagesRead++;
        for (const entry of response.body.models) {
          const model = typeof entry.name === 'string' ? entry.name.replace(/^models\//, '') : '';
          if (!MODEL_RE.test(model)) continue;
          const methods = Array.isArray(entry.supportedGenerationMethods) ? entry.supportedGenerationMethods.filter(method => typeof method === 'string' && /^[A-Za-z]{1,64}$/.test(method)).slice(0, 20) : [];
          const row = rows.get(model) || { model, sources: [], generationAccess: 'unverified' };
          row.sources.push('developer_listing');
          Object.assign(row, { listed: true, methods, inputTokens: finiteCount(entry.inputTokenLimit), outputTokens: finiteCount(entry.outputTokenLimit), textProbeEligible: TEXT_MODEL_RE.test(model) && methods.includes('generateContent') });
          rows.set(model, row);
        }
        nextToken = response.body.nextPageToken;
        if (!nextToken) { inventory.listingComplete = true; break; }
        if (typeof nextToken !== 'string' || nextToken.length > 4096 || tokens.has(nextToken)) throw new DiscoveryError('INVALID_PAGINATION', 'Developer API pagination could not be completed safely.');
        tokens.add(nextToken);
      }
    } catch (error) {
      failure = error instanceof DiscoveryError ? { code: error.code, message: error.message } : { code: 'DISCOVERY_FAILED', message: 'Model discovery could not be completed.' };
    }
  }
  inventory.candidates = [...rows.values()];
  if (failure) inventory.error = failure;
  const probes = { checkedAt: new Date().toISOString(), api, purpose: 'Minimal generic text access checks; not a report-quality benchmark.', maxModels: options.maxModels, maxOutputTokens: PROBE_OUTPUT_TOKENS, results: [], stoppedBecause: null };
  if (options.probe && !failure) {
    const selected = inventory.candidates.filter(row => row.textProbeEligible).slice(0, options.maxModels);
    if (!selected.length) probes.stoppedBecause = 'no_text_candidates';
    for (const candidate of selected) {
      const started = Date.now();
      try {
        const base = api === 'vertex' ? 'https://aiplatform.googleapis.com/v1/publishers/google/models/' : 'https://generativelanguage.googleapis.com/v1beta/models/';
        const response = await requestJson(`${base}${candidate.model}:generateContent`, {
          method: 'POST', headers,
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: PROBE_TEXT }] }], generationConfig: { maxOutputTokens: PROBE_OUTPUT_TOKENS, temperature: 0, responseModalities: ['TEXT'] } }),
        }, options.timeoutMs, fetchImpl);
        const generation = response.body?.candidates?.[0];
        const parts = Array.isArray(generation?.content?.parts) ? generation.content.parts : [];
        const reply = parts.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('').trim();
        const finishReason = ['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(generation?.finishReason) ? generation.finishReason : null;
        const verified = response.status === 200 && !!reply && finishReason === 'STOP';
        const usage = {};
        for (const key of ['promptTokenCount', 'candidatesTokenCount', 'totalTokenCount', 'thoughtsTokenCount']) {
          const count = finiteCount(response.body?.usageMetadata?.[key]);
          if (count !== undefined) usage[key] = count;
        }
        probes.results.push({ model: candidate.model, status: response.status, elapsedMs: Date.now() - started, verifiedTextAccess: verified, finishReason, matchedOK: verified && reply === 'OK', usage });
        if (verified) candidate.generationAccess = 'verified_text_probe';
        const stop = stopReason(response.status);
        if (stop) { probes.stoppedBecause = stop; break; }
      } catch (error) {
        probes.results.push({ model: candidate.model, elapsedMs: Date.now() - started, verifiedTextAccess: false, error: error instanceof DiscoveryError ? error.code : 'REQUEST_FAILED' });
        probes.stoppedBecause = 'transport_or_response_failure';
        break;
      }
    }
  }
  inventory.verifiedTextModelCount = probes.results.filter(result => result.verifiedTextAccess).length;
  return { inventory, probes: options.probe ? probes : null, exitCode: failure || (options.probe && (!probes.results.length || probes.results.some(result => !result.verifiedTextAccess))) ? 1 : 0 };
}

async function saveAudit(filename, value) {
  await mkdir('output/audit', { recursive: true, mode: 0o700 });
  const path = `output/audit/${filename}`;
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArguments(args);
    if (options.help) { console.log(HELP); return 0; }
    nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
    const result = await discover(options, process.env);
    await saveAudit('gemini-models.json', result.inventory);
    if (result.probes) await saveAudit('gemini-model-probes.json', result.probes);
    console.table(result.inventory.candidates.map(row => ({ model: row.model, source: row.sources.join(', '), access: row.generationAccess, textProbeEligible: row.textProbeEligible })));
    console.log(result.inventory.note);
    if (result.inventory.api === 'developer') console.log(`Read ${result.inventory.pagesRead} metadata pages; listing complete: ${result.inventory.listingComplete}.`);
    if (result.inventory.error) console.error(result.inventory.error.message);
    if (result.probes) console.log(JSON.stringify(result.probes));
    console.log('Safe audit artifacts written under output/audit/.');
    return result.exitCode;
  } catch (error) {
    const safe = error instanceof DiscoveryError ? { code: error.code, message: error.message } : { code: 'DISCOVERY_FAILED', message: 'Gemini discovery failed. Check configuration, connectivity and audit-directory permissions.' };
    console.error(safe.message);
    // Only safe, static errors enter the artifact; SDK/fetch causes are never used.
    try { await saveAudit('gemini-models.json', { checkedAt: new Date().toISOString(), error: safe }); } catch { /* The console error remains useful when storage is unavailable. */ }
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();

/* eslint-disable @typescript-eslint/no-require-imports */
require('./register-ts.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const postgres = require('postgres');
const { chromium } = require('playwright');
const { execFile } = require('node:child_process');
const { safeDiagnostic, fixtureError, journalPath, writeJournal, readJournal, retryTransient } = require('./browser-check-state.cjs');
const { parseWhatsAppChat } = require('../lib/parser/whatsapp.ts');
const { computeChatMetrics } = require('../lib/forensics/metrics.ts');
const { computeDetailedStats } = require('../lib/forensics/detailed-stats.ts');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const live = args.includes('--live');
const workerMode = args.includes('--worker');
const sharedOnly = args.includes('--shared-only');
const cleanupRun = args.find(arg => arg.startsWith('--cleanup-run='))?.slice('--cleanup-run='.length);
const fixturePaths = args.filter(arg => !arg.startsWith('--')).map(file => path.resolve(file));
const output = path.join(root, 'tmp/readiness/browser');
const cleanupDirectory = path.join(output, 'cleanup');
const runId = /^[a-f0-9]{32}$/.test(cleanupRun || '') ? cleanupRun : randomUUID().replaceAll('-', '');
const hash = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('hex');
const owner = { id: randomUUID(), email: `qa.${runId}.owner@example.invalid`, token: token() };
const other = { id: randomUUID(), email: `qa.${runId}.other@example.invalid`, token: token() };
const conversationIds = [];
const guestConversationIds = [];
const checks = [];
const browserErrors = [];
const sharedSubsteps = [];
const sharedResponses = [];
const sharedNavigation = [];
let sql, browser, base, currentStep = 'configuration', failure = null, cleaned = false;
let currentSubstep = null, failureDiagnostic = null, cleanupDiagnostic = null, databaseId, journalFile, cleanupAttempts = 0;
let blockedPaidRequests = 0;
const syntheticChat = '[31/12/25, 23:58:00] Alex: Shall we walk to the cafe tomorrow?\n[31/12/25, 23:59:00] Jo: Yes, the window table sounds good.\n[01/01/26, 09:00:00] Alex: I will bring the book we discussed.\n[01/01/26, 09:03:00] Jo: Great, I can bring the notes.\n[02/01/26, 10:00:00] Alex: Thank you for the useful conversation.\n[02/01/26, 10:04:00] Jo: Let us plan another afternoon next week.\n[03/01/26, 10:00:00] Alex: Tuesday works for me.\n[03/01/26, 10:06:00] Jo: Tuesday is confirmed.';
const parsed = parseWhatsAppChat(syntheticChat);
const stats = computeChatMetrics(parsed.messages);
const detailedStats = computeDetailedStats(parsed.messages, stats);

function databaseTarget(value) {
  const url = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  return `${url.hostname.toLowerCase().replace('-pooler.', '.')}:${url.port || '5432'}${decodeURIComponent(url.pathname)}`;
}
function syntheticReport(headline) {
  return {
    headline, subheading: 'A synthetic conversation used only for browser verification.', verdictTag: 'Clear plans',
    grandMetaphor: { intro: 'Alex, you both turn a loose idea into a concrete plan.', roleReader: 'You suggest the cafe and bring a book.', roleOther: 'Jo confirms the table and offers notes.', dynamicSummary: 'Both participants contribute to the plan.', closingPunchline: 'The useful evidence is in the messages.' },
    realTimeReactions: [{ number: 1, title: 'An invitation becomes a plan', narrative: 'The first two messages propose and confirm a cafe visit.', quotes: [{ sender: 'Alex', text: 'Shall we walk to the cafe tomorrow?', at: '2025-12-31T23:58:00.000Z' }, { sender: 'Jo', text: 'Yes, the window table sounds good.', at: '2025-12-31T23:59:00.000Z' }], reaction: 'An offer and a clear answer make coordination easier.' }],
    metaphorSection: { emoji: '☕', title: 'A table with room for two', tagline: 'Both people bring something to the conversation.', paragraphs: ['The messages contain concrete plans and reciprocal responses.', 'These observations describe the chat; they do not establish anyone’s hidden feelings.'] },
    privateDialect: { emoji: '📚', title: 'Shared vocabulary', intro: 'The book and notes give these messages a practical context.', entries: [{ term: 'the notes', meaning: 'Materials Jo offers to bring', subtext: 'A contribution to the plan', quote: 'Great, I can bring the notes.' }] },
    pairProfile: { emoji: '🪞', title: 'Two participants', profiles: ['Alex', 'Jo'].map(name => ({ name, roleTitle: 'Cooperative planner', theFacade: 'Clear, practical messages.', theReality: 'The saved messages show participation.', signatureMove: 'Confirming a next step.', vulnerabilityTell: 'The transcript does not establish this.' })) },
    yelpReview: { emoji: '⭐', title: 'The cafe planning review', stars: 4, ambiance: 'Calm and practical.', service: 'Both people reply.', menu: 'Books, notes and a proposed meeting.', verdict: 'Plans are clear in the available messages.' },
    turningPoints: { emoji: '🕰️', title: 'When plans became concrete', points: [{ dateOrPeriod: 'January 3, 2026', momentTitle: 'Tuesday is confirmed', whatHappened: 'Both people agree on Tuesday.', keyExchange: [{ sender: 'Jo', text: 'Tuesday is confirmed.', at: '2026-01-03T10:06:00.000Z' }], impact: 'The planned day is explicit.' }] },
    practicalAdvice: { emoji: '🎟️', title: 'Keep the next step simple', directTake: 'Confirm a time if that has not been agreed.', whatToText: 'What time on Tuesday works for you?', whatToStopDoing: 'Avoid assuming more than the messages show.', brandonClosing: 'A clear plan leaves less room for guesswork.' },
  };
}
function envelope(headline, language = 'en') {
  const fullReport = syntheticReport(headline);
  return { fullReport, stats, detailedStats, turningPoint: null, reportLanguage: language, myName: 'Alex', preview: { headline, subheading: fullReport.subheading, verdictTag: fullReport.verdictTag, teaserVerdict: fullReport.grandMetaphor.intro, previewHighlights: ['Both participants contribute.'], lockedSections: [] } };
}
async function identity(person) {
  await sql`insert into profiles(id,email) values(${person.id},${person.email})`;
  await newSession(person);
}
async function newSession(person) {
  person.token = token();
  await sql`insert into sessions(token,profile_id,auth_version,expires_at) values(${hash(person.token)},${person.id},1,now()+interval '2 hours')`;
}
async function conversation(person, title, reportNumber = 1, options = {}) {
  const id = randomUUID(); conversationIds.push(id);
  const capability = person ? null : token(); if (capability) guestConversationIds.push(id);
  saveCleanupJournal();
  await sql`insert into conversations(id,user_id,title,category,source,participants,message_count,delete_token,expires_at) values(${id},${person?.id || null},${title},'friend','whatsapp',${['Alex', 'Jo']},8,${capability},now()+interval '2 hours')`;
  if (!options.job) {
    const data = envelope(title, options.language || 'en');
    await sql`insert into reports(conversation_id,report_number,preview_data,full_report_data,is_unlocked) values(${id},${reportNumber},${sql.json(data)},${sql.json(data)},true)`;
  } else {
    // A future lease plus null payload prevents default browser QA from starting provider work.
    await sql`insert into analysis_jobs(id,conversation_id,status,stage,payload,attempts,lease_id,lease_until,error_message) values(${id},${id},${options.job},${options.job === 'running' ? 'Reading the saved chat' : 'Could not finish'},null,1,${options.job === 'running' ? randomUUID() : null},${options.job === 'running' ? new Date(Date.now() + 7_200_000) : null},${options.job === 'failed' ? 'Synthetic analysis failure. Upload the chat again.' : null})`;
  }
  return { id, token: capability, title, reportNumber };
}
async function check(name, task) {
  if (sharedOnly && !name.startsWith('shared links retain their hash')) return;
  currentStep = name;
  currentSubstep = null;
  try { await task(); }
  catch (error) {
    if (!live && browser) {
      const pages = browser.contexts().flatMap(context => context.pages()).filter(page => !page.isClosed());
      for (let i = 0; i < Math.min(pages.length, 3); i++) {
        await pages[i].screenshot({ path: path.join(output, `failure-${i + 1}.png`), fullPage: true }).catch(() => undefined);
      }
    }
    throw error;
  }
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function sharedStep(name, task) {
  currentSubstep = name;
  const result = await task();
  sharedSubsteps.push(name);
  return result;
}
function saveCleanupJournal() {
  journalFile = writeJournal(cleanupDirectory, { version: 1, runId, databaseId, profileIds: [owner.id, other.id], conversationIds, guestConversationIds });
}
async function context(person) {
  const ctx = await browser.newContext({ baseURL: base.origin, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', ignoreHTTPSErrors: ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) });
  ctx.setDefaultTimeout(15000);
  ctx.setDefaultNavigationTimeout(30000);
  if (person) await setIdentity(ctx, person);
  await ctx.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base.origin) return route.abort();
    if ((url.pathname === '/api/analyze' || url.pathname === '/api/interrogate') && request.method() === 'POST') {
      blockedPaidRequests += 1;
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Provider requests are disabled in this browser check.' }) });
    }
    return route.continue();
  });
  ctx.on('page', page => page.on('pageerror', error => browserErrors.push({ name: error.name || 'Error' })));
  return ctx;
}
async function setIdentity(ctx, person) {
  await ctx.clearCookies();
  await ctx.addCookies([{ name: 'frank_session', value: person.token, url: base.origin, httpOnly: true, sameSite: 'Lax', secure: base.protocol === 'https:' }]);
}
async function heading(page, text) { await page.getByRole('heading', { name: text, exact: true }).waitFor(); }
async function absent(page, text) { assert.equal(await page.getByText(text, { exact: true }).count(), 0); }
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'Horizontal overflow');
}
async function capture(page, label, pdf = false) {
  await page.evaluate(() => document.fonts.ready);
  await noOverflow(page);
  await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: true });
  if (pdf) await page.pdf({ path: path.join(output, `${label}.pdf`), format: 'A4', printBackground: true });
}
async function api(ctx, pathname, method, body) {
  const response = await ctx.request.fetch(pathname, { method, timeout: 20000, headers: { Origin: base.origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { data: body }) });
  if (!response.ok()) {
    const error = fixtureError('QA_API_HTTP_ERROR');
    error.status = response.status();
    throw error;
  }
  return response;
}
async function configure() {
  if (args.includes('--help')) {
    console.log('TEST_DATABASE_URL_FILE=/absolute/path/to/isolated-url BASE_URL=https://localhost:3100 node scripts/browser-check.cjs');
    console.log('Optional explicit paid run: append --live path/to/one.zip path/to/two.zip path/to/three.zip; serve with dev-isolated.cjs --live and no separate worker or cron process. Default checks intercept all generation and follow-up POST requests.');
    console.log('Requires migrated isolated database, a ready local server using it (HTTPS for the production build), and Playwright Chromium or installed Google Chrome. Screenshots, PDF and safe summary go to tmp/readiness/browser.');
    console.log('Retry retained fixture cleanup without opening a browser: use the same TEST_DATABASE_URL_FILE and append --cleanup-run=<run-id-from-summary>. Journals contain only fixture IDs and an opaque database identifier.');
    console.log('Use --shared-only for a focused synthetic shared-navigation regression check; omit it for the complete suite.');
    return false;
  }
  if (cleanupRun !== undefined && (live || fixturePaths.length || !/^[a-f0-9]{32}$/.test(cleanupRun))) throw fixtureError('QA_JOURNAL_INVALID');
  if (sharedOnly && (live || cleanupRun !== undefined)) throw new Error('Focused shared checks cannot be combined with live or cleanup mode.');
  if (live && fixturePaths.length !== 3) throw new Error('Live mode requires exactly three explicitly supplied ZIP fixtures.');
  if (!live && fixturePaths.length) throw new Error('Fixture paths require explicit --live mode.');
  for (const file of fixturePaths) if (!/\.zip$/i.test(file) || !fs.statSync(file).isFile()) throw new Error('Invalid live fixture.');
  require('@next/env').loadEnvConfig(root, false, { info() {}, error() {} });
  if (!process.env.TEST_DATABASE_URL_FILE) throw new Error('Set TEST_DATABASE_URL_FILE before running browser QA.');
  const isolated = fs.readFileSync(path.resolve(process.env.TEST_DATABASE_URL_FILE), 'utf8').trim();
  const target = databaseTarget(isolated);
  databaseId = hash(target);
  for (const main of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED].filter(Boolean)) if (databaseTarget(main) === target) throw new Error('Refusing main database target.');
  base = new URL(process.env.BASE_URL || 'https://localhost:3100');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((!local && process.env.ALLOW_REMOTE_TEST_BASE_URL !== '1') || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('BASE_URL must be a localhost origin unless ALLOW_REMOTE_TEST_BASE_URL=1 is explicit.');
  fs.mkdirSync(output, { recursive: true });
  if (cleanupRun) {
    const journal = readJournal(cleanupDirectory, runId, databaseId);
    [owner.id, other.id] = journal.profileIds;
    conversationIds.push(...journal.conversationIds);
    guestConversationIds.push(...journal.guestConversationIds);
    journalFile = journalPath(cleanupDirectory, runId);
  } else {
    // Persist the run's IDs before its first database write, including interrupted setup.
    saveCleanupJournal();
  }
  sql = postgres(isolated, { max: 2, connect_timeout: 10, idle_timeout: 5, prepare: false, onnotice() {}, connection: { application_name: `frank_browser_qa_${runId}`, options: '-c statement_timeout=20000 -c lock_timeout=5000' } });
  return true;
}

async function run() {
  if (!await configure()) return;
  if (cleanupRun) { currentStep = 'synthetic fixture cleanup'; return; }
  currentStep = 'synthetic identity setup';
  await identity(owner); await identity(other);
  currentStep = 'browser startup';
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  // This read-only probe proves the browser server uses the isolated DB before any API mutation.
  // Certificate exceptions apply only to the loopback proxy, never remote test origins.
  currentStep = 'isolated server verification';
  const probeContext = await context(owner);
  const probe = await probeContext.request.get('/api/auth/me', { timeout: 15000 });
  assert.equal(probe.status(), 200, 'Isolated server probe failed');
  assert.equal((await probe.json()).id, owner.id, 'Server is not using the requested isolated database');
  await probeContext.close();
  currentStep = 'synthetic report setup';
  const main = await conversation(owner, 'Synthetic owner report', 3, { language: 'fr' });
  const first = envelope('Synthetic first report');
  await sql`insert into reports(conversation_id,report_number,preview_data,full_report_data,is_unlocked) values(${main.id},1,${sql.json(first)},${sql.json(first)},true)`;
  const foreign = await conversation(other, 'Synthetic other-account report', 2);
  const guest = await conversation(null, 'Synthetic guest report', 2);
  const running = await conversation(owner, 'Synthetic running request', 1, { job: 'running' });
  const failed = await conversation(owner, 'Synthetic failed request', 1, { job: 'failed' });
  const question = 'What did the saved messages establish?';
  const answer = 'The saved messages establish that Alex and Jo agreed on Tuesday.';
  await sql`insert into followups(id,conversation_id,report_number,question,answer,status) values(${randomUUID()},${main.id},3,${question},${answer},'completed')`;
  if (!sharedOnly) for (let i = 0; i < 20; i++) await conversation(owner, `Synthetic history entry ${i + 1}`);
  const ownerContext = await context(owner);
  const page = await ownerContext.newPage();

  await check('desktop and mobile saved report rendering', async () => {
    await page.goto(`/c/${main.id}/reports/3`); await heading(page, main.title);
    await page.getByText('Report 3 · Français', { exact: true }).waitFor();
    await capture(page, 'report-desktop', true);
    await page.setViewportSize({ width: 390, height: 844 }); await capture(page, 'report-mobile');
    await page.getByRole('link', { name: 'See all the stats', exact: true }).click();
    await heading(page, 'Activity calendar');
    assert.equal(new URL(page.url()).searchParams.get('report'), '3');
    await capture(page, 'stats-mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('server-owned follow-up history survives refresh', async () => {
    await page.goto(`/c/${main.id}`); await heading(page, 'Alex & Jo');
    await page.getByRole('button', { name: /Ask Frank about this report/ }).click();
    await page.getByText(answer, { exact: true }).waitFor();
    await page.reload(); await heading(page, 'Alex & Jo');
    await page.getByRole('button', { name: /Ask Frank about this report/ }).click();
    await page.getByText(answer, { exact: true }).waitFor();
  });
  await check('failed follow-up keeps the question and request identity for retry', async () => {
    const ids = []; let firstAttempt = true;
    await page.route('**/api/interrogate', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      const payload = route.request().postDataJSON(); ids.push(payload.requestId);
      const status = firstAttempt ? 503 : 200; firstAttempt = false;
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 503 ? { error: 'Synthetic temporary answer failure' } : { id: payload.requestId, answer: 'Synthetic retry answer.', createdAt: new Date().toISOString() }) });
    });
    await page.getByLabel('Your question for Frank').fill('A synthetic retry question');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await page.getByText('Synthetic temporary answer failure', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Your question for Frank').inputValue(), 'A synthetic retry question');
    await page.getByRole('button', { name: 'Retry question', exact: true }).click();
    await page.getByText('Synthetic retry answer.', { exact: true }).waitFor();
    assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
    await page.unroute('**/api/interrogate');
  });
  await check('durable job state and retryable report errors', async () => {
    await page.goto(`/c/${running.id}`); await heading(page, 'Frank is reading your chat');
    await page.getByText('Reading the saved chat', { exact: true }).waitFor();
    await page.goto(`/c/${failed.id}`); await heading(page, 'The analysis could not finish');
    let unavailable = true;
    const pattern = `**/api/conversations/${main.id}?report=3`;
    await page.route(pattern, route => unavailable ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic storage interruption' }) }) : route.fallback());
    await page.goto(`/c/${main.id}/reports/3`); await heading(page, 'We could not load your report');
    unavailable = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click(); await heading(page, main.title);
    await page.unroute(pattern);
  });
  await check('shared links retain their hash and stay read-only across report, stats and hub', async () => {
    const share = await sharedStep('create share capability', async () => {
      const response = await api(ownerContext, `/api/conversations/${main.id}/share`, 'POST');
      const value = (await response.json()).token;
      assert.ok(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
      return value;
    });
    const sharedContext = await sharedStep('create anonymous viewer', () => context());
    const viewer = await sharedContext.newPage();
    try {
      viewer.on('response', response => {
        const url = new URL(response.url());
        if (url.origin === base.origin && url.pathname === `/api/conversations/${main.id}`) {
          const headers = response.request().headers();
          const hash = new URLSearchParams(new URL(viewer.url()).hash.slice(1));
          const number = url.searchParams.get('report');
          sharedResponses.push({ substep: currentSubstep, pathnameCategory: 'conversation-report-api', reportNumber: number && /^[1-9]\d{0,9}$/.test(number) ? Number(number) : 'latest', status: response.status(), shareHeaderPresent: Boolean(headers['x-share-token']), shareHeaderMatchesCapability: headers['x-share-token'] === share, shareHeaderIsInvalidSentinel: headers['x-share-token'] === 'invalid-share-token', shareHashPresent: hash.has('share'), shareHashMatchesCapability: hash.get('share') === share, shareHashContainsDuplicateCapability: hash.get('share') === `${share}#share=${share}` });
          if (sharedResponses.length > 16) sharedResponses.shift();
        }
      });
      await sharedStep('open shared report', async () => {
        await viewer.goto(`/c/${main.id}/reports/3#share=${share}`);
        await heading(viewer, main.title);
      });
      await sharedStep('shared report hides mutation controls', async () => {
        assert.equal(await viewer.getByRole('button', { name: 'Share the report', exact: true }).count(), 0);
      });
      await sharedStep('navigate from shared report to stats', async () => {
        await viewer.getByRole('link', { name: 'See all the stats', exact: true }).click();
        await heading(viewer, 'Activity calendar');
        assert.equal(new URL(viewer.url()).hash, `#share=${share}`);
      });
      await sharedStep('navigate from shared stats to hub', async () => {
        await viewer.getByRole('link', { name: 'Back to conversation', exact: true }).click();
        await heading(viewer, 'Alex & Jo');
        assert.equal(new URL(viewer.url()).hash, `#share=${share}`);
      });
      await sharedStep('shared hub hides mutation controls', async () => {
        assert.equal(await viewer.getByRole('button', { name: /Ask Frank|Delete conversation/ }).count(), 0);
      });
      await sharedStep('navigate from shared hub back to report', async () => {
        const link = viewer.getByRole('link', { name: /Report 3 · Free/ });
        const destination = new URL(await link.getAttribute('href'), base.origin);
        sharedNavigation.push({ substep: currentSubstep, pathnameCategory: destination.pathname === `/c/${main.id}/reports/3` ? 'selected-report-page' : 'unexpected-page', reportNumber: 3, shareHashPresent: new URLSearchParams(destination.hash.slice(1)).has('share'), shareHashMatchesCapability: new URLSearchParams(destination.hash.slice(1)).get('share') === share });
        await link.click();
        await heading(viewer, main.title);
      });
      await sharedStep('capture shared report', () => capture(viewer, 'shared-report'));
      await sharedStep('revoke share capability', () => api(ownerContext, `/api/conversations/${main.id}/share`, 'DELETE'));
      await sharedStep('anonymous viewer loses revoked report', async () => {
        await viewer.reload(); await heading(viewer, 'Report unavailable'); await absent(viewer, main.title);
      });
      await sharedStep('owner session cannot bypass revoked share', async () => {
        await page.goto(`/c/${main.id}/reports/3#share=${share}`); await heading(page, 'Report unavailable');
      });
    } catch (error) {
      // Only this synthetic shared view is captured; diagnostic fields never include URLs or capabilities.
      await viewer.screenshot({ path: path.join(output, 'shared-failure.png'), fullPage: true }).catch(() => undefined);
      throw error;
    } finally {
      await sharedContext.close().catch(() => undefined);
    }
  });
  await check('account history is paginated and excludes unrelated guest and account data', async () => {
    await page.goto('/account');
    await page.evaluate(({ id, capability }) => localStorage.setItem(`frank:conv:${id}`, JSON.stringify({ conversationId: id, deleteToken: capability, fullReport: { headline: 'Private cached trap' }, email: 'private-cache@example.invalid' })), { id: guest.id, capability: guest.token });
    await page.reload(); await page.getByRole('heading', { name: 'My reports', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Load more reports', exact: true }).click();
    await page.getByText(main.title, { exact: true }).waitFor(); await absent(page, foreign.title); await absent(page, guest.title);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('frank:conv:') || key.startsWith('brandon:conv:'))), false);
    await capture(page, 'account-desktop');
  });
  await check('logout failure is visible, successful logout clears private content, account switching is isolated', async () => {
    const observer = await ownerContext.newPage();
    await observer.goto(`/c/${main.id}/reports/3`); await heading(observer, main.title);
    currentSubstep = 'show a failed logout without private report contents';
    await page.route('**/api/auth/logout', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic sign-out failure' }) }));
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByText('Synthetic sign-out failure', { exact: true }).waitFor(); await absent(page, main.title);
    await page.unroute('**/api/auth/logout');
    currentSubstep = 'retry logout and show signed out';
    await page.getByRole('button', { name: 'Retry sign out', exact: true }).click();
    await page.getByText('Signed out', { exact: true }).waitFor();
    await heading(observer, 'Report unavailable'); await absent(observer, main.title);
    await observer.close();
    currentSubstep = 'signed-out visitor loses private report access';
    await page.goto(`/c/${main.id}/reports/3`); await heading(page, 'Report unavailable'); await absent(page, main.title);
    await setIdentity(ownerContext, other);
    currentSubstep = 'switch accounts and show only the new account history';
    await page.goto('/account'); await page.getByText(foreign.title, { exact: true }).waitFor();
    await absent(page, main.title); await absent(page, guest.title);
  });
  await check('explicit sign-in completion claims guest reports and keeps them on refresh', async () => {
    await newSession(owner);
    const claimContext = await context(owner);
    await claimContext.addInitScript(({ id, capability }) => {
      if (!sessionStorage.getItem('qa:claim-initialized')) {
        localStorage.setItem(`frank:guest:${id}`, JSON.stringify({ conversationId: id, token: capability }));
        sessionStorage.setItem('frank:login-intent', JSON.stringify({ ids: [id], next: `/c/${id}`, createdAt: Date.now() }));
        sessionStorage.setItem('qa:claim-initialized', '1');
      }
    }, { id: guest.id, capability: guest.token });
    const claimant = await claimContext.newPage();
    await claimant.goto(`/login/complete?next=${encodeURIComponent(`/c/${guest.id}`)}`);
    await claimant.waitForURL(`**/c/${guest.id}`); await heading(claimant, 'Alex & Jo');
    await claimant.getByText('Saved to your account. Come back on any device.', { exact: true }).waitFor();
    assert.equal(await claimant.evaluate(id => localStorage.getItem(`frank:guest:${id}`), guest.id), null);
    await claimant.reload(); await heading(claimant, 'Alex & Jo');
    const [stored] = await sql`select user_id,delete_token from conversations where id=${guest.id}`;
    assert.equal(stored.user_id, owner.id); assert.equal(stored.delete_token, null);
    await claimContext.close();
  });
  await check('Google-first login handles OAuth errors and hides unconfigured email sign-in', async () => {
    const loginContext = await context(); const login = await loginContext.newPage();
    await login.route('**/api/auth/config', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ google: true, email: false, requireAuth: true }) }));
    await login.goto('/login?error=google_cancelled');
    await login.getByRole('link', { name: 'Continue with Google', exact: true }).waitFor();
    await login.getByText('Google sign-in was cancelled. You can try again when you are ready.', { exact: true }).waitFor();
    assert.equal(await login.getByLabel('Email', { exact: true }).count(), 0);
    await login.goto('/setup'); await heading(login, 'Sign in to create your report');
    assert.equal(await login.getByLabel('Choose your chat export').count(), 0);
    await loginContext.close();
  });
  await check('Create alone sends validated aliases, note and language with a recoverable guest identity', async () => {
    const setupContext = await context(); const setup = await setupContext.newPage();
    await setup.route('**/api/auth/config', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ google: true, email: false, requireAuth: false }) }));
    let sent = 0, capturedId;
    await setup.route('**/api/analyze', async route => {
      sent += 1;
      const input = route.request().postDataJSON(); capturedId = input.conversationId;
      assert.equal(input.myName, 'Reader Alias'); assert.equal(input.reportLanguage, 'es'); assert.equal(input.userNote, 'Synthetic context note');
      assert.deepEqual([...new Set(input.messages.filter(message => !message.isSystem).map(message => message.sender))].sort(), ['Other Alias', 'Reader Alias']);
      const saved = await setup.evaluate(id => JSON.parse(localStorage.getItem(`frank:guest:${id}`)), capturedId);
      assert.deepEqual(Object.keys(saved).sort(), ['conversationId', 'token']);
      assert.equal(saved.token, route.request().headers()['x-conversation-token']);
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ conversationId: capturedId, jobId: capturedId, status: 'queued' }) });
    });
    await setup.route('**/api/jobs/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'queued', stage: 'Synthetic intercepted request' }) }));
    await setup.route('**/api/conversations/*', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    await setup.goto('/setup'); await heading(setup, 'What kind of chat is this?');
    await setup.getByRole('button', { name: /Any friend/ }).click();
    await setup.getByRole('button', { name: /WhatsApp/ }).click();
    await setup.getByLabel('Choose your chat export').setInputFiles({ name: 'synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from(syntheticChat.replaceAll('Alex:', 'toString:').replaceAll('Jo:', '__proto__:')) });
    await heading(setup, 'Your numbers.'); assert.equal(sent, 0);
    await setup.getByRole('button', { name: 'Continue', exact: true }).click();
    await setup.getByRole('button', { name: 'Apply & Continue', exact: true }).click();
    await setup.getByText('Select which participant is you before continuing.', { exact: true }).waitFor();
    await setup.getByRole('button', { name: 'toString', exact: true }).click();
    await setup.getByLabel('Name for toString', { exact: true }).fill('Reader Alias');
    await setup.getByLabel('Name for __proto__', { exact: true }).fill('Reader Alias');
    await setup.getByRole('button', { name: 'Apply & Continue', exact: true }).click();
    await setup.getByText('Give each participant a distinct name. Names must also differ when capitalization and spacing are ignored.', { exact: true }).waitFor();
    await setup.getByLabel('Name for __proto__', { exact: true }).fill('Other Alias');
    await setup.getByRole('button', { name: 'Apply & Continue', exact: true }).click();
    await setup.locator('textarea').fill('Synthetic context note');
    await setup.getByRole('button', { name: /Español/ }).click();
    await setup.getByRole('button', { name: 'Continue to Final Step', exact: true }).click();
    assert.equal(sent, 0);
    await setup.getByRole('button', { name: 'Create report', exact: true }).click();
    await heading(setup, 'Your report is in the queue'); assert.equal(sent, 1); assert.ok(capturedId);
    await capture(setup, 'queued-request');
    await setupContext.close();
  });
  if (live) await liveReports();
  assert.equal(blockedPaidRequests, 0, 'Unexpected provider POST escaped the explicit browser intercept');
  assert.equal(browserErrors.length, 0, 'Browser runtime errors occurred');
  await ownerContext.close();
}

async function liveReports() {
  await newSession(owner);
  const liveContext = await context(owner);
  for (let index = 0; index < fixturePaths.length; index++) await check(`explicit live fixture ${index + 1}: saved report and refresh`, async () => {
    const page = await liveContext.newPage();
    let sent = 0, id = null;
    // Only the explicitly chosen single Create request bypasses the default paid-call blocker.
    await page.route('**/api/analyze', async route => {
      sent += 1; assert.equal(sent, 1, 'Only one Create is allowed per live fixture');
      id = route.request().postDataJSON().conversationId; conversationIds.push(id);
      saveCleanupJournal();
      await route.continue();
    });
    // Read job state without triggering the job GET endpoint's automatic retry runner.
    await page.route('**/api/jobs/*', async route => {
      if (!id || new URL(route.request().url()).pathname !== `/api/jobs/${id}`) return route.fallback();
      const [job] = await sql`select status,stage,error_message,attempts from analysis_jobs where id=${id}`;
      if (job?.status === 'queued' && job.attempts >= 1) {
        await sql`update analysis_jobs set status='failed',stage='Live test stopped after one attempt',payload=null,lease_id=null,lease_until=null where id=${id} and status='queued' and attempts>=1`;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'failed', stage: 'Live test stopped', error: 'The explicitly bounded live test used its single attempt.' }) });
      }
      await route.fulfill({ status: job ? 200 : 404, contentType: 'application/json', body: JSON.stringify(job ? { status: job.status, stage: job.stage, error: job.error_message } : {}) });
    });
    await page.goto('/setup'); await heading(page, 'What kind of chat is this?');
    await page.getByRole('button', { name: /Any friend/ }).click(); await page.getByRole('button', { name: /WhatsApp/ }).click();
    if (await page.getByLabel('Dates in your export').count()) await page.getByLabel('Dates in your export').selectOption('dmy');
    await page.getByLabel('Choose your chat export').setInputFiles(fixturePaths[index]);
    await heading(page, 'Your numbers.'); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const fields = page.locator('input[aria-label^="Name for "]');
    const count = await fields.count(); assert.ok(count >= 2 && count <= 8, 'Live fixture participant count unsupported');
    // Use aliases so screenshots and stored test metadata do not expose export participant names.
    const firstName = (await fields.first().getAttribute('aria-label')).slice('Name for '.length);
    await page.getByRole('button', { name: firstName, exact: true }).click();
    for (let i = 0; i < count; i++) await fields.nth(i).fill(i === 0 ? 'Reader' : `Participant ${i + 1}`);
    await page.getByRole('button', { name: 'Apply & Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to Final Step', exact: true }).click();
    await page.getByRole('button', { name: 'Create report', exact: true }).click();
    if (workerMode) {
      await page.waitForURL(url => Boolean(id) && url.pathname === `/c/${id}`);
      const [admitted] = await sql`select attempts from analysis_jobs where id=${id}`;
      assert.equal(admitted?.attempts, 0, 'Worker-mode QA requires JOB_EXECUTION_MODE=worker on the server');
      // Exercise the actual production worker once. It cannot silently retry a
      // paid fixture because runWorkerTick processes each selected job once.
      const isolated = fs.readFileSync(process.env.TEST_DATABASE_URL_FILE, 'utf8').trim();
      await new Promise((resolve, reject) => execFile(process.execPath, [path.join(root, 'dist/worker.cjs'), '--once'], {
        cwd: root, timeout: 300000, maxBuffer: 16000,
        env: { ...process.env, DATABASE_URL: isolated, DATABASE_URL_UNPOOLED: isolated, PORT: '' },
      }, error => error ? reject(new Error('The production worker could not finish the live fixture.')) : resolve()));
    }
    const deadline = Date.now() + 360000;
    let completed = false;
    while (Date.now() < deadline) {
      if (id) {
        const [job] = await sql`select status,attempts from analysis_jobs where id=${id}`;
        if (job?.status === 'completed') { assert.ok(job.attempts <= 1, 'Live analysis attempted more than once'); completed = true; break; }
        if (job?.status === 'failed') throw new Error('Bounded live report failed.');
        if (job?.status === 'queued' && job.attempts >= 1) throw new Error('Live report needs a second attempt, outside this run.');
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    assert.ok(completed, 'Live report timed out'); assert.equal(sent, 1);
    await page.goto(`/c/${id}`); await page.getByText('Saved to your account. Come back on any device.', { exact: true }).waitFor();
    const [saved] = await sql`select report_number,full_report_data from reports where conversation_id=${id} order by report_number desc limit 1`;
    assert.ok(saved);
    const [jobMetadata] = await sql`select status,attempts,created_at,updated_at from analysis_jobs where id=${id}`;
    fs.writeFileSync(path.join(output, `live-${index + 1}-result.json`), JSON.stringify({ reportNumber: saved.report_number, full_report_data: saved.full_report_data, job: { status: jobMetadata.status, attempts: jobMetadata.attempts, createdAt: jobMetadata.created_at, updatedAt: jobMetadata.updated_at, durationMs: new Date(jobMetadata.updated_at).getTime() - new Date(jobMetadata.created_at).getTime() } }, null, 2), { mode: 0o600 });
    await page.goto(`/c/${id}/reports/${saved.report_number}`); await page.getByRole('button', { name: 'Share the report', exact: true }).waitFor();
    await capture(page, `live-${index + 1}-report`, true);
    await page.reload(); await page.getByRole('button', { name: 'Share the report', exact: true }).waitFor();
    await page.goto('/account'); await page.locator(`a[href="/c/${id}"]`).waitFor();
    await page.close();
  });
  await liveContext.close();
}

async function cleanup() {
  if (browser) await browser.close().catch(() => undefined);
  if (!sql || !journalFile) return;
  let cleanupError;
  try {
    await retryTransient(async () => sql.begin(async transaction => {
      const profileIds = [owner.id, other.id];
      const profiles = await transaction`select id,email from profiles where id in ${transaction(profileIds)} for update`;
      for (const profile of profiles) {
        const expected = profile.id === owner.id ? owner : other;
        if (profile.email !== expected.email) throw fixtureError('QA_CLEANUP_OWNERSHIP');
      }
      if (conversationIds.length) {
        await transaction`delete from conversations where id in ${transaction(conversationIds)} and user_id in ${transaction(profileIds)}`;
        if (guestConversationIds.length) await transaction`delete from conversations where id in ${transaction(guestConversationIds)} and user_id is null`;
        const remaining = await transaction`select id from conversations where id in ${transaction(conversationIds)} limit 1`;
        if (remaining.length) throw fixtureError('QA_CLEANUP_OWNERSHIP');
      }
      // Refuse to cascade or orphan anything outside the run's recorded conversations.
      const untracked = await transaction`select id from conversations where user_id in ${transaction(profileIds)} limit 1`;
      if (untracked.length) throw fixtureError('QA_CLEANUP_UNTRACKED');
      await transaction`delete from profiles where id in ${transaction(profileIds)} and email in ${transaction([owner.email, other.email])}`;
    }), attempt => { cleanupAttempts = attempt; });
    cleaned = true;
    fs.rmSync(journalFile, { force: true });
    journalFile = undefined;
  } catch (error) { cleanupError = error; }
  finally {
    try { await sql.end({ timeout: 5 }); }
    catch (error) { cleanupError ??= error; }
  }
  if (cleanupError) throw cleanupError;
}

(async () => {
  try { await run(); }
  catch (error) {
    failure = currentStep; process.exitCode = 1;
    failureDiagnostic = safeDiagnostic(error);
    const setupMessages = ['Live mode requires exactly three explicitly supplied ZIP fixtures.', 'Fixture paths require explicit --live mode.', 'Invalid live fixture.', 'Set TEST_DATABASE_URL_FILE before running browser QA.', 'Refusing main database target.', 'BASE_URL must be a localhost origin unless ALLOW_REMOTE_TEST_BASE_URL=1 is explicit.'];
    if (currentStep === 'configuration' && setupMessages.includes(error.message)) console.error(error.message);
  }
  finally {
    try { await cleanup(); }
    catch (error) { cleanupDiagnostic = safeDiagnostic(error); failure = failure || 'synthetic fixture cleanup'; process.exitCode = 1; }
    if (!args.includes('--help')) {
      const summary = { mode: cleanupRun ? 'cleanup-only' : live ? 'explicit-live' : sharedOnly ? 'synthetic-shared' : 'synthetic', passed: checks.length, checks, failedAt: failure, failedSubstep: failureDiagnostic ? currentSubstep : null, failureDiagnostic, sharedSubsteps, sharedResponses, sharedNavigation, browserErrorCount: browserErrors.length, unexpectedProviderRequests: blockedPaidRequests, syntheticFixturesCleaned: cleaned, cleanupAttempts, cleanupDiagnostic, retainedCleanupRun: journalFile ? runId : null };
      fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(path.join(output, cleanupRun ? `cleanup-summary-${runId}.json` : 'summary.json'), JSON.stringify(summary, null, 2));
      console.log(JSON.stringify(summary, null, 2));
      if (failure) console.error('Browser QA did not pass. See the safe summary and captured screenshots; no credentials or transcript logs were emitted.');
    }
  }
})();

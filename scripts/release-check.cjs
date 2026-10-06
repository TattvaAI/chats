/* eslint-disable @typescript-eslint/no-require-imports */
if (process.env.FRANK_WORKER_BUNDLED !== 'true') require('./register-ts.cjs');
process.env.NODE_ENV = 'production';
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { trustedOrigin } = require('../lib/auth/access.ts');
const { getGeminiModel } = require('../lib/ai/gemini.ts');
const { jobLimits, jobsRunInline } = require('../lib/ai/jobs.ts');
const { closeDatabase } = require('../lib/db/index.ts');

let failures = 0;
function check(label, verify) {
  let ok = false;
  try { ok = Boolean(verify()); } catch { /* Never print credential-bearing errors. */ }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
const databaseUrl = name => {
  const url = new URL(process.env[name]);
  return ['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname && url.username && url.password;
};

check('Node.js 24 runtime', () => process.versions.node.split('.')[0] === '24');
check('APP_URL is a public HTTPS origin', () => {
  const url = new URL(trustedOrigin());
  return !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
});
check('Google Web OAuth client ID and secret are configured', () =>
  process.env.GOOGLE_CLIENT_ID?.trim().endsWith('.apps.googleusercontent.com') && process.env.GOOGLE_CLIENT_SECRET?.trim());
check('Public report creation requires sign-in', () => process.env.REQUIRE_AUTH !== 'false');
check('DATABASE_URL is configured', () => databaseUrl('DATABASE_URL'));
check('Migration URL uses a direct connection', () => databaseUrl('DATABASE_URL_UNPOOLED') && !new URL(process.env.DATABASE_URL_UNPOOLED).hostname.includes('-pooler'));
check('Gemini report, follow-up and editing models are configured', () => ['report', 'followup', 'summary'].every(task => getGeminiModel(task)));
check('Trusted ingress is explicitly configured', () => ['railway', 'vercel', 'cloudflare'].includes(process.env.TRUSTED_PROXY));
check('Worker mode or authenticated recovery cron is configured', () => !jobsRunInline() || (process.env.CRON_SECRET?.length ?? 0) >= 32);
console.log('Report admission limits:', JSON.stringify(jobLimits()));
console.log('This checks local configuration only. Live OAuth, database access, worker operation and spending limits still require deployment verification.');
closeDatabase().catch(() => { failures++; }).finally(() => { process.exitCode = failures ? 1 : 0; });

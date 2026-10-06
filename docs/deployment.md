# Deploying Frank

## Recommended platform

Deploy the Next.js app to Vercel Pro and keep the existing Neon project for durable Postgres storage. Use Node.js 24, enable Fluid compute, and deploy near the database. `vercel.json` selects Singapore (`sin1`), matching the current test database region.

The app saves a job before returning an upload response. A browser can close while analysis runs; Vercel's `after()` handler starts work, and `/api/cron/jobs` recovers interrupted work every minute. **This cron schedule requires Pro or Enterprise.** Vercel Hobby only permits daily schedules. Do not silently remove the recovery cron to fit Hobby and then promise reliable unattended completion.

An alternative is a Node host such as Railway or Render with an always-running web service (`npm run build`, `npm start`) and a separate worker (`npm run worker`). Keep the same Postgres database and require a reverse proxy that strips untrusted forwarding headers. Do not use a static-site deployment. The worker needs Node.js and the installed TypeScript tooling used by `scripts/register-ts.cjs`; install with `npm ci --include=dev` for that service, or compile the worker before pruning development dependencies. Enable automatic restart on worker failure.

## 1. Choose the public address

A custom domain is optional; a stable production `*.vercel.app` address works. Set `APP_URL` to the exact HTTPS origin, for example `https://your-frank-domain.example`, without a path. Use that same origin in OAuth settings. A preview deployment must use its own trusted URL, test credentials and separate database branch; never point previews at production data.

## 2. Configure Google sign-in

In [Google Cloud Console](https://console.cloud.google.com/auth/overview), configure the application's branding, support contact, audience and consent screen. Create an OAuth client with application type **Web application**.

Register these values, replacing the example domain:

- Authorized JavaScript origin: `https://your-frank-domain.example`.
- Authorized redirect URI: `https://your-frank-domain.example/api/auth/callback/google`.
- Local testing origin: `http://localhost:3000`.
- Local redirect URI: `http://localhost:3000/api/auth/callback/google`.

The redirect URI must match exactly, including scheme, host, port and path. Use a separate development client if practical. Request only the standard `openid email profile` scopes. For public use, move the Google app out of Testing when Google permits it; while Testing, access is restricted to listed test users. Follow any branding/domain-verification requirements shown in your own Google Console.

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `REQUIRE_AUTH=true` in Vercel. Keep the client secret out of source control, browser code and chat. A Vertex inference API key is different from an OAuth client secret.

A successful login returns to `/login/complete`, where the browser attaches only explicitly selected guest reports. New signed-in uploads belong to that profile immediately. Legacy unverified sessions are rejected after the migration, so existing users must sign in again.

## 3. Configure server variables

Start from `.env.example`. Set production values in the hosting dashboard, not in the committed file.

| Variable | Production value |
| --- | --- |
| `APP_URL` | Exact HTTPS public origin |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Web application OAuth credentials |
| `REQUIRE_AUTH` | `true` |
| `DATABASE_URL` | Neon pooled connection string for the production branch |
| `DATABASE_URL_UNPOOLED` | Direct connection string, available only to the migration operator/CI if possible |
| `DATABASE_POOL_MAX` | `5` initially |
| `GEMINI_API` | `vertex` for your current key |
| `VERTEX_API_KEY` | Your Google Cloud inference key; supported aliases are documented in README |
| `GEMINI_REPORT_MODEL` | `gemini-3.8-flash` |
| `GEMINI_FOLLOWUP_MODEL`, `GEMINI_SUMMARY_MODEL` | `gemini-3.1-flash-lite` |
| `TRUSTED_PROXY` | `vercel` on Vercel; `none` locally |
| `CRON_SECRET` | At least 32 cryptographically random characters |

Generate a cron secret locally with `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"`, then save it in the hosting secret store. Vercel adds it as `Authorization: Bearer ...` on cron invocations. The endpoint refuses missing or incorrect credentials.

The example report and follow-up limits are deliberately finite. `MAX_ACTIVE_JOBS` controls accepted queued/running work, `MAX_CONCURRENT_JOBS` controls active generation, and the per-account, per-IP and global daily limits bound requests. Keep them low during a controlled launch. Limits are stored in Postgres and shared across app instances; deleting a report does not reset the global spending ledger. A report may have two paid attempts after a transient failure.

These are request limits, **not a guaranteed dollar cap**. Set Google Cloud Billing budgets/alerts and provider quota limits appropriate to your budget. Billing alerts alone do not stop spend. Long uploads, reasoning, retries, editing and follow-up requests all affect usage. Hosting/database usage is additional.

Remove obsolete provider variables from hosting settings. The app no longer uses OpenAI, Anthropic, NVIDIA, a relay, Stripe billing, or advertising IDs. Resend and `EMAIL_FROM` are optional; leave them unset for Google-only login. If enabled, verify the sending domain and test delivery before advertising email support.

## 4. Test and migrate the database

Keep production and test branches separate. Use the pooled URL for request traffic and the direct URL for migrations. Back up or create a recoverable snapshot before changing production schema.

```sh
npm ci
npm run check
npm audit --omit=dev
npm run db:migrate
```

Run the migration first on an isolated branch representing the production schema. The migration chain includes a baseline for an empty database and forward migrations for existing tables. Do not use `drizzle-kit push` against production or rewrite an already-applied migration. The readiness migration preserves report rows while assigning unique report numbers. The security migration requires users with old sessions to sign in again.

For explicitly isolated testing, save the disposable direct database URL in an ignored file and set `TEST_DATABASE_URL_FILE` to that file. Never point this variable at production. The integration tests create random isolated schemas, assert `current_schema()` before writing fixtures, and remove only their own schemas. Set an expiration on a temporary Neon branch and remove it after validation.

Run the opt-in checks with the appropriate variable for each suite:

```sh
TEST_DATABASE_URL_FILE=/absolute/path/to/test-url node --test tests/auth.integration.test.cjs
JOBS_TEST_DATABASE_FILE=/absolute/path/to/test-url node --test tests/jobs.integration.test.cjs
```

For browser testing, first migrate the disposable branch with `TEST_DATABASE_URL_FILE=/absolute/path/to/test-url npm run db:migrate`, then build the app. Start the local HTTPS production harness and run the browser check in another terminal:

```sh
TEST_DATABASE_URL_FILE=/absolute/path/to/test-url BASE_URL=https://localhost:3101 node scripts/dev-isolated.cjs --production
TEST_DATABASE_URL_FILE=/absolute/path/to/test-url BASE_URL=https://localhost:3101 node scripts/browser-check.cjs
```

This harness requires OpenSSL and Playwright Chromium or installed Chrome. It uses a temporary local certificate without changing the trust store and refuses the configured primary database target. Default runs disable provider credentials and intercept generation requests. Explicit live checks require starting the server with `--live` and passing `--live` plus exactly three chosen ZIP paths to the browser script; they use paid quota and are bounded to one report attempt per fixture. Keep any separate recovery worker or cron stopped during that bounded live check. Reports, PDFs and safe summaries are written to ignored `tmp/readiness/browser/`. If cleanup needs retry, use the run identifier reported by the harness with `--cleanup-run=<identifier>` against the same disposable database.

## 5. Deploy and verify before inviting users

Import the existing repository into the existing Vercel project, add the production variables, and deploy the reviewed commit. Keep private chats, `.env` files, test exports and audit output out of deployment bundles; `.vercelignore` excludes them.

Verify on the actual HTTPS production address:

1. `/api/health` returns `200` with `status: ok`. This verifies configuration and database schema connectivity, not Google quota, actual OAuth completion or cron execution.
2. Google sign-in succeeds with an allowed account. Cancelled/expired sign-in gives a useful error. Sign out and sign in again.
3. Create a report from a non-sensitive test export. Refresh while queued and while running; confirm one report appears and the raw job payload becomes null.
4. Close the browser during processing and reopen later. Confirm the cron worker still completes or clearly fails the job.
5. Sign in from another browser: the same account sees its report and saved follow-up answers; another account cannot.
6. Create a share link. A signed-out browser can read the report and stats, cannot ask questions or delete it, and loses access after revocation.
7. Delete the test conversation/account and verify dependent rows are gone. Do not perform this destructive check on a real user's account.
8. Confirm the cron is listed, a manual authorized invocation succeeds, and subsequent scheduled runs appear in Vercel logs. Preview deployments do not prove production cron execution.
9. Check mobile layout, source-language quotes and Print to PDF on the production build.

## Operations

Monitor public availability, API errors, failed/queued job age, cron failures and Google quota/billing. `/api/health` is safe for an uptime check; avoid health-checking generation routes. Logs must not contain chat text, emails, session/guest/share tokens, OAuth codes or complete provider/database exceptions.

The worker clears terminal/expired raw payloads and stale follow-ups without an open browser. Reports and follow-up answers remain until deletion. Review support requests through the database's restricted operator console, for example `SELECT id, kind, email, message, created_at FROM feedback ORDER BY created_at DESC LIMIT 50;`. Only authorized operators should have that access. Replying to a support request is a separate operator action; the current implementation does not promise automatic replies.

Set and verify Neon's actual restore window. Its Free tier has a much shorter restore window than a production backup policy normally needs. Practice restoring a disposable branch and document who can restore production, how long it takes, and which recent deletions must be reapplied after a restore. Backups are not instant erasure; the privacy policy explains that distinction.

For rollback, stop accepting new reports by removing public traffic or applying a maintenance rule, leave queued data intact, and redeploy the last compatible secure app version. **Do not roll back to the old unverified-login implementation.** Keep forward-compatible columns/migrations. Restore a database snapshot only for actual data recovery and reconcile recent writes/deletions before reopening traffic.

## Official references checked on 4 October 2026

- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel function limits](https://vercel.com/docs/functions/limitations): 300-second Fluid-compute default and 4.5 MB request/response payload limit; Frank's own limits are smaller.
- [Vercel cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing): minute cron on Pro/Enterprise, daily cron on Hobby.
- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Vertex/Agent Platform pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon restore history window](https://neon.com/docs/postgres/backup-restore/history-window)

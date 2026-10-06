# What Frank Thinks

A free chat-analysis app built with Next.js 16.3, React 19, Google Gemini on Vertex AI, and Postgres on Neon. It reads WhatsApp or iMessage text exports and creates a conversational report with quotations copied from the uploaded messages.

## Development

Use Node.js 24. Run `npm ci`, then copy `.env.example` to `.env.local` only if that file does not already exist. Keep credentials server-side. Set the database URLs and Gemini key. Google login needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and an exact `APP_URL`.

```sh
npm run db:migrate
npm run dev
```

The example configuration requires sign-in before uploads. Set `REQUIRE_AUTH=false` for intentional local guest testing. Guest reports use a browser-held secret and can be explicitly attached to a verified account later. A guest secret never grants access once the report belongs to an account.

## Saved reports and privacy

The database stores accounts, conversations, reports, statistics, follow-up answers, and generation-job state. Signed-in users see their history after refreshing, signing back in, or opening another device. Google sign-in uses a stable Google subject, PKCE, expiring state, and a hashed, HttpOnly session token. Successful sign-in can claim only the guest reports the user chose and for which the browser holds a valid secret.

Report pages fetch authorized server data. Full reports, statistics, notes, participant names, and email addresses are not persisted in browser storage. Old browser caches are removed on upgrade. Shared links are read-only, expire after seven days, and can be revoked. Deleting an account removes its active database records and dependent reports, jobs, shares, and follow-ups; provider backups follow their configured retention periods.

Uploaded messages stay on the device until Create. The raw job payload is cleared on completion or terminal failure, with unattended recovery/expiry cleanup provided by the worker. Source text is sent to Google for generation; provider terms and abuse-monitoring policies still apply.

## AI configuration

`GEMINI_API=vertex` uses Vertex Express. Use `VERTEX_API_KEY`; `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` are supported aliases. Set `GEMINI_API=developer` for an AI Studio key. No alternate AI provider or fabricated report fallback is used.

The report model defaults to `gemini-3.8-flash`. The deployment example uses `gemini-3.1-flash-lite` for follow-up questions and the occasional small editing pass. Per-task settings are `GEMINI_REPORT_MODEL`, `GEMINI_PREVIEW_MODEL`, `GEMINI_FOLLOWUP_MODEL`, and `GEMINI_SUMMARY_MODEL`.

Accepted transcripts are read in full within the upload limit. Quote fields are populated from validated source-message IDs. Generation has a 180-second deadline, an optional 30-second edit, bounded retries for transient failures, and database leases. Errors stay visible and are never replaced by invented results. Token usage includes the report and editing calls, including provider-reported reasoning tokens.

## Verification

```sh
npm run check
npm audit --omit=dev
```

The ordinary tests mock external AI/identity/email services and do not use production data. Real Postgres tests require an explicitly selected database and isolate fixtures in temporary schemas; select a disposable branch. Browser scripts also refuse the configured primary database target. See the deployment guide for exact commands. Live AI checks are opt-in and consume your Google quota.

## Deployment

Use **Vercel Pro + Neon**, with Fluid compute enabled and the app region near the database. The checked-in minute cron requires Vercel Pro or Enterprise; Hobby only supports daily cron and rejects this schedule. A continuously running Node host with `npm run worker` is an alternative.

[Deployment and Google OAuth setup](docs/deployment.md) covers exact environment variables, callback URLs, migrations, job recovery, launch verification, operating limits, backups, and rollback. [The project audit](docs/production-readiness.md) records what was fixed, what was actually tested, and the remaining external launch requirements.

Resend is optional for Google-only login. Native extraction from the macOS Messages database is not included; iMessage text exports are supported.

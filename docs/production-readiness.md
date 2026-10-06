# Production readiness audit

Audit date: 4 October 2026. This audit covers the existing Next.js application, authentication, private data access, parsing/statistics, Gemini generation, background jobs, account history, browser flows, deployment configuration, and operating instructions.

## Release status

The application has substantial security and reliability fixes in place. Final browser and live-generation verification is in progress. It has **not been deployed**, and an actual production Google sign-in and scheduled cron invocation have not been verified.

Public release requires a production HTTPS origin, Google Web OAuth credentials and consent-screen configuration, the reviewed production database migration, valid Google inference quota, and an active recovery worker. Follow [the deployment guide](deployment.md). Use Vercel Pro with Neon, or an always-running Node host with a separate worker.

## Saved account history

Signed-in uploads belong to the verified account immediately. Reports, statistics, available report versions and follow-up answers are stored in Postgres and fetched through ownership checks. Refreshing or returning from another device with the same account retrieves that history. Google identity uses its stable subject, so an email change does not silently create a different account.

Guest reports depend on a browser-held capability until the user explicitly saves them to an account. Clearing that capability before saving can lose guest access. Claiming a report revokes its guest capability. Shared links are separate read-only capabilities, expire after seven days, and can be revoked. Shared viewers cannot access private follow-up history or mutate account data.

## Findings and changes

| Area | Finding | Result |
| --- | --- | --- |
| Authentication | The old instant sign-in path did not establish a verified identity. | Disabled instant sign-in; added Google PKCE, expiring state, bounded Google requests, stable subject identity, and versioned hashed sessions. Existing unverified sessions require login again. |
| Ownership | Browser caches and guest access could conflict with account ownership and shared viewing. | Centralized server ownership checks; guest capabilities work only for unowned conversations; claims and deletion use transactions and row locks. |
| Browser privacy | Full reports and private metadata persisted in browser storage. | Removed persistent private report caches, migrated only recoverable guest capabilities, and fenced asynchronous responses across logout/account changes. |
| History | Account and follow-up history did not have a reliable server source. | Added private cursor pagination, report-specific saved questions/answers, account deletion cascades, and common authorized report loading. |
| Job recovery | Browser interruptions and concurrent requests could lose work, repeat generation, or show false success. | Durable admission before acknowledgement, idempotent request identities, fenced leases, bounded transient retries, transactional report commits, and cron/worker recovery. |
| Input retention | Raw job payloads could outlive a failed or abandoned request. | Clear payloads on completion or terminal failure; unattended worker expires requests after 24 hours and cleans stale reservations. |
| Abuse and spend | Process-local limits and untrusted forwarded headers could bypass controls. | Shared database quotas for accounts, trusted IPs and global usage; finite configuration defaults and admission locks; removed the unused spoofable limiter. |
| Database | Fresh installation, legacy migration and serverless pooling needed verification. | Added an ordered baseline and forward migrations, queue/history indexes, a bounded reusable pool and direct-connection migration locking. Corrected PostgreSQL startup timeout options and a rate-limit timestamp cast using actual database failures. |
| Parsing and statistics | Multiline whitespace, ambiguous dates, empty placeholders, unusual names and timezone boundaries could distort results. | Preserve source text, select one date convention per export, reject invalid dates, count actual messages, support prototype-like participant names, and compute bounded UTC calendar statistics. |
| AI provider | Vertex and Developer API key routing could disagree; failures could encourage wasted retries. | Google-only routing, explicit Vertex support for ordinary Cloud keys, task model overrides, safe error classification and terminal handling of unknown errors. |
| Evidence and prose | Generated quotes, numeric anecdotes and schema instructions could encourage unsupported claims. | Model selects source IDs; server inserts and verifies exact quotations. Prompts and schema descriptions distinguish observations from interpretation and avoid fabricated percentages or hidden-feeling certainty. |
| Follow-up/email APIs | Caller data and duplicate requests could undermine saved answers; email calls lacked a deadline. | Follow-ups use server-owned evidence and idempotent reservations. Email delivery requires ownership, rejects shared mode, uses metadata-only queries, enforces quotas and has a 15-second deadline. |
| Deployment bundle | Private test exports, environment files and generated audit artifacts could be uploaded. | Explicit deployment exclusions, server-only credentials, private response headers, anti-framing policy, robots exclusions, a safe configuration/schema health endpoint, and a generic error page. |
| Dependencies and helpers | Unused payment/UI/email packages and old scripts expanded maintenance and risk. | Removed unused packages; retired unsafe legacy benchmark/smoke entry points; added explicit isolated browser testing and bounded opt-in model probes. |

## Verification recorded so far

- Node.js 24 production build, strict lint and 63 ordinary unit tests passed before the final email/copy changes. The nine added email regression tests also passed separately. Final combined checks will be recorded below.
- All 12 isolated authentication/database scenarios passed, including a fresh migration chain, legacy upgrade, stable Google identity, simultaneous claims, revocation, pagination and account deletion. Two idle socket failures passed targeted retries after test connection cleanup was corrected.
- All 15 isolated job/follow-up scenarios passed, including concurrent admission, retry classification, cancellation fencing, cleanup and database-commit recovery without a second provider call.
- The disposable Neon branch was used for real database writes; production data was not modified. Integration test schemas were removed after their runs.
- The initial production-build browser run passed desktop/mobile rendering, saved question refresh, duplicate-question retry and durable error states. Its shared-link step and cleanup need investigation before a browser pass can be claimed.
- The production dependency audit reported zero known vulnerabilities. Development dependencies have the upstream advisories described below.
- Vertex model inventory now labels candidates unverified by default and makes no enumeration request with an API key. Live access probes require an explicit model count.

## External launch requirements and practical limits

- Configure `APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `REQUIRE_AUTH=true`, database credentials, Google inference credentials and `CRON_SECRET` in the deployment environment. These credentials are different from each other; never publish them in browser code.
- Publish/configure the Google consent screen as required for the intended audience, then test the actual HTTPS callback with a real account. Mocked identity tests cannot prove this configuration.
- Apply the reviewed migrations to production after backup/restore preparation. Do not roll back to the former unverified authentication implementation.
- Verify scheduled recovery on the actual deployment. The committed minute cron requires Vercel Pro or Enterprise; a successful local worker test does not prove the hosted scheduler is running.
- Set provider quotas, billing alerts and an operational spending policy. Application limits count requests; they do not guarantee a dollar cap. Reasoning, optional editing, transient retries and follow-ups consume quota. Users can use the product free while the operator pays hosting/provider costs.
- Verify the database restore window and practice recovery. Active-record deletion and backup expiration are separate processes.
- Native macOS Messages extraction is not included. The supported iMessage input is a text export in the documented format.
- AI conclusions are interpretations. Exact quote verification does not prove every narrative inference, and passing a finite test suite is not a guarantee that every future input or provider response will succeed.

### Development dependency advisories

The complete dependency audit currently reports nine affected packages across two tooling chains: old `esbuild` inside `drizzle-kit` (development-server request exposure) and `braces` through Next.js's ESLint tooling (deeply nested pattern denial of service). Several affected packages are transitive entries for the same underlying advisory. The production dependency audit is clean.

The registry's current `braces` version is still 3.0.3 and is included in the advisory. The automated fix proposal would downgrade Next.js ESLint tooling and Drizzle Kit across major versions; that is not a safe production-readiness fix. Keep this explicit maintenance item, use the reviewed tooling locally/CI with trusted inputs, and adopt a compatible upstream fix when available. No vulnerable development server has been exposed as part of this task.

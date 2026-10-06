import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analysisJobs, conversations, followups, reports, requestLimits } from '@/lib/db/schema';
import { computeChatMetrics } from '@/lib/forensics/metrics';
import { computeDetailedStats } from '@/lib/forensics/detailed-stats';
import { detectTurningPoint } from '@/lib/forensics/turning-point';
import { isDeletedPlaceholder } from '@/lib/parser/whatsapp';
import { positiveIntegerSetting, RequestError } from '@/lib/requests';
import { AnalysisInput } from './input';
import { generateFrankFullReportFull, previewFromReport } from './analyzer';
import { toAIServiceError } from './gemini';

export const JOB_ADMISSION_LOCK = 729431;
export const MAX_JOB_ATTEMPTS = 2;
// The report call is bounded at 180s, its optional editor at 30s. The remaining
// minute covers metrics and persistence; writes are also fenced by this lease.
export const JOB_LEASE_MS = 270_000;
export const FOLLOWUP_LEASE_MS = 90_000;
const DAY_MS = 86_400_000;

/** Dedicated workers own generation on Node hosts; Vercel can use after(). */
export function jobsRunInline(): boolean {
  const mode = process.env.JOB_EXECUTION_MODE || 'inline';
  if (mode !== 'inline' && mode !== 'worker') throw new RequestError('Job processing needs configuration.', 503);
  return mode === 'inline';
}

type Database = NonNullable<typeof db>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type RunResult = { status: 'completed' | 'queued' | 'failed' | 'skipped' };

export function jobLimits() {
  const active = positiveIntegerSetting('MAX_ACTIVE_JOBS', 3, 100);
  return {
    active,
    concurrent: Math.min(active, positiveIntegerSetting('MAX_CONCURRENT_JOBS', 2, 8)),
    daily: positiveIntegerSetting('MAX_DAILY_REPORTS', 50, 10_000),
  };
}

/** Reconciliation does not need a browser, and never replaces an existing report. */
async function reconcileJobs(tx: Transaction, id?: string) {
  const selected = id ? eq(analysisJobs.id, id) : sql`true`;
  const hasReport = sql`EXISTS (SELECT 1 FROM ${reports} WHERE ${reports.conversationId} = ${analysisJobs.conversationId} AND ${reports.reportNumber} = 1 AND ${reports.fullReportData} IS NOT NULL)`;
  const recovered = await tx.update(analysisJobs).set({
    status: 'completed', stage: 'Report ready', payload: null, leaseId: null, leaseUntil: null,
    errorCode: null, errorMessage: null, updatedAt: new Date(),
  }).where(and(selected, hasReport, sql`(${analysisJobs.status} <> 'completed' OR ${analysisJobs.payload} IS NOT NULL OR ${analysisJobs.leaseId} IS NOT NULL)`)).returning({ id: analysisJobs.id });

  const expired = await tx.update(analysisJobs).set({
    status: 'failed', stage: 'Could not finish', payload: null, leaseId: null, leaseUntil: null,
    errorCode: 'JOB_EXPIRED', errorMessage: 'This request expired. Please upload the chat again.', updatedAt: new Date(),
  }).where(and(selected, sql`${analysisJobs.status} IN ('queued', 'running')`, sql`${analysisJobs.createdAt} <= now() - interval '24 hours'`)).returning({ id: analysisJobs.id });

  const exhausted = await tx.update(analysisJobs).set({
    status: 'failed', stage: 'Could not finish', payload: null, leaseId: null, leaseUntil: null,
    errorCode: 'JOB_INTERRUPTED', errorMessage: 'The report was interrupted and could not be recovered. Please upload again.', updatedAt: new Date(),
  }).where(and(selected, sql`(${analysisJobs.status} = 'queued' OR (${analysisJobs.status} = 'running' AND (${analysisJobs.leaseUntil} IS NULL OR ${analysisJobs.leaseUntil} <= now())))`, sql`(${analysisJobs.attempts} >= ${MAX_JOB_ATTEMPTS} OR ${analysisJobs.payload} IS NULL)`)).returning({ id: analysisJobs.id });

  const missing = await tx.update(analysisJobs).set({
    status: 'failed', stage: 'Could not finish', payload: null, leaseId: null, leaseUntil: null,
    errorCode: 'JOB_MISSING_REPORT', errorMessage: 'The saved report is unavailable. Please upload the chat again.', updatedAt: new Date(),
  }).where(and(selected, sql`${analysisJobs.status} = 'completed'`, sql`NOT ${hasReport}`)).returning({ id: analysisJobs.id });

  const invalid = await tx.update(analysisJobs).set({
    status: 'failed', stage: 'Could not finish', payload: null, leaseId: null, leaseUntil: null,
    errorCode: 'JOB_INVALID_STATE', errorMessage: 'The request could not be recovered. Please upload again.', updatedAt: new Date(),
  }).where(and(selected, sql`${analysisJobs.status} NOT IN ('queued', 'running', 'completed', 'failed')`)).returning({ id: analysisJobs.id });

  const requeued = await tx.update(analysisJobs).set({
    status: 'queued', stage: 'Waiting to retry', leaseId: null, leaseUntil: null, updatedAt: new Date(),
  }).where(and(selected, eq(analysisJobs.status, 'running'), sql`(${analysisJobs.leaseUntil} IS NULL OR ${analysisJobs.leaseUntil} <= now())`, sql`${analysisJobs.attempts} < ${MAX_JOB_ATTEMPTS}`)).returning({ id: analysisJobs.id });

  const cleared = await tx.update(analysisJobs).set({ payload: null, leaseId: null, leaseUntil: null })
    .where(and(selected, sql`${analysisJobs.status} NOT IN ('queued', 'running')`, sql`(${analysisJobs.payload} IS NOT NULL OR ${analysisJobs.leaseId} IS NOT NULL OR ${analysisJobs.leaseUntil} IS NOT NULL)`)).returning({ id: analysisJobs.id });
  return { recovered: recovered.length, expired: expired.length, failed: exhausted.length + missing.length + invalid.length, requeued: requeued.length, cleared: cleared.length };
}

export async function recoverAnalysisJob(id: string) {
  if (!db) throw new RequestError('Report storage is unavailable.', 503);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${JOB_ADMISSION_LOCK})`);
    await reconcileJobs(tx, id);
    const [job] = await tx.select({ status: analysisJobs.status, stage: analysisJobs.stage, errorMessage: analysisJobs.errorMessage })
      .from(analysisJobs).where(eq(analysisJobs.id, id)).limit(1);
    return job ?? null;
  });
}

async function claimJob(id: string) {
  if (!db) throw new RequestError('Report storage is unavailable.', 503);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${JOB_ADMISSION_LOCK})`);
    await reconcileJobs(tx, id);
    const [active] = await tx.select({ count: sql<number>`count(*)::int` }).from(analysisJobs)
      .where(and(eq(analysisJobs.status, 'running'), sql`${analysisJobs.leaseUntil} > now()`));
    if (active.count >= jobLimits().concurrent) return null;
    const [job] = await tx.update(analysisJobs).set({
      status: 'running', stage: 'Reading the complete chat', leaseId: randomUUID(),
      leaseUntil: new Date(Date.now() + JOB_LEASE_MS), attempts: sql`${analysisJobs.attempts} + 1`,
      errorCode: null, errorMessage: null, updatedAt: new Date(),
    }).where(and(eq(analysisJobs.id, id), eq(analysisJobs.status, 'queued'),
      sql`(${analysisJobs.leaseUntil} IS NULL OR ${analysisJobs.leaseUntil} <= now())`,
      sql`${analysisJobs.attempts} < ${MAX_JOB_ATTEMPTS}`, sql`${analysisJobs.payload} IS NOT NULL`,
      sql`${analysisJobs.createdAt} > now() - interval '24 hours'`)).returning();
    return job ?? null;
  });
}

export async function runAnalysisJob(id: string): Promise<RunResult> {
  if (!db) throw new RequestError('Report storage is unavailable.', 503);
  const database = db;
  const job = await claimJob(id);
  if (!job?.leaseId) return { status: 'skipped' };
  const leaseId = job.leaseId;
  let envelope: Record<string, unknown>;
  let participants: string[];
  let messageCount: number;
  try {
    const input = AnalysisInput.parse(job.payload);
    const messages = input.messages.map((message, index) => ({
      ...message, id: String(index + 1), timestamp: new Date(message.at),
      isSystem: message.isSystem || false, isDeleted: isDeletedPlaceholder(message.content),
    })).sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
    const stats = computeChatMetrics(messages);
    const detailedStats = computeDetailedStats(messages, stats);
    const turningPoint = detectTurningPoint(messages);
    const source = messages.filter(message => !message.isSystem).map(message => ({ sender: message.sender, content: message.content, at: message.at }));
    const result = await generateFrankFullReportFull(input.category, stats, turningPoint, source, input.userNote, input.reportLanguage, input.myName);
    envelope = { preview: previewFromReport(result.data), fullReport: result.data, stats, detailedStats, turningPoint, reportLanguage: input.reportLanguage, myName: input.myName, usage: result.usage };
    participants = stats.participants.map(participant => participant.name);
    messageCount = stats.totalMessages;
  } catch (error) {
    const failure = toAIServiceError(error);
    const retryable = ['AI_TIMEOUT', 'AI_RATE_LIMITED', 'AI_UNAVAILABLE'].includes(failure.code)
      && job.attempts < MAX_JOB_ATTEMPTS && Date.now() - job.createdAt.getTime() < DAY_MS;
    const [updated] = await database.update(analysisJobs).set({
      status: retryable ? 'queued' : 'failed', stage: retryable ? 'Waiting to retry' : 'Could not finish',
      payload: retryable ? job.payload : null, errorCode: failure.code, errorMessage: failure.message,
      leaseId: null, leaseUntil: retryable ? new Date(Date.now() + (failure.code === 'AI_RATE_LIMITED' ? 30_000 : 10_000)) : null,
      updatedAt: new Date(),
    }).where(and(eq(analysisJobs.id, id), eq(analysisJobs.leaseId, leaseId), eq(analysisJobs.status, 'running'))).returning({ status: analysisJobs.status });
    return { status: updated ? (retryable ? 'queued' : 'failed') : 'skipped' };
  }

  // Retry only persistence after generating a report. An uncertain commit is
  // checked under locks before any insert; it never triggers another AI call here.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await database.transaction(async tx => {
        await tx.execute(sql`SET LOCAL statement_timeout = '3000'`);
        await tx.execute(sql`SET LOCAL lock_timeout = '3000'`);
        // Lock parent before child, matching deletion/claim transactions.
        const [conversation] = await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, job.conversationId)).for('update');
        if (!conversation) return { status: 'skipped' as const };
        const [active] = await tx.select({ status: analysisJobs.status, leaseId: analysisJobs.leaseId, leaseUntil: analysisJobs.leaseUntil })
          .from(analysisJobs).where(eq(analysisJobs.id, id)).for('update');
        const [existing] = await tx.select({ id: reports.id }).from(reports)
          .where(and(eq(reports.conversationId, job.conversationId), eq(reports.reportNumber, 1), sql`${reports.fullReportData} IS NOT NULL`)).limit(1);
        if (existing) {
          if (active) await tx.update(analysisJobs).set({ status: 'completed', stage: 'Report ready', payload: null, leaseId: null, leaseUntil: null, errorCode: null, errorMessage: null, updatedAt: new Date() }).where(eq(analysisJobs.id, id));
          return { status: 'completed' as const };
        }
        if (!active || active.status !== 'running' || active.leaseId !== leaseId || !active.leaseUntil || active.leaseUntil.getTime() <= Date.now()) return { status: 'skipped' as const };
        const previewData = { preview: envelope.preview };
        await tx.insert(reports).values({ conversationId: job.conversationId, reportNumber: 1, previewData, fullReportData: envelope, isUnlocked: true })
          .onConflictDoUpdate({ target: [reports.conversationId, reports.reportNumber], set: { previewData, fullReportData: envelope, isUnlocked: true }, setWhere: sql`${reports.fullReportData} IS NULL` });
        await tx.update(conversations).set({ participants, messageCount }).where(eq(conversations.id, job.conversationId));
        await tx.update(analysisJobs).set({
          status: 'completed', stage: 'Report ready', payload: null, leaseId: null, leaseUntil: null,
          errorCode: null, errorMessage: null, updatedAt: new Date(),
        }).where(and(eq(analysisJobs.id, id), eq(analysisJobs.leaseId, leaseId), eq(analysisJobs.status, 'running')));
        return { status: 'completed' as const };
      });
    } catch {
      if (attempt === 2) throw new RequestError('Report storage is temporarily unavailable. The worker will recover this request.', 503);
      await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  return { status: 'skipped' };
}

export async function runWorkerTick() {
  if (!db) throw new RequestError('Report storage is unavailable.', 503);
  const database = db;
  const maintenance = await database.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${JOB_ADMISSION_LOCK})`);
    const jobs = await reconcileJobs(tx);
    const questions = await tx.update(followups).set({ status: 'failed', answer: null, updatedAt: new Date() })
      .where(and(eq(followups.status, 'pending'), sql`${followups.updatedAt} <= now() - (${FOLLOWUP_LEASE_MS} * interval '1 millisecond')`)).returning({ id: followups.id });
    const limits = await tx.delete(requestLimits).where(sql`${requestLimits.expiresAt} <= now() - interval '24 hours'`).returning({ key: requestLimits.key });
    return { ...jobs, expiredLimits: limits.length, staleFollowups: questions.length };
  });
  const queued = await database.select({ id: analysisJobs.id }).from(analysisJobs)
    .where(and(eq(analysisJobs.status, 'queued'), sql`(${analysisJobs.leaseUntil} IS NULL OR ${analysisJobs.leaseUntil} <= now())`))
    .orderBy(asc(analysisJobs.createdAt)).limit(jobLimits().concurrent);
  const outcomes = await Promise.allSettled(queued.map(job => runAnalysisJob(job.id)));
  const stats = { ...maintenance, completed: 0, retried: 0, failedRuns: 0, skipped: 0 };
  let failedTick = false;
  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') { failedTick = true; continue; }
    if (outcome.value.status === 'completed') stats.completed++;
    else if (outcome.value.status === 'queued') stats.retried++;
    else if (outcome.value.status === 'failed') stats.failedRuns++;
    else stats.skipped++;
  }
  if (failedTick) throw new RequestError('The worker could not persist all queued work. Please retry the tick.', 503);
  return stats;
}

import { after, NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analysisJobs, conversations, reports } from '@/lib/db/schema';
import { currentProfile, ownsConversationWithIdentity, requireAuthentication } from '@/lib/auth/access';
import { positiveIntegerSetting, rateLimit, readJson, RequestError, requestFailure } from '@/lib/requests';
import { AnalysisInput } from '@/lib/ai/input';
import { JOB_ADMISSION_LOCK, jobLimits, jobsRunInline, runAnalysisJob } from '@/lib/ai/jobs';
import { buildFullTranscript } from '@/lib/ai/analyzer';
import { getGeminiModel, toAIServiceError, AIServiceError } from '@/lib/ai/gemini';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
const DAY_MS = 86_400_000;

export async function POST(req: NextRequest) {
  try {
    if (!db) throw new RequestError('Report storage is unavailable.', 503);
    const inline = jobsRunInline();
    const profile = await currentProfile(req);
    if (requireAuthentication() && !profile) throw new RequestError('Sign in before creating your report.', 401);
    const parsed = AnalysisInput.safeParse(await readJson(req));
    if (!parsed.success) throw new RequestError(parsed.error.issues[0]?.message || 'Please check your chat and participant names.');
    const input = parsed.data;
    const guestToken = req.headers.get('x-conversation-token');
    if (!profile && (!guestToken || !/^[a-f0-9]{64}$/i.test(guestToken))) {
      throw new RequestError('Save a new private access key in this browser before creating a report.');
    }
    const result = await db.transaction(async tx => {
      // The identity check and insert share the lock. A lost response can replay
      // the same ID and capability without a second quota charge or paid job.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${JOB_ADMISSION_LOCK})`);
      const [existing] = await tx.select().from(conversations).where(eq(conversations.id, input.conversationId)).for('update');
      if (existing) {
        if (!ownsConversationWithIdentity(req, existing, profile)) throw new RequestError('Conversation not found.', 404);
        const [job] = await tx.select({ status: analysisJobs.status }).from(analysisJobs).where(eq(analysisJobs.conversationId, existing.id)).limit(1);
        const [report] = await tx.select({ id: reports.id }).from(reports).where(and(eq(reports.conversationId, existing.id), sql`${reports.fullReportData} IS NOT NULL`)).limit(1);
        const status = report ? 'completed' : job && ['queued', 'running', 'failed'].includes(job.status) ? job.status : 'failed';
        return { conversationId: existing.id, jobId: existing.id, deleteToken: existing.userId === null ? existing.deleteToken ?? undefined : undefined, status };
      }

      getGeminiModel('report');
      await buildFullTranscript(input.category, input.messages.filter(message => !message.isSystem));
      const limits = jobLimits();
      const [active] = await tx.select({ count: sql<number>`count(*)::int` }).from(analysisJobs)
        .where(sql`${analysisJobs.status} IN ('queued', 'running')`);
      if (active.count >= limits.active) throw new RequestError('Frank is busy reading other chats. Please try again shortly.', 429, 60);
      const [today] = await tx.select({ count: sql<number>`count(*)::int` }).from(analysisJobs)
        .where(sql`${analysisJobs.createdAt} >= now() - interval '24 hours'`);
      if (today.count >= limits.daily) throw new RequestError('Today’s free report limit has been reached. Please try again tomorrow.', 429, 3600);
      // Keep a separate global ledger so deleting a report cannot reset its cost.
      await rateLimit(req, 'analysis-global', limits.daily, DAY_MS, { identity: 'all', transaction: tx });
      await rateLimit(req, 'analysis-ip', positiveIntegerSetting('MAX_REPORTS_PER_IP', 10, 200), DAY_MS, { transaction: tx });
      if (profile) await rateLimit(req, 'analysis-account', positiveIntegerSetting('MAX_REPORTS_PER_ACCOUNT', 5, 100), DAY_MS, { identity: profile.id, transaction: tx });
      await tx.insert(conversations).values({
        id: input.conversationId, userId: profile?.id ?? null, title: input.myName ? `${input.myName}'s conversation` : 'Chat report',
        category: input.category, source: input.source, deleteToken: profile ? null : guestToken,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        participants: [...new Set(input.messages.filter(message => !message.isSystem).map(message => message.sender))],
        messageCount: input.messages.filter(message => !message.isSystem).length,
      });
      await tx.insert(analysisJobs).values({ id: input.conversationId, conversationId: input.conversationId, payload: input });
      return { conversationId: input.conversationId, jobId: input.conversationId, deleteToken: profile ? undefined : guestToken, status: 'queued' };
    });
    if (inline && (result.status === 'queued' || result.status === 'running')) {
      after(async () => {
        try { await runAnalysisJob(result.jobId); }
        catch { console.error('[jobs] Background processing could not persist work; scheduled recovery is required.'); }
      });
    }
    return Response.json(result, { status: 202, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AIServiceError) {
      const failure = toAIServiceError(error);
      return Response.json({ error: failure.message, code: failure.code }, {
        status: failure.status, headers: { 'Cache-Control': 'private, no-store', ...(failure.status === 429 ? { 'Retry-After': '60' } : {}) },
      });
    }
    return requestFailure(error);
  }
}

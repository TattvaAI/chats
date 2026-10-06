import { after } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, reports } from '@/lib/db/schema';
import { ownsConversation, UUID_RE } from '@/lib/auth/access';
import { jobsRunInline, recoverAnalysisJob, runAnalysisJob } from '@/lib/ai/jobs';
import { RequestError, requestFailure } from '@/lib/requests';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new RequestError('Invalid conversation ID.');
    if (!db) throw new RequestError('Report storage is unavailable.', 503);
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conversation || !await ownsConversation(req, conversation)) throw new RequestError('Conversation not found.', 404);
    const job = await recoverAnalysisJob(id);
    if (!job) {
      const [report] = await db.select({ id: reports.id }).from(reports)
        .where(and(eq(reports.conversationId, id), sql`${reports.fullReportData} IS NOT NULL`)).limit(1);
      if (!report) throw new RequestError('No report request was found. Please upload the chat again.', 404);
      return Response.json({ status: 'completed', stage: 'Report ready' }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    if (jobsRunInline() && job.status === 'queued') {
      after(async () => {
        try { await runAnalysisJob(id); }
        catch { console.error('[jobs] Background processing could not persist work; scheduled recovery is required.'); }
      });
    }
    return Response.json({ status: job.status, stage: job.stage, ...(job.status === 'failed' ? { error: job.errorMessage || 'The report could not be completed. Please upload again.' } : {}) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return requestFailure(error); }
}

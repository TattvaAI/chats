import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analysisJobs, conversations, reports } from '@/lib/db/schema';
import { currentProfile } from '@/lib/auth/access';
import { privateJson, privateResponse } from '@/lib/auth/http';
import { conversationPagination, encodeConversationCursor } from '@/lib/auth/pagination';
import { RequestError, requestFailure } from '@/lib/requests';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const query = new URL(req.url).searchParams;
    if (query.get('mine') !== '1') throw new RequestError('Not found.', 404);
    const { cursor, limit } = conversationPagination(query);
    const profile = await currentProfile(req);
    if (!profile) throw new RequestError('Sign in to view your saved reports.', 401);
    if (!db) throw new RequestError('Account storage is unavailable. Please try again.', 503);
    const latestJob = db.select({ status: analysisJobs.status, stage: analysisJobs.stage, error: analysisJobs.errorMessage })
      .from(analysisJobs).where(eq(analysisJobs.conversationId, conversations.id))
      .orderBy(desc(analysisJobs.createdAt), desc(analysisJobs.id)).limit(1).as('latest_job');
    const rows = await db.select({
      id: conversations.id, title: conversations.title, category: conversations.category, createdAt: conversations.createdAt,
      // Date objects truncate PostgreSQL microseconds; retain them in the opaque cursor.
      cursorCreatedAt: sql<string>`to_char(${conversations.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      reportNumber: sql<number | null>`(select max(${reports.reportNumber}) from ${reports} where ${reports.conversationId} = ${conversations.id})`,
      job: { status: latestJob.status, stage: latestJob.stage, error: latestJob.error },
    }).from(conversations).leftJoinLateral(latestJob, sql`true`).where(and(
      eq(conversations.userId, profile.id),
      cursor ? sql`(${conversations.createdAt}, ${conversations.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)` : undefined,
    )).orderBy(desc(conversations.createdAt), desc(conversations.id)).limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return privateJson({
      conversations: page.map((row) => {
        const completed = row.reportNumber !== null;
        const status = completed ? 'completed' : row.job?.status === 'queued' || row.job?.status === 'running' ? row.job.status : 'failed';
        return {
          id: row.id, title: row.title, category: row.category, createdAt: row.createdAt, status, reportNumber: row.reportNumber,
          ...(completed ? { stage: 'Report ready' } : {
            stage: row.job?.stage ?? 'Report unavailable',
            ...(status === 'failed' ? { error: row.job?.error ?? 'This report could not be completed. Please upload again.' } : {}),
          }),
        };
      }),
      nextCursor: rows.length > limit && last ? encodeConversationCursor({ id: last.id, createdAt: last.cursorCreatedAt }) : null,
    });
  } catch (error) { return privateResponse(requestFailure(error)); }
}

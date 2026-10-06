import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, profiles, reports, analysisJobs } from '@/lib/db/schema';
import { isAuthorizedAdmin } from '@/lib/auth/admin';
import { privateResponse } from '@/lib/auth/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await isAuthorizedAdmin(req))) {
    return privateResponse(NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }));
  }

  if (!db) {
    return privateResponse(NextResponse.json({ error: 'Database unavailable.' }, { status: 503 }));
  }

  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('q')?.trim() || '';
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 25, 1), 100);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

    const conditions = search
      ? or(
          ilike(conversations.title, `%${search}%`),
          ilike(conversations.category, `%${search}%`),
          ilike(profiles.email, `%${search}%`),
          sql`${conversations.id}::text ILIKE ${`%${search}%`}`
        )
      : undefined;

    const query = db
      .select({
        id: conversations.id,
        title: conversations.title,
        category: conversations.category,
        source: conversations.source,
        participants: conversations.participants,
        messageCount: conversations.messageCount,
        createdAt: conversations.createdAt,
        userEmail: profiles.email,
        reportId: reports.id,
        reportNumber: reports.reportNumber,
        isUnlocked: reports.isUnlocked,
        jobStatus: analysisJobs.status,
        jobStage: analysisJobs.stage,
        jobError: analysisJobs.errorMessage,
      })
      .from(conversations)
      .leftJoin(profiles, eq(conversations.userId, profiles.id))
      .leftJoin(reports, eq(conversations.id, reports.conversationId))
      .leftJoin(analysisJobs, eq(conversations.id, analysisJobs.conversationId))
      .orderBy(desc(conversations.createdAt))
      .limit(limit)
      .offset(offset);

    const rows = conditions ? await query.where(conditions) : await query;

    return privateResponse(NextResponse.json({ items: rows, limit, offset }));
  } catch (error) {
    console.error('[admin/conversations]', error);
    return privateResponse(NextResponse.json({ error: 'Failed to fetch conversations.' }, { status: 500 }));
  }
}

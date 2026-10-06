import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, profiles, reports, analysisJobs, followups } from '@/lib/db/schema';
import { isAuthorizedAdmin } from '@/lib/auth/admin';
import { privateResponse } from '@/lib/auth/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorizedAdmin(req))) {
    return privateResponse(NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }));
  }

  if (!db) {
    return privateResponse(NextResponse.json({ error: 'Database unavailable.' }, { status: 503 }));
  }

  try {
    const { id } = await params;

    const [conv] = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        category: conversations.category,
        source: conversations.source,
        participants: conversations.participants,
        messageCount: conversations.messageCount,
        createdAt: conversations.createdAt,
        expiresAt: conversations.expiresAt,
        userEmail: profiles.email,
      })
      .from(conversations)
      .leftJoin(profiles, eq(conversations.userId, profiles.id))
      .where(eq(conversations.id, id))
      .limit(1);

    if (!conv) {
      return privateResponse(NextResponse.json({ error: 'Conversation not found.' }, { status: 404 }));
    }

    const reportList = await db
      .select({
        id: reports.id,
        reportNumber: reports.reportNumber,
        type: reports.type,
        isUnlocked: reports.isUnlocked,
        previewData: reports.previewData,
        fullReportData: reports.fullReportData,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.conversationId, id))
      .orderBy(reports.reportNumber);

    const [job] = await db
      .select({
        id: analysisJobs.id,
        status: analysisJobs.status,
        stage: analysisJobs.stage,
        attempts: analysisJobs.attempts,
        errorCode: analysisJobs.errorCode,
        errorMessage: analysisJobs.errorMessage,
        createdAt: analysisJobs.createdAt,
        updatedAt: analysisJobs.updatedAt,
      })
      .from(analysisJobs)
      .where(eq(analysisJobs.conversationId, id))
      .limit(1);

    const followupList = await db
      .select({
        id: followups.id,
        question: followups.question,
        answer: followups.answer,
        status: followups.status,
        createdAt: followups.createdAt,
      })
      .from(followups)
      .where(eq(followups.conversationId, id))
      .orderBy(desc(followups.createdAt));

    return privateResponse(NextResponse.json({
      conversation: conv,
      reports: reportList,
      job: job ?? null,
      followups: followupList,
    }));
  } catch (error) {
    console.error('[admin/conversations/[id]]', error);
    return privateResponse(NextResponse.json({ error: 'Failed to fetch conversation details.' }, { status: 500 }));
  }
}

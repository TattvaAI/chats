import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, profiles, reports, analysisJobs, feedback, followups } from '@/lib/db/schema';
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
    const [profilesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(profiles);
    const [conversationsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(conversations);
    const [reportsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(reports);
    const [feedbackCount] = await db.select({ count: sql<number>`count(*)::int` }).from(feedback);
    const [followupsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(followups);
    const jobsByStatus = await db.select({
      status: analysisJobs.status,
      count: sql<number>`count(*)::int`,
    }).from(analysisJobs).groupBy(analysisJobs.status);

    const jobsMap: Record<string, number> = {};
    for (const j of jobsByStatus) {
      jobsMap[j.status] = j.count;
    }

    return privateResponse(NextResponse.json({
      stats: {
        profiles: profilesCount?.count ?? 0,
        conversations: conversationsCount?.count ?? 0,
        reports: reportsCount?.count ?? 0,
        feedback: feedbackCount?.count ?? 0,
        followups: followupsCount?.count ?? 0,
        jobs: jobsMap,
      },
    }));
  } catch (error) {
    console.error('[admin/stats]', error);
    return privateResponse(NextResponse.json({ error: 'Failed to fetch statistics.' }, { status: 500 }));
  }
}

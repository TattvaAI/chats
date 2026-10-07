import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles, conversations } from '@/lib/db/schema';
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
    const userList = await db
      .select({
        id: profiles.id,
        email: profiles.email,
        locale: profiles.locale,
        createdAt: profiles.createdAt,
        googleLinked: sql<boolean>`${profiles.googleSub} IS NOT NULL`,
        reportCount: sql<number>`count(${conversations.id})::int`,
        latestChatAt: sql<string | null>`max(${conversations.createdAt})`,
      })
      .from(profiles)
      .leftJoin(conversations, eq(profiles.id, conversations.userId))
      .groupBy(profiles.id, profiles.email, profiles.locale, profiles.createdAt, profiles.googleSub)
      .orderBy(desc(profiles.createdAt));

    return privateResponse(NextResponse.json({ users: userList }));
  } catch (error) {
    console.error('[admin/users]', error);
    return privateResponse(NextResponse.json({ error: 'Failed to fetch users.' }, { status: 500 }));
  }
}

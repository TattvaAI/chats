import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { feedback } from '@/lib/db/schema';
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
    const items = await db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(100);
    return privateResponse(NextResponse.json({ items }));
  } catch (error) {
    console.error('[admin/feedback]', error);
    return privateResponse(NextResponse.json({ error: 'Failed to fetch feedback.' }, { status: 500 }));
  }
}

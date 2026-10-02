import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, sessions } from '@/lib/db/schema';
import { SESSION_COOKIE } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get('mine') !== '1') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const raw = req.cookies.get(SESSION_COOKIE)?.value;
    if (!raw || !db) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const [sess] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, tokenHash))
      .limit(1);
    if (!sess || new Date(sess.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rows = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        category: conversations.category,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(eq(conversations.userId, sess.profileId))
      .orderBy(desc(conversations.createdAt));
    return NextResponse.json({ conversations: rows });
  } catch (err: unknown) {
    console.error('Conversations mine error:', err);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles, sessions } from '@/lib/db/schema';
import { SESSION_COOKIE } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
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
      if (sess) {
        await db.delete(sessions).where(eq(sessions.token, tokenHash));
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, sess.profileId))
      .limit(1);
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ email: profile.email });
  } catch (err: unknown) {
    console.error('Auth me error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

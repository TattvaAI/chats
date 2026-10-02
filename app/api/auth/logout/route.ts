import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { SESSION_COOKIE } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const raw = req.cookies.get(SESSION_COOKIE)?.value;
    if (raw && db) {
      const tokenHash = createHash('sha256').update(raw).digest('hex');
      await db.delete(sessions).where(eq(sessions.token, tokenHash));
    }
  } catch (err) {
    console.error('Logout error:', err);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

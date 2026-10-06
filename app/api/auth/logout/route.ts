import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { privateJson } from '@/lib/auth/http';
import { getSessionRawToken, hashToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const raw = getSessionRawToken(req.headers.get('cookie'));
  try {
    if (raw) {
      if (!db) throw new Error('Storage unavailable');
      await db.delete(sessions).where(eq(sessions.token, hashToken(raw)));
    }
    const response = privateJson({ ok: true });
    response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
    return response;
  } catch {
    // Keep the cookie until revocation succeeds, so the browser can retry.
    return privateJson({ error: 'Sign-out could not be completed. Please try again.' }, 503);
  }
}

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { otpCodes, profiles, sessions } from '@/lib/db/schema';
import { createSession, getSessionRawToken, SESSION_COOKIE, hashToken, sessionCookieOptions } from '@/lib/auth/session';
import { equalSecret } from '@/lib/auth/access';
import { privateJson, privateResponse } from '@/lib/auth/http';
import { rateLimit, readJson, RequestError, requestFailure } from '@/lib/requests';

const inputSchema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request) {
  try {
    const { email, code } = inputSchema.parse(await readJson(req, 8192));
    if (!db || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new RequestError('Email sign-in is unavailable.', 503);
    await rateLimit(req, 'otp-verify', 20);
    const previous = getSessionRawToken(req.headers.get('cookie'));
    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(otpCodes).where(eq(otpCodes.email, email)).for('update');
      if (!row || row.expiresAt <= new Date() || row.attempts >= 5) return null;
      if (!equalSecret(row.code, hashToken(code))) {
        await tx.update(otpCodes).set({ attempts: sql`${otpCodes.attempts} + 1` }).where(eq(otpCodes.email, email));
        return null;
      }
      await tx.delete(otpCodes).where(eq(otpCodes.email, email));
      const [profile] = await tx.insert(profiles).values({ email })
        .onConflictDoUpdate({ target: profiles.email, set: { email } }).returning({ id: profiles.id });
      const { rawToken, ...session } = createSession();
      if (previous) await tx.delete(sessions).where(eq(sessions.token, hashToken(previous)));
      await tx.insert(sessions).values({ ...session, profileId: profile.id });
      return { rawToken };
    });
    if (!result) throw new RequestError('Invalid or expired code.', 401);
    const response = privateJson({ ok: true });
    response.cookies.set(SESSION_COOKIE, result.rawToken, sessionCookieOptions());
    return response;
  } catch (error) { return privateResponse(requestFailure(error)); }
}

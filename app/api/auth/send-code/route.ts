import { randomInt } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { otpCodes } from '@/lib/db/schema';
import { hashToken } from '@/lib/auth/session';
import { privateJson, privateResponse } from '@/lib/auth/http';
import { rateLimit, readJson, RequestError, requestFailure } from '@/lib/requests';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { email } = z.object({ email: z.email().max(254).transform((value) => value.trim().toLowerCase()) }).parse(await readJson(req, 4096));
    if (!db || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new RequestError('Email sign-in is not configured. Use Google sign-in if available.', 503);
    await rateLimit(req, 'otp-send', 5, 3_600_000);
    await rateLimit(req, 'otp-send-email', 5, 3_600_000, { identity: `email:${email}` });
    await rateLimit(req, 'otp-send-global', 1000, 86_400_000, { identity: 'global' });
    const code = String(randomInt(100000, 1000000));
    const codeHash = hashToken(code);
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'otp-send:' + email}))`);
      const [previous] = await tx.select({ lastSentAt: otpCodes.lastSentAt }).from(otpCodes).where(eq(otpCodes.email, email)).for('update');
      if (previous && previous.lastSentAt.getTime() > now.getTime() - 60_000) throw new RequestError('Please wait a minute before requesting another code.', 429, 60);
      await tx.insert(otpCodes).values({ email, code: codeHash, expiresAt: new Date(now.getTime() + 900_000), attempts: 0, lastSentAt: now })
        .onConflictDoUpdate({ target: otpCodes.email, set: { code: codeHash, expiresAt: new Date(now.getTime() + 900_000), attempts: 0, lastSentAt: now } });
    });
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM, to: [email], subject: `${code} is your Frank sign-in code`,
          text: `Your sign-in code is ${code}. It expires in 15 minutes. If you did not request this email, ignore it.`,
        }),
      });
      if (!response.ok) throw new Error('Delivery failed');
      await response.body?.cancel();
    } catch {
      // Do not delete a newer code if another request completed while the provider was slow.
      await db.delete(otpCodes).where(and(eq(otpCodes.email, email), eq(otpCodes.code, codeHash)));
      throw new RequestError('The sign-in email could not be sent. Please try again.', 502);
    }
    return privateJson({ success: true });
  } catch (error) { return privateResponse(requestFailure(error)); }
}

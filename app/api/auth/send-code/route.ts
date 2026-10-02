import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { db } from '@/lib/db';
import { otpCodes } from '@/lib/db/schema';

const MAX_SENDS_PER_HOUR = 5;
const CODE_TTL_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail } = await req.json();
    const email =
      typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

    if (db) {
      const [existing] = await db
        .select()
        .from(otpCodes)
        .where(eq(otpCodes.email, email))
        .limit(1);

      if (existing) {
        const lastSent = existing.lastSentAt
          ? new Date(existing.lastSentAt).getTime()
          : 0;
        const windowStart = existing.lastSentAt
          ? lastSent
          : new Date(existing.createdAt).getTime();
        const withinHour = now.getTime() - windowStart < 60 * 60 * 1000;
        // sendCount tracks sends in the current 1h window; reset when window elapsed.
        const countInWindow = withinHour ? (existing.sendCount ?? 0) : 0;
        if (withinHour && countInWindow >= MAX_SENDS_PER_HOUR) {
          return NextResponse.json(
            { error: 'Too many codes requested. Try again later.' },
            { status: 429 }
          );
        }
        const nextCount = withinHour ? countInWindow + 1 : 1;
        await db
          .update(otpCodes)
          .set({
            code,
            expiresAt,
            attempts: 0,
            sendCount: nextCount,
            lastSentAt: now,
          })
          .where(eq(otpCodes.email, email));
      } else {
        await db.insert(otpCodes).values({
          email,
          code,
          expiresAt,
          attempts: 0,
          sendCount: 1,
          lastSentAt: now,
        });
      }
    } else {
      console.log(`[Auth OTP] (no DB) Verification code for ${email}: ${code}`);
    }

    // Keep console.log fallback for local dev without a Resend key.
    console.log(`[Auth OTP] Verification code for ${email}: ${code}`);

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: 'Frank <login@whatfrankthinks.com>',
          to: email,
          subject: `${code} is your What Frank Thinks sign-in code`,
          text: `Your sign-in code for What Frank Thinks is ${code}. It expires in 15 minutes.`,
        });
      } catch (sendErr) {
        console.error('Resend send error (code already stored):', sendErr);
        // Still return success since code is stored and logged for dev.
      }
    }

    return NextResponse.json({ success: true, message: 'Code sent' });
  } catch (err: unknown) {
    console.error('Send code error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, otpCodes, profiles, sessions } from '@/lib/db/schema';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/session';

const MAX_VERIFY_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, code: rawCode, claimIds: rawClaimIds } = await req.json();
    const email =
      typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const claimIds = Array.isArray(rawClaimIds)
      ? [...new Set(rawClaimIds.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))).values()].slice(0, 20)
      : [];
    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code required' }, { status: 400 });
    }
    if (!db) {
      return NextResponse.json({ error: 'Auth unavailable' }, { status: 500 });
    }

    const [row] = await db
      .select()
      .from(otpCodes)
      .where(eq(otpCodes.email, email))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
    }

    const attempts = row.attempts ?? 0;
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      return NextResponse.json({ error: 'Too many attempts' }, { status: 401 });
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Code expired' }, { status: 401 });
    }
    if (row.code !== code) {
      await db
        .update(otpCodes)
        .set({ attempts: attempts + 1 })
        .where(eq(otpCodes.email, email));
      return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
    }

    // Success: consume OTP, upsert profile, create session.
    await db.delete(otpCodes).where(eq(otpCodes.email, email));

    let [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, email))
      .limit(1);
    if (!profile) {
      const inserted = await db
        .insert(profiles)
        .values({ email })
        .returning();
      profile = inserted[0];
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
    await db.insert(sessions).values({
      token: tokenHash,
      profileId: profile.id,
      expiresAt,
    });

    // Claim anonymous funnel reports created before sign-in.
    let claimed = 0;
    if (claimIds.length > 0) {
      try {
        const updated = await db
          .update(conversations)
          .set({ userId: profile.id })
          .where(and(inArray(conversations.id, claimIds), isNull(conversations.userId)))
          .returning({ id: conversations.id });
        claimed = updated.length;
      } catch {
        claimed = 0;
      }
    }

    const res = NextResponse.json({ ok: true, claimed });
    res.cookies.set(SESSION_COOKIE, rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (err: unknown) {
    console.error('Verify code error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

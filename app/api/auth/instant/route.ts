import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { eq, inArray, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles, sessions, conversations } from '@/lib/db/schema';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, claimIds: rawClaimIds } = await req.json();
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const claimIds = Array.isArray(rawClaimIds)
      ? [...new Set(rawClaimIds.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v)))].slice(0, 20)
      : [];

    // 1. Upsert profile
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

    // 2. Generate 30-day session token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

    await db.insert(sessions).values({
      token: tokenHash,
      profileId: profile.id,
      expiresAt,
    });

    // 3. Claim conversations created by this user or passed in claimIds
    let claimed = 0;
    if (claimIds.length > 0) {
      try {
        const updated = await db
          .update(conversations)
          .set({ userId: profile.id })
          .where(and(inArray(conversations.id, claimIds), isNull(conversations.userId)))
          .returning({ id: conversations.id });
        claimed = updated.length;
      } catch (claimErr) {
        console.warn('[Instant Auth] Claim error:', claimErr);
      }
    }

    const response = NextResponse.json({
      success: true,
      email: profile.email,
      claimed,
    });

    response.cookies.set(SESSION_COOKIE, rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (err: unknown) {
    console.error('Instant auth error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

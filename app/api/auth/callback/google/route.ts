import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles, sessions, conversations } from '@/lib/db/schema';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state');
  const error = searchParams.get('error');

  let next = '/account';
  if (stateRaw) {
    try {
      const parsed = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8'));
      if (parsed?.next && typeof parsed.next === 'string' && parsed.next.startsWith('/')) {
        next = parsed.next;
      }
    } catch {
      next = '/account';
    }
  }

  if (error || !code) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('error', error || 'google_cancelled');
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || !db) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('error', 'google_not_configured');
    return NextResponse.redirect(loginUrl);
  }

  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = `${proto}://${host}/api/auth/callback/google`;

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      console.error('[Google OAuth] Token exchange error:', await tokenRes.text());
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('error', 'google_token_failed');
      return NextResponse.redirect(loginUrl);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch user profile from Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('error', 'google_profile_failed');
      return NextResponse.redirect(loginUrl);
    }

    const userData = await userRes.json();
    const email = userData.email?.toLowerCase().trim();

    if (!email) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('error', 'google_no_email');
      return NextResponse.redirect(loginUrl);
    }

    // 3. Upsert profile in DB
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

    // 4. Create persistent session
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
    await db.insert(sessions).values({
      token: tokenHash,
      profileId: profile.id,
      expiresAt,
    });

    // 5. Redirect to destination and set cookie
    const redirectUrl = new URL(next, req.url);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(SESSION_COOKIE, rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (err) {
    console.error('[Google OAuth] Error during callback:', err);
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('error', 'google_server_error');
    return NextResponse.redirect(loginUrl);
  }
}

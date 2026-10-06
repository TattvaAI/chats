import { NextRequest, NextResponse } from 'next/server';
import { trustedOrigin, safeNext } from '@/lib/auth/access';
import { createGoogleState, OAUTH_MAX_AGE, OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from '@/lib/auth/google';
import { privateJson, privateResponse } from '@/lib/auth/http';
import { sessionCookieOptions } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  let origin: string;
  try { origin = trustedOrigin(); }
  catch { return privateJson({ error: 'Sign-in is not configured. Please contact support.' }, 503); }
  const next = safeNext(new URL(req.url).searchParams.get('next'));
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', 'google_not_configured');
    url.searchParams.set('next', next);
    return privateResponse(NextResponse.redirect(url));
  }
  const { state, cookieState, verifier, challenge } = createGoogleState(next);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/callback/google`,
    response_type: 'code', scope: 'openid email profile', prompt: 'select_account',
    state, code_challenge: challenge, code_challenge_method: 'S256',
  }).toString();
  const response = privateResponse(NextResponse.redirect(url));
  response.cookies.set(OAUTH_STATE_COOKIE, cookieState, sessionCookieOptions(OAUTH_MAX_AGE));
  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, sessionCookieOptions(OAUTH_MAX_AGE));
  return response;
}

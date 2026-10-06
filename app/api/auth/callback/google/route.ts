import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { trustedOrigin } from '@/lib/auth/access';
import { privateJson, privateResponse } from '@/lib/auth/http';
import {
  createGoogleSession, exchangeGoogleIdentity, GoogleSignInError,
  OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, verifyGoogleState,
} from '@/lib/auth/google';
import { getSessionRawToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function finish(response: NextResponse) {
  response.cookies.set(OAUTH_STATE_COOKIE, '', sessionCookieOptions(0));
  response.cookies.set(OAUTH_VERIFIER_COOKIE, '', sessionCookieOptions(0));
  return privateResponse(response);
}

export async function GET(req: NextRequest) {
  let origin: string;
  try { origin = trustedOrigin(); }
  catch { return finish(privateJson({ error: 'Sign-in is not configured. Please contact support.' }, 503)); }
  const query = new URL(req.url).searchParams;
  let next = '/account';
  try {
    const state = verifyGoogleState(query.get('state'), req.cookies.get(OAUTH_STATE_COOKIE)?.value, req.cookies.get(OAUTH_VERIFIER_COOKIE)?.value);
    next = state.next;
    if (query.has('error')) throw new GoogleSignInError('google_cancelled');
    const code = query.get('code');
    if (!code || code.length > 4096) throw new GoogleSignInError('google_cancelled');
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !db) throw new GoogleSignInError('google_not_configured');
    const identity = await exchangeGoogleIdentity(code, state.verifier, `${origin}/api/auth/callback/google`);
    const session = await createGoogleSession(identity, getSessionRawToken(req.headers.get('cookie')));
    const destination = new URL('/login/complete', origin);
    destination.searchParams.set('next', next);
    const response = NextResponse.redirect(destination);
    response.cookies.set(SESSION_COOKIE, session.rawToken, sessionCookieOptions());
    return finish(response);
  } catch (error) {
    // Never log tokens, authorization codes, provider bodies, profiles or SQL parameters.
    const destination = new URL('/login', origin);
    destination.searchParams.set('error', error instanceof GoogleSignInError ? error.code : 'google_server_error');
    destination.searchParams.set('next', next);
    return finish(NextResponse.redirect(destination));
  }
}

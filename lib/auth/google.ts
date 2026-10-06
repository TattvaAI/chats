import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { profiles, sessions } from '@/lib/db/schema';
import { equalSecret, safeNext } from './access';
import { createSession, hashToken } from './session';

export const OAUTH_STATE_COOKIE = 'frank_oauth_state';
export const OAUTH_VERIFIER_COOKIE = 'frank_oauth_verifier';
export const OAUTH_MAX_AGE = 600;

export class GoogleSignInError extends Error {
  constructor(public code: string) { super(code); }
}

export function createGoogleState(next: string) {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('hex');
  return {
    state,
    // Keep report paths and any fragment capabilities out of Google's authorization URL.
    cookieState: Buffer.from(JSON.stringify({ next: safeNext(next), nonce: state, issuedAt: Date.now() })).toString('base64url'),
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}

export function verifyGoogleState(state: string | null, cookieState: string | undefined, verifier: string | undefined) {
  if (!state || !/^[a-f0-9]{64}$/.test(state) || !cookieState || cookieState.length > 4096 || !verifier || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
    throw new GoogleSignInError('google_state_invalid');
  }
  try {
    const value = JSON.parse(Buffer.from(cookieState, 'base64url').toString('utf8'));
    if (!value || typeof value.next !== 'string' || !equalSecret(state, value.nonce) || !Number.isSafeInteger(value.issuedAt)
      || value.issuedAt > Date.now() + 60_000 || value.issuedAt < Date.now() - OAUTH_MAX_AGE * 1000) {
      throw new Error('Invalid state');
    }
    return { next: safeNext(value.next), verifier };
  } catch { throw new GoogleSignInError('google_state_invalid'); }
}

async function googleJson(url: string, init: RequestInit, errorCode: string) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000), redirect: 'error', cache: 'no-store' });
    if (!response.ok || Number(response.headers.get('content-length') || 0) > 32_768) throw new Error('Google request failed');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty response');
    let length = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32_768) { await reader.cancel(); throw new Error('Response too large'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch { throw new GoogleSignInError(errorCode); }
}

const GoogleIdentity = z.object({
  sub: z.string().min(1).max(255).regex(/^[^\s]+$/),
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  email_verified: z.literal(true),
});

export async function exchangeGoogleIdentity(code: string, verifier: string, redirectUri: string) {
  const tokenData = await googleJson('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, code_verifier: verifier, client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  }, 'google_token_failed');
  const token = z.object({ access_token: z.string().min(1).max(8192), token_type: z.string().regex(/^Bearer$/i) }).safeParse(tokenData);
  if (!token.success) throw new GoogleSignInError('google_token_failed');
  // UserInfo is fetched directly from Google with this code's access token. Never trust a caller's decoded JWT or email.
  const userData = await googleJson('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.data.access_token}` },
  }, 'google_profile_failed');
  const identity = GoogleIdentity.safeParse(userData);
  if (!identity.success) throw new GoogleSignInError('google_no_email');
  return identity.data;
}

export async function createGoogleSession(identity: { sub: string; email: string }, previousToken: string | null) {
  if (!db) throw new GoogleSignInError('google_server_error');
  return db.transaction(async (tx) => {
    for (const key of [`email:${identity.email}`, `google:${identity.sub}`].sort()) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    }
    const [subjectProfile] = await tx.select().from(profiles).where(eq(profiles.googleSub, identity.sub)).for('update');
    const [emailProfile] = await tx.select().from(profiles).where(eq(profiles.email, identity.email)).for('update');
    if ((subjectProfile && emailProfile && subjectProfile.id !== emailProfile.id)
      || (!subjectProfile && emailProfile?.googleSub && emailProfile.googleSub !== identity.sub)) {
      throw new GoogleSignInError('google_account_conflict');
    }
    let profile = subjectProfile ?? emailProfile;
    if (profile) {
      [profile] = await tx.update(profiles).set({ googleSub: identity.sub, email: identity.email })
        .where(eq(profiles.id, profile.id)).returning();
    } else {
      [profile] = await tx.insert(profiles).values({ googleSub: identity.sub, email: identity.email }).returning();
    }
    const { rawToken, ...session } = createSession();
    if (previousToken) await tx.delete(sessions).where(eq(sessions.token, hashToken(previousToken)));
    await tx.insert(sessions).values({ ...session, profileId: profile.id });
    return { rawToken, profile: { id: profile.id, email: profile.email } };
  });
}

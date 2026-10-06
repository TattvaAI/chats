import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'frank_session';
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
export const VERIFIED_AUTH_VERSION = 1;

export function createSession() {
  const rawToken = randomBytes(32).toString('hex');
  return {
    rawToken, token: hashToken(rawToken), authVersion: VERIFIED_AUTH_VERSION,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
  };
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE) {
  return { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge, secure: process.env.NODE_ENV === 'production' };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function getSessionRawToken(cookieHeader: string | null): string | null {
  if (!cookieHeader || cookieHeader.length > 16_384) return null;
  let token: string | null = null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SESSION_COOKIE) {
      if (token !== null) return null;
      try { token = decodeURIComponent(rest.join('=')); } catch { return null; }
      if (!/^[a-f0-9]{64}$/.test(token)) return null;
    }
  }
  return token;
}

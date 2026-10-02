import { createHash } from 'crypto';

export const SESSION_COOKIE = 'frank_session';
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function getSessionRawToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

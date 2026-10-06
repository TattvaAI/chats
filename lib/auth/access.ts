import { timingSafeEqual } from 'node:crypto';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, profiles, sessions } from '@/lib/db/schema';
import { RequestError } from '@/lib/requests';
import { getSessionRawToken, hashToken, VERIFIED_AUTH_VERSION } from './session';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ProfileIdentity = { id: string; email: string };
export type ConversationClaim = { id: string; token: string };
export type ConversationOwner = { userId: string | null; deleteToken: string | null };

export function equalSecret(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length > 8192 || a.length !== b.length) return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireAuthentication() {
  if (process.env.REQUIRE_AUTH === 'true') return true;
  if (process.env.REQUIRE_AUTH === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

export async function currentProfile(req: Request): Promise<ProfileIdentity | null> {
  const raw = getSessionRawToken(req.headers.get('cookie'));
  if (!raw) return null;
  if (!db) throw new RequestError('Account storage is unavailable. Please try again.', 503);
  const [row] = await db.select({ id: profiles.id, email: profiles.email }).from(sessions)
    .innerJoin(profiles, eq(profiles.id, sessions.profileId))
    .where(and(
      eq(sessions.token, hashToken(raw)),
      eq(sessions.authVersion, VERIFIED_AUTH_VERSION),
      gt(sessions.expiresAt, new Date()),
    )).limit(1);
  return row ?? null;
}

export function ownsConversationWithIdentity(req: Request, conv: ConversationOwner, profile: ProfileIdentity | null) {
  if (req.headers.has('x-share-token')) return false;
  if (conv.userId !== null) return profile?.id === conv.userId;
  return equalSecret(req.headers.get('x-conversation-token') || req.headers.get('x-delete-token'), conv.deleteToken);
}

export async function ownsConversation(req: Request, conv: ConversationOwner) {
  // Saving a report removes its guest capability; all future access uses the account.
  if (conv.userId === null) return ownsConversationWithIdentity(req, conv, null);
  return ownsConversationWithIdentity(req, conv, await currentProfile(req));
}

export async function claimConversations(profileId: string, claims: ConversationClaim[]) {
  if (!db) throw new RequestError('Account storage is unavailable. Please try again.', 503);
  if (!claims.length) return { claimed: 0, claimedIds: [] as string[] };
  const byId = new Map(claims.map((claim) => [claim.id.toLowerCase(), claim.token]));
  return db.transaction(async (tx) => {
    const [profile] = await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, profileId)).for('key share');
    if (!profile) throw new RequestError('Sign in to save these reports.', 401);
    // Stable row order prevents overlapping claim batches from deadlocking.
    const rows = await tx.select({ id: conversations.id, userId: conversations.userId, deleteToken: conversations.deleteToken })
      .from(conversations).where(inArray(conversations.id, [...byId.keys()])).orderBy(conversations.id).for('update');
    const claimedIds: string[] = [];
    for (const row of rows) {
      if (row.userId === profileId) {
        claimedIds.push(row.id); // A lost success response can be safely retried.
      } else if (row.userId === null && equalSecret(byId.get(row.id), row.deleteToken)) {
        const updated = await tx.update(conversations).set({ userId: profileId, deleteToken: null })
          .where(and(eq(conversations.id, row.id), isNull(conversations.userId))).returning({ id: conversations.id });
        if (updated[0]) claimedIds.push(updated[0].id);
      }
    }
    return { claimed: claimedIds.length, claimedIds };
  });
}

export function trustedOrigin() {
  const configured = process.env.APP_URL?.trim();
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('APP_URL is required');
  const url = new URL(configured || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('APP_URL must be an HTTP(S) origin');
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('APP_URL must use HTTPS in production');
  return url.origin;
}

export function safeNext(value: string | null) {
  if (!value || value.length > 2048) return '/account';
  try {
    const decoded = decodeURIComponent(value);
    if (![value, decoded].every((path) => /^\/(?!\/)/.test(path) && !/[\\\u0000-\u0020\u007f]/.test(path))) return '/account';
    const url = new URL(value, 'https://frank.invalid');
    return url.origin === 'https://frank.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/account';
  } catch { return '/account'; }
}

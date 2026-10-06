import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { analyticsEvents, conversations, profiles, purchases, otpCodes, feedback } from '@/lib/db/schema';
import { currentProfile, equalSecret } from '@/lib/auth/access';
import { privateJson, privateResponse } from '@/lib/auth/http';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { readJson, RequestError, requestFailure } from '@/lib/requests';

const inputSchema = z.object({
  claims: z.array(z.object({ id: z.uuid(), token: z.string().min(32).max(128) })).max(100).default([]),
});

export async function DELETE(req: Request) {
  try {
    const { claims } = inputSchema.parse(await readJson(req, 30_000));
    if (!db) throw new RequestError('Account storage is unavailable; nothing has been deleted.', 503);
    const profile = await currentProfile(req);
    if (!profile && !claims.length) throw new RequestError('Sign in or use the browser that created your reports.', 401);
    if (req.headers.has('x-share-token')) throw new RequestError('Shared reports cannot delete account data.', 403);
    const byId = new Map(claims.map((claim) => [claim.id.toLowerCase(), claim.token]));
    await db.transaction(async (tx) => {
      if (profile) {
        const [existing] = await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, profile.id)).for('update');
        if (!existing) throw new RequestError('Sign in to access your account.', 401);
      }
      const rows = await tx.select({ id: conversations.id, userId: conversations.userId, deleteToken: conversations.deleteToken })
        .from(conversations).where(or(
          profile ? eq(conversations.userId, profile.id) : undefined,
          byId.size ? inArray(conversations.id, [...byId.keys()]) : undefined,
        )).orderBy(conversations.id).for('update');
      for (const row of rows) {
        const allowed = row.userId === null ? equalSecret(byId.get(row.id), row.deleteToken) : row.userId === profile?.id;
        if (!allowed) throw new RequestError('One report could not be verified. Nothing has been deleted.', 404);
      }
      const ids = rows.map((row) => row.id);
      if (ids.length || profile) {
        // Legacy analytics accepted metadata; remove any rows explicitly associated with this account/report.
        await tx.delete(analyticsEvents).where(or(
          profile ? sql`${analyticsEvents.metadata}->>'profileId' = ${profile.id}` : undefined,
          profile ? sql`${analyticsEvents.metadata}->>'userId' = ${profile.id}` : undefined,
          profile ? sql`lower(${analyticsEvents.metadata}->>'email') = ${profile.email.toLowerCase()}` : undefined,
          ids.length ? inArray(sql<string>`${analyticsEvents.metadata}->>'conversationId'`, ids) : undefined,
        ));
      }
      if (ids.length) await tx.delete(conversations).where(inArray(conversations.id, ids));
      if (profile) {
        await tx.delete(purchases).where(eq(purchases.userId, profile.id));
        await tx.delete(otpCodes).where(eq(otpCodes.email, profile.email));
        await tx.delete(feedback).where(and(sql`lower(${feedback.email}) = ${profile.email.toLowerCase()}`));
        await tx.delete(profiles).where(eq(profiles.id, profile.id));
      }
    });
    const response = privateJson({ ok: true });
    response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
    return response;
  } catch (error) { return privateResponse(requestFailure(error)); }
}

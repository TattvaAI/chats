import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, reportShares } from '@/lib/db/schema';
import { currentProfile, ownsConversationWithIdentity, UUID_RE } from '@/lib/auth/access';
import { hashToken } from '@/lib/auth/session';
import { privateJson, privateResponse } from '@/lib/auth/http';
import { RequestError, requestFailure } from '@/lib/requests';

type Context = { params: Promise<{ id: string }> };

async function changeShare(req: Request, id: string, create: boolean) {
  if (!UUID_RE.test(id)) throw new RequestError('Invalid conversation ID.');
  if (!db) throw new RequestError('Report storage is unavailable. Please try again.', 503);
  const profile = await currentProfile(req);
  return db.transaction(async (tx) => {
    const [conv] = await tx.select({ userId: conversations.userId, deleteToken: conversations.deleteToken })
      .from(conversations).where(eq(conversations.id, id)).for('update');
    if (!conv || !ownsConversationWithIdentity(req, conv, profile)) throw new RequestError('Report not found.', 404);
    if (!create) {
      await tx.delete(reportShares).where(eq(reportShares.conversationId, id));
      return { ok: true };
    }
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);
    await tx.insert(reportShares).values({ conversationId: id, tokenHash: hashToken(token), expiresAt })
      .onConflictDoUpdate({ target: reportShares.conversationId, set: { tokenHash: hashToken(token), expiresAt } });
    return { token, expiresAt };
  });
}

export async function POST(req: Request, { params }: Context) {
  try { return privateJson(await changeShare(req, (await params).id, true)); }
  catch (error) { return privateResponse(requestFailure(error)); }
}
export async function DELETE(req: Request, { params }: Context) {
  try { return privateJson(await changeShare(req, (await params).id, false)); }
  catch (error) { return privateResponse(requestFailure(error)); }
}

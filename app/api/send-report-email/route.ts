import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, reports } from '@/lib/db/schema';
import { currentProfile, trustedOrigin } from '@/lib/auth/access';
import { privateJson, privateResponse } from '@/lib/auth/http';
import { rateLimit, readJson, RequestError, requestFailure } from '@/lib/requests';

export const maxDuration = 60;

const inputSchema = z.object({
  conversationId: z.uuid(),
  reportNumber: z.number().int().positive().max(2_147_483_647).optional(),
});

export async function POST(req: Request) {
  try {
    if (req.headers.has('x-share-token')) throw new RequestError('Report not found.', 404);
    const { conversationId, reportNumber } = inputSchema.parse(await readJson(req, 4096));
    const profile = await currentProfile(req);
    if (!profile) throw new RequestError('Sign in to email your report.', 401);
    if (!db) throw new RequestError('Report storage is unavailable. Please try again.', 503);
    const [conversation] = await db.select({ id: conversations.id }).from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, profile.id))).limit(1);
    if (!conversation) throw new RequestError('Report not found.', 404);
    const [report] = await db.select({ id: reports.id, reportNumber: reports.reportNumber }).from(reports)
      .where(and(eq(reports.conversationId, conversationId), reportNumber === undefined ? undefined : eq(reports.reportNumber, reportNumber)))
      .orderBy(desc(reports.reportNumber)).limit(1);
    if (!report) throw new RequestError(reportNumber === undefined ? 'Your report is still being prepared.' : 'Report not found.', reportNumber === undefined ? 409 : 404);
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new RequestError('Report email is not configured yet.', 503);
    const reportUrl = `${trustedOrigin()}/c/${conversationId}/reports/${report.reportNumber}`;
    await rateLimit(req, 'report-email', 5, 3_600_000);
    await rateLimit(req, 'report-email-account', 5, 3_600_000, { identity: `account:${profile.id}` });
    await rateLimit(req, 'report-email-global', 1000, 86_400_000, { identity: 'global' });
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM, to: [profile.email], subject: 'Your Frank report is ready',
          text: `Your private report is ready. Sign in to read it:\n${reportUrl}`,
        }),
      });
      // Discard provider bodies on both success and failure, without delaying the response.
      void response.body?.cancel().catch(() => undefined);
      if (!response.ok) throw new RequestError('The email could not be sent. Your report is still available here.', 502);
    } catch (error) {
      if (error instanceof RequestError) throw error;
      const timedOut = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
      throw new RequestError(timedOut
        ? 'Email delivery timed out. Your report is still available here.'
        : 'The email could not be sent. Your report is still available here.', timedOut ? 504 : 502);
    }
    return privateJson({ delivered: true });
  } catch (error) { return privateResponse(requestFailure(error)); }
}

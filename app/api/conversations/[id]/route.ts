import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, reports, reportShares } from '@/lib/db/schema';
import { currentProfile, ownsConversationWithIdentity, UUID_RE } from '@/lib/auth/access';
import { hashToken } from '@/lib/auth/session';
import { privateJson, privateResponse } from '@/lib/auth/http';
import { FrankReportSchema, FreePreviewSchema } from '@/lib/ai/schemas';
import { RequestError, requestFailure } from '@/lib/requests';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function recordField(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined;
}
function publicFields(value: unknown, keys: string[]) {
  if (!isRecord(value)) return null;
  return Object.fromEntries(keys.filter((key) => key in value).map((key) => [key, value[key]]));
}
function validReportNumber(raw: string | null) {
  if (raw === null) return null;
  const value = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(value) || value > 2_147_483_647) throw new RequestError('Invalid report number.');
  return value;
}
const selection = {
  id: conversations.id, userId: conversations.userId, deleteToken: conversations.deleteToken,
  title: conversations.title, category: conversations.category, source: conversations.source,
  fileUrl: conversations.fileUrl, createdAt: conversations.createdAt,
};

export async function GET(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new RequestError('Invalid conversation ID.');
    const number = validReportNumber(new URL(req.url).searchParams.get('report'));
    if (!db) throw new RequestError('Report storage is unavailable. Please try again.', 503);
    const profile = await currentProfile(req);
    const data = await db.transaction(async (tx) => {
      const [conv] = await tx.select(selection).from(conversations).where(eq(conversations.id, id)).for('share');
      if (!conv) throw new RequestError('Report not found.', 404);
      let shared = false;
      if (!ownsConversationWithIdentity(req, conv, profile)) {
        const token = req.headers.get('x-share-token');
        const [share] = token && /^[a-f0-9]{64}$/.test(token)
          ? await tx.select({ id: reportShares.conversationId }).from(reportShares)
            .where(and(eq(reportShares.conversationId, id), eq(reportShares.tokenHash, hashToken(token)), gt(reportShares.expiresAt, new Date()))).for('share')
          : [];
        if (!share) throw new RequestError('Report not found. Sign in or open it in the browser that created it.', 404);
        shared = true;
      }
      const [report] = await tx.select({
        reportNumber: reports.reportNumber, previewData: reports.previewData, fullReportData: reports.fullReportData,
      }).from(reports).where(and(eq(reports.conversationId, id), number === null ? undefined : eq(reports.reportNumber, number)))
        .orderBy(desc(reports.reportNumber)).limit(1);
      if (!report) throw new RequestError('This report is not available yet.', 404);
      const availableReports = await tx.select({ reportNumber: reports.reportNumber, createdAt: reports.createdAt })
        .from(reports).where(eq(reports.conversationId, id)).orderBy(desc(reports.reportNumber)).limit(100);
      const previewEnvelope = report.previewData;
      const fullEnvelope = report.fullReportData;
      const preview = publicFields(recordField(previewEnvelope, 'preview') ?? previewEnvelope, Object.keys(FreePreviewSchema.shape));
      const fullReport = publicFields(recordField(fullEnvelope, 'fullReport') ?? fullEnvelope, Object.keys(FrankReportSchema.shape));
      const language = recordField(fullEnvelope, 'reportLanguage') ?? recordField(previewEnvelope, 'reportLanguage');
      const reader = recordField(fullEnvelope, 'myName') ?? recordField(previewEnvelope, 'myName');
      const fileName = conv.fileUrl?.split(/[?#]/, 1)[0].split('/').at(-1) ?? '';
      return {
        found: true, conversationId: conv.id, shared, savedToAccount: conv.userId !== null,
        reportNumber: report.reportNumber, availableReports,
        reportLanguage: typeof language === 'string' ? language : '', myName: typeof reader === 'string' ? reader : '',
        conversation: { title: conv.title, createdAt: conv.createdAt, category: conv.category, source: conv.source, fileName },
        stats: recordField(previewEnvelope, 'stats') ?? recordField(fullEnvelope, 'stats') ?? null,
        detailedStats: recordField(previewEnvelope, 'detailedStats') ?? recordField(fullEnvelope, 'detailedStats') ?? null,
        turningPoint: recordField(previewEnvelope, 'turningPoint') ?? recordField(fullEnvelope, 'turningPoint') ?? null,
        preview, fullReport,
      };
    });
    return privateJson(data);
  } catch (error) { return privateResponse(requestFailure(error)); }
}

export async function DELETE(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new RequestError('Invalid conversation ID.');
    if (!db) throw new RequestError('Report storage is unavailable; nothing has been deleted.', 503);
    const profile = await currentProfile(req);
    await db.transaction(async (tx) => {
      const [conv] = await tx.select({ userId: conversations.userId, deleteToken: conversations.deleteToken })
        .from(conversations).where(eq(conversations.id, id)).for('update');
      if (!conv || !ownsConversationWithIdentity(req, conv, profile)) throw new RequestError('Report not found.', 404);
      // Foreign keys cascade reports, purchases, jobs, shares and follow-ups atomically.
      await tx.delete(conversations).where(eq(conversations.id, id));
    });
    return privateJson({ ok: true });
  } catch (error) { return privateResponse(requestFailure(error)); }
}

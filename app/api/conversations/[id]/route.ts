import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, reports, sessions } from '@/lib/db/schema';
import { SESSION_COOKIE } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function extract<T>(envelope: unknown, key: string): T | null {
  if (!isRecord(envelope)) return (envelope as T) ?? null;
  if (key in envelope) return (envelope[key] as T) ?? null;
  return null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ found: false, error: 'Not found' }, { status: 404 });
  }

  if (!db) {
    return NextResponse.json({ found: false, error: 'Not found' }, { status: 404 });
  }

  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    const reportRows = await db
      .select()
      .from(reports)
      .where(eq(reports.conversationId, id))
      .limit(1);

    const report = reportRows[0];
    if (!conv || !report) {
      return NextResponse.json({ found: false, error: 'Not found' }, { status: 404 });
    }

    const previewEnvelope: unknown = report.previewData;
    const fullEnvelope: unknown = report.fullReportData;

    // previewData may be the preview itself or an envelope { stats, turningPoint, preview }
    const preview = extract<object>(previewEnvelope, 'preview') ?? (isRecord(previewEnvelope) ? previewEnvelope : null);
    const stats =
      extract<object>(previewEnvelope, 'stats') ?? extract<object>(fullEnvelope, 'stats') ?? null;
    const detailedStats =
      extract<object>(previewEnvelope, 'detailedStats') ?? extract<object>(fullEnvelope, 'detailedStats') ?? null;
    const turningPoint =
      extract<object>(previewEnvelope, 'turningPoint') ??
      extract<object>(fullEnvelope, 'turningPoint') ??
      null;
    // fullReportData may be the report itself or an envelope { fullReport }
    const fullReport = isRecord(fullEnvelope) && 'fullReport' in fullEnvelope
      ? (fullEnvelope['fullReport'] as object) ?? null
      : (fullEnvelope as object) ?? null;

    const convRecord = conv as Record<string, unknown>;
    const rawFile = convRecord['fileName'] ?? conv.fileUrl ?? conv.title ?? '';
    const fileName = typeof rawFile === 'string' ? rawFile.split('/').pop() ?? rawFile : '';

    return NextResponse.json({
      found: true,
      conversationId: conv.id,
      conversation: {
        category: conv.category,
        source: conv.source,
        fileName,
      },
      stats,
      detailedStats,
      turningPoint,
      preview,
      fullReport,
    });
  } catch {
    return NextResponse.json({ found: false, error: 'Not found' }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!db) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const providedToken = req.headers.get('x-delete-token');
    const tokenOk =
      typeof providedToken === 'string' &&
      providedToken.length > 0 &&
      typeof conv.deleteToken === 'string' &&
      conv.deleteToken.length > 0 &&
      providedToken === conv.deleteToken;
    let ownerOk = false;
    if (!tokenOk) {
      try {
        const raw = req.cookies.get(SESSION_COOKIE)?.value;
        if (raw && conv.userId) {
          const tokenHash = createHash('sha256').update(raw).digest('hex');
          const [sess] = await db
            .select()
            .from(sessions)
            .where(eq(sessions.token, tokenHash))
            .limit(1);
          if (
            sess &&
            new Date(sess.expiresAt).getTime() >= Date.now() &&
            sess.profileId === conv.userId
          ) {
            ownerOk = true;
          }
        }
      } catch {
        ownerOk = false;
      }
    }
    if (!tokenOk && !ownerOk) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await db.delete(reports).where(eq(reports.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

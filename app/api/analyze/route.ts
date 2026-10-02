import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import {
  generateBrandonPreview,
  generateBrandonFullReport,
  generateBrandonPreviewFull,
  generateBrandonFullReportFull,
  FullChatMessage,
} from '@/lib/ai/analyzer';
import { ChatForensicStats } from '@/lib/forensics/metrics';
import { TurningPointResult } from '@/lib/forensics/turning-point';
import { db } from '@/lib/db';
import { conversations, reports, sessions, profiles } from '@/lib/db/schema';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/rate-limit';

export const maxDuration = 60; // Allow sufficient time for LLM generation
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AnalyzeRequestBody {
  category: string;
  stats: ChatForensicStats;
  detailedStats?: Record<string, unknown>;
  turningPoint: TurningPointResult | null;
  transcriptSample: string;
  messages?: FullChatMessage[];
  userNote?: string;
  reportLanguage?: 'en' | 'fr' | 'es';
  conversationId?: string;
  source?: string;
  myName?: string;
  email?: string;
}

export async function POST(req: NextRequest) {
  try {
    if (!checkRateLimit(req, { limit: 20, windowMs: 10 * 60 * 1000 })) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });
    }
    const body = (await req.json()) as AnalyzeRequestBody;
    const { category, stats, turningPoint, transcriptSample, messages, userNote, reportLanguage = 'en', myName } = body;

    if (Array.isArray(messages) && messages.length > 15000) {
      return NextResponse.json(
        { error: 'Message limit exceeded (max 15000).' },
        { status: 400 }
      );
    }
    if (Array.isArray(messages)) {
      let totalChars = 0;
      for (const m of messages) {
        const c = (m as { content?: unknown }).content;
        if (typeof c === 'string') {
          totalChars += c.length;
          if (totalChars > 4000000) break;
        }
      }
      if (totalChars > 4000000) {
        return NextResponse.json(
          { error: 'Payload too large (max ~4M characters).' },
          { status: 400 }
        );
      }
    }

    if (!stats || !category) {
      return NextResponse.json(
        { error: 'Missing required forensics stats or category.' },
        { status: 400 }
      );
    }

    const languageDirectives: Record<string, string> = {
      fr: 'Language Directive: The entire report, verdicts, roasts, dossiers, awards, and advice must be written in French (Français).',
      es: 'Language Directive: The entire report, verdicts, roasts, dossiers, awards, and advice must be written in Spanish (Español).',
      en: '',
    };
    const langInstruction = languageDirectives[reportLanguage] || '';
    const augmentedUserNote = [userNote, langInstruction].filter(Boolean).join('\n\n') || undefined;

    const hasMessages = Array.isArray(messages) && messages.length > 0;

    const previewPromise = (async () => {
      if (hasMessages) {
        try {
          return await generateBrandonPreviewFull(
            category,
            stats,
            turningPoint,
            messages,
            augmentedUserNote,
            reportLanguage,
            myName
          );
        } catch (err) {
          console.warn('[route] generateBrandonPreviewFull failed, falling back to legacy path:', err);
        }
      }
      return generateBrandonPreview(category, stats, turningPoint, transcriptSample, augmentedUserNote, reportLanguage, myName);
    })();

    const fullReportPromise = (async () => {
      if (hasMessages) {
        try {
          return await generateBrandonFullReportFull(
            category,
            stats,
            turningPoint,
            messages,
            augmentedUserNote,
            reportLanguage,
            myName
          );
        } catch (err) {
          console.warn('[route] generateBrandonFullReportFull failed, falling back to legacy path:', err);
        }
      }
      return generateBrandonFullReport(category, stats, turningPoint, transcriptSample, augmentedUserNote, reportLanguage, myName);
    })();

    // Run preview and full report generation in parallel
    const [previewResult, fullReportResult] = await Promise.all([previewPromise, fullReportPromise]);

    const preview = previewResult.data;
    const fullReport = fullReportResult.data;
    const aiLive = previewResult.live === true && fullReportResult.live === true;

    let serverPersisted = false;
    let newSessionCookie: string | null = null;
    const clientId = body.conversationId;
    const conversationId =
      typeof clientId === 'string' && UUID_RE.test(clientId) ? clientId : randomUUID();
    const deleteToken = randomUUID();
    try {
      if (db) {
        let userId: string | null = null;

        // 1. Check existing session cookie
        try {
          const raw = req.cookies.get(SESSION_COOKIE)?.value;
          if (raw) {
            const tokenHash = createHash('sha256').update(raw).digest('hex');
            const [sess] = await db
              .select()
              .from(sessions)
              .where(eq(sessions.token, tokenHash))
              .limit(1);
            if (sess && new Date(sess.expiresAt).getTime() >= Date.now()) {
              userId = sess.profileId;
            }
          }
        } catch {
          userId = null;
        }

        // 2. If no user session yet, but user provided their email (e.g. from Step 7)
        // Automatically create their account and log them in!
        const userEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!userId && userEmail && userEmail.includes('@')) {
          try {
            let [profile] = await db
              .select()
              .from(profiles)
              .where(eq(profiles.email, userEmail))
              .limit(1);
            if (!profile) {
              const inserted = await db
                .insert(profiles)
                .values({ email: userEmail })
                .returning();
              profile = inserted[0];
            }
            if (profile) {
              userId = profile.id;

              // Generate persistent 30-day session
              const rawToken = randomBytes(32).toString('hex');
              const tokenHash = createHash('sha256').update(rawToken).digest('hex');
              const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
              await db.insert(sessions).values({
                token: tokenHash,
                profileId: profile.id,
                expiresAt,
              });
              newSessionCookie = rawToken;
            }
          } catch (profileErr) {
            console.warn('[API /api/analyze] Auto-profile creation error:', profileErr);
          }
        }

        const source = body.source || 'unknown';
        const participants = Array.isArray(stats.participants)
          ? stats.participants.map((p) => p.name)
          : [];
        const messageCount = stats.totalMessages ?? 0;
        const title = `${category} — ${new Date().toISOString().slice(0, 10)}`;
        // manual-delete-only: owner-controlled deletion, no auto-expiry.
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 100);

        await db
          .insert(conversations)
          .values({
            id: conversationId,
            userId,
            title,
            category,
            source,
            participants,
            messageCount,
            deleteToken,
            expiresAt,
          })
          .onConflictDoNothing();

        // Save preview, fullReport, AND stats + detailedStats in the report record
        const envelope = {
          preview,
          fullReport,
          stats,
          detailedStats: body.detailedStats || null,
          turningPoint: turningPoint || null,
        };

        await db.insert(reports).values({
          conversationId,
          previewData: envelope as unknown as Record<string, unknown>,
          fullReportData: envelope as unknown as Record<string, unknown>,
          isUnlocked: true,
        });
        serverPersisted = true;
      }
    } catch (persistError) {
      console.error('API /api/analyze persistence error (non-fatal):', persistError);
    }

    const response = NextResponse.json({
      success: true,
      reportLanguage,
      preview,
      fullReport,
      aiLive,
      serverPersisted,
      conversationId,
      deleteToken,
    });

    if (newSessionCookie) {
      response.cookies.set(SESSION_COOKIE, newSessionCookie, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE,
        secure: process.env.NODE_ENV === 'production',
      });
    }

    return response;
  } catch (error: unknown) {
    console.error('API /api/analyze error:', error);
    return NextResponse.json(
      { error: 'Failed to complete conversational analysis.' },
      { status: 500 }
    );
  }
}

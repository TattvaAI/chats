import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { db } from '@/lib/db';
import { profiles, conversations, sessions } from '@/lib/db/schema';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, conversationId, host: customHost } = await req.json();

    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email address required.' }, { status: 400 });
    }

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID required.' }, { status: 400 });
    }

    let sessionTokenToSet: string | null = null;
    if (db) {
      try {
        let [profile] = await db
          .select()
          .from(profiles)
          .where(eq(profiles.email, email))
          .limit(1);
        if (!profile) {
          const inserted = await db
            .insert(profiles)
            .values({ email })
            .returning();
          profile = inserted[0];
        }
        if (profile) {
          await db
            .update(conversations)
            .set({ userId: profile.id })
            .where(eq(conversations.id, conversationId));

          const rawToken = randomBytes(32).toString('hex');
          const tokenHash = createHash('sha256').update(rawToken).digest('hex');
          const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
          await db.insert(sessions).values({
            token: tokenHash,
            profileId: profile.id,
            expiresAt,
          });
          sessionTokenToSet = rawToken;
        }
      } catch (dbErr) {
        console.warn('[Email] User linking error (non-fatal):', dbErr);
      }
    }

    const host =
      customHost ||
      req.headers.get('x-forwarded-host') ||
      req.headers.get('host') ||
      'whatbrandonthinks.com';
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const origin = `${proto}://${host}`;
    const reportUrl = `${origin}/c/${encodeURIComponent(conversationId)}/reports/1`;

    console.log(`[Email] Sending Brandon report email to ${email} -> ${reportUrl}`);

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        const fromAddress =
          process.env.EMAIL_FROM ||
          'What Brandon Thinks <onboarding@resend.dev>';

        await resend.emails.send({
          from: fromAddress,
          to: email,
          subject: 'Your What Brandon Thinks report is ready',
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your What Brandon Thinks Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafafa; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="560px" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 20px; border: 1px solid #eaeaea; overflow: hidden; padding: 40px 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <span style="display: inline-block; width: 64px; height: 64px; border-radius: 50%; overflow: hidden; background-color: #b9f3e0; line-height: 64px; text-align: center; font-size: 32px;">
                😎
              </span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 12px;">
              <h1 style="margin: 0; font-family: Georgia, serif; font-size: 28px; font-weight: 600; color: #111111; letter-spacing: -0.5px;">
                Your report is ready.
              </h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 28px;">
              <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #666666; max-width: 440px;">
                Brandon read your conversation and wrote down his candid opinion. It is 100% free and stored privately so you can read it anytime.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <a href="${reportUrl}" style="display: inline-block; background-color: #111111; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 9999px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                Read Brandon's Report &rarr;
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="border-t: 1px solid #f0f0f0; padding-top: 24px;">
              <p style="margin: 0; font-size: 12px; color: #999999;">
                Direct link: <a href="${reportUrl}" style="color: #666666; word-break: break-all;">${reportUrl}</a>
              </p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #aaaaaa;">
                &copy; 2026 What Brandon Thinks &middot; Completely free &middot; Stored until you delete it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
          `,
          text: `Your What Brandon Thinks report is ready!\n\nRead Brandon's full report here:\n${reportUrl}\n\nBrandon read your conversation and gave his honest, unfiltered verdict. It is 100% free and stored privately until you delete it.`,
        });

        const res = NextResponse.json({ success: true, delivered: true, reportUrl });
        if (sessionTokenToSet) {
          res.cookies.set(SESSION_COOKIE, sessionTokenToSet, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: SESSION_MAX_AGE,
            secure: process.env.NODE_ENV === 'production',
          });
        }
        return res;
      } catch (sendErr) {
        console.error('[Email] Resend delivery error:', sendErr);
        // Non-blocking: report link is still valid
        const res = NextResponse.json({ success: true, delivered: false, error: (sendErr as Error).message, reportUrl });
        if (sessionTokenToSet) {
          res.cookies.set(SESSION_COOKIE, sessionTokenToSet, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: SESSION_MAX_AGE,
            secure: process.env.NODE_ENV === 'production',
          });
        }
        return res;
      }
    }

    const res = NextResponse.json({
      success: true,
      delivered: false,
      note: 'No RESEND_API_KEY found, logged to console.',
      reportUrl,
    });
    if (sessionTokenToSet) {
      res.cookies.set(SESSION_COOKIE, sessionTokenToSet, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE,
        secure: process.env.NODE_ENV === 'production',
      });
    }
    return res;
  } catch (err: unknown) {
    console.error('[Email] send-report-email error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

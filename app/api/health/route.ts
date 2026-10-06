import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { trustedOrigin } from '@/lib/auth/access';
import { getGeminiModel } from '@/lib/ai/gemini';
import { jobsRunInline } from '@/lib/ai/jobs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!db) throw new Error('Storage unavailable');
    trustedOrigin();
    getGeminiModel('report');
    const inline = jobsRunInline();
    const requireAuth = process.env.REQUIRE_AUTH === 'true'
      || (process.env.REQUIRE_AUTH !== 'false' && process.env.NODE_ENV === 'production');
    if (requireAuth && !(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
      && !(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)) throw new Error('Sign-in unavailable');
    if (process.env.VERCEL && inline && (process.env.CRON_SECRET?.length ?? 0) < 32) throw new Error('Worker unavailable');
    await db.execute(sql`select p.google_sub, s.auth_version, f.id, j.payload
      from profiles p, sessions s, followups f, analysis_jobs j limit 0`);
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'not_ready' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

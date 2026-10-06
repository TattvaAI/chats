import { timingSafeEqual } from 'node:crypto';
import { runWorkerTick } from '@/lib/ai/jobs';
import { RequestError, requestFailure } from '@/lib/requests';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32) throw new RequestError('Scheduled processing is not configured.', 503);
    const expected = Buffer.from(`Bearer ${secret}`);
    const received = Buffer.from(req.headers.get('authorization') || '');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new RequestError('Unauthorized.', 401);
    const stats = await runWorkerTick();
    return Response.json({ ok: true, ...stats }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return requestFailure(error); }
}

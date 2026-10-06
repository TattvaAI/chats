import { NextRequest, NextResponse } from 'next/server';
import { runWorkerTick } from '@/lib/ai/jobs';
import { isAuthorizedAdmin } from '@/lib/auth/admin';
import { privateResponse } from '@/lib/auth/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!(await isAuthorizedAdmin(req))) {
    return privateResponse(NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }));
  }

  try {
    const stats = await runWorkerTick();
    return privateResponse(NextResponse.json({ ok: true, stats }));
  } catch (error) {
    console.error('[admin/worker-tick]', error);
    return privateResponse(NextResponse.json({ error: error instanceof Error ? error.message : 'Worker tick failed.' }, { status: 500 }));
  }
}

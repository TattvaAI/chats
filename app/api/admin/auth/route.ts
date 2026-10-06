import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedAdmin } from '@/lib/auth/admin';
import { privateResponse } from '@/lib/auth/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authorized = await isAuthorizedAdmin(req);
  return privateResponse(NextResponse.json({ authorized }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { key?: string };
    const adminSecret = (process.env.ADMIN_SECRET || 'frank-admin-2026').trim();
    if (body.key && body.key.trim() === adminSecret) {
      const response = privateResponse(NextResponse.json({ ok: true }));
      response.cookies.set('frank_admin', adminSecret, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400 * 30, // 30 days
      });
      return response;
    }
    return privateResponse(NextResponse.json({ error: 'Invalid admin key.' }, { status: 401 }));
  } catch {
    return privateResponse(NextResponse.json({ error: 'Bad request.' }, { status: 400 }));
  }
}

export async function DELETE() {
  const response = privateResponse(NextResponse.json({ ok: true }));
  response.cookies.delete('frank_admin');
  return response;
}

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { feedback } from '@/lib/db/schema';
import { isAuthorizedAdmin } from '@/lib/auth/admin';
import { privateResponse } from '@/lib/auth/http';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorizedAdmin(req))) {
    return privateResponse(NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }));
  }

  if (!db) {
    return privateResponse(NextResponse.json({ error: 'Database unavailable.' }, { status: 503 }));
  }

  try {
    const { id } = await params;
    const deleted = await db
      .delete(feedback)
      .where(eq(feedback.id, id))
      .returning({ id: feedback.id });

    if (!deleted.length) {
      return privateResponse(NextResponse.json({ error: 'Feedback item not found.' }, { status: 404 }));
    }

    return privateResponse(NextResponse.json({ success: true, id }));
  } catch (error) {
    console.error('[admin/feedback/[id] DELETE]', error);
    return privateResponse(NextResponse.json({ error: 'Failed to delete feedback.' }, { status: 500 }));
  }
}

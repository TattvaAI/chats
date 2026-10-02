import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { analyticsEvents } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  try {
    const { eventName, metadata } = await req.json();

    if (db && eventName) {
      await db.insert(analyticsEvents).values({
        eventName,
        metadata: metadata || {},
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

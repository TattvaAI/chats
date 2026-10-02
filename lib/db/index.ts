import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { eq } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL;

export const db = connectionString
  ? drizzle(postgres(connectionString, { max: 10 }), { schema })
  : null;

export async function persistReport(
  conversationId: string,
  previewData: Record<string, unknown>,
  fullReportData: Record<string, unknown>
) {
  if (!db) {
    console.log('[Database] DATABASE_URL not set; skipping database write in local demo mode.');
    return { id: 'local-demo-report-id', isUnlocked: false };
  }

  try {
    const [report] = await db
      .insert(schema.reports)
      .values({
        conversationId,
        previewData,
        fullReportData,
        isUnlocked: false,
      })
      .returning();

    return report;
  } catch (err) {
    console.error('[Database] Failed to persist report:', err);
    return null;
  }
}

export async function unlockReportInDb(reportId: string) {
  if (!db) {
    console.log(`[Database] DATABASE_URL not set; marking report ${reportId} unlocked in memory.`);
    return true;
  }

  try {
    await db
      .update(schema.reports)
      .set({ isUnlocked: true })
      .where(eq(schema.reports.id, reportId));
    return true;
  } catch (err) {
    console.error('[Database] Failed to unlock report:', err);
    return false;
  }
}

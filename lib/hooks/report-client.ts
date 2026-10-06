import { FrankReportSchema, type FrankReport, type FreePreview } from '@/lib/ai/schemas';
const readableReport = FrankReportSchema.partial();
import type { ChatForensicStats } from '@/lib/forensics/metrics';
import type { DetailedStats } from '@/lib/forensics/detailed-stats';
import type { TurningPointResult } from '@/lib/forensics/turning-point';
import { conversationHeaders } from '@/lib/store/access';

export type JobStatus = 'queued' | 'running' | 'failed' | 'completed';
export interface ReportRecord {
  conversationId: string;
  conversation: { category: string; source: string; title?: string; fileName?: string; createdAt?: string };
  shared: boolean;
  savedToAccount: boolean;
  reportLanguage: string;
  myName: string;
  reportNumber: number;
  availableReports: Array<{ reportNumber: number; createdAt: string }>;
  stats: ChatForensicStats | null;
  detailedStats: DetailedStats | null;
  turningPoint: TurningPointResult | null;
  preview: FreePreview | null;
  fullReport: FrankReport;
}
export type ReportLoad =
  | { status: 'found'; data: ReportRecord; message: string }
  | { status: 'queued' | 'running' | 'failed' | 'missing' | 'error'; data: null; message: string };

export async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    return typeof data.error === 'string' && data.error ? data.error : fallback;
  } catch { return fallback; }
}

export async function fetchReportRecord(id: string, number: string | undefined, share: string | null, signal?: AbortSignal): Promise<ReportLoad> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || (number !== undefined && (!/^[1-9]\d*$/.test(number) || !Number.isSafeInteger(Number(number))))) {
    return { status: 'missing', data: null, message: 'This report address is not valid.' };
  }
  const options: RequestInit = { headers: conversationHeaders(id, share), signal, cache: 'no-store', credentials: 'same-origin' };
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}${number ? `?report=${encodeURIComponent(number)}` : ''}`, options);
  if (response.ok) {
    const record = await response.json() as ReportRecord;
    if (record.conversationId !== id || !Number.isSafeInteger(record.reportNumber) || record.reportNumber < 1 || (number && record.reportNumber !== Number(number)) || !record.fullReport || typeof record.fullReport.headline !== 'string' || !record.fullReport.headline.trim() || !readableReport.safeParse(record.fullReport).success) {
      return { status: 'error', data: null, message: 'The saved report could not be read. Please retry or contact support.' };
    }
    return { status: 'found', data: { ...record, shared: Boolean(share) || record.shared }, message: '' };
  }
  if (response.status !== 404 && response.status !== 401 && response.status !== 403) {
    return { status: 'error', data: null, message: await responseError(response, 'Your report could not be loaded. Please retry in a moment.') };
  }
  if (share) return { status: 'missing', data: null, message: 'This shared link is unavailable. It may have expired or been revoked.' };
  // The durable conversation can exist before its report does. Ask for the real job state.
  const jobResponse = await fetch(`/api/jobs/${encodeURIComponent(id)}`, options);
  if (jobResponse.ok) {
    const job = await jobResponse.json();
    if (job.status === 'queued' || job.status === 'running') return { status: job.status, data: null, message: typeof job.stage === 'string' && job.stage ? job.stage : job.status === 'queued' ? 'Your report is queued.' : 'Frank is reading your chat.' };
    if (job.status === 'failed') return { status: 'failed', data: null, message: typeof job.error === 'string' && job.error ? job.error : 'The analysis could not finish. Please upload the chat again.' };
    if (job.status === 'completed') return { status: number ? 'missing' : 'error', data: null, message: number ? 'This report number is not available for this conversation.' : 'The report is not available yet. Please retry.' };
    return { status: 'error', data: null, message: 'The report status could not be verified. Please retry.' };
  }
  if (jobResponse.status >= 500 || jobResponse.status === 429) return { status: 'error', data: null, message: await responseError(jobResponse, 'Your report status could not be loaded. Please retry.') };
  return { status: 'missing', data: null, message: 'This report is private or no longer available. Sign in to the account that created it, or use the browser that holds its guest access.' };
}

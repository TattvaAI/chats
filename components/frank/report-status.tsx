'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/frank/header';
import { conversationHeaders, removeGuestCapability } from '@/lib/store/access';
import { clearPrivateClientState } from '@/lib/hooks/useSession';
import { responseError } from '@/lib/hooks/report-client';

export function ReportStatus({ id, status, message, retry, shared = false }: { id: string; status: string; message: string; retry: () => void; shared?: boolean }) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const inProgress = status === 'queued' || status === 'running';
  async function cancel() {
    if (!confirm('Cancel this analysis and permanently delete its conversation?')) return;
    setCancelling(true); setCancelError('');
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE', headers: conversationHeaders(id, null) });
      if (!response.ok) throw new Error(await responseError(response, 'Could not cancel the analysis. Please retry.'));
      try { removeGuestCapability(id); } catch { /* Server deletion already revoked access. */ }
      clearPrivateClientState();
      setCancelled(true);
    } catch (error) { setCancelError(error instanceof Error ? error.message : 'Could not cancel the analysis.'); }
    finally { setCancelling(false); }
  }
  return <div className="flex min-h-screen flex-col bg-background text-foreground"><SiteHeader /><main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-24 text-center">
    <h1 className="font-serif text-3xl font-medium">{cancelled ? 'Analysis cancelled' : status === 'loading' ? 'Opening your report' : inProgress ? status === 'queued' ? 'Your report is in the queue' : 'Frank is reading your chat' : status === 'failed' ? 'The analysis could not finish' : status === 'error' ? 'We could not load your report' : 'Report unavailable'}</h1>
    <p role="status" className="max-w-md text-sm leading-relaxed text-muted-foreground">{cancelled ? 'The conversation and its analysis were deleted.' : message}</p>
    {inProgress && !cancelled && <p className="max-w-md text-xs leading-relaxed text-muted-foreground">You can leave this page and return from My Reports. Your analysis continues on the server.</p>}
    {(status === 'error' || status === 'missing') && !cancelled && <button onClick={retry} className="rounded-xl bg-neutral-900 px-6 py-3 text-sm text-white">Retry</button>}
    {cancelError && <p role="alert" className="max-w-md text-sm text-destructive">{cancelError}</p>}
    <div className="flex flex-wrap justify-center gap-5 text-sm">
      <Link href="/account" className="underline underline-offset-4">My reports</Link>
      {!shared && status === 'missing' && <Link href={`/login?next=${encodeURIComponent(`/c/${id}`)}`} className="underline underline-offset-4">Sign in</Link>}
      {(status === 'failed' || cancelled) && <Link href="/setup" className="underline underline-offset-4">Upload a chat again</Link>}
      {!shared && inProgress && !cancelled && <button onClick={cancel} disabled={cancelling} className="text-destructive underline underline-offset-4 disabled:opacity-50">{cancelling ? 'Cancelling…' : 'Cancel analysis'}</button>}
    </div>
  </main><SiteFooter /></div>;
}

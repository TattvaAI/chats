'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Trash2, AlertTriangle, ArrowRight, User, FileText, LogOut } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/frank/header';
import { clearGuestCapabilities, localClaims, type GuestClaim } from '@/lib/store/access';
import { announceSessionChange, refreshSession, useSession, useSessionState } from '@/lib/hooks/useSession';
import { responseError, type JobStatus, type ReportRecord } from '@/lib/hooks/report-client';

interface MyConversation {
  id: string; title: string; category: string; createdAt: string | null;
  status: JobStatus; stage?: string; error?: string; reportNumber: number | null;
}
interface ReportList { scope: string; items: MyConversation[]; nextCursor: string | null; loading: boolean; error: string }

async function guestConversation(claim: GuestClaim, signal: AbortSignal): Promise<MyConversation | null> {
  const options = { headers: { 'x-conversation-token': claim.token }, signal, cache: 'no-store' as const };
  const jobResponse = await fetch(`/api/jobs/${encodeURIComponent(claim.id)}`, options);
  if (jobResponse.ok) {
    const job = await jobResponse.json();
    if (job.status === 'queued' || job.status === 'running' || job.status === 'failed') {
      return { id: claim.id, title: job.status === 'failed' ? 'Unfinished analysis' : 'Conversation being analyzed', category: '', createdAt: null, status: job.status, stage: job.stage, error: job.error, reportNumber: null };
    }
  } else if (![401, 403, 404].includes(jobResponse.status)) throw new Error(await responseError(jobResponse, 'Could not check your guest reports. Please retry.'));
  const response = await fetch(`/api/conversations/${encodeURIComponent(claim.id)}`, options);
  if ([401, 403, 404].includes(response.status)) return null;
  if (!response.ok) throw new Error(await responseError(response, 'Could not load your guest reports. Please retry.'));
  const data = await response.json() as ReportRecord;
  if (data.shared || data.savedToAccount || !data.fullReport || !Number.isSafeInteger(data.reportNumber)) return null;
  return { id: claim.id, title: data.conversation.title || data.fullReport.headline, category: data.conversation.category, createdAt: data.conversation.createdAt || null, status: 'completed', reportNumber: data.reportNumber };
}

export default function AccountPage() {
  const session = useSession();
  const [deleted, setDeleted] = useState(false);
  const [busy, setBusy] = useState<'logout' | 'delete' | null>(null);
  const [actionError, setActionError] = useState('');
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [privateHidden, setPrivateHidden] = useState(false);
  const [reload, setReload] = useState(0);
  const scope = `${session.profile?.id || session.status}/${session.version}/${reload}`;
  const [list, setList] = useState<ReportList>({ scope: '', items: [], nextCursor: null, loading: true, error: '' });

  const loadPage = useCallback(async (cursor: string | null, signal?: AbortSignal) => {
    if ((session.status !== 'authenticated' && session.status !== 'guest') || privateHidden) return;
    const controller = signal ? null : new AbortController();
    const activeSignal = signal || controller!.signal;
    setList(current => ({ scope, items: cursor && current.scope === scope ? current.items : [], nextCursor: null, loading: true, error: '' }));
    try {
      const verifiedProfile = await refreshSession();
      if (activeSignal.aborted || (verifiedProfile?.id ?? null) !== (session.profile?.id ?? null)) return;
      let items: MyConversation[];
      let nextCursor: string | null;
      if (session.status === 'authenticated') {
        const response = await fetch(`/api/conversations?mine=1&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store', signal: activeSignal });
        if (!response.ok) throw new Error(await responseError(response, 'Could not load your saved reports. Please retry.'));
        const data = await response.json();
        if (!Array.isArray(data.conversations)) throw new Error('The report list could not be read. Please retry.');
        items = data.conversations; nextCursor = typeof data.nextCursor === 'string' ? data.nextCursor : null;
      } else {
        const claims = localClaims();
        const offset = cursor ? Number(cursor) : 0;
        const page = claims.slice(offset, offset + 20);
        items = [];
        // Bound concurrent guest lookups; every displayed entry is verified on the server.
        for (let start = 0; start < page.length; start += 4) {
          const results = await Promise.all(page.slice(start, start + 4).map(claim => guestConversation(claim, activeSignal)));
          items.push(...results.filter((item): item is MyConversation => item !== null));
        }
        nextCursor = offset + 20 < claims.length ? String(offset + 20) : null;
      }
      if (activeSignal.aborted) return;
      setList(current => current.scope !== scope ? current : ({ scope, items: cursor ? [...current.items, ...items.filter(item => !current.items.some(existing => existing.id === item.id))] : items, nextCursor, loading: false, error: '' }));
    } catch (error) {
      if (!activeSignal.aborted) setList(current => current.scope !== scope ? current : ({ ...current, loading: false, error: error instanceof Error ? error.message : 'Could not load your reports. Please retry.' }));
    }
  }, [session.status, session.profile?.id, scope, privateHidden]);

  useEffect(() => {
    const controller = new AbortController();
    void loadPage(null, controller.signal);
    return () => controller.abort();
  }, [loadPage]);

  async function handleLogout() {
    setBusy('logout'); setPrivateHidden(true); setActionError(''); setLogoutFailed(false);
    announceSessionChange();
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' });
      if (!response.ok) throw new Error(await responseError(response, 'Sign out failed. Your session may still be active; please retry.'));
      try { clearGuestCapabilities(); } catch { /* No report contents are retained in storage. */ }
      announceSessionChange();
      // The successful server response confirms revocation. A separate identity
      // request must not turn completed sign-out into a network error.
      useSessionState.setState({ profile: null, status: 'guest', error: null });
      setPrivateHidden(false);
    } catch (error) {
      setLogoutFailed(true);
      setActionError(error instanceof Error ? error.message : 'Sign out failed. Your session may still be active; please retry.');
    } finally { setBusy(null); }
  }

  async function handleDeleteAll() {
    const authenticated = session.status === 'authenticated';
    if (!confirm(authenticated ? 'Permanently delete this account, all its saved reports and questions, and guest conversations accessible in this browser? This cannot be undone.' : 'Permanently delete the guest conversations accessible in this browser, including reports and questions? This cannot be undone.')) return;
    setBusy('delete'); setActionError('');
    try {
      let claims: GuestClaim[] = [];
      try { claims = localClaims(); } catch (error) { if (!authenticated) throw error; }
      const response = await fetch('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claims }) });
      if (!response.ok) throw new Error(await responseError(response, 'Deletion failed. Your data has not been confirmed deleted; please retry.'));
      try { clearGuestCapabilities(); } catch { /* Server deletion revokes the retained capabilities. */ }
      setPrivateHidden(true);
      announceSessionChange();
      useSessionState.setState({ profile: null, status: 'guest', error: null });
      setDeleted(true);
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Deletion failed. Please retry.'); }
    finally { setBusy(null); }
  }

  const current = list.scope === scope && !privateHidden ? list : { items: [], nextCursor: null, loading: true, error: '' };
  const signedIn = session.status === 'authenticated';
  const ready = (signedIn || session.status === 'guest') && !privateHidden;

  return <div className="flex min-h-screen flex-col bg-background text-foreground"><SiteHeader />
    <main className="flex flex-1 flex-col items-center px-6 pb-24 pt-12 sm:pt-16"><div className="mx-auto flex w-full max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-2"><h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">Your Account &amp; Data Controls</h1><p className="text-sm leading-relaxed text-muted-foreground">Reports saved to your account stay available when you return or sign in on another device.</p></div>
      {deleted ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">Your account or guest reports were deleted from the active database. Backup copies expire according to the hosting provider’s retention period.</div> : <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2.5 text-sm font-medium"><User className="size-5 text-muted-foreground" />{privateHidden ? 'Your private report view is cleared' : signedIn ? session.profile?.email : session.status === 'guest' ? 'Signed out' : session.status === 'error' ? 'Session unavailable' : 'Checking session…'}</span>
            {(signedIn || logoutFailed) && <button onClick={handleLogout} disabled={busy !== null} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"><LogOut className="size-3.5" />{busy === 'logout' ? 'Signing out…' : logoutFailed ? 'Retry sign out' : 'Sign out'}</button>}
            {session.status === 'guest' && !privateHidden && <Link href="/login" className="text-xs font-medium text-primary underline">Sign in</Link>}
          </div>
          {session.status === 'error' && !privateHidden && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{session.error}</p><button onClick={() => { void session.retry().catch(() => undefined); }} className="underline">Retry account check</button></div>}
          {ready && <p className="text-xs leading-relaxed text-muted-foreground">{signedIn ? 'This list contains reports belonging to your signed-in account.' : 'Guest access depends on this browser’s site data. Sign in to save your reports across devices.'}</p>}
          {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
        </div>
        {!privateHidden && <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-medium"><FileText className="size-5 text-muted-foreground" />{signedIn ? 'My reports' : 'Guest reports in this browser'}</h2>{ready && <button onClick={() => setReload(value => value + 1)} disabled={current.loading} className="text-xs underline disabled:opacity-50">Refresh</button>}</div>
          {ready && !signedIn && current.items.length > 0 && <Link href="/login?save=all" className="rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-950 underline">Sign in to save these reports to your account →</Link>}
          {current.error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{current.error}</p><button onClick={() => setReload(value => value + 1)} className="underline">Retry loading reports</button></div>}
          {ready && !current.loading && !current.error && current.items.length === 0 && <p className="text-sm text-muted-foreground">{signedIn ? 'No reports saved to this account yet.' : 'No accessible guest reports were found in this browser.'}</p>}
          {ready && current.items.length > 0 && <ul className="flex flex-col gap-2">{current.items.map(report => <li key={report.id}><Link href={`/c/${report.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-accent"><span className="flex min-w-0 flex-col gap-1"><span className="truncate text-sm font-medium">{report.title}</span><span className="text-xs text-muted-foreground">{[report.category, report.createdAt ? new Date(report.createdAt).toLocaleDateString() : ''].filter(Boolean).join(' · ')}</span><span className={`text-xs ${report.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>{report.status === 'completed' ? report.reportNumber ? `Report ${report.reportNumber} ready` : 'Report ready' : report.status === 'failed' ? report.error || 'Analysis failed — open for details' : `${report.status === 'queued' ? 'Queued' : 'Running'}${report.stage ? ` · ${report.stage}` : ''}`}</span></span><ArrowRight className="size-4 shrink-0 text-muted-foreground" /></Link></li>)}</ul>}
          {current.loading && session.status !== 'error' && <p role="status" className="text-sm text-muted-foreground">Loading reports…</p>}
          {ready && current.nextCursor && <button onClick={() => { void loadPage(current.nextCursor); }} disabled={current.loading} className="rounded-xl border border-border px-4 py-3 text-sm disabled:opacity-50">Load more reports</button>}
          <Link href="/setup" className="inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs font-medium text-primary-foreground">Analyze a chat<ArrowRight className="size-3.5" /></Link>
        </div>}
        {ready && <div className="flex flex-col gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-6"><h2 className="flex items-center gap-2 font-serif text-lg font-medium text-destructive"><AlertTriangle className="size-5" />Privacy &amp; Purge Controls</h2><p className="text-xs leading-relaxed text-muted-foreground">{signedIn ? 'Permanently delete this account and its saved reports and questions, plus guest conversations accessible in this browser.' : 'Permanently delete the guest conversations accessible in this browser, including reports and questions.'} This action cannot be reversed.</p><button onClick={handleDeleteAll} disabled={busy !== null} className="inline-flex items-center justify-center gap-2 rounded-xl bg-destructive px-5 py-3 text-xs font-medium text-white disabled:opacity-50"><Trash2 className="size-3.5" />{busy === 'delete' ? 'Deleting…' : signedIn ? 'Delete my account and data' : 'Delete my guest reports'}</button></div>}
      </div>}
    </div></main><SiteFooter />
  </div>;
}

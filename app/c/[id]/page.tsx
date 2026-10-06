'use client';

import { Suspense, useState } from 'react';
import { ReportLink as Link } from '@/components/frank/report-link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, BarChart3, Trash2, CheckCircle2, MessageSquare } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/frank/header';
import { ReportStatus } from '@/components/frank/report-status';
import { FollowupQuestions } from '@/components/frank/followup-questions';
import { useConversation } from '@/lib/hooks/useConversation';
import { conversationHeaders, removeGuestCapability } from '@/lib/store/access';
import { clearPrivateClientState } from '@/lib/hooks/useSession';
import { responseError } from '@/lib/hooks/report-client';

export default function ConversationHubPage() {
  return <Suspense><HubInner /></Suspense>;
}

function HubInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const result = useConversation(id);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showQuestions, setShowQuestions] = useState(false);

  async function handleDelete() {
    if (!confirm('Permanently delete this conversation, its reports and questions? This cannot be undone.')) return;
    setDeleting(true); setDeleteError('');
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE', headers: conversationHeaders(id, null) });
      if (!response.ok) throw new Error(await responseError(response, 'Could not delete the report. Please retry.'));
      try { removeGuestCapability(id); } catch { /* The server already revoked access. */ }
      clearPrivateClientState();
      router.replace('/account');
    } catch (error) { setDeleteError(error instanceof Error ? error.message : 'Deletion failed. Please retry.'); }
    finally { setDeleting(false); }
  }

  if (result.status !== 'found' || !result.data) return <ReportStatus key={id} id={id} status={result.status} message={result.message} retry={result.retry} shared={Boolean(result.shareToken)} />;
  const data = result.data;
  const names = data.stats?.participants.map(participant => participant.name).join(' & ');
  const title = names || data.conversation.title || data.fullReport.headline;
  const reports = data.availableReports?.length ? data.availableReports : [{ reportNumber: data.reportNumber, createdAt: '' }];
  const saveUrl = `/login?claim=${encodeURIComponent(id)}&next=${encodeURIComponent(`/c/${id}`)}`;

  return <div className="flex min-h-screen flex-col bg-background text-foreground"><SiteHeader />
    <main className="flex flex-1 flex-col"><div className="mx-auto w-full max-w-2xl px-6 py-12 sm:px-10 sm:py-16">
      <div className="flex flex-col gap-3"><h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
        {data.stats && <p className="text-sm text-muted-foreground">{data.stats.totalMessages.toLocaleString()} messages · {data.stats.dateRange.start} to {data.stats.dateRange.end}</p>}
        <Link href={result.href('/stats')} className="mt-4 flex min-h-14 items-center justify-between rounded-2xl border border-border bg-[#C9F2DE] px-5 py-4 text-base font-semibold text-[#0B3B2E]"><span className="flex items-center gap-2"><BarChart3 className="size-5" />See all the stats</span><ChevronRight className="size-5" /></Link>
      </div>
      <div className={`mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-xs ${data.shared ? 'border-border bg-muted/40' : data.savedToAccount ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
        <span className="flex items-center gap-2"><CheckCircle2 className="size-4 shrink-0" />{data.shared ? 'You are viewing a read-only shared report.' : data.savedToAccount ? 'Saved to your account. Come back on any device.' : 'Guest report — keep this browser’s site data until you save it to an account.'}</span>
        {!data.shared && <Link href={data.savedToAccount ? '/account' : saveUrl} className="font-semibold underline underline-offset-4">{data.savedToAccount ? 'My reports' : 'Sign in to save'}</Link>}
      </div>
      <section className="mt-10 sm:mt-12"><h2 className="text-base font-semibold tracking-tight sm:text-lg">{data.shared ? 'Reports' : 'Your reports'}</h2>
        <ol className="relative mt-6 flex flex-col gap-5">{reports.map(item => <li key={item.reportNumber}>
          <Link href={result.href(`/reports/${item.reportNumber}`)} className="group flex min-h-[100px] items-center gap-4 rounded-2xl border border-border bg-card px-5 py-5 shadow-xs transition-colors hover:border-foreground/30 hover:bg-muted/30 sm:gap-5">
            <span className="size-12 shrink-0 overflow-hidden rounded-full bg-linear-to-br from-[#e3f0ff] via-[#93c2fb] to-[#4a7fd4] shadow-sm ring-2 ring-[#4a7fd4]/40 sm:size-14"><Image src="/images/frank/avatar.webp" width={56} height={56} alt="Frank" className="size-full object-contain" /></span>
            <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Report {item.reportNumber} · Free</span><span className="truncate font-serif text-lg font-medium sm:text-xl">{item.reportNumber === data.reportNumber ? data.fullReport.headline : `Report ${item.reportNumber}`}</span>{item.createdAt && <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</span>}<span className="text-xs font-medium text-primary">Read the full report →</span></span><ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        </li>)}</ol>
      </section>
      {!data.shared && <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        <button onClick={() => setShowQuestions(value => !value)} aria-expanded={showQuestions} className="flex min-h-[100px] w-full items-center gap-4 px-5 py-5 text-left sm:gap-5"><span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#C9F2DE] text-[#0B3B2E] sm:size-14"><MessageSquare className="size-6" /></span><span className="flex flex-1 flex-col gap-1"><span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Follow-up questions · Free</span><span className="font-serif text-lg font-medium sm:text-xl">Ask Frank about this report</span><span className="text-xs text-emerald-700">{showQuestions ? 'Hide your questions' : 'Your questions and answers are saved here'}</span></span><ChevronRight className={`size-5 shrink-0 transition-transform ${showQuestions ? 'rotate-90' : ''}`} /></button>
        <div hidden={!showQuestions}><FollowupQuestions conversationId={id} reportNumber={data.reportNumber} /></div>
      </section>}
      {deleteError && <p role="alert" className="mt-5 text-sm text-destructive">{deleteError}</p>}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6"><Link href="/setup" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Analyze another chat</Link>{!data.shared && <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive disabled:opacity-50"><Trash2 className="size-3.5" />{deleting ? 'Deleting…' : 'Delete conversation'}</button>}</div>
    </div></main><SiteFooter />
  </div>;
}

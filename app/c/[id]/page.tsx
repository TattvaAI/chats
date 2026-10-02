'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, BarChart3, FileText, Sparkles, Trash2 } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/brandon/header';
import { useChatStore } from '@/lib/store/useChatStore';

export default function ConversationHubPage() {
  return (
    <Suspense>
      <HubInner />
    </Suspense>
  );
}

function HubInner() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const searchParams = useSearchParams();
  const welcome = searchParams?.get('welcome') === '1';
  const { stats, preview, fullReport, loadFromLocal } = useChatStore();
  const storeEmail = useChatStore((s) => s.email);
  const storeLastEmail = useChatStore((s) => s.lastEmail);
  const funnelEmail = storeEmail || storeLastEmail || '';
  const [status, setStatus] = useState<'loading' | 'found' | 'missing'>('loading');
  const [deleting, setDeleting] = useState(false);
  const [showSaveCard, setShowSaveCard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm('Permanently delete this conversation and its report? This cannot be undone.')) return;
    setDeleting(true);
    try {
      let deleteToken: string | null = null;
      try {
        const raw = window.localStorage.getItem(`frank:conv:${id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed?.deleteToken === 'string') deleteToken = parsed.deleteToken;
        }
      } catch {
        deleteToken = null;
      }
      await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: deleteToken ? { 'x-delete-token': deleteToken } : {},
      });
    } catch {
      // proceed with local cleanup even if server delete fails
    }
    try {
      window.localStorage.removeItem(`frank:conv:${id}`);
    } catch {
      // ignore storage errors
    }
    router.push('/setup');
  };

  useEffect(() => {
    if (!id) {
      queueMicrotask(() => setStatus('missing'));
      return;
    }
    if (loadFromLocal(id)) {
      queueMicrotask(() => setStatus('found'));
      return;
    }
    let cancelled = false;
    fetch(`/api/conversations/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        try {
          const st = useChatStore.getState();
          st.setConversationId(
            typeof data?.conversationId === 'string' ? data.conversationId : id
          );
          const cat = data?.conversation?.category;
          if (
            cat === 'romantic' ||
            cat === 'friends_group' ||
            cat === 'friend' ||
            cat === 'family' ||
            cat === 'work' ||
            cat === 'other'
          ) {
            st.setCategory(cat);
          }
          const src = data?.conversation?.source;
          if (src === 'whatsapp' || src === 'imessage') {
            st.setSource(src);
          }
          if (typeof data?.conversation?.fileName === 'string' && data.conversation.fileName) {
            st.setUploadedChat(data.conversation.fileName, '');
          }
          if (data?.stats) {
            st.setParsedData([], data.stats, data?.turningPoint ?? null);
          }
          if (data?.preview) {
            st.setPreview(data.preview);
          }
          if (data?.fullReport) {
            st.setFullReport(data.fullReport);
          }
        } catch {
          // fall through to status check below
        }
        setStatus(data?.stats || data?.preview || data?.fullReport ? 'found' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!welcome || !id) {
      queueMicrotask(() => setShowSaveCard(false));
      return;
    }
    let cancelled = false;
    async function check() {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!cancelled && meRes.ok) {
          setShowSaveCard(false);
          return;
        }
      } catch {
        // treat as signed out
      }
      const emailNow =
        useChatStore.getState().email || useChatStore.getState().lastEmail || '';
      if (!cancelled) setShowSaveCard(emailNow.length > 0);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [welcome, id, funnelEmail]);

  const handleSaveToAccount = async () => {
    if (!funnelEmail || !id) return;
    setSaving(true);
    setSaveError(null);
    try {
      await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: funnelEmail }),
      }).catch(() => null);
    } finally {
      setSaving(false);
    }
    router.push(
      `/login?email=${encodeURIComponent(funnelEmail)}&claim=${encodeURIComponent(id)}&next=${encodeURIComponent(`/c/${id}`)}`
    );
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center px-6 py-24">
          <p className="font-mono text-xs text-muted-foreground">Loading conversation…</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (status === 'missing') {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
          <h1 className="font-serif text-2xl font-medium sm:text-3xl">Not found</h1>
          <p className="max-w-sm text-xs text-muted-foreground">
            This conversation could not be found on this device. Analyses are stored locally in your
            browser.
          </p>
          <Link
            href="/setup"
            className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Analyze a chat
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const names = (stats?.participants ?? []).map((p) => p.name);
  const title = names.length > 0 ? names.join(' & ') : 'Conversation';
  const headline = fullReport?.headline ?? preview?.headline ?? 'Forensic dossier ready';
  const totalMessages = stats?.totalMessages ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 pt-10 pb-24 sm:pt-14">
        <Link
          href="/setup"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span>Audit another chat</span>
        </Link>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Conversation hub
          </span>
          <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {totalMessages > 0 ? `${totalMessages.toLocaleString()} messages audited` : 'Dossier ready'}{' '}
            • 1 report + 1 up next
          </p>
          {showSaveCard && (
            <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Keep this on any device
              </p>
              <p className="text-xs text-neutral-600 leading-relaxed dark:text-neutral-300">
                Save it to your account with one email code.
              </p>
              {saveError && <p className="text-xs text-destructive">{saveError}</p>}
              <button
                type="button"
                onClick={handleSaveToAccount}
                disabled={saving}
                className="inline-flex w-fit items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <span>{saving ? 'Sending…' : 'Save to my account'}</span>
              </button>
            </div>
          )}
          <Link
            href={`/c/${id}/stats`}
            className="mt-2 inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-medium hover:bg-muted"
          >
            <BarChart3 className="size-4 text-primary" />
            <span>See all the stats</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/chat/report/full"
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-foreground/40"
          >
            <span className="inline-flex w-fit items-center gap-2 rounded-md bg-primary/10 px-2.5 py-1 font-mono text-[11px] font-bold text-primary">
              <FileText className="size-3.5" />
              Report 1
            </span>
            <span className="font-serif text-xl font-medium leading-snug">{headline}</span>
            <span className="text-xs font-medium text-primary">Open full dossier →</span>
          </Link>

          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-5">
            <span className="inline-flex w-fit items-center gap-2 rounded-md bg-muted px-2.5 py-1 font-mono text-[11px] font-bold text-muted-foreground">
              <Sparkles className="size-3.5" />
              Report 2 · Next chapter
            </span>
            <span className="font-serif text-xl font-medium text-muted-foreground">
              Not written yet — the next deep-dive lands here.
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-xs font-medium text-destructive transition-all hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="size-4" />
          <span>{deleting ? 'Deleting…' : 'Delete conversation'}</span>
        </button>
      </main>
      <SiteFooter />
    </div>
  );
}

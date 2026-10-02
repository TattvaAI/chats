'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronRight, BarChart3, Trash2, CheckCircle2, MessageSquare, Sparkles } from 'lucide-react';
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
  const [showInterrogate, setShowInterrogate] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [interrogateHistory, setInterrogateHistory] = useState<Array<{ q: string; a: string }>>([]);

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm('Permanently delete this conversation and its report? This cannot be undone.')) return;
    setDeleting(true);
    try {
      let deleteToken: string | null = null;
      try {
        const raw =
          window.localStorage.getItem(`brandon:conv:${id}`) ||
          window.localStorage.getItem(`frank:conv:${id}`);
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
      window.localStorage.removeItem(`brandon:conv:${id}`);
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
          // fall through
        }
        setStatus(data?.stats || data?.preview || data?.fullReport ? 'found' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [id, loadFromLocal]);

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

  const handleAskBrandon = async (questionToAsk: string) => {
    const q = questionToAsk.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const res = await fetch('/api/interrogate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          reportHeadline: headline,
          stats,
        }),
      });
      const data = await res.json();
      const answer = data.answer || "Brandon's take: The patterns in this chat speak for themselves.";
      setInterrogateHistory((prev) => [...prev, { q, a: answer }]);
      setCustomQuestion('');
    } catch {
      setInterrogateHistory((prev) => [
        ...prev,
        {
          q,
          a: "Brandon's take: Trust the actions, not the delay. If someone wants to talk to you, they don't make it this complicated.",
        },
      ]);
    } finally {
      setAsking(false);
    }
  };

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
            This conversation could not be found on this device. Analyses are stored locally in your browser.
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
  const headline = fullReport?.headline ?? preview?.headline ?? 'The Comedy Club Built Over an Open Heart';

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+7rem)] pt-10 sm:px-8 sm:pt-16 sm:pb-32">
          {/* Top Mint Header Tile matching live site */}
          <div
            className="w-full rounded-3xl px-6 py-6 shadow-2xs"
            style={{ backgroundColor: '#b9f3e0', color: '#17343d' }}
          >
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0 max-w-2xl pt-1">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl text-pretty">
                  {title}
                </h1>
                <p className="mt-1.5 text-sm opacity-80">1 report available</p>
              </div>
            </div>

            <Link
              href={`/c/${id}/stats`}
              className="mt-5 flex touch-manipulation items-center justify-between border-t pt-4 text-base font-semibold outline-none transition-transform active:scale-[0.99]"
              style={{ borderColor: 'color-mix(in oklab, currentColor 14%, transparent)' }}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="size-5" />
                <span>See all the stats</span>
              </div>
              <ChevronRight className="size-5" />
            </Link>
          </div>

          {/* Account Save reassurance banner */}
          <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              <span className="text-xs text-emerald-900 font-medium">
                {funnelEmail ? `Saved to your account (${funnelEmail})` : 'Permanently saved in your account'}
              </span>
            </div>
            <Link
              href="/account"
              className="text-xs font-semibold text-emerald-800 hover:underline shrink-0"
            >
              My Reports →
            </Link>
          </div>

          {/* Reports Section with Timeline Connector */}
          <section className="mt-10 sm:mt-12">
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">Your reports</h2>

            <ol className="relative mt-6 flex flex-col gap-5">
              {/* Report 1 Card: Links to /c/[id]/reports/1 */}
              <li className="relative after:absolute after:top-full after:left-10 after:h-5 after:w-px after:bg-foreground/20 after:content-[''] last:after:hidden">
                <Link
                  href={`/c/${id}/reports/1`}
                  className="group relative flex min-h-[100px] w-full touch-manipulation items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card px-5 py-5 text-left shadow-xs transition-all hover:border-foreground/30 hover:bg-muted/30 active:scale-[0.99] sm:gap-5"
                >
                  <span className="relative size-12 shrink-0 sm:size-14">
                    <span
                      aria-hidden="true"
                      className="grid place-items-center overflow-hidden rounded-full bg-linear-to-br shadow-sm ring-2 ring-inset from-[#e3f0ff] via-[#93c2fb] to-[#4a7fd4] ring-[#4a7fd4]/40 size-full"
                    >
                      <Image
                        alt="Brandon"
                        width={56}
                        height={56}
                        className="size-full object-contain motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:-rotate-6 motion-safe:group-hover:scale-110"
                        src="/images/brandon/avatar.webp"
                      />
                    </span>
                  </span>

                  <div className="flex flex-1 flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        1
                      </span>
                      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        Full Report · 100% Free
                      </span>
                    </div>
                    <span className="font-serif text-lg font-medium leading-snug text-foreground sm:text-xl truncate">
                      {headline}
                    </span>
                    <span className="text-xs font-medium text-primary">Read the full report →</span>
                  </div>

                  <ChevronRight className="size-5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                </Link>
              </li>

              {/* Report 2 Card: Chapter 2 - The Interrogation (100% Free) */}
              <li className="relative">
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all hover:border-foreground/30">
                  <button
                    type="button"
                    onClick={() => setShowInterrogate((prev) => !prev)}
                    className="flex min-h-[100px] w-full touch-manipulation items-center gap-4 px-5 py-5 text-left active:scale-[0.99] sm:gap-5 cursor-pointer"
                  >
                    <span className="relative size-12 shrink-0 sm:size-14">
                      <span className="grid place-items-center overflow-hidden rounded-full bg-linear-to-br shadow-sm ring-2 ring-inset from-[#e0f7ef] via-[#a7f3d0] to-[#10b981] ring-[#10b981]/40 size-full text-xl">
                        💬
                      </span>
                    </span>

                    <div className="flex flex-1 flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                          2
                        </span>
                        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                          Chapter 2 · 100% Free
                        </span>
                      </div>
                      <span className="font-serif text-lg font-medium leading-snug text-foreground sm:text-xl truncate">
                        Ask Brandon Anything (Interrogation)
                      </span>
                      <span className="text-xs font-medium text-emerald-700">
                        {showInterrogate ? 'Hide questions' : 'Interrogate Brandon about this chat →'}
                      </span>
                    </div>

                    <ChevronRight
                      className={`size-5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                        showInterrogate ? 'rotate-90 text-foreground' : ''
                      }`}
                    />
                  </button>

                  {/* Expanded Interrogation Drawer */}
                  {showInterrogate && (
                    <div className="border-t border-border bg-muted/10 p-5 sm:p-6 flex flex-col gap-4">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Ask Brandon any question about this conversation. He knows the timeline, response patterns, deleted messages, and subtext.
                      </p>

                      {/* Prompt Suggestions */}
                      <div className="flex flex-wrap gap-2">
                        {[
                          'Does she/he actually like me?',
                          'What should I text next?',
                          'Why did the conversation go cold?',
                          'Am I overthinking this?',
                        ].map((promptText) => (
                          <button
                            key={promptText}
                            type="button"
                            onClick={() => handleAskBrandon(promptText)}
                            disabled={asking}
                            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:border-foreground/40 hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
                          >
                            &ldquo;{promptText}&rdquo;
                          </button>
                        ))}
                      </div>

                      {/* History of answers */}
                      {interrogateHistory.length > 0 && (
                        <div className="flex flex-col gap-3 pt-2">
                          {interrogateHistory.map((item, idx) => (
                            <div key={idx} className="flex flex-col gap-2 rounded-xl bg-background p-4 border border-border text-sm">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                                You asked: &ldquo;{item.q}&rdquo;
                              </span>
                              <div className="rounded-xl bg-[#e7f8f2] border border-[#a3e9d0] p-3 text-[#0a4837] text-sm leading-relaxed">
                                <span className="font-semibold block mb-1">Brandon:</span>
                                {item.a}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Custom Question Input */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAskBrandon(customQuestion);
                        }}
                        className="flex gap-2 pt-2"
                      >
                        <input
                          type="text"
                          value={customQuestion}
                          onChange={(e) => setCustomQuestion(e.target.value)}
                          placeholder="Type your question for Brandon..."
                          className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={asking || !customQuestion.trim()}
                          className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50 transition-all cursor-pointer"
                        >
                          {asking ? 'Thinking…' : 'Ask'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </li>
            </ol>
          </section>

          {/* Action Links */}
          <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
            <Link
              href="/setup"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Analyze another chat</span>
            </Link>

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive transition-all hover:bg-destructive/10 disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="size-3.5" />
              <span>{deleting ? 'Deleting…' : 'Delete conversation'}</span>
            </button>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

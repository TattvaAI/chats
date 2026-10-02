'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/brandon/header';
import { useChatStore } from '@/lib/store/useChatStore';
import { computeDetailedStats } from '@/lib/forensics/detailed-stats';

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function formatHour(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

export default function ConversationStatsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { stats, parsedMessages, loadFromLocal } = useChatStore();
  const [status, setStatus] = useState<'loading' | 'found' | 'missing'>('loading');

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

  const detailed = useMemo(() => {
    if (!stats || parsedMessages.length === 0) return null;
    return computeDetailedStats(parsedMessages, stats);
  }, [parsedMessages, stats]);

  const dayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of detailed?.calendar ?? []) m.set(e.date, e.count);
    return m;
  }, [detailed]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center px-6 py-24">
          <p className="font-mono text-xs text-muted-foreground">Loading stats…</p>
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
            No local data for this conversation on this device.
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
  const year = detailed?.recordDay.date
    ? Number(detailed.recordDay.date.slice(0, 4))
    : new Date().getFullYear();
  const maxDay = Math.max(1, ...(detailed?.calendar.map((e) => e.count) ?? [1]));
  const maxHour = Math.max(1, ...(detailed?.hourly ?? Array(24).fill(0)));

  if (!detailed) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 pt-10 pb-24 sm:pt-14">
          <Link
            href={`/c/${id}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            <span>Back to conversation</span>
          </Link>
          <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
          <p className="text-xs text-muted-foreground">No data yet.</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 pt-10 pb-24 sm:pt-14">
        <Link
          href={`/c/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span>Back to conversation</span>
        </Link>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Full stats • {Number.isFinite(year) ? year : new Date().getFullYear()}
          </span>
          <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
        </div>

        {/* Yearly calendar heatmap */}
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-7">
          <h2 className="font-serif text-xl font-medium sm:text-2xl">Activity calendar</h2>
          <div className="grid grid-cols-6 gap-3 sm:grid-cols-12">
            {MONTH_LABELS.map((label, m) => {
              const daysInMonth = new Date(year, m + 1, 0).getDate();
              return (
                <div key={m} className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] font-bold text-muted-foreground">{label}</span>
                  <div className="grid grid-cols-4 gap-1 sm:grid-cols-3">
                    {Array.from({ length: daysInMonth }, (_, d) => {
                      const key = `${year}-${`${m + 1}`.padStart(2, '0')}-${`${d + 1}`.padStart(2, '0')}`;
                      const count = dayCounts.get(key) ?? 0;
                      const opacity = count === 0 ? 1 : 0.2 + 0.8 * (count / maxDay);
                      return (
                        <div
                          key={key}
                          title={`${key}: ${count}`}
                          style={count === 0 ? undefined : { opacity }}
                          className={
                            count === 0
                              ? 'size-2.5 rounded-[3px] bg-muted'
                              : 'size-2.5 rounded-[3px] bg-primary'
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Who talks, who starts */}
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-7">
          <h2 className="font-serif text-xl font-medium sm:text-2xl">Who talks, who starts</h2>
          {detailed.perPerson.length === 0 ? (
            <p className="text-xs text-muted-foreground">No data yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {detailed.perPerson.map((p) => (
                <div key={p.name} className="flex flex-col gap-1 rounded-xl border border-border bg-muted/30 p-4">
                  <span className="font-serif text-lg font-medium">{p.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.messageCount.toLocaleString()} msgs • {p.sharePct}% share • {p.initiationPct}% starts
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Rhythm */}
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-7">
          <h2 className="font-serif text-xl font-medium sm:text-2xl">Rhythm</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <span className="font-mono text-[11px] uppercase text-muted-foreground">Record day</span>
              <p className="mt-1 text-sm font-semibold">
                {detailed.recordDay.count > 0 ? `${detailed.recordDay.date} (${detailed.recordDay.count})` : '0'}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <span className="font-mono text-[11px] uppercase text-muted-foreground">Streak</span>
              <p className="mt-1 text-sm font-semibold">{detailed.streakDays} days</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <span className="font-mono text-[11px] uppercase text-muted-foreground">Longest silence</span>
              <p className="mt-1 text-sm font-semibold">{detailed.longestSilenceDays} days</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <span className="font-mono text-[11px] uppercase text-muted-foreground">After 10pm</span>
              <p className="mt-1 text-sm font-semibold">
                {detailed.after10pmPct}% • peak {formatHour(detailed.peakHour)}
              </p>
            </div>
          </div>
          {detailed.perPerson.length > 0 && (
            <div className="flex flex-col gap-1">
              {detailed.perPerson.map((p) => (
                <p key={p.name} className="font-mono text-xs text-muted-foreground">
                  {p.name}: median reply {p.medianReplyMin}m
                </p>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 pt-1">
            <span className="font-mono text-[11px] uppercase text-muted-foreground">Hourly volume</span>
            <div className="flex h-20 items-end gap-1">
              {detailed.hourly.map((c, h) => (
                <div key={h} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    title={`${formatHour(h)}: ${c}`}
                    style={{ height: `${Math.max(4, (c / maxHour) * 64)}px` }}
                    className="w-full rounded-sm bg-primary"
                  />
                  {h % 3 === 0 && (
                    <span className="font-mono text-[9px] text-muted-foreground">{formatHour(h)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Words */}
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-7">
          <h2 className="font-serif text-xl font-medium sm:text-2xl">Words & emoji</h2>
          {detailed.perPerson.length === 0 ? (
            <p className="text-xs text-muted-foreground">No data yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {detailed.perPerson.map((p) => (
                <div key={p.name} className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-4">
                  <span className="font-serif text-lg font-medium">{p.name}</span>
                  <div className="text-xs">
                    <span className="font-mono uppercase text-muted-foreground">Top words: </span>
                    {p.topWords.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      p.topWords.map((w) => `${w.word} (${w.count})`).join(' • ')
                    )}
                  </div>
                  <div className="text-xs">
                    <span className="font-mono uppercase text-muted-foreground">Top emoji: </span>
                    {p.topEmojis.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      p.topEmojis.map((e) => `${e.emoji} (${e.count})`).join(' ')
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

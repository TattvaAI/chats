'use client';

import { Suspense, useMemo, useState } from 'react';
import { ReportLink as Link } from '@/components/frank/report-link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/frank/header';
import { useConversation } from '@/lib/hooks/useConversation';
import { ReportStatus } from '@/components/frank/report-status';

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function formatHour(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

export default function ConversationStatsPage() {
  return <Suspense><StatsInner /></Suspense>;
}

function StatsInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const result = useConversation(id, params.get('report') || undefined);
  const stats = result.data?.stats;
  const detailed = result.data?.detailedStats;
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const years = useMemo(() => [...new Set((detailed?.calendar || []).map(day => Number(day.date.slice(0, 4))).filter(Number.isFinite))].sort((a, b) => a - b), [detailed]);
  const year = selectedYear !== null && years.includes(selectedYear) ? selectedYear : years[years.length - 1];

  const dayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of detailed?.calendar ?? []) m.set(e.date, e.count);
    return m;
  }, [detailed]);

  if (result.status !== 'found' || !result.data) return <ReportStatus key={id} id={id} status={result.status} message={result.message} retry={result.retry} shared={Boolean(result.shareToken)} />;

  const names = (stats?.participants ?? []).map((p) => p.name);
  const title = names.length > 0 ? names.join(' & ') : result.data.conversation.title || result.data.fullReport.headline;
  const maxDay = Math.max(1, ...(detailed?.calendar.map((e) => e.count) ?? [1]));
  const maxHour = Math.max(1, ...(detailed?.hourly ?? Array(24).fill(0)));

  if (!detailed) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 pt-10 pb-24 sm:pt-14">
          <Link
            href={result.href()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            <span>Back to conversation</span>
          </Link>
          <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Detailed statistics were not stored with this report. You can still read the saved report.
          </p>
          <Link
            href={result.href(`/reports/${result.data.reportNumber}`)}
            className="inline-flex h-11 w-fit items-center justify-center rounded-xl bg-primary px-6 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Read Frank&apos;s Report &rarr;
          </Link>
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
          href={result.href()}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span>Back to conversation</span>
        </Link>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Full stats · Report {result.data.reportNumber}{result.data.shared ? ' · Shared view' : ''}
          </span>
          <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
        </div>

        {/* Yearly calendar heatmap */}
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl font-medium sm:text-2xl">Activity calendar</h2>{years.length > 0 && <label className="flex items-center gap-2 text-sm">Year<select value={year} onChange={event => setSelectedYear(Number(event.target.value))} className="rounded-lg border border-border bg-background px-3 py-2">{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}</div>
          {years.length === 0 ? <p className="text-sm text-muted-foreground">Daily activity was not stored with this report.</p> : <div className="grid grid-cols-6 gap-3 sm:grid-cols-12">
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
          </div>}
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
              <span className="font-mono text-[11px] uppercase text-muted-foreground">10pm–6am</span>
              <p className="mt-1 text-sm font-semibold">
                {detailed.after10pmPct}% • peak {formatHour(detailed.peakHour)}
              </p>
            </div>
          </div>
          {detailed.perPerson.length > 0 && (
            <div className="flex flex-col gap-1">
              {detailed.perPerson.map((p) => (
                <p key={p.name} className="font-mono text-xs text-muted-foreground">
                  {p.name}: median reply {p.medianReplyMin == null ? 'not available' : `${p.medianReplyMin}m`}
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
                    style={{ height: `${c > 0 ? Math.max(2, (c / maxHour) * 64) : 0}px` }}
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

'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Share2,
  Printer,
  Check,
  BarChart3,
  ShieldCheck,
  Copy,
  Star,
} from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/brandon/header';
import { useChatStore } from '@/lib/store/useChatStore';
import { BrandonReport } from '@/lib/ai/schemas';

export default function ReportPage() {
  return (
    <Suspense>
      <ReportInner />
    </Suspense>
  );
}

function ReportInner() {
  const params = useParams<{ id: string; reportNumber: string }>();
  const id = params?.id ?? '';
  const { fullReport, preview, stats, loadFromLocal } = useChatStore();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
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
          st.setConversationId(data?.conversationId || id);
          if (data?.stats) {
            st.setParsedData([], data.stats, data?.turningPoint ?? null);
          }
          if (data?.preview) st.setPreview(data.preview);
          if (data?.fullReport) st.setFullReport(data.fullReport);
        } catch {
          // ignore
        }
        setStatus(data?.fullReport || data?.preview ? 'found' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [id, loadFromLocal]);

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyText = (text: string) => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center px-6 py-24">
          <p className="font-mono text-xs text-muted-foreground">Loading report…</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (status === 'missing' && !fullReport) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
          <h1 className="font-serif text-2xl font-medium sm:text-3xl">Report not found</h1>
          <p className="max-w-sm text-xs text-muted-foreground">
            This report could not be found on this device. Analyses are stored locally in your browser.
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

  const report = fullReport as BrandonReport | null;
  const headline = report?.headline || preview?.headline || 'The Comedy Club Built Over an Open Heart';
  const subheading = report?.subheading || preview?.subheading || '';

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 sm:px-10 sm:py-14 lg:px-16">
          <div className="flex w-full flex-col gap-10">
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between no-print">
              <Link
                href={`/c/${id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="size-4" />
                <span>Conversation hub</span>
              </Link>
              <Link
                href={`/c/${id}/stats`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <BarChart3 className="size-4 text-emerald-600" />
                <span>See all the stats</span>
              </Link>
            </div>

            {/* Header & Title */}
            <div className="mx-auto w-full max-w-prose">
              <div className="flex flex-col items-start text-left">
                <h1 className="font-serif text-4xl font-medium tracking-tight text-pretty sm:text-5xl">
                  {headline}
                </h1>
                {subheading && (
                  <p className="mt-3 font-serif text-lg italic text-muted-foreground sm:text-xl">
                    &ldquo;{subheading}&rdquo;
                  </p>
                )}

                {/* Brandon Byline Card */}
                <div className="mt-8 flex w-full items-center gap-3 rounded-xl bg-muted/50 px-4 py-3 ring-1 ring-foreground/10">
                  <span className="size-10 shrink-0">
                    <span
                      aria-hidden="true"
                      className="grid place-items-center overflow-hidden rounded-full bg-linear-to-br shadow-sm ring-2 ring-inset from-[#e3f0ff] via-[#93c2fb] to-[#4a7fd4] ring-[#4a7fd4]/40 size-full"
                    >
                      <Image
                        alt="Brandon"
                        width={40}
                        height={40}
                        className="size-full object-contain"
                        src="/images/brandon/avatar.webp"
                      />
                    </span>
                  </span>
                  <p className="text-sm leading-tight text-muted-foreground">
                    <span className="text-foreground font-medium">Brandon</span>
                    <br />
                    An AI with no filter, too many opinions and an unexplained fondness for lasagna.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="no-print mt-4 flex w-full flex-col gap-3 sm:flex-row sm:[&>*]:flex-1">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="inline-flex h-10 w-full shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground shadow-2xs transition-all hover:bg-muted"
                  >
                    {copiedLink ? <Check className="size-4 text-emerald-600" /> : <Share2 className="size-4" />}
                    <span>{copiedLink ? 'Link copied!' : 'Share the report'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') window.print();
                    }}
                    className="inline-flex h-10 w-full shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground shadow-2xs transition-all hover:bg-muted"
                  >
                    <Printer className="size-4" />
                    <span>Print report</span>
                  </button>
                </div>

                {/* Privacy Badge */}
                <div className="no-print mt-4">
                  <p className="flex items-start gap-2 text-xs text-foreground/70">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <span>Your data stays completely private and under your control.</span>
                  </p>
                </div>
              </div>
            </div>

            {/* GRAND METAPHOR INTRO */}
            {report?.grandMetaphor && (
              <div className="mx-auto w-full max-w-prose">
                <article className="prose prose-lg max-w-none prose-p:leading-relaxed sm:prose-p:leading-relaxed prose-strong:font-semibold">
                  <p className="font-serif text-xl sm:text-2xl leading-relaxed text-foreground">
                    {report.grandMetaphor.intro}
                  </p>
                  <p className="text-base sm:text-lg text-foreground/90">
                    {report.grandMetaphor.roleReader}
                  </p>
                  <p className="text-base sm:text-lg text-foreground/90">
                    {report.grandMetaphor.roleOther}
                  </p>
                  <p className="text-base sm:text-lg text-foreground/90">
                    {report.grandMetaphor.dynamicSummary}
                  </p>
                  {report.grandMetaphor.closingPunchline && (
                    <p className="font-serif text-lg font-medium italic text-primary">
                      {report.grandMetaphor.closingPunchline}
                    </p>
                  )}
                </article>
              </div>
            )}

            {/* SECTION 1: 🎬 BRANDON REACTS */}
            {report?.realTimeReactions && report.realTimeReactions.length > 0 && (
              <div className="mx-auto w-full max-w-prose">
                <article className="prose prose-lg max-w-none">
                  <SectionHeader
                    emoji="🎬"
                    title="Brandon Reacts: Reading This in Real Time"
                  />
                  <p className="text-base sm:text-lg leading-relaxed text-foreground/90">
                    Reading your chat logs was an Olympic sport of decoding what was typed, what was deleted, and what was said between the lines. Here is my live commentary on the experience:
                  </p>

                  <div className="not-prose mt-6 flex flex-col gap-8">
                    {report.realTimeReactions.map((scene) => (
                      <div key={scene.number} className="flex flex-col gap-3">
                        <h3 className="font-serif text-xl font-medium sm:text-2xl text-foreground">
                          {scene.number}. {scene.title}
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed text-foreground/85">
                          {scene.narrative}
                        </p>

                        {/* WhatsApp speech bubbles */}
                        {scene.quotes && scene.quotes.length > 0 && (
                          <div className="my-2 flex flex-col gap-2">
                            {scene.quotes.map((q, qIdx) => (
                              <WhatsAppBubble key={qIdx} text={q.text} />
                            ))}
                          </div>
                        )}

                        <p className="text-sm sm:text-base leading-relaxed text-foreground/85 italic border-l-2 border-foreground/20 pl-4 py-1">
                          {scene.reaction}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            )}

            {/* SECTION 2: 🎪 THE METAPHOR */}
            {report?.metaphorSection && (
              <div className="mx-auto w-full max-w-prose">
                <article className="prose prose-lg max-w-none">
                  <SectionHeader
                    emoji={report.metaphorSection.emoji || '🎪'}
                    title={report.metaphorSection.title}
                  />

                  {report.metaphorSection.tagline && (
                    <p className="font-serif text-xl sm:text-2xl font-medium leading-snug text-foreground">
                      {report.metaphorSection.tagline}
                    </p>
                  )}

                  {report.metaphorSection.paragraphs &&
                    report.metaphorSection.paragraphs.map((p, idx) => (
                      <p key={idx} className="text-base sm:text-lg leading-relaxed text-foreground/90">
                        {p}
                      </p>
                    ))}
                </article>
              </div>
            )}

            {/* SECTION 3: 🔍 LINGUISTIC DECODING */}
            {report?.privateDialect && (
              <div className="mx-auto w-full max-w-prose">
                <article className="prose prose-lg max-w-none">
                  <SectionHeader
                    emoji={report.privateDialect.emoji || '🔍'}
                    title={report.privateDialect.title || 'Linguistic Decoding: Your Private Dialect'}
                  />

                  {report.privateDialect.intro && (
                    <p className="text-base sm:text-lg leading-relaxed text-foreground/90">
                      {report.privateDialect.intro}
                    </p>
                  )}

                  <div className="not-prose mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {report.privateDialect.entries.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-2xs"
                      >
                        <span className="font-serif text-lg font-medium text-foreground">
                          &ldquo;{item.term}&rdquo;
                        </span>
                        {item.quote && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.quote}
                          </span>
                        )}
                        <p className="text-xs text-foreground/90 pt-1 leading-relaxed">
                          <strong>Literal: </strong>
                          {item.meaning}
                        </p>
                        <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                          <strong>Subtext: </strong>
                          {item.subtext}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            )}

            {/* SECTION 4: 🪞 PROFILE OF THE PAIR */}
            {report?.pairProfile && (
              <div className="mx-auto w-full max-w-prose">
                <article className="prose prose-lg max-w-none">
                  <SectionHeader
                    emoji={report.pairProfile.emoji || '🪞'}
                    title={report.pairProfile.title || 'Profile of the Pair'}
                  />

                  <div className="not-prose mt-6 flex flex-col gap-6">
                    {report.pairProfile.profiles.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-xs"
                      >
                        <div className="flex flex-col gap-1 border-b border-border pb-3">
                          <span className="font-serif text-2xl font-medium text-foreground">
                            {p.name}
                          </span>
                          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-600">
                            {p.roleTitle}
                          </span>
                        </div>

                        <div className="flex flex-col gap-2 text-sm leading-relaxed">
                          <p>
                            <strong className="text-foreground">The Facade: </strong>
                            <span className="text-foreground/80">{p.theFacade}</span>
                          </p>
                          <p>
                            <strong className="text-foreground">The Reality: </strong>
                            <span className="text-foreground/80">{p.theReality}</span>
                          </p>
                          <p>
                            <strong className="text-foreground">Signature Move: </strong>
                            <span className="text-foreground/80">{p.signatureMove}</span>
                          </p>
                          <p>
                            <strong className="text-foreground">Vulnerability Tell: </strong>
                            <span className="text-foreground/80">{p.vulnerabilityTell}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            )}

            {/* SECTION 5: ⭐ THE YELP REVIEW */}
            {report?.yelpReview && (
              <div className="mx-auto w-full max-w-prose">
                <article className="prose prose-lg max-w-none">
                  <SectionHeader
                    emoji={report.yelpReview.emoji || '⭐'}
                    title={report.yelpReview.title}
                  />

                  <div className="not-prose mt-6 flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-xs">
                    {/* Star Rating */}
                    <div className="flex items-center gap-1.5">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`size-5 ${
                            i < (report.yelpReview.stars || 4)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-neutral-300'
                          }`}
                        />
                      ))}
                      <span className="ml-2 font-mono text-xs font-bold text-foreground">
                        {report.yelpReview.stars || 4}.0 / 5.0
                      </span>
                    </div>

                    <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground/85 divide-y divide-border/60">
                      <div className="pt-2">
                        <strong className="text-foreground block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                          Ambiance:
                        </strong>
                        <p>{report.yelpReview.ambiance}</p>
                      </div>

                      <div className="pt-3">
                        <strong className="text-foreground block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                          Service:
                        </strong>
                        <p>{report.yelpReview.service}</p>
                      </div>

                      <div className="pt-3">
                        <strong className="text-foreground block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                          The Menu:
                        </strong>
                        <p>{report.yelpReview.menu}</p>
                      </div>

                      <div className="pt-3">
                        <strong className="text-foreground block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                          Brandon&apos;s Verdict:
                        </strong>
                        <p className="font-medium text-foreground">{report.yelpReview.verdict}</p>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            )}

            {/* SECTION 6: 🕰️ THE TURNING POINTS */}
            {report?.turningPoints && (
              <div className="mx-auto w-full max-w-prose">
                <article className="prose prose-lg max-w-none">
                  <SectionHeader
                    emoji={report.turningPoints.emoji || '🕰️'}
                    title={report.turningPoints.title || 'The Turning Points: When the Subtext Leaked'}
                  />

                  <div className="not-prose mt-6 flex flex-col gap-5">
                    {report.turningPoints.points.map((pt, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-serif text-lg font-medium text-foreground">
                            {pt.momentTitle}
                          </span>
                          <span className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-muted-foreground">
                            {pt.dateOrPeriod}
                          </span>
                        </div>

                        <p className="text-sm leading-relaxed text-foreground/85">
                          {pt.whatHappened}
                        </p>

                        {pt.keyExchange && pt.keyExchange.length > 0 && (
                          <div className="my-2 flex flex-col gap-2">
                            {pt.keyExchange.map((q, qIdx) => (
                              <WhatsAppBubble key={qIdx} text={q.text} />
                            ))}
                          </div>
                        )}

                        <p className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-3">
                          {pt.impact}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            )}

            {/* SECTION 7: 🎟️ THE ADVICE */}
            {report?.practicalAdvice && (
              <div className="mx-auto w-full max-w-prose">
                <article className="prose prose-lg max-w-none">
                  <SectionHeader
                    emoji={report.practicalAdvice.emoji || '🎟️'}
                    title={report.practicalAdvice.title || 'The Advice'}
                  />

                  <div className="not-prose mt-6 flex flex-col gap-6 rounded-2xl border-2 border-primary/30 bg-card p-6 sm:p-8 shadow-sm">
                    <p className="font-serif text-lg leading-relaxed text-foreground">
                      {report.practicalAdvice.directTake}
                    </p>

                    {/* What to text next */}
                    {report.practicalAdvice.whatToText && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                            Recommended Next Text:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(report.practicalAdvice.whatToText)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-950 hover:bg-emerald-200 transition-colors cursor-pointer"
                          >
                            {copiedText ? (
                              <Check className="size-3.5 text-emerald-700" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                            <span>{copiedText ? 'Copied!' : 'Copy text'}</span>
                          </button>
                        </div>
                        <div className="rounded-xl border border-emerald-300 bg-[#C9F2DE] p-4 text-sm font-medium text-[#0B3B2E] shadow-2xs">
                          {report.practicalAdvice.whatToText}
                        </div>
                      </div>
                    )}

                    {/* What to stop doing */}
                    {report.practicalAdvice.whatToStopDoing && (
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                          What to Stop Doing Immediately:
                        </span>
                        <div className="rounded-xl border border-rose-300 bg-[#FFD9E2] p-4 text-sm text-[#5E1A2A]">
                          {report.practicalAdvice.whatToStopDoing}
                        </div>
                      </div>
                    )}

                    {/* Brandon Closing */}
                    {report.practicalAdvice.brandonClosing && (
                      <div className="border-t border-border pt-4">
                        <p className="font-serif text-base italic text-muted-foreground leading-relaxed">
                          &ldquo;{report.practicalAdvice.brandonClosing}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>
                </article>
              </div>
            )}

            {/* Bottom Actions and Hub Link */}
            <div className="mx-auto flex w-full max-w-prose flex-col items-center justify-center gap-4 pt-10 border-t border-border no-print">
              <Link
                href={`/c/${id}`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all"
              >
                Back to conversation hub
              </Link>
              <Link
                href={`/c/${id}/stats`}
                className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <BarChart3 className="size-4 text-primary" />
                <span>Explore all message stats</span>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

// Section Header with Circular Emoji Badge and Diamond Ornament
function SectionHeader({ emoji, title }: { emoji: string; title: string }) {
  return (
    <h2 className="mt-14 mb-7 flex flex-col items-center text-center first:mt-0">
      <span className="heading-emoji mb-4 flex h-13 min-w-13 items-center justify-center rounded-full border border-foreground/15 bg-background px-2.5 text-2xl shadow-[0_6px_16px_-8px_rgb(0_0_0/0.35)]">
        {emoji}
      </span>
      <span className="font-serif text-3xl/snug font-medium text-balance text-foreground">
        {title}
      </span>
      <span aria-hidden="true" className="mt-4 flex items-center gap-2 text-foreground">
        <span className="h-px w-7 bg-current opacity-60" />
        <span className="size-1.5 rotate-45 bg-current" />
        <span className="h-px w-7 bg-current opacity-60" />
      </span>
    </h2>
  );
}

// WhatsApp Speech Bubble matching live site
function WhatsAppBubble({ text }: { text: string }) {
  return (
    <blockquote className="not-prose my-2 flex justify-start first:mt-0">
      <div className="relative max-w-[88%] [filter:drop-shadow(0_1px_1px_rgb(11_20_26_/_0.16))] sm:max-w-[76%]">
        <svg
          viewBox="0 0 22 18"
          aria-hidden="true"
          className="pointer-events-none absolute -left-3 bottom-0 h-[18px] w-[22px] text-whatsapp-bubble"
          fill="currentColor"
        >
          <path d="M22 0V18H11C7.4 18 3.6 16.4 0.6 13.6C6.2 12.4 8.7 8.7 9.8 4.6C10.6 1.7 15.8 0 22 0Z" />
        </svg>
        <div className="relative z-10 rounded-[7.5px] rounded-bl-[3px] bg-whatsapp-bubble px-[9px] py-[6px] text-base sm:text-lg leading-relaxed text-whatsapp-bubble-foreground">
          <div className="[&>p]:m-0 [&>p:not(:last-of-type)]:mb-1.5 [&>p:not(:last-of-type)]:block [&>p:last-of-type]:inline">
            <p>{text}</p>
            <span className="inline-block w-7" aria-hidden="true" />
          </div>
          <span className="absolute bottom-[5px] right-[9px] inline-flex h-3.5 items-center">
            <svg
              viewBox="0 0 16 15"
              aria-hidden="true"
              className="h-[15px] w-4 flex-none text-whatsapp-check"
              fill="currentColor"
            >
              <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.033L1.891 7.769a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l3.013 2.928c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512z" />
            </svg>
          </span>
        </div>
      </div>
    </blockquote>
  );
}

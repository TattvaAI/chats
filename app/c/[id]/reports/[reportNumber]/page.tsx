'use client';
import { conversationHeaders } from '@/lib/store/access';

import { Suspense, useState } from 'react';
import { ReportLink as Link } from '@/components/frank/report-link';
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
import { SiteHeader, SiteFooter } from '@/components/frank/header';
import { useConversation } from '@/lib/hooks/useConversation';
import { responseError } from '@/lib/hooks/report-client';
import { ReportStatus } from '@/components/frank/report-status';

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
  const result = useConversation(id, params.reportNumber);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [shareError, setShareError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareLink, setShareLink] = useState<{ id: string; url: string } | null>(null);

  const handleShare = async () => {
    if (!result.data || result.data.shared || sharing) return;
    setShareError(''); setSharing(true);
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(id)}/share`, { method: 'POST', headers: conversationHeaders(id, null) });
      if (!response.ok) throw new Error(await responseError(response, 'Could not create a shared link. Please retry.'));
      const data = await response.json();
      if (typeof data.token !== 'string') throw new Error('The shared link could not be read. Please retry.');
      const url = `${location.origin}/c/${id}/reports/${result.data.reportNumber}#share=${encodeURIComponent(data.token)}`;
      setShareLink({ id, url });
      try {
        await navigator.clipboard.writeText(url);
        setCopiedLink(true);
      } catch { setShareError('The link is ready. Copy it from the field below.'); }
    } catch (error) { setShareError(error instanceof Error ? error.message : 'Could not share the report.'); }
    finally { setSharing(false); }
  };
  const revokeShare = async () => {
    if (result.data?.shared || sharing) return;
    setSharing(true); setShareError('');
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(id)}/share`, { method: 'DELETE', headers: conversationHeaders(id, null) });
      if (!response.ok) throw new Error(await responseError(response, 'Could not revoke sharing. Please retry.'));
      setShareError('Shared links revoked.'); setShareLink(null); setCopiedLink(false);
    } catch (error) { setShareError(error instanceof Error ? error.message : 'Could not revoke sharing.'); }
    finally { setSharing(false); }
  };
  const handleCopyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedText(true); }
    catch { setShareError('Your browser could not copy the text. Select it and copy it manually.'); }
  };

  if (result.status !== 'found' || !result.data) return <ReportStatus key={id} id={id} status={result.status} message={result.message} retry={result.retry} shared={Boolean(result.shareToken)} />;
  const { fullReport: report, shared, reportLanguage, reportNumber } = result.data;
  const headline = report.headline;
  const subheading = report.subheading;


  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main lang={reportLanguage || undefined} className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 sm:px-10 sm:py-14 lg:px-16">
          <div className="flex w-full flex-col gap-10">
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between no-print">
              <Link
                href={result.href()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="size-4" />
                <span>Conversation hub</span>
              </Link>
              <Link
                href={result.href(`/stats?report=${reportNumber}`)}
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

                <p className="mt-4 text-xs text-muted-foreground">Report {reportNumber} · {reportLanguage === 'fr' ? 'Français' : reportLanguage === 'es' ? 'Español' : reportLanguage === 'en' ? 'English' : 'Language not recorded'}{shared ? ' · Read-only shared report' : ''}</p>
                {/* Frank Byline Card */}
                <div className="mt-8 flex w-full items-center gap-3 rounded-xl bg-muted/50 px-4 py-3 ring-1 ring-foreground/10">
                  <span className="size-10 shrink-0">
                    <span
                      aria-hidden="true"
                      className="grid place-items-center overflow-hidden rounded-full bg-linear-to-br shadow-sm ring-2 ring-inset from-[#e3f0ff] via-[#93c2fb] to-[#4a7fd4] ring-[#4a7fd4]/40 size-full"
                    >
                      <Image
                        alt="Frank"
                        width={40}
                        height={40}
                        className="size-full object-contain"
                        src="/images/frank/avatar.webp"
                      />
                    </span>
                  </span>
                  <p className="text-sm leading-tight text-muted-foreground">
                    <span className="text-foreground font-medium">Frank</span>
                    <br />
                    An AI with no filter, too many opinions and an unexplained fondness for lasagna.
                  </p>
                </div>

                {!shared && <div className="no-print mt-3 text-xs text-muted-foreground">Sharing creates a read-only link that expires in 7 days. <button onClick={revokeShare} disabled={sharing} className="underline disabled:opacity-50">Revoke shared links</button></div>}
                {shareError && <p role="status" className="no-print mt-2 text-sm">{shareError}</p>}
                {!shared && shareLink?.id === id && <label className="no-print mt-3 block text-xs text-muted-foreground">Shared link<input aria-label="Shared report link" readOnly value={shareLink.url} onFocus={event => event.target.select()} className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-xs" /></label>}
                {/* Action Buttons */}
                <div className="no-print mt-4 flex w-full flex-col gap-3 sm:flex-row sm:[&>*]:flex-1">
                  {!shared && <button
                    type="button"
                    disabled={sharing}
                    onClick={handleShare}
                    className="inline-flex h-10 w-full shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground shadow-2xs transition-all hover:bg-muted"
                  >
                    {copiedLink ? <Check className="size-4 text-emerald-600" /> : <Share2 className="size-4" />}
                    <span>{sharing ? 'Please wait…' : copiedLink ? 'Link copied!' : 'Share the report'}</span>
                  </button>}

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
                    <span>{shared ? 'This read-only report is visible to anyone with this link until it expires or is revoked.' : 'Your report has restricted access. Sharing creates a link other people can read.'}</span>
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
                    title="Frank Reacts: Reading This in Real Time"
                  />
                  <p className="text-base sm:text-lg leading-relaxed text-foreground/90">
                    A few moments that stood out, with the original messages alongside Frank’s reading.
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
                              <WhatsAppBubble key={qIdx} text={q.text} sender={q.sender} at={q.at} />
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
                          <span className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
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
                    {Number.isFinite(report.yelpReview.stars) && <div className="flex items-center gap-1.5">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`size-5 ${
                            i < report.yelpReview.stars
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-neutral-300'
                          }`}
                        />
                      ))}
                      <span className="ml-2 font-mono text-xs font-bold text-foreground">
                        {report.yelpReview.stars.toFixed(1)} / 5.0
                      </span>
                    </div>}

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
                          Frank&apos;s Verdict:
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
                              <WhatsAppBubble key={qIdx} text={q.text} sender={q.sender} at={q.at} />
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

                    {/* Frank Closing */}
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

            {/* SECTION 8: 🗂️ MEMBER DOSSIERS */}
            {report?.memberDossiers && report.memberDossiers.length > 0 && (
              <div className="mx-auto w-full max-w-prose">
                <article className="prose prose-lg max-w-none">
                  <SectionHeader
                    emoji="🗂️"
                    title="Member Dossiers"
                  />

                  <div className="not-prose mt-6 flex flex-col gap-6">
                    {report.memberDossiers.map((dossier, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-xs"
                      >
                        <div className="flex flex-col gap-1 border-b border-border pb-3">
                          <span className="font-serif text-2xl font-medium text-foreground">
                            {dossier.name}
                          </span>
                          {dossier.roleTitle && (
                            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-600">
                              {dossier.roleTitle}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 text-sm leading-relaxed">
                          {dossier.roast && (
                            <p>
                              <strong className="text-foreground">Roast: </strong>
                              <span className="text-foreground/80">{dossier.roast}</span>
                            </p>
                          )}
                          {dossier.diagnosis && (
                            <p>
                              <strong className="text-foreground">Diagnosis: </strong>
                              <span className="text-foreground/80">{dossier.diagnosis}</span>
                            </p>
                          )}
                          {dossier.telltaleHabit && (
                            <p>
                              <strong className="text-foreground">Signature Habit: </strong>
                              <span className="text-foreground/80">{dossier.telltaleHabit}</span>
                            </p>
                          )}
                          {dossier.redFlags && dossier.redFlags.length > 0 && (
                            <div className="pt-2">
                              <strong className="text-foreground block text-xs font-mono uppercase tracking-wider text-rose-700 dark:text-rose-400 mb-1">
                                Red Flags:
                              </strong>
                              <ul className="list-disc list-inside space-y-1 text-xs text-foreground/80">
                                {dossier.redFlags.map((flag, fIdx) => (
                                  <li key={fIdx}>{flag}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {dossier.ratings && dossier.ratings.length > 0 && (
                            <div className="pt-2">
                              <strong className="text-foreground block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
                                Ratings:
                              </strong>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {dossier.ratings.map((rate, rIdx) => (
                                  <div key={rIdx} className="rounded-lg bg-muted/60 p-2.5 text-xs">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="font-medium text-foreground">{rate.label}</span>
                                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{rate.score} / 5</span>
                                    </div>
                                    {rate.note && (
                                      <p className="text-muted-foreground text-[11px] leading-tight">{rate.note}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            )}

            {/* SECTION 9: 📖 PRIVATE GLOSSARY */}
            {report?.privateGlossary && report.privateGlossary.length > 0 && (
              <div className="mx-auto w-full max-w-prose">
                <article className="prose prose-lg max-w-none">
                  <SectionHeader
                    emoji="📖"
                    title="Private Glossary"
                  />

                  <div className="not-prose mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {report.privateGlossary.map((item, idx) => {
                      const def = item.frankDefinition || item.brandonDefinition;
                      return (
                        <div
                          key={idx}
                          className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-2xs"
                        >
                          <span className="font-serif text-lg font-medium text-foreground">
                            &ldquo;{item.phraseOrSlang}&rdquo;
                          </span>
                          {item.contextQuote && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {item.contextQuote}
                            </span>
                          )}
                          {def && (
                            <p className="text-xs text-foreground/90 pt-1 leading-relaxed">
                              <strong>Definition: </strong>
                              {def}
                            </p>
                          )}
                          {item.subtextAnalysis && (
                            <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                              <strong>Subtext: </strong>
                              {item.subtextAnalysis}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              </div>
            )}

            {/* SECTION 10: 🏆 AWARDS & SUPERLATIVES */}
            {report?.awardsAndSuperlatives && report.awardsAndSuperlatives.length > 0 && (
              <div className="mx-auto w-full max-w-prose">
                <article className="prose prose-lg max-w-none">
                  <SectionHeader
                    emoji="🏆"
                    title="Awards & Superlatives"
                  />

                  <div className="not-prose mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {report.awardsAndSuperlatives.map((award, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-serif text-lg font-medium text-foreground">
                            {award.title}
                          </span>
                          {award.recipient && (
                            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-amber-700 dark:text-amber-400">
                              {award.recipient}
                            </span>
                          )}
                        </div>
                        {award.reason && (
                          <p className="text-xs text-foreground/85 leading-relaxed">
                            {award.reason}
                          </p>
                        )}
                        {award.quoteCitation && (
                          <p className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-2 mt-1">
                            &ldquo;{award.quoteCitation}&rdquo;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            )}

            {/* SECTION 11: 🎯 TACTICAL ADVICE */}
            {report?.tacticalAdvice && (
              <div className="mx-auto w-full max-w-prose">
                <article className="prose prose-lg max-w-none">
                  <SectionHeader
                    emoji="🎯"
                    title="Tactical Advice"
                  />

                  <div className="not-prose mt-6 flex flex-col gap-6 rounded-2xl border-2 border-primary/30 bg-card p-6 sm:p-8 shadow-sm">
                    {/* What to send */}
                    {report.tacticalAdvice.whatToSend && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                            Recommended Next Text:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(report.tacticalAdvice!.whatToSend)}
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
                          {report.tacticalAdvice.whatToSend}
                        </div>
                      </div>
                    )}

                    {/* What to never do again */}
                    {report.tacticalAdvice.whatToNeverDoAgain && (
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                          What to Never Do Again:
                        </span>
                        <div className="rounded-xl border border-rose-300 bg-[#FFD9E2] p-4 text-sm text-[#5E1A2A]">
                          {report.tacticalAdvice.whatToNeverDoAgain}
                        </div>
                      </div>
                    )}

                    {/* Rules of engagement list */}
                    {report.tacticalAdvice.rulesOfEngagement && report.tacticalAdvice.rulesOfEngagement.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                          Rules of Engagement:
                        </span>
                        <ul className="list-disc list-inside space-y-1.5 rounded-xl border border-border bg-muted/40 p-4 text-xs text-foreground/85 leading-relaxed">
                          {report.tacticalAdvice.rulesOfEngagement.map((rule, rIdx) => (
                            <li key={rIdx}>{rule}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Closing verdict */}
                    {report.tacticalAdvice.closingVerdict && (
                      <div className="border-t border-border pt-4">
                        <p className="font-serif text-base italic text-muted-foreground leading-relaxed">
                          &ldquo;{report.tacticalAdvice.closingVerdict}&rdquo;
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
                href={result.href()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all"
              >
                Back to conversation hub
              </Link>
              <Link
                href={result.href(`/stats?report=${reportNumber}`)}
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
function WhatsAppBubble({ text, sender, at }: { text: string; sender?:string; at?:string }) {
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
          {sender && <p className="mb-1 text-xs font-semibold">{sender}</p>}
          {at && <time className="block text-[10px] text-muted-foreground">{at.replace('T',' ').slice(0,16)}</time>}
          <div className="[&>p]:m-0 [&>p:not(:last-of-type)]:mb-1.5 [&>p:not(:last-of-type)]:block [&>p:last-of-type]:inline">
            <p className="whitespace-pre-wrap">{text}</p>
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

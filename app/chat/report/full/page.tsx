'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Trophy,
  Calendar,
  Compass,
  Sparkles,
  Send,
  Printer,
  Share2,
  Check,
  Copy,
  Clock,
  MessageSquare,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/brandon/header';
import { useChatStore } from '@/lib/store/useChatStore';

export default function FullReportPage() {
  const { fullReport, stats, rawText } = useChatStore();
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [conversationHistory, setConversationHistory] = useState<
    { sender: 'user' | 'frank'; text: string }[]
  >([]);
  const [isAsking, setIsAsking] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [dossierNumber] = useState(() => Math.floor(100000 + Math.random() * 900000));

  if (!fullReport) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h2 className="font-serif text-2xl sm:text-3xl font-medium">No report found</h2>
        <p className="text-xs text-muted-foreground mt-2 max-w-sm">
          Please upload a chat export first to generate Frank&apos;s complete forensic audit.
        </p>
        <Link
          href="/setup"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-3 text-xs font-medium text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"
        >
          Analyze a Chat
        </Link>
      </div>
    );
  }

  const p1 = stats?.participants[0];
  const p2 = stats?.participants[1];

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleAskFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpQuestion.trim() || isAsking) return;

    const currentQ = followUpQuestion;
    setFollowUpQuestion('');
    setConversationHistory((prev) => [...prev, { sender: 'user', text: currentQ }]);
    setIsAsking(true);

    try {
      const res = await fetch('/api/interrogate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: currentQ,
          reportHeadline: fullReport.headline,
          stats,
          transcriptSample: rawText ? rawText.slice(0, 1000) : '',
        }),
      });

      const data = await res.json();
      setConversationHistory((prev) => [
        ...prev,
        {
          sender: 'frank',
          text: data.answer || "Frank's Take: The data points to the exact same conclusion: stop over-investing.",
        },
      ]);
    } catch {
      setConversationHistory((prev) => [
        ...prev,
        {
          sender: 'frank',
          text: "Frank's Take: Stop looking for excuses in their silence. When someone values you, they don't leave you guessing.",
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center px-4 pt-8 pb-24 sm:px-6 sm:pt-14 sm:pb-28">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 sm:gap-12">
          {/* 1. TOP UTILITY ACTION BAR */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 print:hidden">
            <Link
              href="/setup"
              className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4 shrink-0" />
              <span>Audit Another Chat</span>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:inline-block">
                Forensic Dossier #{dossierNumber}
              </span>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {copiedLink ? <Check className="size-3.5 text-emerald-600 shrink-0" /> : <Share2 className="size-3.5 shrink-0" />}
                <span>{copiedLink ? 'Link Copied' : 'Share'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <Printer className="size-3.5 shrink-0" />
                <span>Print Dossier</span>
              </button>
            </div>
          </div>

          {/* 2. REPORT HERO BANNER */}
          <div className="flex flex-col gap-4 sm:gap-5">
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                {fullReport.verdictTag}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FFD9E2] px-3 py-1 text-xs font-mono font-bold text-[#5E1A2A]">
                <Zap className="size-3 shrink-0" />
                Brutality Index: {fullReport.brutalityScore} / 10
              </span>
              {stats?.dateRange && (
                <span className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-mono text-muted-foreground">
                  {stats.dateRange.durationDays} Days Audited • {stats.totalMessages} Messages
                </span>
              )}
            </div>

            <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl lg:text-5xl leading-tight break-words">
              {fullReport.headline}
            </h1>
            <p className="font-serif text-base sm:text-xl italic text-muted-foreground leading-relaxed break-words">
              &ldquo;{fullReport.subheading}&rdquo;
            </p>
          </div>

          {/* 3. VISUAL FORENSIC METRICS COCKPIT */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-7 md:p-8 shadow-xs flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Clock className="size-5 text-primary shrink-0" />
                <h2 className="font-serif text-xl sm:text-2xl font-medium">The Numbers & Asymmetry</h2>
              </div>
              <span className="font-mono text-xs font-semibold text-[#5E1A2A] bg-[#FFD9E2] px-2.5 py-1 rounded-md self-start sm:self-auto">
                Power Ratio: {fullReport.theDynamic.powerBalance}
              </span>
            </div>

            {/* Visual Balance Bar */}
            {p1 && p2 && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-mono font-medium">
                  <span className="flex items-center gap-1.5 text-foreground font-semibold">
                    <span className="size-2 rounded-full bg-primary shrink-0" />
                    <span>{p1.name}</span> ({p1.initiationPercentage}% Initiation)
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span>{p2.name}</span> ({p2.initiationPercentage}% Initiation)
                    <span className="size-2 rounded-full bg-muted-foreground/40 shrink-0" />
                  </span>
                </div>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    style={{ width: `${p1.initiationPercentage}%` }}
                    className="bg-primary transition-all duration-500"
                  />
                  <div
                    style={{ width: `${p2.initiationPercentage}%` }}
                    className="bg-muted-foreground/30 transition-all duration-500"
                  />
                </div>
              </div>
            )}

            {/* 4 Forensic Metric Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 pt-1">
              <div className="flex flex-col rounded-xl border border-border bg-muted/40 p-3.5 sm:p-4">
                <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  Restart Initiative
                </span>
                <span className="font-serif text-xl sm:text-2xl font-semibold text-foreground mt-1 truncate">
                  {p1?.initiationPercentage || 80}%
                </span>
                <span className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-snug">
                  Driven by {p1?.name || 'Person A'} after silence
                </span>
              </div>

              <div className="flex flex-col rounded-xl border border-border bg-muted/40 p-3.5 sm:p-4">
                <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  Median Reply Gap
                </span>
                <span className="font-serif text-xl sm:text-2xl font-semibold text-foreground mt-1 truncate">
                  {p2?.medianResponseTimeMinutes ? `${p2.medianResponseTimeMinutes}m` : '3+ hrs'}
                </span>
                <span className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-snug">
                  vs {p1?.medianResponseTimeMinutes || 3}m for {p1?.name}
                </span>
              </div>

              <div className="flex flex-col rounded-xl border border-border bg-muted/40 p-3.5 sm:p-4">
                <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  Double-Text Index
                </span>
                <span className="font-serif text-xl sm:text-2xl font-semibold text-foreground mt-1 truncate">
                  {p1?.doubleTextCount || 5} sent
                </span>
                <span className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-snug">
                  Sent to fill unprompted silence
                </span>
              </div>

              <div className="flex flex-col rounded-xl border border-border bg-muted/40 p-3.5 sm:p-4">
                <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  Night Owl Share
                </span>
                <span className="font-serif text-xl sm:text-2xl font-semibold text-foreground mt-1 truncate">
                  {p1?.nightOwlPercentage ? `${p1.nightOwlPercentage}%` : '18%'}
                </span>
                <span className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-snug">
                  Messages between 11pm–4am
                </span>
              </div>
            </div>
          </section>

          {/* 4. SECTION 1: THE EXECUTIVE VERDICT (Deep 5-Paragraph Essay) */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-8 md:p-10 shadow-xs flex flex-col gap-6">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <Sparkles className="size-5 text-amber-500 shrink-0" />
              <h2 className="font-serif text-xl sm:text-2xl md:text-3xl font-medium">The Forensic Verdict</h2>
            </div>

            <div className="font-serif text-base sm:text-lg leading-relaxed sm:leading-loose text-foreground/90 space-y-4 sm:space-y-5 whitespace-pre-line break-words">
              {fullReport.fullVerdict}
            </div>

            <div className="rounded-xl border border-amber-300 bg-amber-100 p-4 sm:p-5 mt-2">
              <span className="text-xs font-mono uppercase tracking-wider text-amber-950 font-semibold block mb-1">
                Forensic Takeaway:
              </span>
              <p className="font-serif text-sm sm:text-base italic text-amber-950 leading-relaxed">
                &ldquo;You cannot confuse someone answering your text with someone wanting to talk to you. Stop excusing capacity when the real culprit is priority.&rdquo;
              </p>
            </div>
          </section>

          {/* 5. SECTION 2: THE DYNAMIC & BALANCE OF POWER */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-xs flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border pb-4">
              <h2 className="font-serif text-xl sm:text-2xl md:text-3xl font-medium">The Balance of Power</h2>
              <span className="font-mono text-xs font-semibold text-[#5E1A2A] bg-[#FFD9E2] px-2.5 py-1 rounded self-start sm:self-auto">
                {fullReport.theDynamic.powerBalance}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col gap-1">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Carrying Emotional Labor:
                </span>
                <span className="font-serif text-lg sm:text-xl font-medium text-foreground">
                  {fullReport.theDynamic.emotionalLaborCarrier || p1?.name || 'Initiator'}
                </span>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Absorbs the risk of rejection, initiates conversation restarts, and formulates plans.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col gap-1">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Controls Conversational Tempo:
                </span>
                <span className="font-serif text-lg sm:text-xl font-medium text-foreground">
                  {fullReport.theDynamic.tempoController || p2?.name || 'Respondent'}
                </span>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Dictates the temperature simply by taking their time to reply while offering zero friction.
                </p>
              </div>
            </div>

            <p className="text-sm sm:text-base text-foreground/85 leading-relaxed sm:leading-loose pt-1 break-words">
              {fullReport.theDynamic.analysis}
            </p>

            {fullReport.theDynamic.doubleTextDiagnosis && (
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed italic border-l-2 border-primary/40 pl-3.5 py-0.5 break-words">
                {fullReport.theDynamic.doubleTextDiagnosis}
              </p>
            )}

            <div className="rounded-xl border border-rose-300 bg-[#FFD9E2] p-4 sm:p-5 mt-2">
              <span className="text-xs font-mono uppercase tracking-wider text-[#5E1A2A] font-semibold block mb-1">
                The Unspoken Truth Nobody In The Chat Admits:
              </span>
              <p className="font-serif text-base sm:text-lg italic text-[#5E1A2A] font-medium leading-relaxed break-words">
                &ldquo;{fullReport.theDynamic.unspokenTruth}&rdquo;
              </p>
            </div>
          </section>

          {/* 6. SECTION 3: THE CHAT EVOLUTION TIMELINE */}
          {fullReport.timeline && fullReport.timeline.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-xs flex flex-col gap-6">
              <div className="flex items-center gap-2 border-b border-border pb-4">
                <TrendingDown className="size-5 text-indigo-600 shrink-0" />
                <h2 className="font-serif text-xl sm:text-2xl md:text-3xl font-medium">
                  Anatomy of the Thread: The Evolution
                </h2>
              </div>

              <div className="flex flex-col gap-3.5 sm:gap-4">
                {fullReport.timeline.map((phase, idx) => (
                  <div
                    key={idx}
                    className="relative flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-4 sm:p-5 pl-6 sm:pl-7"
                  >
                    <span className="absolute left-2.5 top-5 size-2.5 rounded-full bg-primary" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                      <span className="font-serif text-base sm:text-lg font-medium text-foreground">
                        {phase.phaseTitle}
                      </span>
                      <span className="self-start sm:self-auto rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                        {phase.timeframe}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-primary font-medium">{phase.vibe}</span>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1 break-words">
                      {phase.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 7. SECTION 4: THE TURNING POINT ("THE WEEK IT CHANGED") */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-xs flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Calendar className="size-5 text-purple-600 shrink-0" />
                <h2 className="font-serif text-xl sm:text-2xl md:text-3xl font-medium">The Turning Point</h2>
              </div>
              <span className="inline-flex rounded-lg bg-[#DCD4FF] px-3 py-1 text-xs font-mono font-semibold text-[#2A1A5E] self-start sm:self-auto">
                {fullReport.theTurningPoint.week}
              </span>
            </div>

            {fullReport.theTurningPoint.dropPercentage && (
              <span className="text-xs font-mono font-medium text-rose-600">
                Forensic Impact: {fullReport.theTurningPoint.dropPercentage}
              </span>
            )}

            <p className="text-sm sm:text-base leading-relaxed sm:leading-loose text-foreground/85 break-words">
              {fullReport.theTurningPoint.whatChanged}
            </p>

            {/* Styled WhatsApp / iMessage Chat Bubble Excerpt */}
            <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/40 p-4 sm:p-6 mt-1">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground block mb-0.5">
                Pivotal Transcript Evidence:
              </span>
              <div className="font-mono text-xs sm:text-sm leading-relaxed text-foreground bg-background rounded-lg border border-border p-3.5 sm:p-4 whitespace-pre-wrap break-words shadow-inner">
                {fullReport.theTurningPoint.transcriptEvidence}
              </div>
            </div>
          </section>

          {/* 8. SECTION 5: COMPREHENSIVE MEMBER DOSSIERS */}
          <section className="flex flex-col gap-5 sm:gap-6">
            <div className="flex flex-col gap-1">
              <h2 className="font-serif text-xl sm:text-2xl md:text-3xl font-medium">Member Dossiers & Roasts</h2>
              <p className="text-xs text-muted-foreground">
                Psychological profiling, attachment patterns, and satirical scorecards for each participant.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
              {fullReport.memberDossiers.map((dossier, i) => (
                <div
                  key={i}
                  className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs gap-5"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-serif font-bold text-primary">
                          {dossier.name.charAt(0)}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-serif text-xl sm:text-2xl font-medium text-foreground truncate">
                            {dossier.name}
                          </span>
                          <span className="text-xs font-mono font-medium text-amber-600 truncate">
                            {dossier.roleTitle}
                          </span>
                        </div>
                      </div>
                    </div>

                    {dossier.emblematicQuote && (
                      <div className="rounded-lg bg-muted/50 p-3 text-xs italic font-serif text-foreground/90 border-l-2 border-amber-500 break-words">
                        &ldquo;{dossier.emblematicQuote}&rdquo;
                      </div>
                    )}

                    <div className="text-xs sm:text-sm text-foreground/85 leading-relaxed pt-1 space-y-2 whitespace-pre-line break-words">
                      <p>{dossier.roast}</p>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/30 p-3.5 mt-1">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                        Attachment & Subtext Diagnosis:
                      </span>
                      <p className="text-xs text-foreground/80 leading-relaxed font-sans break-words">
                        {dossier.diagnosis}
                      </p>
                    </div>

                    {dossier.telltaleHabit && (
                      <div className="text-xs text-muted-foreground break-words">
                        <span className="font-semibold text-foreground">Signature Tell: </span>
                        {dossier.telltaleHabit}
                      </div>
                    )}
                  </div>

                  {/* Rating Bars */}
                  <div className="border-t border-border pt-4 flex flex-col gap-2.5">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Forensic Scorecard:
                    </span>
                    {dossier.ratings && dossier.ratings.length > 0 ? (
                      dossier.ratings.map((rating, rIdx) => (
                        <div key={rIdx} className="flex flex-col gap-1 text-xs">
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span className="truncate pr-2">{rating.label}</span>
                            <span className="font-mono font-bold text-foreground shrink-0">
                              {rating.score} / 5
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              style={{ width: `${(rating.score / 5) * 100}%` }}
                              className="h-full bg-primary rounded-full transition-all duration-300"
                            />
                          </div>
                          {rating.note && (
                            <span className="text-[10px] text-muted-foreground italic break-words">
                              {rating.note}
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{dossier.ratingLabel || 'Availability'}:</span>
                        <span className="font-mono font-bold text-foreground">
                          {dossier.ratingScore || 3} / 5
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 9. SECTION 6: PRIVATE LANGUAGE & DECODED SUBTEXT */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-xs flex flex-col gap-5">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <Compass className="size-5 text-emerald-600 shrink-0" />
              <h2 className="font-serif text-xl sm:text-2xl md:text-3xl font-medium">
                The Slang & Subtext Glossary
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Translating what was typed into what was actually communicated underneath.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4 pt-1">
              {fullReport.privateGlossary.map((item, i) => (
                <div key={i} className="rounded-xl border border-border bg-muted/20 p-4 sm:p-5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-base sm:text-lg font-medium text-foreground break-words">
                      &ldquo;{item.phraseOrSlang}&rdquo;
                    </span>
                  </div>
                  <div className="text-xs italic text-muted-foreground border-l border-border pl-2 break-words">
                    Context: {item.contextQuote}
                  </div>
                  <div className="pt-2 border-t border-border mt-1">
                    <span className="text-[11px] font-mono text-emerald-700 font-semibold block uppercase">
                      Frank&apos;s Translation:
                    </span>
                    <p className="text-xs sm:text-sm font-medium text-foreground mt-0.5 break-words">
                      {item.frankDefinition || item.brandonDefinition}
                    </p>
                  </div>
                  {item.subtextAnalysis && (
                    <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed mt-1 break-words">
                      {item.subtextAnalysis}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 10. SECTION 7: THE SUPERLATIVE AWARDS CEREMONY */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-xs flex flex-col gap-5">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <Trophy className="size-5 text-amber-500 shrink-0" />
              <h2 className="font-serif text-xl sm:text-2xl md:text-3xl font-medium">The Awards Ceremony</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
              {fullReport.awardsAndSuperlatives.map((award, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-muted/30 p-4 sm:p-5 flex flex-col justify-between gap-3"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-amber-600 font-semibold uppercase tracking-wider">
                      <Trophy className="size-3.5 shrink-0" />
                      Superlative Award
                    </div>
                    <span className="font-serif text-lg sm:text-xl font-medium text-foreground break-words">
                      {award.title}
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      Winner: <strong className="text-primary">{award.recipient}</strong>
                    </span>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-1 break-words">{award.reason}</p>
                  </div>
                  {award.quoteCitation && (
                    <div className="border-t border-border pt-2 text-[11px] font-mono italic text-muted-foreground break-words">
                      Cited Evidence: {award.quoteCitation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 11. SECTION 8: TACTICAL ADVICE & ACTION PLAN */}
          <section className="rounded-2xl border-2 border-primary bg-white p-5 sm:p-8 md:p-10 flex flex-col gap-6 dark:bg-neutral-900">
            <div className="flex items-center gap-2 border-b border-primary/20 pb-4">
              <Zap className="size-5 text-primary shrink-0" />
              <h2 className="font-serif text-xl sm:text-2xl md:text-3xl font-medium">
                Frank&apos;s Tactical Advice & Action Plan
              </h2>
            </div>

            {/* WHAT TO TEXT NEXT */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-emerald-800">
                  Recommended Next Message:
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyText(fullReport.tacticalAdvice.whatToSend)}
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-950 hover:bg-emerald-200 transition-colors cursor-pointer"
                >
                  {copiedText ? <Check className="size-3.5 text-emerald-700 shrink-0" /> : <Copy className="size-3.5 shrink-0" />}
                  <span>{copiedText ? 'Copied!' : 'Copy Text'}</span>
                </button>
              </div>

              <div className="rounded-xl border border-emerald-300 bg-[#C9F2DE] p-4 sm:p-5 text-sm sm:text-base font-medium text-[#0B3B2E] leading-relaxed shadow-xs break-words">
                {fullReport.tacticalAdvice.whatToSend}
              </div>
            </div>

            {/* RULES OF ENGAGEMENT */}
            {fullReport.tacticalAdvice.rulesOfEngagement && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-primary">
                  Strict Rules of Engagement:
                </span>
                <ul className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:p-5 text-xs sm:text-sm text-foreground/85">
                  {fullReport.tacticalAdvice.rulesOfEngagement.map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-primary font-bold shrink-0">•</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* WHAT TO NEVER DO AGAIN */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-rose-800">
                What to Never Do Again:
              </span>
              <div className="rounded-xl border border-rose-300 bg-[#FFD9E2] p-4 sm:p-5 text-xs sm:text-sm text-[#5E1A2A] leading-relaxed break-words">
                {fullReport.tacticalAdvice.whatToNeverDoAgain}
              </div>
            </div>

            {/* CLOSING PARTING VERDICT */}
            <div className="border-t border-primary/20 pt-6">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground block mb-2">
                Frank&apos;s Final Parting Verdict:
              </span>
              <p className="font-serif text-base sm:text-lg italic text-foreground leading-relaxed break-words">
                &ldquo;{fullReport.tacticalAdvice.closingVerdict}&rdquo;
              </p>
            </div>
          </section>

          {/* 12. SECTION 9: LIVE INTERROGATION CONSOLE ("ASK FRANK ANYTHING") */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-8 flex flex-col gap-5">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <MessageSquare className="size-5 text-primary shrink-0" />
              <div>
                <h3 className="font-serif text-xl sm:text-2xl font-medium">Interrogate the Chat Logs with Frank</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ask any specific question about what they said, what they meant, or what you should do.
                </p>
              </div>
            </div>

            {/* Conversation Log */}
            {conversationHistory.length > 0 && (
              <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1 sm:pr-2">
                {conversationHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col max-w-[90%] sm:max-w-[85%] rounded-2xl p-3.5 sm:p-4 text-xs sm:text-sm leading-relaxed break-words ${
                      item.sender === 'user'
                        ? 'ml-auto bg-primary text-primary-foreground'
                        : 'mr-auto bg-muted/60 text-foreground font-serif border border-border whitespace-pre-line'
                    }`}
                  >
                    <span className="text-[10px] font-mono opacity-70 mb-1">
                      {item.sender === 'user' ? 'You' : 'Frank'}
                    </span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleAskFollowUp} className="flex flex-col sm:flex-row gap-2 pt-2">
              <input
                type="text"
                value={followUpQuestion}
                onChange={(e) => setFollowUpQuestion(e.target.value)}
                placeholder="e.g. Did they ever actually care about me, or was it just convenient?"
                className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none min-h-[44px]"
              />
              <button
                type="submit"
                disabled={isAsking || !followUpQuestion.trim()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs sm:text-sm font-medium text-primary-foreground shadow-xs transition-all hover:bg-primary/90 disabled:opacity-50 cursor-pointer shrink-0"
              >
                <span>{isAsking ? 'Analyzing...' : 'Ask Frank'}</span>
                <Send className="size-3.5 shrink-0" />
              </button>
            </form>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

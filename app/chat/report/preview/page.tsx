'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, ArrowRight, Check, BookOpen, Lock, ShieldCheck, Zap } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/brandon/header';
import { useChatStore } from '@/lib/store/useChatStore';

export default function ReportPreviewPage() {
  const router = useRouter();
  const { preview } = useChatStore();

  if (!preview) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h2 className="font-serif text-2xl font-medium">No active report preview found</h2>
        <p className="text-xs text-muted-foreground mt-2 max-w-sm">
          Upload a chat first to see Frank&apos;s forensic preview.
        </p>
        <Link
          href="/setup"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-2.5 text-xs font-medium text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"
        >
          Go to Setup
        </Link>
      </div>
    );
  }

  const defaultLockedSections = [
    'The Turning Point: The Week It Changed',
    'The Balance of Power & Unspoken Truth',
    'Individual Member Dossiers & Roasts',
    'The Slang & Subtext Glossary',
    'The Superlative Awards Ceremony',
    'Tactical Advice (Exact Message to Send)',
  ];

  const lockedSectionsList =
    preview.lockedSections && preview.lockedSections.length > 0
      ? preview.lockedSections
      : defaultLockedSections;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center px-4 pt-8 pb-20 sm:px-6 sm:pt-14 sm:pb-24">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 sm:gap-8">
          {/* TOP BADGE */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3.5 py-1 text-xs font-medium text-amber-950">
              <Sparkles className="size-3 text-amber-600 shrink-0" />
              <span>Forensic Dossier Ready</span>
            </span>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">Brutality Rating:</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-[#FFD9E2] px-2.5 py-0.5 text-xs font-mono font-bold text-[#5E1A2A]">
                <Zap className="size-3 shrink-0 text-rose-600" />
                {preview.brutalityScore} / 10
              </span>
            </div>
          </div>

          {/* REPORT HEADER */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                {preview.verdictTag}
              </span>
            </div>
            <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl lg:text-5xl leading-tight break-words">
              {preview.headline}
            </h1>
            <p className="font-serif text-base sm:text-lg italic text-muted-foreground leading-relaxed break-words">
              &ldquo;{preview.subheading}&rdquo;
            </p>
          </div>

          {/* THE TEASER ESSAY */}
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-xs flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Sparkles className="size-4 text-amber-500 shrink-0" />
              <h2 className="font-serif text-lg sm:text-xl font-medium text-foreground">
                Frank&apos;s Initial Assessment
              </h2>
            </div>
            <p className="font-serif text-sm sm:text-base leading-relaxed sm:leading-loose text-foreground/90 whitespace-pre-line">
              {preview.teaserVerdict}
            </p>

            {/* PREVIEW HIGHLIGHTS */}
            <div className="mt-4 border-t border-border pt-5">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground block mb-3">
                Key Findings Detected in Chat Logs:
              </span>
              <ul className="flex flex-col gap-2.5">
                {preview.previewHighlights.map((highlight, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-foreground/85 leading-relaxed">
                    <Check className="size-4 shrink-0 text-emerald-600 mt-0.5" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* LOCKED SECTIONS WITH BLUR EFFECT & FREE CTA */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
            {/* Header for locked sections */}
            <div className="flex items-center justify-between border-b border-border p-5 sm:p-6 pb-4">
              <div className="flex items-center gap-2">
                <Lock className="size-4 text-primary shrink-0" />
                <h3 className="font-serif text-base sm:text-lg font-medium text-foreground">
                  Dossier Sections ({lockedSectionsList.length} In-Depth Audits)
                </h3>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground bg-muted px-2.5 py-0.5 rounded">
                Preview
              </span>
            </div>

            {/* Simulated Blurred Section Cards */}
            <div className="p-5 sm:p-6 pt-4 pb-36 sm:pb-36 grid grid-cols-1 sm:grid-cols-2 gap-3 select-none pointer-events-none opacity-70">
              {lockedSectionsList.map((sectionTitle, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/30 p-3.5"
                >
                  <div className="flex items-center gap-2">
                    <Lock className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="font-serif text-xs sm:text-sm font-medium text-foreground truncate">
                      {sectionTitle}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5 filter blur-[2px] opacity-50">
                    <div className="h-2 w-full rounded bg-muted-foreground/40" />
                    <div className="h-2 w-4/5 rounded bg-muted-foreground/30" />
                  </div>
                </div>
              ))}
            </div>

            {/* Blur Gradient Overlay with CTA Container */}
            <div className="absolute inset-x-0 bottom-0 top-16 bg-gradient-to-t from-background via-background/95 to-transparent flex flex-col items-center justify-end p-5 sm:p-8 text-center">
              <div className="flex flex-col items-center gap-3.5 max-w-md w-full">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3.5 py-1 text-xs font-semibold text-emerald-950">
                  <ShieldCheck className="size-3.5 text-emerald-600 shrink-0" />
                  <span>100% Free Dossier • No Paywall</span>
                </div>

                <div className="flex flex-col gap-1">
                  <h3 className="font-serif text-xl sm:text-2xl font-medium tracking-tight text-foreground">
                    Unlock the Complete Forensic Dossier
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    View all 12 forensic sections including turning point timestamp evidence, power ratio analysis, participant scorecards, and Frank&apos;s tactical text recommendations.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => router.push('/chat/report/full')}
                  className="group inline-flex w-full sm:w-auto min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-8 text-sm font-medium text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
                >
                  <BookOpen className="size-4 shrink-0" />
                  <span>View Full Report</span>
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </button>

                <span className="text-[11px] font-mono text-muted-foreground">
                  Free • No payment or account required • Instant access
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Play, Sparkles, FileText, CheckCircle2 } from 'lucide-react';

export interface InteractiveStageProps {
  className?: string;
}

export function InteractiveStage({ className = '' }: InteractiveStageProps = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setStep((prev) => (prev === 3 ? 1 : ((prev + 1) as 1 | 2 | 3)));
    }, 2800);
    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div className={`flex w-full max-w-5xl justify-center lg:max-w-7xl ${className}`.trim()}>
      <div className="w-full max-w-md text-left">
        <div className="relative flex aspect-square min-h-[380px] w-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xs sm:min-h-[420px] sm:p-7">
          {!isPlaying ? (
            <>
              <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted-foreground sm:text-xs">
                <span>Preview</span>
                <span>Forensic Engine v2.6</span>
              </div>

              <div className="my-auto flex flex-col items-center justify-center gap-4 text-center">
                <button
                  type="button"
                  onClick={() => setIsPlaying(true)}
                  className="group inline-flex min-h-[44px] cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground shadow-xs transition-all hover:border-foreground/30 hover:bg-muted active:scale-95"
                >
                  <Play className="size-4 fill-current transition-transform group-hover:scale-110" />
                  <span>See how it works</span>
                </button>
              </div>

              <div className="flex flex-col items-center gap-2 text-sm text-foreground/85">
                <span className="text-[11px] text-muted-foreground sm:text-xs">Compatible with</span>
                <span className="flex items-center gap-3">
                  <Image
                    src="/icons/whatsapp.svg"
                    alt="WhatsApp"
                    width={28}
                    height={28}
                    className="size-6 sm:size-7"
                  />
                  <Image
                    src="/icons/imessage.svg"
                    alt="iMessage"
                    width={28}
                    height={28}
                    className="size-6 sm:size-7"
                  />
                </span>
              </div>
            </>
          ) : (
            <div className="flex size-full flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  Step {step} of 3
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setStep(1);
                  }}
                  className="min-h-[32px] cursor-pointer touch-manipulation px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Reset
                </button>
              </div>

              <div className="my-auto py-4">
                {step === 1 && (
                  <div className="flex flex-col items-center gap-3 text-center animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 sm:size-16">
                      <FileText className="size-7 sm:size-8" />
                    </div>
                    <h3 className="font-serif text-xl font-medium sm:text-2xl">Export & Drop Chat</h3>
                    <p className="max-w-xs text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      Export your WhatsApp (.txt) or iMessage thread without media.
                    </p>
                  </div>
                )}

                {step === 2 && (
                  <div className="flex flex-col items-center gap-3 text-center animate-in fade-in zoom-in-95 duration-200">
                    <div className="relative flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-amber-500/10 text-amber-600 sm:size-16">
                      <div className="pulse-ring absolute inset-0 rounded-2xl border-2 border-amber-400" />
                      <Sparkles className="size-7 animate-spin sm:size-8" />
                    </div>
                    <h3 className="font-serif text-xl font-medium sm:text-2xl">Frank Reads Everything</h3>
                    <p className="max-w-xs text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      Tracking initiation latency, 3 AM spikes, and the exact week things shifted.
                    </p>
                  </div>
                )}

                {step === 3 && (
                  <div className="flex flex-col items-center gap-3 text-center animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 sm:size-16">
                      <CheckCircle2 className="size-7 sm:size-8" />
                    </div>
                    <h3 className="font-serif text-xl font-medium sm:text-2xl">The Unfiltered Truth</h3>
                    <p className="max-w-xs text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      Who cares more, awards nobody asked for, and what to text next.
                    </p>
                  </div>
                )}
              </div>

              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={step}
                aria-valuemin={1}
                aria-valuemax={3}
                aria-label={`Step ${step} of 3`}
              >
                <div
                  className="h-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${(step / 3) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

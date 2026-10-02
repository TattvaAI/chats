'use client';

import { useEffect, useState, useRef } from 'react';

export interface StatsBannerProps {
  total?: number | string;
  weekly?: number | string;
  daily?: number | string;
  className?: string;
}

function parseStat(value: number | string): {
  target: number;
  prefix: string;
  suffix: string;
  decimals: number;
} {
  if (typeof value === 'number') {
    return { target: value, prefix: '', suffix: '', decimals: 0 };
  }
  const match = String(value).trim().match(/^([^0-9.]*)([0-9]+(?:\.[0-9]+)?)(.*)$/);
  if (!match) {
    return { target: 0, prefix: '', suffix: String(value), decimals: 0 };
  }
  const prefix = match[1] || '';
  const num = parseFloat(match[2]);
  const suffix = match[3] || '';
  const decimals = match[2].includes('.') ? match[2].split('.')[1].length : 0;
  return { target: isNaN(num) ? 0 : num, prefix, suffix, decimals };
}

function CountUpStat({ value }: { value: number | string }) {
  const { target, prefix, suffix, decimals } = parseStat(value);
  const [display, setDisplay] = useState<string>(() => String(value));
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || target === 0) {
      queueMicrotask(() => setDisplay(String(value)));
      return;
    }

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      queueMicrotask(() => setDisplay(String(value)));
      return;
    }

    hasAnimated.current = true;
    let startTimestamp: number | null = null;
    const duration = 1600;
    let animationFrameId: number;

    const animate = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = target * easeProgress;
      const formatted = decimals > 0 ? current.toFixed(decimals) : Math.round(current).toString();
      setDisplay(`${prefix}${formatted}${suffix}`);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setDisplay(`${prefix}${target.toFixed(decimals)}${suffix}`);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [value, target, prefix, suffix, decimals]);

  return <span>{display}</span>;
}

export function StatsBanner({
  total = '151K',
  weekly = '33.2K',
  daily = '5K',
  className = '',
}: StatsBannerProps = {}) {
  return (
    <section className={`w-full border-y border-border/60 bg-muted/30 py-12 sm:py-16 ${className}`.trim()}>
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 text-center sm:gap-8 sm:px-6">
        <h2 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl lg:text-5xl text-foreground">
          Brandon has been busy
        </h2>
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:gap-5">
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-8 text-center shadow-xs sm:gap-2.5 sm:py-10">
            <span className="font-mono text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              <CountUpStat value={total} />
            </span>
            <span className="text-xs text-muted-foreground sm:text-sm">
              Total reports written
            </span>
          </div>

          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-8 text-center shadow-xs sm:gap-2.5 sm:py-10">
            <span className="font-mono text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              <CountUpStat value={weekly} />
            </span>
            <span className="text-xs text-muted-foreground sm:text-sm">
              Reports written this week
            </span>
          </div>

          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-8 text-center shadow-xs sm:gap-2.5 sm:py-10">
            <span className="font-mono text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              <CountUpStat value={daily} />
            </span>
            <span className="text-xs text-muted-foreground sm:text-sm">
              Reports written today
            </span>
          </div>

          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-8 text-center shadow-xs sm:gap-2.5 sm:py-10">
            <span className="flex items-center gap-2 sm:gap-3 py-1">
              <img
                src="/icons/whatsapp.svg"
                alt="WhatsApp"
                className="size-8 sm:size-9"
              />
              <img
                src="/icons/imessage.svg"
                alt="iMessage"
                className="size-8 sm:size-9"
              />
            </span>
            <span className="text-xs text-muted-foreground sm:text-sm">
              WhatsApp &amp; iMessage
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

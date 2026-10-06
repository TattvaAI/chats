'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Play, Sparkles, RotateCcw } from 'lucide-react';

export interface InteractiveStageProps {
  className?: string;
}

type SceneKey = 'couple' | 'friends' | 'family';

interface SceneData {
  key: SceneKey;
  label: string;
  reportTitle: string;
  heading1: string;
  heading2: string;
  opening: string;
  stats: {
    bars: string;
    figureLabel: string;
    figureValue: string;
  };
  take1: string;
  take2: string;
}

const SCENES: Record<SceneKey, SceneData> = {
  couple: {
    key: 'couple',
    label: 'Relationship',
    reportTitle: 'Nine Days of Silence and a “Hey Stranger”',
    heading1: 'Who texts first, and who pretends not to care',
    heading2: 'The week it changed',
    opening: 'Léo isn’t busy. You’re on standby, and “let me see how the week goes” is what standby sounds like.',
    stats: {
      bars: 'Average reply time',
      figureLabel: 'Longest silence',
      figureValue: '9 days',
    },
    take1: 'You ask, Léo hedges. “Maybe” is how Léo says no without having to say it.',
    take2: 'The emoji does the apologising. The plans never arrive.',
  },
  friends: {
    key: 'friends',
    label: 'Friends & Group',
    reportTitle: 'Six Spreadsheets, Zero Flights',
    heading1: 'Who actually plans, and who just types “in”',
    heading2: 'The running joke nobody remembers starting',
    opening: 'Maya plans, Noah negotiates, Sam keeps score, and nobody books anything.',
    stats: {
      bars: 'Times each said “in”',
      figureLabel: 'Trips booked',
      figureValue: '0',
    },
    take1: 'Everyone is in until there’s a date. Maya is the only one who means it.',
    take2: 'It’s a joke, and it’s also the most honest thing anyone has said here.',
  },
  family: {
    key: 'family',
    label: 'Family Group',
    reportTitle: 'Sunday Lunch and Someone Called Tom',
    heading1: 'Who runs this group (it isn’t Dad)',
    heading2: 'The question Mum asked four different ways',
    opening: 'Mum runs this group on questions, Dad answers in four words, and Tom already has a place at the table.',
    stats: {
      bars: 'Questions asked',
      figureLabel: 'Dad’s average message',
      figureValue: '4 words',
    },
    take1: 'Mum doesn’t ask questions. She takes attendance.',
    take2: 'Four ways, zero answers, and a place set for Tom anyway.',
  },
};

export function InteractiveStage({ className = '' }: InteractiveStageProps = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeScene, setActiveScene] = useState<SceneKey>('couple');
  const [isVerdictReady, setIsVerdictReady] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    const verdictTimer = setTimeout(() => {
      setIsVerdictReady(true);
    }, 900);

    const interval = setInterval(() => {
      setIsVerdictReady(false);
      setActiveScene((prev) => {
        if (prev === 'couple') return 'friends';
        if (prev === 'friends') return 'family';
        return 'couple';
      });
      setTimeout(() => setIsVerdictReady(true), 900);
    }, 4500);

    return () => {
      clearTimeout(verdictTimer);
      clearInterval(interval);
    };
  }, [isPlaying]);

  const scene = SCENES[activeScene];

  return (
    <div className={`flex w-full max-w-5xl justify-center lg:max-w-7xl ${className}`.trim()}>
      <div className="w-full max-w-md text-left">
        <div className="relative flex aspect-square min-h-[420px] w-full flex-col justify-between overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-xs sm:min-h-[450px] sm:p-7">
          {!isPlaying ? (
            <>
              <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <span>Fictional example</span>
                <span>Frank AI</span>
              </div>

              <div className="my-auto flex flex-col items-center justify-center gap-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(true);
                    setIsVerdictReady(false);
                  }}
                  className="group inline-flex min-h-[48px] cursor-pointer touch-manipulation items-center justify-center gap-2.5 rounded-full border border-border bg-background px-7 py-3 text-sm font-semibold text-foreground shadow-xs transition-all hover:border-foreground/30 hover:bg-muted active:scale-95"
                >
                  <Play className="size-4 fill-current transition-transform group-hover:scale-110" />
                  <span>See how it works</span>
                </button>
                <p className="text-xs text-muted-foreground">
                  An illustrated example with fictional conversations
                </p>
              </div>

              <div className="flex flex-col items-center gap-2 text-sm text-foreground/85">
                <span className="text-xs text-muted-foreground">Compatible with</span>
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
              {/* Scene Switcher Pills */}
              <div className="flex items-center justify-between gap-1 border-b border-border/60 pb-3">
                <div className="flex items-center gap-1.5">
                  {(['couple', 'friends', 'family'] as SceneKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setActiveScene(key);
                        setIsVerdictReady(true);
                      }}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer transition-all ${
                        activeScene === key
                          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {SCENES[key].label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setActiveScene('couple');
                  }}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <RotateCcw className="size-3" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Dynamic Content */}
              <div className="my-auto flex flex-col gap-3 py-3">
                {!isVerdictReady ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center animate-in fade-in duration-200">
                    <div className="relative flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                      <Sparkles className="size-6 animate-spin" />
                    </div>
                    <span className="font-serif text-lg font-medium text-foreground">
                      Frank is thinking…
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Reading between the lines of this {scene.label.toLowerCase()} chat
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                        Verdict
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {scene.stats.figureLabel}: <strong className="text-foreground">{scene.stats.figureValue}</strong>
                      </span>
                    </div>

                    <h3 className="font-serif text-xl font-medium sm:text-2xl text-foreground leading-snug">
                      {scene.reportTitle}
                    </h3>

                    <p className="text-xs sm:text-sm leading-relaxed text-foreground/90 font-serif">
                      {scene.opening}
                    </p>

                    <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground/80">
                      <span className="font-semibold text-foreground block mb-0.5">
                        {scene.heading1}
                      </span>
                      <span>{scene.take1}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                  <span>Scene {activeScene === 'couple' ? '1' : activeScene === 'friends' ? '2' : '3'} of 3</span>
                  <span>Free demo</span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Scene progress"
                >
                  <div
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{
                      width:
                        activeScene === 'couple'
                          ? '33%'
                          : activeScene === 'friends'
                            ? '66%'
                            : '100%',
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

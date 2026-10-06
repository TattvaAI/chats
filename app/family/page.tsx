import Link from 'next/link';
import { ArrowRight, Home, Shield, Award } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/frank/header';
import { Testimonials } from '@/components/frank/testimonials';
import { StatsBanner } from '@/components/frank/stats-banner';

export default function FamilyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center">
        <section className="w-full px-6 pt-24 pb-16 sm:pt-32 sm:pb-24 lg:pt-36">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3.5 py-1 text-xs font-medium text-purple-700">
              🏠 Family WhatsApp Groups
            </span>

            <div className="flex flex-col items-center gap-4 max-w-2xl">
              <h1 className="font-serif text-4xl font-normal leading-[1.18] tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance">
                What does Frank think of you and your family?
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Upload the family WhatsApp group, or just the chat with your mum, dad, sister or brother. Frank reads every message and writes who runs it and what nobody says out loud.
              </p>
            </div>

            <div className="w-full sm:w-auto pt-2">
              <Link
                href="/setup?category=family"
                className="group inline-flex h-14 w-full sm:w-auto items-center justify-center gap-3 rounded-xl bg-primary px-8 text-lg font-medium text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-[0.98] sm:min-w-64"
              >
                <span>Analyze Your Family Chat</span>
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
              {['🏠 Family group', '👩 Mum', '👨 Dad', '👫 Siblings', '👭 Sister', '👴 Grandparents'].map((pill, i) => (
                <span
                  key={i}
                  className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full border-t border-border bg-card py-20 px-6 sm:px-10">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-12">
            <h2 className="text-center font-serif text-3xl font-medium tracking-tight sm:text-4xl">
              The unspoken family dynamics
            </h2>

            <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
                  <Shield className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-medium">Who Actually Runs It</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Spoiler alert: it isn&apos;t Dad. Frank identifies the true emotional gatekeeper of the household.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                  <Home className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-medium">Door Codes & Weather Alerts</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Analyzing Dad&apos;s 4-digit code updates, Mum&apos;s weather warnings, and the sibling side-chats.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                  <Award className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-medium">The Sunday Lunch Readout</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Brutal enough to make everyone laugh, honest enough to make the table quiet for five minutes.
                </p>
              </div>
            </div>
          </div>
        </section>

        <StatsBanner />
        <div className="w-full max-w-5xl py-12 px-6">
          <Testimonials />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

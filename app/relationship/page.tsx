import Link from 'next/link';
import { ArrowRight, HeartCrack, Flame, Compass, MessageCircleHeart } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/frank/header';
import { Testimonials } from '@/components/frank/testimonials';
import { StatsBanner } from '@/components/frank/stats-banner';

export default function RelationshipPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center">
        <section className="w-full px-6 pt-24 pb-16 sm:pt-32 sm:pb-24 lg:pt-36">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 text-center">
            {/* Category Badges */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1 text-xs font-medium text-rose-700">
                <HeartCrack className="size-3.5" />
                Exes & Situationships
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1 text-xs font-medium text-amber-700">
                <Flame className="size-3.5" />
                Talking Stage
              </span>
            </div>

            <div className="flex flex-col items-center gap-4 max-w-2xl">
              <h1 className="font-serif text-4xl font-normal leading-[1.18] tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance">
                What does he <span className="italic font-serif">actually</span> think of you?
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Frank reads every message and writes what was real, what changed, and what to do now.
              </p>
            </div>

            <div className="w-full sm:w-auto pt-2">
              <Link
                href="/setup?category=romantic"
                className="group inline-flex h-14 w-full sm:w-auto items-center justify-center gap-3 rounded-xl bg-primary px-8 text-lg font-medium text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-[0.98] sm:min-w-64"
              >
                <span>Try It Now</span>
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            {/* Sub-vertical pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
              {['💔 Ex', '🌀 Situationship', '💬 Talking stage', '💌 Boyfriend', '✈️ Long distance', '💍 Husband'].map((pill, i) => (
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

        {/* THREE TRUTHS SECTION */}
        <section className="w-full border-t border-border bg-card py-20 px-6 sm:px-10">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-12">
            <h2 className="text-center font-serif text-3xl font-medium tracking-tight sm:text-4xl">
              What Frank reveals in relationship chats
            </h2>

            <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600">
                  <Compass className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-medium">The Exact Week It Changed</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Frank pinpoints the exact week the energy shifted, response times widened, and the excuses started.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                  <HeartCrack className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-medium">The Dynamic & Unspoken Truth</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Who initiates after silence, who double-texts, and who acts unbothered while calculating every reply.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                  <MessageCircleHeart className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-medium">The Practical Advice</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Frank tells you exactly what to send next—or gives you the strict order to leave them on read.
                </p>
              </div>
            </div>
          </div>
        </section>

        <StatsBanner />
        <Testimonials />
      </main>

      <SiteFooter />
    </div>
  );
}

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/brandon/header';
import { HeroCluster } from '@/components/brandon/hero-cluster';
import { MarqueePills } from '@/components/brandon/marquee-pills';
import { InteractiveStage } from '@/components/brandon/interactive-stage';
import { Testimonials } from '@/components/brandon/testimonials';
import { StatsBanner } from '@/components/brandon/stats-banner';
import { WallOfLove } from '@/components/brandon/wall-of-love';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center">
        {/* HERO SECTION */}
        <section className="w-full px-4 sm:px-6 pt-20 pb-16 sm:pt-32 sm:pb-28 lg:pt-36">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 sm:gap-12 text-center">
            {/* Clustered Avatars & Icons */}
            <HeroCluster />

            {/* Headline & Subhead */}
            <div className="flex flex-col items-center gap-3 sm:gap-4 max-w-2xl px-2 sm:px-0">
              <h1 className="font-serif text-4xl font-normal leading-[1.18] tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance">
                Upload a chat. <span className="underline decoration-amber-400 underline-offset-6">Frank</span> tells you what&apos;s really going on.
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Frank reads every message and writes what he really thinks about everyone in it.
              </p>
            </div>

            {/* Primary CTA Button */}
            <div className="w-full sm:w-auto px-4 sm:px-0 max-w-xs sm:max-w-none">
              <Link
                href="/setup"
                className="group inline-flex h-12 sm:h-14 w-full sm:w-auto items-center justify-center gap-2.5 sm:gap-3 rounded-xl bg-primary px-6 sm:px-8 text-base sm:text-lg font-medium text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-[0.98] sm:min-w-64"
              >
                <span>Try It Now</span>
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            {/* Continuous Marquee Ticker */}
            <MarqueePills />

            {/* Interactive Preview Card */}
            <div className="w-full pt-6 sm:pt-8">
              <InteractiveStage />
            </div>

            {/* Testimonials Carousel */}
            <div className="w-full pt-8 sm:pt-10">
              <Testimonials />
            </div>
          </div>
        </section>

        {/* STATS BANNER */}
        <StatsBanner />

        {/* WALL OF LOVE */}
        <WallOfLove />

        {/* BOTTOM CALL TO ACTION */}
        <section className="w-full py-14 sm:py-20 px-4 sm:px-6 text-center border-t border-border bg-card">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 sm:gap-6">
            <h2 className="font-serif text-3xl font-medium sm:text-4xl">
              Ready to find out what Frank thinks?
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base">
              Takes 2 minutes. Free preview before you decide. Your chat stays private.
            </p>
            <Link
              href="/setup"
              className="group inline-flex h-12 sm:h-13 w-full sm:w-auto max-w-xs sm:max-w-none items-center justify-center gap-2 rounded-xl bg-primary px-6 sm:px-8 font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
            >
              <span>Get Your Report</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

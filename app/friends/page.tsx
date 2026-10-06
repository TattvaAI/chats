import Link from 'next/link';
import { ArrowRight, Trophy, Users, ShieldAlert } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/frank/header';
import { Testimonials } from '@/components/frank/testimonials';
import { StatsBanner } from '@/components/frank/stats-banner';

export default function FriendsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center">
        <section className="w-full px-6 pt-24 pb-16 sm:pt-32 sm:pb-24 lg:pt-36">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1 text-xs font-medium text-amber-700">
              😂 Group Chat Roasts & Awards
            </span>

            <div className="flex flex-col items-center gap-4 max-w-2xl">
              <h1 className="font-serif text-4xl font-normal leading-[1.18] tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance">
                What does Frank think of you and your friends?
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Upload the boys&apos; group, the girls&apos; chat or ten years of messages with your best friend. Frank roasts everyone in it, then says what nobody says out loud.
              </p>
            </div>

            <div className="w-full sm:w-auto pt-2">
              <Link
                href="/setup?category=friends_group"
                className="group inline-flex h-14 w-full sm:w-auto items-center justify-center gap-3 rounded-xl bg-primary px-8 text-lg font-medium text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-[0.98] sm:min-w-64"
              >
                <span>Roast Your Group</span>
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
              {['🐐 Boys group', '💅 Girls group', '🤝 Best friend', '🎓 Uni group', '🧳 Trip group', '🕰️ Old friend'].map((pill, i) => (
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
              Nobody is spared in group reports
            </h2>

            <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                  <Users className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-medium">One Page on Every Member</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Who carries the chat, who only shows up to split the bill, and who has been lurking on mute since 2021.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                  <Trophy className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-medium">The Awards Section</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Brutal superlatives that get screenshotted and argued over in the group for the next two weeks.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
                  <ShieldAlert className="size-5" />
                </div>
                <h3 className="font-serif text-lg font-medium">The Slang Glossary</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Frank decodes your group&apos;s weird private language, inside jokes, and who started what.
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

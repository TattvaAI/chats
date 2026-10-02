import Link from 'next/link';
import { ArrowRight, Apple, Download, Terminal, ShieldCheck } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/brandon/header';
import { Testimonials } from '@/components/brandon/testimonials';

export default function IMessagePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center">
        <section className="w-full px-6 pt-24 pb-16 sm:pt-32 sm:pb-24 lg:pt-36">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1 text-xs font-medium text-blue-700">
              <Apple className="size-3.5" />
              macOS Apple Silicon & Web Exporter
            </span>

            <div className="flex flex-col items-center gap-4 max-w-2xl">
              <h1 className="font-serif text-4xl font-normal leading-[1.18] tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance">
                Upload an iMessage chat. Brandon tells you what&apos;s really going on.
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Export any iMessage conversation from your Mac in two clicks. Brandon reads every message and writes what he really thinks of everyone in it.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto pt-2">
              <Link
                href="/setup?source=imessage"
                className="group inline-flex h-14 w-full sm:w-auto items-center justify-center gap-3 rounded-xl bg-primary px-8 text-lg font-medium text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-[0.98] sm:min-w-56"
              >
                <span>Upload Export</span>
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="#mac-utility"
                className="inline-flex h-14 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-base font-medium text-foreground shadow-xs transition-colors hover:bg-muted"
              >
                <Download className="size-4" />
                <span>Mac Exporter Guide</span>
              </a>
            </div>
          </div>
        </section>

        {/* HOW IMESSAGE EXPORT WORKS */}
        <section id="mac-utility" className="w-full border-t border-border bg-card py-20 px-6 sm:px-10">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-10">
            <div className="text-center flex flex-col gap-2">
              <h2 className="font-serif text-3xl font-medium sm:text-4xl">
                How iMessage export works
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                iMessage has no native export button on iPhone, so we provide two fast methods.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-background p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                  <Terminal className="size-5" />
                </div>
                <h3 className="font-serif text-xl font-medium">Method 1: Mac Exporter Command</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Open Terminal on any Mac signed into your iMessage account and run our 1-line open-source SQLite exporter. It formats any conversation into a private text file in 3 seconds.
                </p>
                <pre className="rounded-lg bg-muted p-3 text-[11px] font-mono text-foreground overflow-x-auto">
                  curl -sSL /export.sh | bash
                </pre>
              </div>

              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-background p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                  <ShieldCheck className="size-5" />
                </div>
                <h3 className="font-serif text-xl font-medium">Method 2: Mac Companion App</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Download our lightweight Apple Silicon app. It reads the local conversation database with your direct permission and saves a `.txt` file ready to drop into Brandon.
                </p>
                <Link
                  href="/setup?source=imessage"
                  className="mt-auto inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
                >
                  Continue to iMessage Setup &rarr;
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="w-full max-w-5xl py-12 px-6">
          <Testimonials />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

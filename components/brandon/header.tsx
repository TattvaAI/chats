import Link from 'next/link';
import Image from 'next/image';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--header-border)] bg-[var(--header-bg)] backdrop-blur-md pt-[env(safe-area-inset-top)] text-foreground transition-colors duration-300">
      <div className="mx-auto flex h-[var(--app-header-row-height)] w-full items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <span className="relative block size-8 sm:size-9 overflow-hidden rounded-full ring-2 ring-black/5">
            <Image
              src="/images/brandon/avatar.webp"
              alt="Brandon"
              width={40}
              height={40}
              className="size-full object-cover"
              priority
            />
          </span>
          <span className="font-serif text-2xl leading-none tracking-tight sm:text-3xl">
            Brandon
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/account"
            className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-black/5"
          >
            My Reports
          </Link>
          <Link
            href="/setup"
            className="inline-flex h-9 items-center justify-center rounded-xl bg-neutral-900 px-3.5 sm:px-4 text-xs font-medium text-white shadow-2xs hover:bg-neutral-800 active:scale-95 transition-all"
          >
            Analyze a chat
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white pb-[env(safe-area-inset-bottom)] text-foreground">
      <div className="flex w-full flex-col items-start gap-6 px-4 py-14 sm:px-6 sm:py-16">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <Image
            src="/images/brandon/avatar.webp"
            alt="Brandon"
            width={28}
            height={28}
            className="size-7 rounded-full object-cover"
          />
          <span className="text-sm font-medium">© 2026 What Brandon Thinks</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-x-5 text-sm text-muted-foreground">
          <Link href="/" className="inline-flex min-h-11 items-center underline-offset-2 transition-colors hover:text-foreground hover:underline">Home</Link>
          <Link href="/account" className="inline-flex min-h-11 items-center underline-offset-2 transition-colors hover:text-foreground hover:underline">Account</Link>
          <Link href="/faq" className="inline-flex min-h-11 items-center underline-offset-2 transition-colors hover:text-foreground hover:underline">FAQ</Link>
          <Link href="/support" className="inline-flex min-h-11 items-center underline-offset-2 transition-colors hover:text-foreground hover:underline">Customer Support</Link>
          <Link href="/feedback" className="inline-flex min-h-11 items-center underline-offset-2 transition-colors hover:text-foreground hover:underline">Feedback</Link>
          <Link href="/relationship" className="inline-flex min-h-11 items-center underline-offset-2 transition-colors hover:text-foreground hover:underline">Relationship chats</Link>
          <Link href="/friends" className="inline-flex min-h-11 items-center underline-offset-2 transition-colors hover:text-foreground hover:underline">Friend &amp; group chats</Link>
          <Link href="/family" className="inline-flex min-h-11 items-center underline-offset-2 transition-colors hover:text-foreground hover:underline">Family chats</Link>
          <Link href="/imessage" className="inline-flex min-h-11 items-center underline-offset-2 transition-colors hover:text-foreground hover:underline">iMessage chats</Link>
          <Link href="/privacy" className="inline-flex min-h-11 items-center underline-offset-2 transition-colors hover:text-foreground hover:underline">Privacy</Link>
          <Link href="/terms" className="inline-flex min-h-11 items-center underline-offset-2 transition-colors hover:text-foreground hover:underline">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}

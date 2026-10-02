import Link from 'next/link';
import Image from 'next/image';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--header-border)] bg-[var(--header-bg)] backdrop-blur-md pt-[env(safe-area-inset-top)] text-foreground transition-colors duration-300">
      <div className="mx-auto flex h-[var(--app-header-row-height)] w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-85"
        >
          <span className="relative block size-8 sm:size-9 overflow-hidden rounded-full ring-2 ring-black/5">
            <Image
              src="/images/brandon/avatar.webp"
              alt="Frank"
              width={40}
              height={40}
              className="size-full object-cover"
              priority
            />
          </span>
          <span className="font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
            Frank
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex size-8 sm:size-9 items-center justify-center rounded-lg bg-emerald-500/10 p-1">
              <Image
                src="/icons/whatsapp.svg"
                alt="WhatsApp"
                width={28}
                height={28}
                className="size-6 sm:size-7"
              />
            </div>
            <div className="flex size-8 sm:size-9 items-center justify-center rounded-lg bg-blue-500/10 p-1">
              <Image
                src="/icons/imessage.svg"
                alt="iMessage"
                width={28}
                height={28}
                className="size-6 sm:size-7"
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-border bg-card py-12 text-sm text-muted-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-6 text-center sm:px-10">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 font-medium text-foreground/80">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <Link href="/account" className="hover:text-foreground">Account</Link>
          <Link href="/faq" className="hover:text-foreground">FAQ</Link>
          <Link href="/support" className="hover:text-foreground">Customer Support</Link>
          <Link href="/relationship" className="hover:text-foreground">Relationship chats</Link>
          <Link href="/friends" className="hover:text-foreground">Friend & group chats</Link>
          <Link href="/family" className="hover:text-foreground">Family chats</Link>
          <Link href="/imessage" className="hover:text-foreground">iMessage chats</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
        </div>
        <p className="text-xs text-muted-foreground">
          © 2026 What Frank Thinks. All rights reserved. Built for conversational insight and relationship forensics.
        </p>
      </div>
    </footer>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/brandon/header';

const FAQS = [
  {
    q: 'What is What Brandon Thinks?',
    a: "Brandon reads a conversation, a friend group, a couple, an ex, or the family, and gives his candid opinion. It can be funny. It can be deep. It can be something to act on. It depends on the chat, and on Brandon's mood.",
  },
  {
    q: 'What kind of chats does it work on?',
    a: 'Any. A couple, a situationship, an ex, a crush. The friends group or one best friend. The family group or just your mum. Even the work chat. If two or more people talk in it, Brandon has an opinion.',
  },
  {
    q: 'Which apps work?',
    a: 'WhatsApp exports from iPhone or Android (.txt or .zip), and iMessage conversations exported from your Mac. Other messaging apps are not supported yet.',
  },
  {
    q: 'How do I export a WhatsApp chat?',
    a: 'Open the chat, tap the name at the top, choose Export chat, then "Without media". Send the file to yourself and upload it. The setup walks you through it step by step.',
  },
  {
    q: 'How do I export an iMessage conversation?',
    a: 'iMessage has no export button, so we made a small Mac utility. Two clicks and any conversation is exported. It needs a Mac with Apple Silicon (M1 or later).',
  },
  {
    q: 'Is it free?',
    a: 'Yes! Completely 100% free. No credit card required, no paywalls, no subscriptions. You get Brandon’s full, unfiltered report immediately.',
  },
  {
    q: 'Is my chat private?',
    a: 'Completely. Nothing is sent to anyone in the chat. Your upload is secure and stored locally or in your account until you delete it. Nothing is used to train AI models, sold, or shared with third parties.',
  },
  {
    q: 'What is in the report?',
    a: 'An editorial headline, the grand metaphor, real-time reactions with dated scenes and speech bubbles, the dynamic breakdown, your private slang dictionary, character profiles for each person, a Yelp review of the dynamic, and direct practical advice on what to text next.',
  },
  {
    q: 'Which languages does it understand?',
    a: 'The chat can be in any language, or several (English, Hinglish, Spanish, French, etc.). The report is written in English, French, or Spanish, your choice.',
  },
  {
    q: 'Can I ask Brandon more afterwards?',
    a: 'Yes. Every report includes a way to ask follow-up questions about the chat to dig deeper into what happened.',
  },
  {
    q: 'How long does it take?',
    a: 'A few seconds, usually. Brandon reads the whole chat and writes your report on the spot.',
  },
  {
    q: 'How do I delete my data?',
    a: 'From your account or the conversation page, any time: one conversation, one report, or purge everything.',
  },
];

export function FaqAccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border py-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left font-serif text-lg font-medium text-foreground transition-colors hover:text-primary cursor-pointer"
      >
        <span>{q}</span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed animate-in fade-in duration-200">
          {a}
        </p>
      )}
    </div>
  );
}

export default function FaqPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center px-6 pt-12 pb-24 sm:pt-16 sm:pb-32">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
          <div className="flex flex-col gap-3 text-center sm:text-left">
            <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
              Questions people ask before uploading
            </h1>
            <p className="text-muted-foreground text-base">
              Which apps work, how exports work, what is in the report, and how your privacy is protected.
            </p>
          </div>

          <div className="flex flex-col divide-y divide-border">
            {FAQS.map((faq, i) => (
              <FaqAccordionItem key={i} q={faq.q} a={faq.a} />
            ))}
          </div>

          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center mt-6">
            <h3 className="font-serif text-2xl font-medium">Ready to see what Brandon thinks?</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Upload your exported chat in two clicks. 100% free with no credit card required.
            </p>
            <Link
              href="/setup"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground shadow-xs transition-all hover:bg-primary/90"
            >
              <span>Upload a Chat</span>
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

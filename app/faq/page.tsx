'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/brandon/header';

const FAQS = [
  {
    q: 'What is What Frank Thinks?',
    a: "Frank reads a conversation, a friend group, a couple, an ex, or the family, and gives his candid opinion. It can be funny. It can be deep. It can be something to act on. It depends on the chat, and on Frank's mood.",
  },
  {
    q: 'What kind of chats does it work on?',
    a: 'Any. A couple, a situationship, an ex, a crush. The friends group or one best friend. The family group or just your mum. Even the work chat. If two or more people talk in it, Frank has an opinion.',
  },
  {
    q: 'Which apps work?',
    a: 'WhatsApp exports from iPhone or Android, and iMessage conversations exported with our Mac utility. Other messaging apps are not supported yet.',
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
    a: "Your first report comes with a free preview: you read the start of Frank's report before deciding whether to pay for the rest. No card needed to get there.",
  },
  {
    q: 'Is my chat private?',
    a: 'Completely. Nothing is sent to anyone in the chat. Your upload is secure and stored until you delete it from your account. Nothing is used to train AI models, sold, or shared: that is not our business model. You pay per report, and that is the whole model. The AI providers who help write the reports work under strict privacy terms and cannot use or train on what we send them.',
  },
  {
    q: 'What is in the report?',
    a: 'A verdict, the real dynamic between the people in it, the week it changed, who texts first and who pretends not to care, your private language and running jokes, and what Frank would do in your place. Group reports have an opinion on every member.',
  },
  {
    q: 'Which languages does it understand?',
    a: 'The chat can be in any language, or several. The report is written in English, French or Spanish, your choice.',
  },
  {
    q: 'Can I ask Frank more afterwards?',
    a: 'Yes. Every report ends with a way to ask the next question about the same chat, and each answer is a new, deeper report.',
  },
  {
    q: 'How long does it take?',
    a: 'A few seconds, usually. We present your initial preview immediately on screen.',
  },
  {
    q: 'How do I delete my data?',
    a: 'From your account, any time: one conversation, one report, or the whole account. Deleting the account removes everything.',
  },
];

export function FaqAccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border py-4 transition-colors">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left font-serif text-lg font-medium text-foreground hover:text-foreground/80 sm:text-xl cursor-pointer"
      >
        <span>{q}</span>
        <ChevronDown
          className={`size-5 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="pt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {a}
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center px-6 pt-24 pb-20 sm:pt-32">
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
            <h3 className="font-serif text-2xl font-medium">Ready to see what Frank thinks?</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Upload your exported chat in two clicks. Free preview with no credit card required.
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

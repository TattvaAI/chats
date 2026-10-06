'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/frank/header';

const FAQS = [
  {
    q: 'What is What Frank Thinks?',
    a: "Frank reads a conversation, a friend group, a couple, an ex, or the family, and gives his candid opinion. It can be funny. It can be deep. It can be something to act on. It depends on the chat, and on Frank's mood.",
  },
  {
    q: 'What kind of chats does it work on?',
    a: 'Couples, friends, families and colleagues. Choose an export with 2–8 participants, text messages from at least two people, and at least 5 meaningful text messages. Exports can contain up to 15,000 entries; large files or very long messages may need shortening.',
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
    a: 'A native Frank Mac app is not available yet. Use a trusted exporter to save one conversation as text, including sender names, dates and messages. Review it before uploading and follow the supported format on our iMessage page. Do not upload your entire Messages database.',
  },
  {
    q: 'Is it free?',
    a: 'Reports and follow-up questions are currently free. No credit card or subscription is required. Usage limits apply to keep the service available.',
  },
  {
    q: 'Is my chat private?',
    a: 'We do not send your chat to its other participants. When you select Create report, the messages, chosen names and note are sent to our server and Google Vertex AI. Reports and follow-up questions are stored on the server. You control shared links and deletion; the Privacy page explains provider processing and retention.',
  },
  {
    q: 'Will my reports still be there when I return?',
    a: 'Yes. Reports created while signed in are saved to your account. Sign in with the same account on any device to see your previous reports and follow-up answers. If you have a guest report, use Sign in to save on its page before clearing this browser’s site data.',
  },
  {
    q: 'What is in the report?',
    a: 'An editorial headline, the grand metaphor, real-time reactions with dated scenes and speech bubbles, the dynamic breakdown, your private slang dictionary, character profiles for each person, a Yelp review of the dynamic, and direct practical advice on what to text next.',
  },
  {
    q: 'Which languages does it understand?',
    a: 'Frank can analyze multilingual chats, including mixed-language conversations such as Hinglish. Interpretation quality can vary with language and context. Choose English, French or Spanish for the report.',
  },
  {
    q: 'Can I ask Frank more afterwards?',
    a: 'Yes. Open your report’s conversation page to ask questions based on the saved report. Your questions and answers are saved with it. Shared links are read-only and do not include your follow-up history.',
  },
  {
    q: 'How long does it take?',
    a: 'Reports normally take 1–3 minutes. A large export, a busy queue or provider delays can take longer. Your account keeps the request and completed report so you can return later.',
  },
  {
    q: 'How do I delete my data?',
    a: 'Delete a conversation from its page to remove all its reports, statistics, follow-up questions and shared links. From Account, you can delete your account and reports together. Downloaded or printed copies and provider backups are described on the Privacy page.',
  },
];

export function FaqAccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border py-4">
      <button
        type="button"
        aria-expanded={open}
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
            <h3 className="font-serif text-2xl font-medium">Ready to see what Frank thinks?</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Sign in, choose a chat export, and create your report. No credit card required.
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

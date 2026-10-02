'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/brandon/header';

export default function SupportPage() {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center px-6 pt-16 pb-24">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
          <div className="flex flex-col gap-2 text-center sm:text-left">
            <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
              Talk to our team
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Have a question about your report or need help deleting your data? Send us a message and a real person will reply.
            </p>
          </div>

          {submitted ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
              <span>Thank you. Your message has been received and our team will get back to you shortly.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground">Message</label>
                <textarea
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your question or issue..."
                  className="rounded-xl border border-border bg-background p-4 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="mt-2 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
              >
                Send Message
              </button>
            </form>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

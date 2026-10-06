'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, MessageSquareHeart, Sparkles } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/frank/header';

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error,setError]=useState('');
  const [sending,setSending]=useState(false);

  const minChars = 15;
  const remaining = Math.max(0, minChars - feedback.trim().length);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();if(sending)return;setSending(true);setError('');
    try{const res=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'feedback',email,message:feedback})});const data=await res.json();if(!res.ok)throw new Error(data.error);setSubmitted(true);}
    catch(e){setError(e instanceof Error?e.message:'Your message could not be saved.');}finally{setSending(false);}
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
          <div className="flex flex-col gap-2 text-center sm:text-left">
            <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">
              Give us feedback!
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              What do you think of What Frank Thinks? Share what worked, what fell flat, or an idea for improving it.
            </p>
          </div>

          {/* 100% Free callout */}
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4 text-emerald-950 text-sm">
            <Sparkles className="size-5 shrink-0 text-emerald-600" />
            <div>
              <span className="font-medium">Free to use. </span>
              <span className="text-emerald-800">
                What Frank Thinks is completely free — no paywalls, subscriptions, or credit cards required.
              </span>
            </div>
          </div>

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {submitted ? (
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card p-8 text-center shadow-xs">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="size-8" />
              </div>
              <div className="flex flex-col gap-1.5">
                <h2 className="font-serif text-2xl font-medium">Thank you! 🙏</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Your feedback has been saved for review. Thank you for helping us improve Frank.
                </p>
              </div>
              <Link
                href="/"
                className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all"
              >
                Back to Frank
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-xs">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="feedback-email" className="text-xs font-medium text-foreground">
                  Your email <span className="text-muted-foreground">(optional, if you want a reply)</span>
                </label>
                <input
                  id="feedback-email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="feedback-message" className="text-xs font-medium text-foreground">Your feedback</label>
                  {remaining > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {remaining} more character{remaining === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-600 font-medium">Ready to submit</span>
                  )}
                </div>
                <textarea
                  id="feedback-message"
                  required
                  minLength={minChars}
                  maxLength={5000}
                  rows={6}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="What you loved, what fell flat, what you'd want next…"
                  className="rounded-xl border border-border bg-background p-4 text-sm focus:border-primary focus:outline-none resize-y"
                />
              </div>

              <button
                type="submit" disabled={sending || remaining > 0}
                className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MessageSquareHeart className="size-4" />
                <span>Send Feedback</span>
              </button>
            </form>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

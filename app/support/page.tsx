'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/frank/header';

export default function SupportPage() {
  const [submitted, setSubmitted] = useState(false);
  const [error,setError]=useState('');
  const [sending,setSending]=useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();if(sending)return;setSending(true);setError('');
    try{const res=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'support',email,message:message})});const data=await res.json();if(!res.ok)throw new Error(data.error);setSubmitted(true);}
    catch(e){setError(e instanceof Error?e.message:'Your message could not be saved.');}finally{setSending(false);}
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
              Have a question about your report or need help deleting your data? Send us a message for review.
            </p>
          </div>

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {submitted ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
              <span>Thank you. Your message has been received and it has been saved for review.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-xs">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="support-email" className="text-xs font-medium text-foreground">Email Address</label>
                <input
                  id="support-email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="support-message" className="text-xs font-medium text-foreground">Message <span className="font-normal text-muted-foreground">(15–5,000 characters)</span></label>
                <textarea
                  id="support-message"
                  required
                  minLength={15}
                  maxLength={5000}
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your question or issue..."
                  className="rounded-xl border border-border bg-background p-4 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <button
                type="submit" disabled={sending || message.trim().length < 15}
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

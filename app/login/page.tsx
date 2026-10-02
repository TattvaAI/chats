'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/brandon/header';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const claimParam = searchParams?.get('claim') ?? '';
  const nextParam = searchParams?.get('next') ?? '';
  const claimId = UUID_RE.test(claimParam) ? claimParam : '';
  const nextPath =
    nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/account';
  const [email, setEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const prefill = searchParams?.get('email') ?? '';
    if (prefill) {
      queueMicrotask(() => setEmail((prev) => prev || prefill));
    }
  }, [searchParams]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to send code');
        return;
      }
      setCodeSent(true);
    } catch {
      setError('Failed to send code');
    } finally {
      setSending(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setVerifying(true);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, claimIds: claimId ? [claimId] : [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Invalid code');
        return;
      }
      router.push(nextPath);
    } catch {
      setError('Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm flex flex-col gap-6 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-3xl font-medium tracking-tight">
              Sign in to Frank
            </h1>
            <p className="text-xs text-muted-foreground">
              Enter your email and we&apos;ll send you a 6-digit verification code. No password needed.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive">
              {error}
            </div>
          )}

          {!codeSent ? (
            <form onSubmit={handleSendCode} className="flex flex-col gap-4">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50"
              >
                <span>{sending ? 'Sending…' : 'Send Code'}</span>
                <ArrowRight className="size-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
              <span className="text-xs text-emerald-600 font-medium">
                6-digit code sent to {email}
              </span>
              <input
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-center font-mono text-lg tracking-widest text-foreground focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={verifying || code.length !== 6}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50"
              >
                <span>{verifying ? 'Verifying…' : 'Verify Code'}</span>
                <ArrowRight className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeSent(false);
                  setCode('');
                  setError(null);
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Use a different email
              </button>
            </form>
          )}

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-4">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            <span>Secure passwordless authentication</span>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

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
    const err = searchParams?.get('error');
    if (err === 'google_not_configured') {
      setError('Google OAuth is not configured yet. You can sign in instantly using your email below.');
    } else if (err) {
      setError(`Sign-in note: ${err.replace(/_/g, ' ')}`);
    }
  }, [searchParams]);

  const handleInstantSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch('/api/auth/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, claimIds: claimId ? [claimId] : [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Sign-in failed. Please check your email.');
        return;
      }
      router.push(nextPath);
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm flex flex-col gap-6 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-3xl font-medium tracking-tight">
              Sign in to Brandon
            </h1>
            <p className="text-xs text-muted-foreground">
              Access all your saved chat reports and forensic timelines from any device.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive text-left leading-relaxed">
              {error}
            </div>
          )}

          {/* Google Sign In Button */}
          <a
            href={`/api/auth/google?next=${encodeURIComponent(nextPath)}`}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-2xs hover:bg-accent transition-all cursor-pointer"
          >
            <svg className="size-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </a>

          <div className="relative flex items-center justify-center">
            <span className="w-full border-t border-border" />
            <span className="bg-background px-3 text-xs uppercase tracking-wider text-muted-foreground font-mono">
              or with email
            </span>
            <span className="w-full border-t border-border" />
          </div>

          <form onSubmit={handleInstantSignIn} className="flex flex-col gap-4">
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
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-6 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 transition-all cursor-pointer disabled:opacity-50"
            >
              <span>{sending ? 'Signing in…' : 'Continue with Email'}</span>
              <ArrowRight className="size-4" />
            </button>
          </form>

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-2">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            <span>100% Free · Stored securely until you delete it</span>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

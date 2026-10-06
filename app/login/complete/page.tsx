'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { SiteHeader, SiteFooter } from '@/components/frank/header';
import { clearLoginIntent, localClaims, readLoginIntent, removeGuestCapability, safeDestination, saveLoginIntent } from '@/lib/store/access';
import { announceSessionChange, refreshSession } from '@/lib/hooks/useSession';
import { responseError } from '@/lib/hooks/report-client';

export default function LoginCompletePage() { return <Suspense><CompleteLogin /></Suspense>; }

function CompleteLogin() {
  const params = useSearchParams();
  const router = useRouter();
  const destination = safeDestination(params.get('next'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function finish() {
      setBusy(true); setError('');
      try {
        const profile = await refreshSession();
        if (!active) return;
        if (!profile) throw new Error('Your sign-in session could not be verified. Sign in again to finish saving your reports.');
        announceSessionChange();
        const intent = readLoginIntent();
        if (intent?.ids.length) {
          const available = localClaims();
          const claims = intent.ids.flatMap(id => { const claim = available.find(item => item.id === id); return claim ? [claim] : []; });
          const claimed = new Set<string>();
          for (let start = 0; start < claims.length; start += 20) {
            const response = await fetch('/api/conversations/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claims: claims.slice(start, start + 20) }), signal: controller.signal });
            if (!response.ok) throw new Error(await responseError(response, 'You are signed in, but your guest reports could not be saved yet. Retry to finish saving them.'));
            const data = await response.json();
            if (!Array.isArray(data.claimedIds)) throw new Error('The save result could not be verified. Your guest access has been kept; please retry.');
            for (const id of data.claimedIds) if (intent.ids.includes(id)) claimed.add(id);
            // Update recoverable intent before discarding capabilities, so interrupted cleanup is safe.
            saveLoginIntent(intent.ids.filter(id => !claimed.has(id)), intent.next);
            for (const id of data.claimedIds) if (claimed.has(id)) {
              try { removeGuestCapability(id); } catch { /* Account ownership has already revoked this guest capability. */ }
            }
          }
          const remaining = intent.ids.filter(id => !claimed.has(id));
          if (remaining.length) throw new Error('You are signed in, but some guest reports could not be saved to this account. Their guest access has been kept. Retry, or continue to your account and return using the original browser.');
        }
        clearLoginIntent();
        if (active) router.replace(destination);
      } catch (error) {
        if (active && !controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not finish sign-in. Please retry.');
      } finally { if (active) setBusy(false); }
    }
    void finish();
    return () => { active = false; controller.abort(); };
  }, [attempt, destination, router]);

  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-24"><h1 className="font-serif text-3xl">{busy ? 'Finishing sign-in…' : error ? 'Finish saving your reports' : 'You are signed in'}</h1><p role={error ? 'alert' : 'status'} className={`text-sm leading-relaxed ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{error || 'Checking your account and saving only the guest reports you selected.'}</p>
    {error && <><button disabled={busy} onClick={() => setAttempt(value => value + 1)} className="rounded-xl bg-neutral-900 px-6 py-3 text-sm text-white disabled:opacity-50">Retry</button><div className="flex flex-wrap gap-5 text-sm"><Link href="/account" className="underline">Continue to my account</Link><Link href={`/login?next=${encodeURIComponent(destination)}`} className="underline">Sign in again</Link></div></>}
  </main><SiteFooter /></div>;
}

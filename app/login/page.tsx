'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { SiteHeader, SiteFooter } from '@/components/frank/header';
import { localClaims, safeDestination, saveLoginIntent } from '@/lib/store/access';
import { responseError } from '@/lib/hooks/report-client';
import { clearPrivateClientState, useSession } from '@/lib/hooks/useSession';

interface AuthConfig { google: boolean; email: boolean; requireAuth: boolean }
const OAUTH_ERRORS: Record<string, string> = {
  google_not_configured: 'Google sign-in is not configured on this site yet. Please contact support.',
  google_cancelled: 'Google sign-in was cancelled. You can try again when you are ready.',
  google_denied: 'Google sign-in was cancelled. You can try again when you are ready.',
  access_denied: 'Google sign-in was cancelled. You can try again when you are ready.',
  google_state_invalid: 'Your sign-in request expired or could not be verified. Start Google sign-in again.',
  google_token_failed: 'Google could not complete sign-in. Please try again.',
  google_profile_failed: 'Google could not verify your account details. Please try again.',
  google_no_email: 'Google did not provide a verified email address. Choose an account with a verified email.',
  google_account_conflict: 'This email is already linked to a different Google identity. Use your original Google account or contact support.',
  google_server_error: 'Sign-in is temporarily unavailable. Please try again in a moment.',
};

export default function Login() { return <Suspense><LoginForm /></Suspense>; }

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [storageError, setStorageError] = useState('');
  const [saveGuests, setSaveGuests] = useState(params.has('claim') || params.get('save') === 'all');
  const destination = safeDestination(params.get('next'));
  const claimId = params.get('claim');
  const oauthCode = params.get('error');
  const oauthError = oauthCode ? OAUTH_ERRORS[oauthCode] || 'Sign-in could not be completed. Please try again.' : '';

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setConfigError('');
      try {
        const response = await fetch('/api/auth/config', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Sign-in options could not be loaded. Please retry.');
        const data = await response.json();
        if (typeof data.google !== 'boolean' || typeof data.email !== 'boolean' || typeof data.requireAuth !== 'boolean') throw new Error('Sign-in options could not be read. Please retry.');
        if (!controller.signal.aborted) setConfig(data);
      } catch (error) { if (!controller.signal.aborted) setConfigError(error instanceof Error ? error.message : 'Could not load sign-in options.'); }
      try {
        const ids = localClaims(claimId || undefined).map(claim => claim.id);
        if (!controller.signal.aborted) { setCandidateIds(ids); setStorageError(''); }
      } catch (error) { if (!controller.signal.aborted) setStorageError(error instanceof Error ? error.message : 'Guest access could not be read.'); }
    }
    void load();
    return () => controller.abort();
  }, [attempt, claimId]);

  function prepareLogin() {
    if (saveGuests && storageError) throw new Error(storageError);
    if (saveGuests && claimId && candidateIds.length === 0) throw new Error('This browser no longer has guest access to that report. Sign in without saving it, or use the browser where you created it.');
    saveLoginIntent(saveGuests ? candidateIds : [], destination);
    clearPrivateClientState();
  }

  function googleLogin(event: React.MouseEvent<HTMLAnchorElement>) {
    if (busy) { event.preventDefault(); return; }
    setError('');
    try {
      prepareLogin(); setBusy(true);
    } catch (error) { event.preventDefault(); setError(error instanceof Error ? error.message : 'Could not start sign-in.'); setBusy(false); }
  }

  function saveToCurrentAccount() {
    setError('');
    try { prepareLogin(); router.push(`/login/complete?next=${encodeURIComponent(destination)}`); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save the report.'); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      prepareLogin();
      const response = await fetch(sent ? '/api/auth/verify-code' : '/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent ? { email: email.trim(), code } : { email: email.trim() }) });
      if (!response.ok) throw new Error(await responseError(response, 'Could not sign in. Please retry.'));
      if (sent) router.replace(`/login/complete?next=${encodeURIComponent(destination)}`);
      else setSent(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }

  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto w-full max-w-md flex-1 px-6 py-20 sm:py-24">
    <h1 className="font-serif text-4xl">Your conversations, saved.</h1><p className="mt-4 text-sm leading-relaxed text-muted-foreground">Sign in to keep your reports in your account and return on any device. Creating and reading a report is free.</p>
    {(error || oauthError) && <p role="alert" className="mt-6 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error || oauthError}</p>}
    {configError && <div role="alert" className="mt-6 space-y-2 text-sm text-destructive"><p>{configError}</p><button onClick={() => setAttempt(value => value + 1)} className="underline">Retry sign-in options</button></div>}
    {!config && !configError && <p role="status" className="mt-6 text-sm text-muted-foreground">Loading sign-in options…</p>}
    {(candidateIds.length > 0 || claimId || (saveGuests && storageError)) && <label className="mt-6 flex items-start gap-3 rounded-xl border border-border p-4 text-sm leading-relaxed"><input type="checkbox" checked={saveGuests} onChange={event => setSaveGuests(event.target.checked)} disabled={busy} className="mt-1 size-4 shrink-0" /><span>{claimId ? 'Save this guest report to the account I sign in to.' : `Save ${candidateIds.length === 1 ? 'my guest report' : 'my guest reports from this browser'} to the account I sign in to.`}</span></label>}
    {saveGuests && storageError && <p role="alert" className="mt-3 text-sm text-destructive">{storageError}</p>}
    {session.profile && <div className="mt-6 rounded-xl border border-border p-4 text-sm"><p className="break-words">Signed in as {session.profile.email}.</p><button onClick={saveToCurrentAccount} disabled={busy} className="mt-3 font-medium underline disabled:opacity-50">{saveGuests ? 'Save to this account' : 'Continue to my account'}</button></div>}
    {config?.google && <a href={`/api/auth/google?next=${encodeURIComponent(destination)}`} onClick={googleLogin} aria-disabled={busy} className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-neutral-900 p-4 font-medium text-white disabled:opacity-50"><span aria-hidden="true" className="font-sans text-lg font-semibold">G</span>{busy ? 'Please wait…' : 'Continue with Google'}</a>}
    {config?.email && <form onSubmit={submit} className="mt-8 space-y-5">{config.google && <p className="text-center text-xs text-muted-foreground">Or use an email sign-in code</p>}<label className="block text-sm">Email<input className="mt-2 w-full rounded-xl border border-border p-3" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} disabled={sent || busy} /></label>
      {sent && <label className="block text-sm">Six-digit code<input className="mt-2 w-full rounded-xl border border-border p-3" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} disabled={busy} /></label>}
      <button disabled={busy} className="w-full rounded-xl border border-border p-4 font-medium disabled:opacity-50">{busy ? 'Please wait…' : sent ? 'Verify and sign in' : 'Send a sign-in code'}</button>
      {sent && <><p role="status" className="text-xs text-muted-foreground">Check your inbox and spam folder for your sign-in code.</p><button type="button" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(''); }} className="text-sm underline">Use a different email or request another code</button></>}
    </form>}
    {config && !config.google && !config.email && <div role="status" className="mt-8 space-y-3 rounded-xl border border-border p-4 text-sm"><p>Sign-in has not been configured on this site yet. Contact the site operator before uploading a private chat.</p><button onClick={() => setAttempt(value => value + 1)} className="underline">Check again</button><Link href="/support" className="ml-5 underline">Support</Link></div>}
    {config && !config.requireAuth && <Link href="/setup" className="mt-8 block text-center text-xs text-muted-foreground underline">Continue as a guest on this browser</Link>}
  </main><SiteFooter /></div>;
}

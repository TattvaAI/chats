'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { readShareToken, reportHref } from '@/lib/store/access';
import { fetchReportRecord, type ReportLoad } from './report-client';
import { useSession } from './useSession';

function subscribeHash(callback: () => void) {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => { window.removeEventListener('hashchange', callback); window.removeEventListener('popstate', callback); };
}
const serverHash = () => undefined;
const currentHash = () => readShareToken();

export function useConversation(id: string, reportNumber?: string) {
  const session = useSession();
  const shareToken = useSyncExternalStore(subscribeHash, currentHash, serverHash);
  const [attempt, setAttempt] = useState(0);
  const key = `${id}/${reportNumber || 'latest'}/${shareToken || ''}/${session.version}/${attempt}`;
  const [result, setResult] = useState<(ReportLoad | { status: 'loading'; data: null; message: string }) & { key: string }>({ key: '', status: 'loading', data: null, message: 'Checking access to your report…' });
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (shareToken === undefined) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    let generation = 0;
    let failures = 0;
    async function load(clear: boolean) {
      const current = ++generation;
      request?.abort();
      clearTimeout(timer);
      request = new AbortController();
      const controller = request;
      const timeout = setTimeout(() => controller.abort(), 15000);
      if (clear) setResult({ key, status: 'loading', data: null, message: 'Checking access to your report…' });
      try {
        const next = await fetchReportRecord(id, reportNumber, shareToken ?? null, request.signal);
        if (!active || current !== generation) return;
        setResult({ ...next, key });
        if (next.status === 'queued' || next.status === 'running') timer = setTimeout(() => { void load(false); }, 3000);
        else if (next.status === 'found') { failures = 0; timer = setTimeout(() => { void load(false); }, shareToken ? 30000 : 60000); }
        else if (next.status === 'error' && failures++ < 3) timer = setTimeout(() => { void load(false); }, 10000);
      } catch {
        if (!active || current !== generation) return;
        setResult({ key, status: 'error', data: null, message: 'Connection interrupted. Your saved report has not been changed. Retry when you are back online.' });
        if (failures++ < 3) timer = setTimeout(() => { void load(false); }, 10000);
      } finally { clearTimeout(timeout); }
    }
    const refresh = () => { if (document.visibilityState === 'visible') void load(true); };
    void load(true);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      request?.abort();
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [id, reportNumber, shareToken, key]);

  const current = result.key === key && shareToken !== undefined ? result : { status: 'loading' as const, data: null, message: 'Checking access to your report…' };
  return { ...current, retry, shareToken: shareToken ?? null, href: (path = '') => reportHref(id, path, shareToken ?? null) };
}

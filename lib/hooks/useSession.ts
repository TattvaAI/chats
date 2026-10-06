'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { useChatStore } from '@/lib/store/useChatStore';
import { migrateLegacyStorage } from '@/lib/store/access';

export interface Profile { id: string; email: string }
interface SessionState {
  profile: Profile | null;
  status: 'checking' | 'authenticated' | 'guest' | 'error';
  error: string | null;
  version: number;
}
export const useSessionState = create<SessionState>(() => ({ profile: null, status: 'checking', error: null, version: 0 }));
let pending: Promise<Profile | null> | null = null;
let generation = 0;
let activeRequest: AbortController | null = null;
let observedIdentity: string | null | undefined;
let sessionChannel: BroadcastChannel | null = null;
let sessionSubscribers = 0;
let removeSessionEvents: (() => void) | null = null;

export function clearPrivateClientState(): void {
  useChatStore.getState().reset();
  useSessionState.setState(state => ({ version: state.version + 1 }));
  try { migrateLegacyStorage(); } catch { /* No cached content is read if storage is blocked. */ }
}

export async function refreshSession(): Promise<Profile | null> {
  if (pending) return pending;
  const currentGeneration = generation;
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 15000);
  pending = (async () => {
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (currentGeneration !== generation) throw new DOMException('Session changed', 'AbortError');
      if (!response.ok && response.status !== 401) throw new Error('We could not check your account. Please retry when your connection is back.');
      const profile: Profile | null = response.status === 401 ? null : await response.json();
      if (currentGeneration !== generation) throw new DOMException('Session changed', 'AbortError');
      if (profile && (typeof profile.id !== 'string' || typeof profile.email !== 'string')) throw new Error('Your session could not be verified. Please sign in again.');
      if (observedIdentity !== undefined && observedIdentity !== (profile?.id ?? null)) clearPrivateClientState();
      observedIdentity = profile?.id ?? null;
      useSessionState.setState({ profile, status: profile ? 'authenticated' : 'guest', error: null });
      return profile;
    } catch (error) {
      if (currentGeneration !== generation) throw error;
      // A failed identity check must not leave a previous account's private UI visible.
      clearPrivateClientState();
      useSessionState.setState({ profile: null, status: 'error', error: controller.signal.aborted ? 'The account check timed out. Please retry.' : error instanceof Error ? error.message : 'Could not check your account.' });
      throw error;
    } finally { clearTimeout(timeout); if (currentGeneration === generation) { pending = null; activeRequest = null; } }
  })();
  return pending;
}

export function announceSessionChange(): void {
  generation += 1;
  activeRequest?.abort();
  activeRequest = null;
  pending = null;
  clearPrivateClientState();
  if (typeof BroadcastChannel !== 'undefined') {
    // Reuse the receiver: BroadcastChannel does not echo to its own instance.
    // A second channel in this tab would cancel our own sign-out refresh.
    const channel = sessionChannel ?? new BroadcastChannel('frank:session');
    channel.postMessage('changed');
    if (channel !== sessionChannel) channel.close();
  }
}

function subscribeSessionEvents() {
  sessionSubscribers += 1;
  if (sessionSubscribers === 1) {
    const refresh = () => { void refreshSession().catch(() => undefined); };
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    const onChange = (event: MessageEvent) => {
      if (event.data !== 'changed') return;
      generation += 1; activeRequest?.abort(); activeRequest = null; pending = null;
      clearPrivateClientState(); useSessionState.setState({ profile: null, status: 'checking' }); refresh();
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    sessionChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('frank:session') : null;
    if (sessionChannel) sessionChannel.onmessage = onChange;
    removeSessionEvents = () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      sessionChannel?.close(); sessionChannel = null;
    };
  }
  return () => {
    sessionSubscribers -= 1;
    if (sessionSubscribers === 0) { removeSessionEvents?.(); removeSessionEvents = null; }
  };
}

export function useSession() {
  const session = useSessionState();
  useEffect(() => {
    try { migrateLegacyStorage(); } catch { /* Guests see an actionable warning at upload/history. */ }
    return subscribeSessionEvents();
  }, []);
  return { ...session, retry: refreshSession };
}

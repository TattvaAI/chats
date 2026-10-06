const GUEST_PREFIX = 'frank:guest:';
const INTENT_KEY = 'frank:login-intent';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAPABILITY = /^[0-9a-f]{64}$/i;

export interface GuestClaim { id: string; token: string }
export interface LoginIntent { ids: string[]; next: string; createdAt: number }

export class BrowserStorageError extends Error {
  constructor() {
    super('This browser is blocking site storage. Enable storage for this site or sign in before creating a report so you can return to it.');
    this.name = 'BrowserStorageError';
  }
}

function browserStorage(): Storage {
  try {
    if (typeof window === 'undefined') throw new BrowserStorageError();
    return window.localStorage;
  } catch { throw new BrowserStorageError(); }
}

function keys(storage: Storage): string[] {
  return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => key !== null);
}

/** Upgrade old caches without ever making their private contents available to a page. */
export function migrateLegacyStorage(storage: Storage = browserStorage()): void {
  try {
    for (const key of keys(storage)) {
      if (key.startsWith('frank:conv:') || key.startsWith('brandon:conv:')) {
        try {
          const old = JSON.parse(storage.getItem(key) || 'null');
          const id = key.split(':').pop() || '';
          if (UUID.test(id) && typeof old?.deleteToken === 'string' && CAPABILITY.test(old.deleteToken)) {
            // First shrink the old entry in place, freeing quota before creating its replacement.
            storage.setItem(key, JSON.stringify({ conversationId: id, deleteToken: old.deleteToken }));
            storage.setItem(`${GUEST_PREFIX}${id}`, JSON.stringify({ conversationId: id, token: old.deleteToken }));
          }
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
        storage.removeItem(key);
      }
      if (key === 'frank:reports_index' || key === 'brandon:reports_index') storage.removeItem(key);
    }
  } catch { throw new BrowserStorageError(); }
}

export function localClaims(id?: string): GuestClaim[] {
  const storage = browserStorage();
  migrateLegacyStorage(storage);
  try {
    const entries = id ? [`${GUEST_PREFIX}${id}`] : keys(storage).filter(key => key.startsWith(GUEST_PREFIX));
    const claims: GuestClaim[] = [];
    for (const key of entries) {
      try {
        const data = JSON.parse(storage.getItem(key) || 'null');
        const conversationId = key.slice(GUEST_PREFIX.length);
        if (UUID.test(conversationId) && data?.conversationId === conversationId && typeof data.token === 'string' && CAPABILITY.test(data.token)) {
          claims.push({ id: conversationId, token: data.token });
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    return claims;
  } catch { throw new BrowserStorageError(); }
}

export function saveGuestCapability(id: string, token: string): void {
  if (!UUID.test(id) || !CAPABILITY.test(token)) throw new Error('Could not create a secure report identity. Please reload and try again.');
  const storage = browserStorage();
  migrateLegacyStorage(storage);
  try {
    const key = `${GUEST_PREFIX}${id}`;
    const value = JSON.stringify({ conversationId: id, token });
    storage.setItem(key, value);
    if (storage.getItem(key) !== value) throw new BrowserStorageError();
  } catch { throw new BrowserStorageError(); }
}

export function removeGuestCapability(id: string): void {
  try {
    const storage = browserStorage();
    storage.removeItem(`${GUEST_PREFIX}${id}`);
    storage.removeItem(`frank:conv:${id}`);
    storage.removeItem(`brandon:conv:${id}`);
  } catch { throw new BrowserStorageError(); }
}

export function clearGuestCapabilities(): void {
  const storage = browserStorage();
  try {
    for (const key of keys(storage)) {
      if (key.startsWith(GUEST_PREFIX) || key.startsWith('frank:conv:') || key.startsWith('brandon:conv:') || key === 'frank:reports_index' || key === 'brandon:reports_index') storage.removeItem(key);
    }
    window.sessionStorage.removeItem(INTENT_KEY);
  } catch { throw new BrowserStorageError(); }
}

export function createGuestCapability(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function readShareToken(hash?: string): string | null {
  const value = hash ?? (typeof window === 'undefined' ? '' : window.location.hash);
  const params = new URLSearchParams(value.replace(/^#/, ''));
  if (!params.has('share')) return null;
  if (params.getAll('share').length !== 1) return 'invalid-share-token';
  const token = params.get('share');
  // An invalid shared link must never fall back to an owner's cookies or guest capability.
  return token && /^[A-Za-z0-9_-]{16,256}$/.test(token) ? token : 'invalid-share-token';
}

export function conversationHeaders(id: string, shareToken?: string | null): Record<string, string> {
  const share = shareToken === undefined ? readShareToken() : shareToken;
  if (share) return { 'x-share-token': share };
  try {
    const claim = localClaims(id)[0];
    return claim ? { 'x-conversation-token': claim.token } : {};
  } catch {
    // A verified server session works even when browser storage is blocked.
    return {};
  }
}

export function reportHref(id: string, path = '', shareToken: string | null = null): string {
  return `/c/${encodeURIComponent(id)}${path}${shareToken ? `#share=${encodeURIComponent(shareToken)}` : ''}`;
}

export function safeDestination(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/account';
  try {
    const url = new URL(value, 'https://frank.invalid');
    if (url.origin !== 'https://frank.invalid' || url.pathname === '/login' || url.pathname === '/login/complete') return '/account';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/account'; }
}

export function saveLoginIntent(ids: string[], next: string): void {
  const intent: LoginIntent = { ids: [...new Set(ids.filter(id => UUID.test(id)))], next: safeDestination(next), createdAt: Date.now() };
  try { window.sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent)); }
  catch {
    if (intent.ids.length) throw new Error('Your browser cannot remember which guest reports to save. Enable site storage, then try signing in again. Your guest reports have not been changed.');
  }
}

export function readLoginIntent(): LoginIntent | null {
  try {
    const intent = JSON.parse(window.sessionStorage.getItem(INTENT_KEY) || 'null');
    if (!intent || !Array.isArray(intent.ids) || typeof intent.createdAt !== 'number' || Date.now() - intent.createdAt > 60 * 60 * 1000) return null;
    return { ids: intent.ids.filter((id: unknown): id is string => typeof id === 'string' && UUID.test(id)), next: safeDestination(intent.next), createdAt: intent.createdAt };
  } catch { return null; }
}

export function clearLoginIntent(): void {
  try { window.sessionStorage.removeItem(INTENT_KEY); } catch { /* No report content lives here. */ }
}

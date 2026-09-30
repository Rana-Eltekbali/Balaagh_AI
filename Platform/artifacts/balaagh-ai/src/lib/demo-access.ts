type AccessState = { open: boolean; message: string };
let state: AccessState = { open: false, message: '' };
let storageKey = 'balaagh.demoAccessKey';
const listeners = new Set<() => void>();
const waiting = new Set<(token: string) => void>();

export function configureDemoAccess(apiBase: string): void {
  // A key entered for one backend must not follow a later API-origin change.
  storageKey = `balaagh.demoAccessKey:${new URL(apiBase || '/', window.location.origin).origin}`;
}

function publish(next: AccessState): void {
  state = next;
  listeners.forEach(listener => listener());
}

export const getDemoAccessState = () => state;
export function subscribeDemoAccess(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function storedToken(): string | null {
  try { return window.sessionStorage.getItem(storageKey); }
  catch { return null; }
}

export function requestDemoToken(signal?: AbortSignal | null): Promise<string> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  const token = storedToken();
  if (token) return Promise.resolve(token);
  if (!state.open) publish({ open: true, message: '' });
  return new Promise((resolve, reject) => {
    const complete = (value: string) => {
      waiting.delete(complete);
      signal?.removeEventListener('abort', abort);
      resolve(value);
    };
    const abort = () => {
      waiting.delete(complete);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    waiting.add(complete);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function acceptDemoToken(token: string): void {
  try { window.sessionStorage.setItem(storageKey, token); }
  catch { throw new Error('Session storage is unavailable. Enable it for this site to use demo access.'); }
  publish({ open: false, message: '' });
  [...waiting].forEach(complete => complete(token));
}

export function rejectDemoToken(rejected: string | null): void {
  const current = storedToken();
  // A late 401 for an old key must not erase a newly accepted key.
  if (current && current !== rejected) return;
  try { window.sessionStorage.removeItem(storageKey); } catch { /* Nothing persisted. */ }
  publish({ open: true, message: 'Access key was not accepted. Enter the current demo access key.' });
}

export function lockDemoAccess(): void {
  try { window.sessionStorage.removeItem(storageKey); } catch { /* Nothing persisted. */ }
  publish({ open: true, message: '' });
}

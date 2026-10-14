import { vi } from 'vitest';

export const USER = { id: 5, name: 'Rita Shah', email: 'rita@company.com', role: 'analyst' as const, active: true, default_brand_id: null };

export function putSession(access = 'A1', refresh = 'R1', store: Storage = localStorage) {
  store.setItem('scammind.auth', JSON.stringify({ access, refresh }));
  store.setItem('scammind.user', JSON.stringify(USER));
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** Replace window.location with a stub that records assign() calls. */
export function stubLocation() {
  const assign = vi.fn();
  vi.stubGlobal('location', { assign, href: 'http://localhost/studio/', origin: 'http://localhost', pathname: '/studio/' });
  return assign;
}

type LockFn = (name: string, cb: () => Promise<unknown>) => Promise<unknown>;

export function setLocks(impl: LockFn | undefined) {
  Object.defineProperty(navigator, 'locks', { value: impl ? { request: vi.fn(impl) } : undefined, configurable: true });
  return (navigator as unknown as { locks?: { request: ReturnType<typeof vi.fn> } }).locks;
}

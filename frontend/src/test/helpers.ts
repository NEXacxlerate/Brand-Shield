import { vi } from 'vitest';

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export type FetchCall = { url: string; init: RequestInit };

/** Replace global fetch with a scripted fake. `handler` answers each call (return a Response, or throw to simulate a network error). */
export function mockFetch(handler: (call: FetchCall, n: number) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call, calls.length);
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

export function authHeader(call: FetchCall): string | undefined {
  return (call.init.headers as Record<string, string> | undefined)?.Authorization;
}

export const USER = { id: 1, name: 'Test User', email: 'user@example.test', role: 'admin' as const, default_brand_id: 1 };

export function signIn(access = 'access-1', refresh = 'refresh-1') {
  localStorage.setItem('scammind.auth', JSON.stringify({ access, refresh }));
  localStorage.setItem('scammind.user', JSON.stringify(USER));
}

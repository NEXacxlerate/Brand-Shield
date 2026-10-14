import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, TOKEN_KEY, downloadFile, isAbortError, mapError, request, session } from './client';
import { authHeader, jsonResponse, mockFetch, signIn, USER } from '../test/helpers';

const refreshOk = (n: number) =>
  jsonResponse(200, { access_token: `access-${n}`, refresh_token: `refresh-${n}`, token_type: 'bearer', expires_in: 900, user: USER });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request: auth header and session', () => {
  it('sends the Bearer token and parses JSON', async () => {
    signIn('tok-a');
    const { calls } = mockFetch(() => jsonResponse(200, { ok: 1 }));
    expect(await request<{ ok: number }>('/api/me')).toEqual({ ok: 1 });
    expect(authHeader(calls[0])).toBe('Bearer tok-a');
    expect(calls[0].url).toMatch(/\/api\/me$/);
  });

  it('does not send the token on anonymous calls', async () => {
    signIn();
    const { calls } = mockFetch(() => jsonResponse(200, {}));
    await request('/api/auth/login', { method: 'POST', json: { a: 1 }, anonymous: true });
    expect(authHeader(calls[0])).toBeUndefined();
  });
});

describe('request: refresh on 401 with rotation', () => {
  it('refreshes once, stores the rotated pair, and retries the original request with the new token', async () => {
    signIn('old-access', 'old-refresh');
    const { calls } = mockFetch((c, n) => {
      if (c.url.endsWith('/api/auth/refresh')) return refreshOk(2);
      return n === 1 ? jsonResponse(401, { detail: 'expired' }) : jsonResponse(200, { done: true });
    });
    expect(await request('/api/dashboard')).toEqual({ done: true });
    expect(calls.map((c) => c.url.replace(/^.*\/api/, ''))).toEqual(['/dashboard', '/auth/refresh', '/dashboard']);
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ refresh_token: 'old-refresh' });
    expect(authHeader(calls[2])).toBe('Bearer access-2');
    expect(session.tokens()).toEqual({ access: 'access-2', refresh: 'refresh-2' });
  });

  it('single-flight: concurrent 401s trigger exactly one refresh and every request is retried with the new token', async () => {
    signIn('old-access', 'old-refresh');
    let refreshCalls = 0;
    const { calls } = mockFetch(async (c) => {
      if (c.url.endsWith('/api/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return refreshOk(2);
      }
      return authHeader(c) === 'Bearer access-2' ? jsonResponse(200, { url: c.url }) : jsonResponse(401, { detail: 'expired' });
    });
    const results = await Promise.all([request<{ url: string }>('/api/a'), request<{ url: string }>('/api/b'), request<{ url: string }>('/api/c')]);
    expect(refreshCalls).toBe(1);
    expect(results.map((r) => r.url.replace(/^.*\/api/, ''))).toEqual(['/a', '/b', '/c']);
    // a rotated refresh token is never sent twice
    const refreshBodies = calls.filter((c) => c.url.endsWith('/auth/refresh')).map((c) => c.init.body);
    expect(new Set(refreshBodies).size).toBe(refreshBodies.length);
  });

  it('a request that 401s after another request already rotated the tokens just retries (no second refresh)', async () => {
    signIn('old-access', 'old-refresh');
    let refreshCalls = 0;
    mockFetch(async (c) => {
      if (c.url.endsWith('/api/auth/refresh')) {
        refreshCalls++;
        return refreshOk(2);
      }
      if (c.url.endsWith('/slow')) {
        await new Promise((r) => setTimeout(r, 30)); // answers 401 only after the refresh finished
      }
      return authHeader(c) === 'Bearer access-2' ? jsonResponse(200, { ok: 1 }) : jsonResponse(401, { detail: 'expired' });
    });
    await Promise.all([request('/api/slow'), request('/api/fast')]);
    expect(refreshCalls).toBe(1);
  });

  it('when the refresh is rejected the session is cleared, unauthorized is dispatched and the 401 is thrown', async () => {
    signIn();
    const heard = vi.fn();
    window.addEventListener('scammind:unauthorized', heard);
    mockFetch((c) =>
      c.url.endsWith('/api/auth/refresh')
        ? jsonResponse(401, { detail: 'Invalid or expired refresh token' })
        : jsonResponse(401, { detail: 'Not authenticated' })
    );
    await expect(request('/api/me')).rejects.toMatchObject({ status: 401, message: 'Not authenticated' });
    expect(session.tokens()).toBeNull();
    expect(session.user()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener('scammind:unauthorized', heard);
  });

  it('a network failure during the refresh keeps the session and reports a network error', async () => {
    signIn();
    mockFetch((c) => {
      if (c.url.endsWith('/api/auth/refresh')) throw new TypeError('Failed to fetch');
      return jsonResponse(401, { detail: 'expired' });
    });
    await expect(request('/api/me')).rejects.toMatchObject({ status: 0, network: true });
    expect(session.tokens()).not.toBeNull();
  });

  it('does not try to refresh for anonymous calls (a wrong password must not look like an expired session)', async () => {
    signIn();
    const { calls } = mockFetch(() => jsonResponse(401, { detail: 'Incorrect email or password' }));
    await expect(request('/api/auth/login', { method: 'POST', json: {}, anonymous: true })).rejects.toMatchObject({
      status: 401,
      message: 'Incorrect email or password',
    });
    expect(calls).toHaveLength(1);
    expect(session.tokens()).not.toBeNull();
  });
});

describe('refresh: cross-tab Web Lock', () => {
  afterEach(() => {
    delete (navigator as unknown as { locks?: unknown }).locks;
  });
  const stubLocks = (before?: () => void) => {
    const request = vi.fn(async (_name: string, fn: () => Promise<unknown>) => {
      before?.(); // simulates another tab/app rotating the tokens while we waited for the lock
      return fn();
    });
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    return request;
  };

  it('takes the scammind-refresh lock around the refresh', async () => {
    signIn('old-access', 'old-refresh');
    const locks = stubLocks();
    mockFetch((c, n) => (c.url.endsWith('/api/auth/refresh') ? refreshOk(2) : n === 1 ? jsonResponse(401, {}) : jsonResponse(200, { ok: 1 })));
    await request('/api/x');
    expect(locks).toHaveBeenCalledTimes(1);
    expect(locks.mock.calls[0][0]).toBe('scammind-refresh');
    expect(session.tokens()).toEqual({ access: 'access-2', refresh: 'refresh-2' });
  });

  it('if the tokens changed while waiting for the lock, retries with the new token and does NOT refresh', async () => {
    signIn('old-access', 'old-refresh');
    stubLocks(() => signIn('other-tab-access', 'other-tab-refresh'));
    const { calls } = mockFetch((c) => (authHeader(c) === 'Bearer other-tab-access' ? jsonResponse(200, { ok: 1 }) : jsonResponse(401, {})));
    expect(await request('/api/x')).toEqual({ ok: 1 });
    expect(calls.some((c) => c.url.endsWith('/auth/refresh'))).toBe(false);
    expect(authHeader(calls[1])).toBe('Bearer other-tab-access');
    expect(session.tokens()).toEqual({ access: 'other-tab-access', refresh: 'other-tab-refresh' });
  });

  it('refreshes with the refresh token re-read inside the lock when nothing changed', async () => {
    signIn('old-access', 'old-refresh');
    stubLocks();
    const { calls } = mockFetch((c, n) => (c.url.endsWith('/api/auth/refresh') ? refreshOk(2) : n === 1 ? jsonResponse(401, {}) : jsonResponse(200, {})));
    await request('/api/x');
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ refresh_token: 'old-refresh' });
  });

  it('works without the Web Locks API', async () => {
    signIn('old-access', 'old-refresh');
    expect((navigator as unknown as { locks?: unknown }).locks).toBeUndefined();
    mockFetch((c, n) => (c.url.endsWith('/api/auth/refresh') ? refreshOk(2) : n === 1 ? jsonResponse(401, {}) : jsonResponse(200, { ok: 1 })));
    expect(await request('/api/x')).toEqual({ ok: 1 });
  });
});

describe('error mapping', () => {
  it('uses the string detail and keeps the body', () => {
    const e = mapError(409, { detail: 'A scan is already running', job_id: 'job_1' });
    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toBe('A scan is already running');
    expect((e.body as { job_id: string }).job_id).toBe('job_1');
  });

  it('joins FastAPI 422 messages and exposes them by field', () => {
    const e = mapError(422, {
      detail: [
        { loc: ['body', 'handle'], msg: 'Handle must be 3 to 30 characters', type: 'value_error' },
        { loc: ['body', 'platform'], msg: 'Platform must be one of: x', type: 'value_error' },
      ],
    });
    expect(e.message).toBe('Handle must be 3 to 30 characters; Platform must be one of: x');
    expect(e.fields).toEqual({ handle: 'Handle must be 3 to 30 characters', platform: 'Platform must be one of: x' });
  });

  it('maps 429 with and without Retry-After', () => {
    expect(mapError(429, { detail: 'Too many failed attempts. Try again later.' }, 60).message).toBe('Too many failed attempts. Try again later.');
    expect(mapError(429, null, 30).message).toContain('30 seconds');
    expect(mapError(429, null).message).toMatch(/Too many requests/);
    expect(mapError(429, null, 30).retryAfter).toBe(30);
  });

  it('has readable fallbacks when the body is not JSON', () => {
    expect(mapError(500, null).message).toMatch(/server had a problem \(500\)/);
    expect(mapError(404, null).message).toBe('Not found.');
    expect(mapError(418, null).message).toBe('Request failed (418)');
  });

  it('request() throws ApiError with the 429 body and Retry-After header', async () => {
    mockFetch(() => jsonResponse(429, { detail: 'Too many failed attempts. Try again later.' }, { 'Retry-After': '45' }));
    await expect(request('/api/auth/login', { method: 'POST', json: {}, anonymous: true })).rejects.toMatchObject({
      status: 429,
      retryAfter: 45,
      message: 'Too many failed attempts. Try again later.',
    });
  });

  it('maps a network failure to ApiError status 0 with the friendly message', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const err = (await request('/api/me').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.network).toBe(true);
    expect(err.message).toBe('Cannot reach the server. Check your connection and try again.');
  });
});

describe('AbortController', () => {
  it('passes the signal to fetch and rejects with an AbortError when cancelled', async () => {
    signIn();
    const ctl = new AbortController();
    mockFetch((c) => {
      return new Promise<Response>((_, reject) => {
        (c.init.signal as AbortSignal).addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });
    const p = request('/api/dashboard', { signal: ctl.signal });
    ctl.abort();
    const err = await p.catch((e) => e);
    expect(isAbortError(err)).toBe(true);
    expect(err).not.toBeInstanceOf(ApiError);
  });
});

describe('session storage', () => {
  it('uses the single key scammind.auth and clear() removes it from both storages (sign-out bug)', () => {
    session.save({ access: 'a', refresh: 'r' }, USER, true);
    expect(localStorage.getItem(TOKEN_KEY)).not.toBeNull();
    sessionStorage.setItem(TOKEN_KEY, '{"access":"x","refresh":"y"}');
    localStorage.setItem('scammind_auth', 'legacy');
    session.clear();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem('scammind_auth')).toBeNull();
    expect(session.isAuthenticated()).toBe(false);
  });

  it('keeps the session in sessionStorage when keep-me-signed-in is off, and a refresh keeps it there', async () => {
    session.save({ access: 'a', refresh: 'r' }, USER, false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(TOKEN_KEY)).not.toBeNull();
    mockFetch((c, n) => (c.url.endsWith('/auth/refresh') ? refreshOk(2) : n === 1 ? jsonResponse(401, {}) : jsonResponse(200, {})));
    await request('/api/me');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(TOKEN_KEY) as string).access).toBe('access-2');
  });

  it('there is no offline session any more', () => {
    expect((session as unknown as Record<string, unknown>).startOffline).toBeUndefined();
    expect(session.isAuthenticated()).toBe(false);
  });
});

describe('downloadFile', () => {
  it('fetches with auth, makes a blob and clicks an anchor with the filename', async () => {
    signIn('tok-d');
    const { calls } = mockFetch(() => new Response('a,b\n1,2\n', { status: 200, headers: { 'Content-Type': 'text/csv' } }));
    const created = vi.fn(() => 'blob:fake');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await downloadFile('/api/reports/1/export.csv', 'report.csv');
    expect(authHeader(calls[0])).toBe('Bearer tok-d');
    expect(created).toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('surfaces the server error', async () => {
    signIn();
    mockFetch(() => jsonResponse(404, { detail: 'Report not found' }));
    await expect(downloadFile('/api/reports/9/export.csv', 'x.csv')).rejects.toMatchObject({ status: 404, message: 'Report not found' });
  });
});

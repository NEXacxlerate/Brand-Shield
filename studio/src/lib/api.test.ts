import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { request, ApiError, logout, mapError } from './api';
import { json, putSession, setLocks, stubLocation } from '../test/helpers';

const loginPayload = (n: number) => ({ access_token: `A${n}`, refresh_token: `R${n}`, token_type: 'bearer', expires_in: 900, user: { id: 5, name: 'Rita', email: 'r@x.com', role: 'analyst' } });

function auth(init?: RequestInit) {
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); putSession('A1', 'R1'); });
afterEach(() => { vi.unstubAllGlobals(); setLocks(undefined); });

describe('api client', () => {
  it('sends the Bearer token and returns the JSON body', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: 1 }));
    vi.stubGlobal('fetch', f);
    await expect(request('/api/me')).resolves.toEqual({ ok: 1 });
    expect(auth(f.mock.calls[0][1])).toBe('Bearer A1');
  });

  it('shares ONE refresh between concurrent 401s, stores the rotated pair and retries once', async () => {
    setLocks((_n, cb) => cb());
    let refreshCalls = 0;
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/refresh') { refreshCalls++; return json(loginPayload(2)); }
      return auth(init) === 'Bearer A2' ? json({ done: true }) : json({ detail: 'expired' }, 401);
    });
    vi.stubGlobal('fetch', f);
    const out = await Promise.all([request('/api/x'), request('/api/y'), request('/api/z')]);
    expect(out).toEqual([{ done: true }, { done: true }, { done: true }]);
    expect(refreshCalls).toBe(1);
    expect(JSON.parse(localStorage.getItem('scammind.auth')!)).toEqual({ access: 'A2', refresh: 'R2' });
    const call = f.mock.calls.find((c) => c[0] === '/api/auth/refresh')!;
    expect(JSON.parse(call[1]!.body as string)).toEqual({ refresh_token: 'R1' });
  });

  it('takes the refresh lock "scammind-refresh"', async () => {
    const locks = setLocks((_n, cb) => cb())!;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (url === '/api/auth/refresh' ? json(loginPayload(2)) : auth(init) === 'Bearer A2' ? json({}) : json({}, 401))));
    await request('/api/x');
    expect(locks.request).toHaveBeenCalledWith('scammind-refresh', expect.any(Function));
  });

  it('inside the lock, tokens another tab already rotated are used without a second refresh', async () => {
    setLocks(async (_n, cb) => {
      putSession('A9', 'R9'); // another tab/app refreshed while we waited for the lock
      return cb();
    });
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/refresh') throw new Error('must not refresh again');
      return auth(init) === 'Bearer A9' ? json({ ok: true }) : json({ detail: 'expired' }, 401);
    });
    vi.stubGlobal('fetch', f);
    await expect(request('/api/x')).resolves.toEqual({ ok: true });
    expect(f.mock.calls.some((c) => c[0] === '/api/auth/refresh')).toBe(false);
  });

  it('works without navigator.locks (falls back to the in-tab single flight)', async () => {
    setLocks(undefined);
    let refreshCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/refresh') { refreshCalls++; return json(loginPayload(2)); }
      return auth(init) === 'Bearer A2' ? json({ ok: 1 }) : json({}, 401);
    }));
    await Promise.all([request('/api/a'), request('/api/b')]);
    expect(refreshCalls).toBe(1);
  });

  it('clears both keys and goes to the BrandShield login when the refresh is rejected', async () => {
    setLocks((_n, cb) => cb());
    const assign = stubLocation();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/auth/refresh' ? json({ detail: 'bad' }, 401) : json({ detail: 'expired' }, 401))));
    await expect(request('/api/x')).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem('scammind.auth')).toBeNull();
    expect(localStorage.getItem('scammind.user')).toBeNull();
    expect(assign).toHaveBeenCalledWith('/login?next=/studio/');
  });

  it('keeps the session when the refresh fails because the server is down', async () => {
    setLocks((_n, cb) => cb());
    const assign = stubLocation();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/auth/refresh' ? json({}, 503) : json({}, 401))));
    await expect(request('/api/x')).rejects.toMatchObject({ network: true });
    expect(localStorage.getItem('scammind.auth')).not.toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('maps network failures and FastAPI 422 lists', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed'); }));
    await expect(request('/api/x')).rejects.toMatchObject({ status: 0, network: true });
    const e = mapError(422, { detail: [{ loc: ['body', 'name'], msg: 'Too short' }, { loc: ['body', 'domains'], msg: 'Bad domain' }] });
    expect(e).toBeInstanceOf(ApiError);
    expect(e.fields).toEqual({ name: 'Too short', domains: 'Bad domain' });
    expect(e.message).toBe('Too short; Bad domain');
  });

  it('logout revokes the refresh token, clears the session and goes to /login', async () => {
    const assign = stubLocation();
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true }));
    vi.stubGlobal('fetch', f);
    await logout();
    expect(f).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
    expect(localStorage.getItem('scammind.auth')).toBeNull();
    expect(assign).toHaveBeenCalledWith('/login');
  });
});

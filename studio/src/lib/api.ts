// HTTP client for the BrandShield API (same origin, relative URLs). Replicates frontend/src/api/client.ts:
// Bearer token, ONE refresh on 401 with token rotation, serialised across tabs and apps with the Web Locks API
// ('scammind-refresh'), session cleared and redirect to the BrandShield login when the refresh is rejected.
import { session, redirectToLogin, type ApiUser } from './session';

export const NETWORK_ERROR_MESSAGE = 'Cannot reach the server. Check your connection and try again.';
export const REFRESH_LOCK = 'scammind-refresh';

export class ApiError extends Error {
  status: number;
  network: boolean;
  /** Field name -> message for FastAPI 422 validation errors (`loc[-1]`). */
  fields: Record<string, string>;
  retryAfter: number | null;
  body: unknown;

  constructor(status: number, message: string, extra: { network?: boolean; fields?: Record<string, string>; retryAfter?: number | null; body?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.network = extra.network ?? status === 0;
    this.fields = extra.fields ?? {};
    this.retryAfter = extra.retryAfter ?? null;
    this.body = extra.body;
  }
}

export function mapError(status: number, body: unknown, retryAfter: number | null = null): ApiError {
  let message = '';
  const fields: Record<string, string> = {};
  const detail = body && typeof body === 'object' ? (body as { detail?: unknown }).detail : undefined;
  if (typeof detail === 'string') {
    message = detail;
  } else if (Array.isArray(detail)) {
    const parts: string[] = [];
    for (const d of detail as { msg?: string; loc?: unknown[] }[]) {
      if (!d || typeof d.msg !== 'string') continue;
      parts.push(d.msg);
      const loc = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : undefined;
      if (typeof loc === 'string' && !(loc in fields)) fields[loc] = d.msg;
    }
    message = parts.join('; ');
  }
  if (!message) {
    if (status === 429) message = retryAfter ? `Too many requests. Try again in ${retryAfter} seconds.` : 'Too many requests. Please wait a moment and try again.';
    else if (status === 401) message = 'Your session has expired. Sign in again.';
    else if (status === 403) message = 'You do not have permission to do that.';
    else if (status === 404) message = 'Not found.';
    else if (status >= 500) message = `The server had a problem (${status}). Try again in a moment.`;
    else message = `Request failed (${status})`;
  }
  return new ApiError(status, message, { fields, retryAfter, body });
}

function parseRetryAfter(h: string | null): number | null {
  if (!h) return null;
  const n = Number(h);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- refresh ---
export type RefreshResult = 'ok' | 'denied' | 'network';
let inflight: Promise<RefreshResult> | null = null;

async function doRefresh(usedAccess: string | null): Promise<RefreshResult> {
  // Inside the lock the stored tokens are the truth: another tab or app may have rotated them already.
  const t = session.tokens();
  if (!t) return 'denied';
  if (usedAccess && t.access !== usedAccess) return 'ok';
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: t.refresh }),
    });
    if (!res.ok) return res.status >= 500 ? 'network' : 'denied';
    const j = (await res.json()) as { access_token: string; refresh_token: string; user: ApiUser };
    session.save({ access: j.access_token, refresh: j.refresh_token }, j.user);
    return 'ok';
  } catch {
    return 'network';
  }
}

/** Single-flight refresh: one per tab, and one at a time across tabs/apps through navigator.locks when available. */
export function refreshTokens(usedAccess: string | null): Promise<RefreshResult> {
  if (inflight) return inflight;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const run: Promise<RefreshResult> =
    locks && typeof locks.request === 'function'
      ? Promise.resolve(locks.request(REFRESH_LOCK, () => doRefresh(usedAccess)))
      : doRefresh(usedAccess);
  const p: Promise<RefreshResult> = run.finally(() => {
    if (inflight === p) inflight = null;
  });
  inflight = p;
  return p;
}

// ---------------------------------------------------------------- requests ---
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  blob?: boolean;
}

export function endSession() {
  session.clear();
  window.dispatchEvent(new Event('scammind:unauthorized'));
  redirectToLogin();
}

function send(path: string, o: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(o.json);
  }
  return fetch(path, { method: o.method || 'GET', headers, body, signal: o.signal });
}

async function sendSafe(path: string, o: RequestOptions, token: string | null): Promise<Response> {
  try {
    return await send(path, o, token);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }
}

async function authedFetch(path: string, o: RequestOptions): Promise<Response> {
  const used = session.tokens()?.access ?? null;
  let res = await sendSafe(path, o, used);
  if (res.status !== 401) return res;
  if (!session.tokens()) {
    endSession();
    return res;
  }
  const r = await refreshTokens(used);
  if (r === 'network') throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  if (r !== 'ok') {
    endSession();
    return res;
  }
  res = await sendSafe(path, o, session.tokens()?.access ?? null);
  if (res.status === 401) endSession();
  return res;
}

export async function request<T>(path: string, o: RequestOptions = {}): Promise<T> {
  const res = await authedFetch(path, o);
  if (!res.ok) throw mapError(res.status, await readJson(res), parseRetryAfter(res.headers.get('Retry-After')));
  if (o.blob) return (await res.blob()) as unknown as T;
  if (res.status === 204) return undefined as unknown as T;
  return (await readJson(res)) as T;
}

/** Best-effort server logout (revokes the refresh token), then clear both storage keys and go to BrandShield's login. */
export async function logout(): Promise<void> {
  const t = session.tokens();
  if (t) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: t.refresh }),
      });
    } catch {
      /* offline: still sign out locally */
    }
  }
  session.clear();
  window.location.assign('/login');
}

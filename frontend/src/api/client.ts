// HTTP core: base URL, session tokens, refresh-on-401 with rotation, error mapping, AbortController support.
//
// Rules this file enforces (see docs/API.md sections 1 and 4):
// - Every request carries `Authorization: Bearer <access>` unless `anonymous` is set.
// - On 401 the client refreshes ONCE (single-flight: concurrent 401s share one POST /api/auth/refresh), stores the rotated
//   access + refresh pair and retries the original request once. A rotated refresh token must never be sent twice, so the
//   refresh is never retried and never fired in parallel.
// - If the refresh is rejected (4xx) the session is cleared and `scammind:unauthorized` is dispatched. A network failure during
//   the refresh keeps the session (the server may just be down) and surfaces as a network error.
// - Errors are mapped to ApiError(status, message). The message is the server's `detail` (string, or the `msg` of every FastAPI
//   422 item joined by "; "). Network failures have status 0 and `network === true`; cancelled calls rethrow the AbortError.
// - There is no offline/sample session: nothing is ever shown unless the server answered.

import { clearQueryCache } from './queryCache';

declare global {
  interface Window {
    /** Written at container start from API_URL (see frontend/nginx/40-runtime-config.sh); empty in development. */
    __SCAMMIND_CONFIG__?: { API_URL?: string };
  }
}

// Precedence: runtime config (/config.js, no rebuild needed) > VITE_API_URL (build time) > local default.
const runtimeApiUrl = typeof window !== 'undefined' ? window.__SCAMMIND_CONFIG__?.API_URL : undefined;
export const BASE_URL: string = (runtimeApiUrl || (import.meta.env.VITE_API_URL as string | undefined) || 'http://127.0.0.1:8000').replace(/\/+$/, '');

export const NETWORK_ERROR_MESSAGE = 'Cannot reach the server. Check your connection and try again.';

export class ApiError extends Error {
  status: number;
  /** True when no HTTP response was received (server down, DNS, CORS). */
  network: boolean;
  /** Field name -> message for FastAPI 422 validation errors (`loc[-1]`). */
  fields: Record<string, string>;
  /** Seconds from the Retry-After header, when the server sent one (429). */
  retryAfter: number | null;
  /** Parsed JSON body of the error response, when there was one (e.g. 409 scan already running carries `job_id`). */
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

export function isAbortError(e: unknown): boolean {
  return (e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && e.name === 'AbortError');
}

// ------------------------------------------------------------------ tokens ---
/** The one and only session storage key. Sign-out, refresh and login all go through `session`, never through raw keys. */
export const TOKEN_KEY = 'scammind.auth';
export const USER_KEY = 'scammind.user';
const LEGACY_KEYS = ['scammind_auth', 'scammind.offline-session'];

export interface Tokens {
  access: string;
  refresh: string;
}

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
  active?: boolean;
  default_brand_id?: number | null;
}

function read<T>(key: string): T | null {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      /* storage unavailable or corrupt: treat as empty */
    }
  }
  return null;
}

/** persist=false keeps the value for this browser tab only ("keep me signed in" switched off). */
function write(key: string, value: unknown, persist = true) {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    if (value !== null) (persist ? localStorage : sessionStorage).setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the session just will not persist */
  }
}

function sessionIsPersistent(): boolean {
  try {
    return localStorage.getItem(TOKEN_KEY) !== null;
  } catch {
    return false;
  }
}

export const session = {
  tokens: (): Tokens | null => read<Tokens>(TOKEN_KEY),
  user: (): ApiUser | null => read<ApiUser>(USER_KEY),
  save(tokens: Tokens, user: ApiUser, persist?: boolean) {
    // when tokens are refreshed, keep the session wherever it already lives
    const keep = persist ?? sessionIsPersistent();
    write(TOKEN_KEY, tokens, keep);
    write(USER_KEY, user, keep);
  },
  saveUser(user: ApiUser) {
    write(USER_KEY, user, sessionIsPersistent());
  },
  /** Remove the session from both storages (and the keys older builds used). */
  clear() {
    clearQueryCache(); // the next person to sign in must never see this session's pages
    write(TOKEN_KEY, null);
    write(USER_KEY, null);
    for (const k of LEGACY_KEYS) write(k, null);
  },
  isAuthenticated(): boolean {
    return !!this.tokens();
  }
};

// ------------------------------------------------------------ offline flag ---
// Only informational (used by the orphaned pages): true after a network failure, false after any HTTP answer.
type Listener = (offline: boolean) => void;
let offline = false;
const listeners = new Set<Listener>();

export function isOffline(): boolean {
  return offline;
}

export function subscribeStatus(l: Listener): () => void {
  listeners.add(l);
  l(offline);
  return () => {
    listeners.delete(l);
  };
}

function setOffline(v: boolean) {
  if (offline !== v) {
    offline = v;
    listeners.forEach((l) => l(offline));
  }
}

// ----------------------------------------------------------- response taps ---
// Lets the app react to every JSON answer (the "Sample data" badge) without each page wiring it up.
type Tap = (path: string, body: unknown) => void;
const taps = new Set<Tap>();

export function onResponse(tap: Tap): () => void {
  taps.add(tap);
  return () => {
    taps.delete(tap);
  };
}

function notify(path: string, body: unknown) {
  taps.forEach((t) => {
    try {
      t(path, body);
    } catch {
      /* a broken listener must not break the request */
    }
  });
}

// ----------------------------------------------------------- error mapping ---
function parseRetryAfter(h: string | null): number | null {
  if (!h) return null;
  const n = Number(h);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Map a failed HTTP response (already read as JSON or null) to an ApiError carrying the server's own message. */
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
    if (status === 429) {
      message = retryAfter ? `Too many requests. Try again in ${retryAfter} seconds.` : 'Too many requests. Please wait a moment and try again.';
    } else if (status === 401) message = 'Your session has expired. Sign in again.';
    else if (status === 403) message = 'You do not have permission to do that.';
    else if (status === 404) message = 'Not found.';
    else if (status >= 500) message = `The server had a problem (${status}). Try again in a moment.`;
    else message = `Request failed (${status})`;
  }
  return new ApiError(status, message, { fields, retryAfter, body });
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- requests ---
type RefreshResult = 'ok' | 'denied' | 'network';
let refreshing: Promise<RefreshResult> | null = null;

/** Single-flight token refresh. Exported for tests. */
export function refreshTokens(): Promise<RefreshResult> {
  if (refreshing) return refreshing;
  const t = session.tokens();
  if (!t) return Promise.resolve('denied');
  const p: Promise<RefreshResult> = (async (): Promise<RefreshResult> => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: t.refresh })
      });
      if (!res.ok) {
        // 4xx: the refresh token is invalid, expired or already used. 5xx: the server is unwell, keep the session.
        return res.status >= 500 ? 'network' : 'denied';
      }
      const j = (await res.json()) as { access_token: string; refresh_token: string; user: ApiUser };
      session.save({ access: j.access_token, refresh: j.refresh_token }, j.user);
      return 'ok';
    } catch {
      return 'network';
    }
  })().finally(() => {
    if (refreshing === p) refreshing = null;
  });
  refreshing = p;
  return p;
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  json?: unknown;
  form?: FormData;
  /** Skip the Authorization header and the refresh logic (login, refresh, logout, forgot, reset). */
  anonymous?: boolean;
  /** Cancel the call (page left, new keystroke). A cancelled call rejects with an AbortError, see `isAbortError`. */
  signal?: AbortSignal;
  /** Return the response body as text (HTML previews). */
  text?: boolean;
  /** Return the response body as a Blob (downloads, images). */
  blob?: boolean;
  /** Orphaned pages only: returned instead of throwing when the server cannot be reached. The live pages never pass it. */
  fallback?: T;
}

export function onUnauthorized(handler: () => void) {
  window.addEventListener('scammind:unauthorized', handler);
  return () => window.removeEventListener('scammind:unauthorized', handler);
}

function endSession() {
  session.clear();
  window.dispatchEvent(new Event('scammind:unauthorized'));
}

function send(path: string, o: RequestOptions<unknown>, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token && !o.anonymous) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(o.json);
  }
  return fetch(`${BASE_URL}${path}`, { method: o.method || 'GET', headers, body, signal: o.signal });
}

/** fetch with the 401 -> refresh -> retry-once flow. Throws ApiError(0) on network failure, AbortError when cancelled. */
async function authedFetch(path: string, o: RequestOptions<unknown>): Promise<Response> {
  const used = session.tokens()?.access ?? null;
  let res: Response;
  try {
    res = await send(path, o, used);
  } catch (e) {
    if (isAbortError(e)) throw e;
    setOffline(true);
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }
  if (res.status === 401 && !o.anonymous && session.tokens()) {
    const current = session.tokens()?.access ?? null;
    let ok = false;
    if (current && current !== used) {
      ok = true; // another request already rotated the tokens while this one was in flight
    } else {
      const r = await refreshTokens();
      if (r === 'network') {
        setOffline(true);
        throw new ApiError(0, NETWORK_ERROR_MESSAGE);
      }
      ok = r === 'ok';
    }
    if (!ok) {
      endSession();
      return res; // the caller maps the original 401
    }
    try {
      res = await send(path, o, session.tokens()?.access ?? null);
    } catch (e) {
      if (isAbortError(e)) throw e;
      setOffline(true);
      throw new ApiError(0, NETWORK_ERROR_MESSAGE);
    }
    if (res.status === 401) endSession();
  }
  setOffline(false);
  return res;
}

export async function request<T>(path: string, o: RequestOptions<T> = {}): Promise<T> {
  let res: Response;
  try {
    res = await authedFetch(path, o);
  } catch (e) {
    if (e instanceof ApiError && e.network && o.fallback !== undefined) return o.fallback;
    throw e;
  }
  if (!res.ok) {
    throw mapError(res.status, await readJson(res), parseRetryAfter(res.headers.get('Retry-After')));
  }
  if (o.blob) return (await res.blob()) as unknown as T;
  if (o.text) return (await res.text()) as unknown as T;
  if (res.status === 204) return undefined as unknown as T;
  const json = (await readJson(res)) as T;
  notify(path, json);
  return json;
}

/** Fetch a file the API serves behind auth and hand it to the browser (fetch -> blob -> anchor download). */
export async function downloadFile(path: string, filename: string, signal?: AbortSignal): Promise<void> {
  const blob = await request<Blob>(path, { blob: true, signal });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    setOffline(!res.ok);
    return res.ok;
  } catch {
    setOffline(true);
    return false;
  }
}

// HTTP core: base URL, tokens, refresh-on-401, offline detection.
// Network failures never throw when a `fallback` is supplied: the page renders the bundled sample data and the header shows
// an "Offline: showing sample data" chip. HTTP errors (4xx/5xx) always throw ApiError so forms can show the server's message.

export const BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined) || 'http://127.0.0.1:8000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ------------------------------------------------------------------ tokens ---
const TOKEN_KEY = 'scammind.auth';
const OFFLINE_SESSION_KEY = 'scammind.offline-session';

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
  user: (): ApiUser | null => read<ApiUser>('scammind.user'),
  save(tokens: Tokens, user: ApiUser, persist?: boolean) {
    // when tokens are refreshed, keep the session wherever it already lives
    const keep = persist ?? sessionIsPersistent();
    write(TOKEN_KEY, tokens, keep);
    write('scammind.user', user, keep);
    write(OFFLINE_SESSION_KEY, null);
  },
  saveUser(user: ApiUser) {
    write('scammind.user', user, sessionIsPersistent());
  },
  clear() {
    write(TOKEN_KEY, null);
    write('scammind.user', null);
    write(OFFLINE_SESSION_KEY, null);
  },
  /** Sample-data session for when the API cannot be reached. It carries no token and unlocks nothing but the bundled samples. */
  startOffline() {
    write(OFFLINE_SESSION_KEY, true);
  },
  isOfflineSession: (): boolean => read<boolean>(OFFLINE_SESSION_KEY) === true,
  isAuthenticated(): boolean {
    return !!this.tokens() || this.isOfflineSession();
  }
};

// ------------------------------------------------------------ offline flag ---
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

// ---------------------------------------------------------------- requests ---
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const t = session.tokens();
  if (!t) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: t.refresh })
        });
        if (!res.ok) return false;
        const j = await res.json();
        session.save({ access: j.access_token, refresh: j.refresh_token }, j.user);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => {
          refreshing = null;
        }, 0);
      }
    })();
  }
  return refreshing;
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  json?: unknown;
  form?: FormData;
  /** Skip the Authorization header (login, refresh, forgot, reset). */
  anonymous?: boolean;
  /** Returned (and the offline chip shown) if the server cannot be reached. */
  fallback?: T;
  /** Return the response body as text (HTML previews). */
  text?: boolean;
}

export function onUnauthorized(handler: () => void) {
  window.addEventListener('scammind:unauthorized', handler);
  return () => window.removeEventListener('scammind:unauthorized', handler);
}

async function send(path: string, o: RequestOptions<unknown>, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token && !o.anonymous) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(o.json);
  }
  return fetch(`${BASE_URL}${path}`, { method: o.method || 'GET', headers, body });
}

export async function request<T>(path: string, o: RequestOptions<T> = {}): Promise<T> {
  // Sample-data session: never touch the network for protected data.
  if (!o.anonymous && session.isOfflineSession() && !session.tokens()) {
    setOffline(true);
    if (o.fallback !== undefined) return o.fallback;
    throw new ApiError(0, 'You are in the offline sample-data session. Sign in to use this feature.');
  }
  let res: Response;
  try {
    res = await send(path, o, session.tokens()?.access ?? null);
    if (res.status === 401 && !o.anonymous && session.tokens()) {
      if (await refreshTokens()) {
        res = await send(path, o, session.tokens()?.access ?? null);
      } else {
        session.clear();
        window.dispatchEvent(new Event('scammind:unauthorized'));
      }
    }
  } catch {
    setOffline(true);
    if (o.fallback !== undefined) return o.fallback;
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  setOffline(false);
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') detail = j.detail;
      else if (Array.isArray(j.detail)) detail = j.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ') || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (o.text) return (await res.text()) as unknown as T;
  return (await res.json()) as T;
}

/** Download a file the API serves behind auth (PDF, JSON, evidence) and hand it to the browser. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const send1 = () => send(path, {}, session.tokens()?.access ?? null);
  let res = await send1();
  if (res.status === 401 && (await refreshTokens())) res = await send1();
  if (!res.ok) {
    let detail = `Download failed (${res.status})`;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

// BrandShield session, read from the shared storage (same origin). Mirrors frontend/src/api/client.ts: same keys,
// localStorage first then sessionStorage, both keys written together and removed together.
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
  /** Keeps the session wherever it already lives (localStorage or sessionStorage). */
  save(tokens: Tokens, user: ApiUser) {
    const keep = sessionIsPersistent();
    write(TOKEN_KEY, tokens, keep);
    write(USER_KEY, user, keep);
  },
  clear() {
    write(TOKEN_KEY, null);
    write(USER_KEY, null);
    for (const k of LEGACY_KEYS) write(k, null);
  },
  isAuthenticated(): boolean {
    return !!this.tokens();
  },
};

/** BrandShield sign-in page on the same origin, coming back to Studio afterwards. */
export const LOGIN_URL = '/login?next=/studio/';
export const BRANDSHIELD_HOME = '/dashboard';

export function redirectToLogin() {
  window.location.assign(LOGIN_URL);
}

/** Pure check used by the auth provider and tests: is there a usable session, or where should the visitor go? */
export function sessionGate(): { signedIn: true; user: ApiUser } | { signedIn: false; redirect: string } {
  const tokens = session.tokens();
  const user = session.user();
  if (!tokens || !user) return { signedIn: false, redirect: LOGIN_URL };
  return { signedIn: true, user };
}

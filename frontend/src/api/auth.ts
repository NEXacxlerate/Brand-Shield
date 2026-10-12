import { request, session } from './client';
import type { ApiUser, Tokens } from './client';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user: ApiUser;
}

export const authApi = {
  async login(email: string, password: string, persist = true): Promise<ApiUser> {
    const r = await request<TokenResponse>('/api/auth/login', { method: 'POST', json: { email, password }, anonymous: true });
    const tokens: Tokens = { access: r.access_token, refresh: r.refresh_token };
    session.save(tokens, r.user, persist);
    return r.user;
  },
  async logout(): Promise<void> {
    const t = session.tokens();
    try {
      if (t) await request('/api/auth/logout', { method: 'POST', json: { refresh_token: t.refresh }, anonymous: true });
    } catch {
      /* the local session is cleared either way */
    }
    session.clear();
  },
  async me(): Promise<ApiUser | null> {
    const u = await request<ApiUser | null>('/api/me', { fallback: null });
    if (u) session.saveUser(u);
    return u;
  },
  forgot(email: string) {
    return request<{ ok: boolean; detail: string }>('/api/auth/forgot', { method: 'POST', json: { email }, anonymous: true });
  },
  reset(token: string, newPassword: string) {
    return request<{ ok: boolean; detail: string }>('/api/auth/reset', { method: 'POST', json: { token, new_password: newPassword }, anonymous: true });
  }
};

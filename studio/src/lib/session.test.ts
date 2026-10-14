import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { session, sessionGate, redirectToLogin, LOGIN_URL } from './session';
import { putSession, stubLocation, USER } from '../test/helpers';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('session (shared BrandShield session)', () => {
  it('reads the two BrandShield keys from localStorage', () => {
    putSession('a', 'r');
    expect(session.tokens()).toEqual({ access: 'a', refresh: 'r' });
    expect(session.user()?.email).toBe(USER.email);
    expect(sessionGate()).toEqual({ signedIn: true, user: USER });
  });

  it('falls back to sessionStorage (keep me signed in switched off), localStorage first', () => {
    putSession('s-access', 's-refresh', sessionStorage);
    expect(session.tokens()?.access).toBe('s-access');
    putSession('l-access', 'l-refresh', localStorage);
    expect(session.tokens()?.access).toBe('l-access');
  });

  it('asks for the BrandShield login with a return path when there is no session', () => {
    expect(sessionGate()).toEqual({ signedIn: false, redirect: '/login?next=/studio/' });
    putSession();
    localStorage.removeItem('scammind.user');
    expect(sessionGate().signedIn).toBe(false);
  });

  it('treats corrupt storage as empty', () => {
    localStorage.setItem('scammind.auth', '{not json');
    expect(session.tokens()).toBeNull();
  });

  it('save() keeps the session in the storage where it lives', () => {
    putSession('a', 'r', sessionStorage);
    session.save({ access: 'a2', refresh: 'r2' }, USER);
    expect(sessionStorage.getItem('scammind.auth')).toContain('a2');
    expect(localStorage.getItem('scammind.auth')).toBeNull();
  });

  it('clear() removes both keys from both storages, like BrandShield', () => {
    putSession('a', 'r', localStorage);
    putSession('a', 'r', sessionStorage);
    session.clear();
    for (const s of [localStorage, sessionStorage]) {
      expect(s.getItem('scammind.auth')).toBeNull();
      expect(s.getItem('scammind.user')).toBeNull();
    }
  });

  it('redirectToLogin goes to /login?next=/studio/', () => {
    const assign = stubLocation();
    redirectToLogin();
    expect(assign).toHaveBeenCalledWith(LOGIN_URL);
  });
});

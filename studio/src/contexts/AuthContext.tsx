import React, { createContext, useContext, useEffect, useState } from 'react';
import { sessionGate, redirectToLogin, type ApiUser, TOKEN_KEY, USER_KEY } from '../lib/session';
import { logout as apiLogout } from '../lib/api';

// The user is the BrandShield user, read from the shared session (same origin). There is no sign-in screen here.
interface AuthContextValue {
  user: ApiUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(() => {
    const g = sessionGate();
    return g.signedIn ? g.user : null;
  });

  useEffect(() => {
    const g = sessionGate();
    if (!g.signedIn) {
      redirectToLogin();
      return;
    }
    const onChange = () => {
      const next = sessionGate();
      if (!next.signedIn) {
        setUser(null);
        redirectToLogin();
      } else {
        setUser(next.user);
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === TOKEN_KEY || e.key === USER_KEY) onChange();
    };
    window.addEventListener('storage', onStorage); // signed out (or refreshed) in another tab
    window.addEventListener('scammind:unauthorized', onChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('scammind:unauthorized', onChange);
    };
  }, []);

  return <AuthContext.Provider value={{ user, loading: user === null, logout: apiLogout }}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

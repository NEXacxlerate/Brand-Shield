// The signed-in user. Shown immediately from the session copy, then confirmed by GET /api/me.
import { useEffect, useState } from 'react';
import { ApiError, isAbortError, session } from '../api/client';
import type { ApiUser } from '../api/client';
import { sm } from '../api/sm';

export interface MeState {
  user: ApiUser | null;
  error: ApiError | null;
  isAdmin: boolean;
  /** analyst or admin: may scan, review, edit the brand, create reports. */
  canWrite: boolean;
}

export function useMe(): MeState {
  const [user, setUser] = useState<ApiUser | null>(() => session.user());
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    sm.me(ctl.signal)
      .then((u) => {
        session.saveUser(u);
        setUser(u);
      })
      .catch((e: unknown) => {
        if (isAbortError(e)) return;
        setError(e instanceof ApiError ? e : null);
      });
    return () => ctl.abort();
  }, []);

  return { user, error, isAdmin: user?.role === 'admin', canWrite: user?.role === 'admin' || user?.role === 'analyst' };
}

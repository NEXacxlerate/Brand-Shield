import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isAbortError } from '../api/client';

export interface ApiState<T> {
  data: T | null;
  /** True only for the first load (no data yet). Reloads keep the old data on screen and set `refreshing`. */
  loading: boolean;
  refreshing: boolean;
  error: ApiError | null;
  reload: () => void;
  /** Replace the cached data (optimistic updates, or merging a mutation's response). */
  setData: (updater: T | null | ((prev: T | null) => T | null)) => void;
}

function toApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError(0, e instanceof Error ? e.message : 'Something went wrong', { network: false });
}

/**
 * Load data with loading / error / retry state. The request is cancelled (AbortController) when the component unmounts,
 * when `deps` change, or when a newer load starts, so a slow answer can never overwrite a newer one.
 * `enabled=false` skips the call (for dependent loads).
 */
export function useApi<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[] = [], enabled = true): ApiState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const hasData = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    fnRef
      .current(ctl.signal)
      .then((d) => {
        if (ctl.signal.aborted) return;
        hasData.current = true;
        setDataState(d);
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted || isAbortError(e)) return;
        setError(toApiError(e));
      })
      .finally(() => {
        if (ctl.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((u: T | null | ((prev: T | null) => T | null)) => {
    setDataState((prev) => {
      const next = typeof u === 'function' ? (u as (p: T | null) => T | null)(prev) : u;
      hasData.current = next !== null;
      return next;
    });
  }, []);

  return { data, loading, refreshing, error, reload, setData };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isAbortError, session } from '../api/client';
import { cacheGet, cacheHas, cacheSet } from '../api/queryCache';

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
  // Same request (same code, same inputs, same signed-in user) = same cache entry, shared by every visit to the page.
  const key = `${session.user()?.id ?? ''}|${fn.toString()}|${JSON.stringify(deps)}`;
  const keyRef = useRef(key);
  keyRef.current = key;
  const [data, setDataState] = useState<T | null>(() => (cacheHas(key) ? (cacheGet<T>(key) as T) : null));
  const [loading, setLoading] = useState(enabled && !cacheHas(key));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const hasData = useRef(cacheHas(key));

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    if (cacheHas(key)) {
      // shown at once; the request below only refreshes it
      setDataState(cacheGet<T>(key) as T);
      hasData.current = true;
      setLoading(false);
    }
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    fnRef
      .current(ctl.signal)
      .then((d) => {
        if (ctl.signal.aborted) return;
        hasData.current = true;
        cacheSet(key, d);
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
      cacheSet(keyRef.current, next); // optimistic edits and mutation answers stay in the cache too
      return next;
    });
  }, []);

  return { data, loading, refreshing, error, reload, setData };
}

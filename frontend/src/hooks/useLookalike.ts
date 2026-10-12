// Live matcher: POST /api/lookalike/test after the person stops typing (debounce). Every new keystroke cancels the previous call
// (AbortController), so a slow answer can never replace a newer one.
import { useEffect, useState } from 'react';
import { ApiError, isAbortError } from '../api/client';
import { sm } from '../api/sm';
import type { LookalikeResult } from '../api/types';

export const DEBOUNCE_MS = 350;

export interface LookalikeState {
  result: LookalikeResult | null;
  loading: boolean;
  error: ApiError | null;
}

export function useLookalike(input: string, enabled = true, debounceMs = DEBOUNCE_MS): LookalikeState {
  const [result, setResult] = useState<LookalikeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    const name = input.trim();
    if (!enabled || !name) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      sm.lookalikeTest(name.slice(0, 200), ctl.signal)
        .then((r) => {
          if (ctl.signal.aborted) return;
          setResult(r);
          setError(null);
        })
        .catch((e: unknown) => {
          if (ctl.signal.aborted || isAbortError(e)) return;
          setError(e instanceof ApiError ? e : new ApiError(0, 'Could not test the name.', { network: false }));
        })
        .finally(() => {
          if (!ctl.signal.aborted) setLoading(false);
        });
    }, debounceMs);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [input, enabled, debounceMs]);

  return { result, loading, error };
}

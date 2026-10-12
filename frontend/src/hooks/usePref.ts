// Harmless UI preferences (selected tab, filters) remembered in this browser. Never domain data, never tokens.
import { useCallback, useState } from 'react';

const PREFIX = 'scammind.ui.';

export function usePref<T extends string>(key: string, initial: T, allowed?: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw && (!allowed || (allowed as readonly string[]).includes(raw))) return raw as T;
    } catch {
      /* storage unavailable: use the default */
    }
    return initial;
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(PREFIX + key, v);
      } catch {
        /* ignore */
      }
    },
    [key]
  );
  return [value, set];
}

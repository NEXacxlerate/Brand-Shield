import { useEffect, useState } from 'react';
import { request } from '../api/client';

/** Fetches an API image that requires auth, returns a revocable object URL (null until loaded or on error). */
export function useAuthImage(path: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setSrc(null);
      return;
    }
    let active = true;
    let objUrl: string | null = null;
    void request<Blob>(path, { blob: true }).then((blob) => {
      if (!active) return;
      objUrl = URL.createObjectURL(blob);
      setSrc(objUrl);
    }).catch(() => {
      if (active) setSrc(null);
    });
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [path]);

  return src;
}

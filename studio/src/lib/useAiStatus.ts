import { useEffect, useState } from 'react';
import { getAiStatus, type AiStatus } from './ai';

let cached: Promise<AiStatus> | null = null;

/** GET /api/studio/ai/status once per page load (shared by every screen that shows the "AI unavailable" banner). */
export function useAiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    cached ??= getAiStatus();
    cached.then((s) => alive && setStatus(s)).catch(() => {
      cached = null;
      if (alive) setFailed(true);
    });
    return () => { alive = false; };
  }, []);
  return { status, failed };
}

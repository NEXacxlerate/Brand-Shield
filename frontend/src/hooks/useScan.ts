// Start a scan and follow it to the end by polling GET /api/jobs/{job_id}.
// - 409 "A scan is already running" attaches to the running job instead of failing.
// - A scan that finishes "partial" (some source unavailable) is a normal outcome, not an error.
// - Polling stops on unmount (AbortController) and gives up after MAX_WAIT_MS with a clear message.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isAbortError } from '../api/client';
import { sm } from '../api/sm';
import type { Scan, ScanScope } from '../api/types';

const POLL_MS = 1000;
const MAX_WAIT_MS = 10 * 60 * 1000;

export interface ScanUi {
  scanning: boolean;
  progress: number;
  message: string;
  error: string | null;
  /** The finished scan, kept until the next start (for result summaries). */
  last: Scan | null;
  start: () => Promise<void>;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

export function useScan(scope: ScanScope, onFinished?: (scan: Scan) => void, pollMs = POLL_MS): ScanUi {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<Scan | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const cb = useRef(onFinished);
  cb.current = onFinished;

  useEffect(() => () => ctl.current?.abort(), []);

  const follow = useCallback(
    async (first: Scan, signal: AbortSignal) => {
      let scan = first;
      const t0 = Date.now();
      while (scan.state === 'queued' || scan.state === 'running') {
        setProgress(scan.progress ?? 0);
        setMessage(scan.message || 'Scanning');
        if (Date.now() - t0 > MAX_WAIT_MS) throw new ApiError(0, 'The scan is taking longer than expected. It keeps running; check back in a few minutes.', { network: false });
        await sleep(pollMs, signal);
        scan = await sm.job(scan.job_id, signal);
      }
      setProgress(100);
      setLast(scan);
      if (scan.state === 'error') {
        setError(scan.message || 'The scan failed.');
      } else {
        setMessage(scan.message);
      }
      cb.current?.(scan);
    },
    [pollMs]
  );

  const run = useCallback(
    async (getScan: (signal: AbortSignal) => Promise<Scan>) => {
      if (ctl.current) return;
      const c = new AbortController();
      ctl.current = c;
      setScanning(true);
      setError(null);
      setProgress(0);
      setMessage('Starting scan');
      setLast(null);
      try {
        await follow(await getScan(c.signal), c.signal);
      } catch (e) {
        if (!isAbortError(e)) setError(e instanceof Error ? e.message : 'The scan could not be started.');
      } finally {
        if (ctl.current === c) ctl.current = null;
        if (!c.signal.aborted) setScanning(false);
      }
    },
    [follow]
  );

  const start = useCallback(
    () =>
      run(async (signal) => {
        try {
          return (await sm.startScan(scope)).scan;
        } catch (e) {
          // 409: a scan for this brand is already queued/running. Follow it.
          const body = e instanceof ApiError && e.status === 409 ? (e.body as { job_id?: string } | null) : null;
          if (!body?.job_id) throw e;
          return sm.job(body.job_id, signal);
        }
      }),
    [scope, run]
  );

  // A scan started elsewhere (scheduler, another tab) is shown as running instead of letting a second start fail.
  useEffect(() => {
    const c = new AbortController();
    sm.scanStatus(c.signal)
      .then((s) => {
        if (s.running_job_id && !c.signal.aborted) void run((signal) => sm.job(s.running_job_id as string, signal));
      })
      .catch(() => {
        /* status is optional here: the start button still works */
      });
    return () => c.abort();
  }, [run]);

  return { scanning, progress, message, error, last, start };
}

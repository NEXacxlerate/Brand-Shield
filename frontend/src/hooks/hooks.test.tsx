import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useApi } from './useApi';
import { useLookalike } from './useLookalike';
import { useScan } from './useScan';
import { useMonitor } from './useMonitor';
import { jsonResponse, mockFetch, signIn } from '../test/helpers';

beforeEach(() => {
  localStorage.clear();
  signIn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useApi', () => {
  it('goes loading -> data, and reload keeps the old data while refreshing', async () => {
    let n = 0;
    const fn = vi.fn(async () => ({ n: ++n }));
    const { result } = renderHook(() => useApi(fn, []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));
    expect(result.current.loading).toBe(false);
    act(() => result.current.reload());
    expect(result.current.data).toEqual({ n: 1 });
    await waitFor(() => expect(result.current.data).toEqual({ n: 2 }));
  });

  it('exposes an ApiError and recovers on retry', async () => {
    mockFetch((_c, n) => (n === 1 ? jsonResponse(500, { detail: 'boom' }) : jsonResponse(200, { ok: true })));
    const { request } = await import('../api/client');
    const { result } = renderHook(() => useApi(() => request<{ ok: boolean }>('/api/x'), []));
    await waitFor(() => expect(result.current.error?.message).toBe('boom'));
    expect(result.current.data).toBeNull();
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toEqual({ ok: true }));
    expect(result.current.error).toBeNull();
  });

  it('cancels the request when the component unmounts and when deps change (a stale answer never wins)', async () => {
    const signals: AbortSignal[] = [];
    const fn = (s: AbortSignal) => {
      signals.push(s);
      return new Promise<string>(() => {});
    };
    const { rerender, unmount } = renderHook(({ k }) => useApi(fn, [k]), { initialProps: { k: 1 } });
    rerender({ k: 2 });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    unmount();
    expect(signals[1].aborted).toBe(true);
  });
});

describe('useLookalike (live matcher)', () => {
  it('debounces: only the last keystroke reaches the server, earlier calls are cancelled', async () => {
    vi.useFakeTimers();
    const { calls } = mockFetch(() => jsonResponse(200, { input: 'x', verdict: 'flagged', headline: 'h', explanation: 'e', reasons: [], normalization: [], match_percent: 90 }));
    const { result, rerender } = renderHook(({ v }) => useLookalike(v, true, 350), { initialProps: { v: 'a' } });
    rerender({ v: 'ac' });
    rerender({ v: 'acm' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(calls).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ name: 'acm' });
    expect(result.current.result?.verdict).toBe('flagged');
  });

  it('does not call the server for an empty input', async () => {
    vi.useFakeTimers();
    const { calls } = mockFetch(() => jsonResponse(200, {}));
    const { result } = renderHook(() => useLookalike('   ', true, 10));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(calls).toHaveLength(0);
    expect(result.current.result).toBeNull();
  });

  it('surfaces a server error', async () => {
    vi.useFakeTimers();
    mockFetch(() => jsonResponse(404, { detail: 'No brand profile yet. Create one first.' }));
    const { result } = renderHook(() => useLookalike('acme', true, 10));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.error?.status).toBe(404);
  });
});

const scanObj = (over: Record<string, unknown>) => ({
  id: 1,
  job_id: 'job_1',
  scope: 'all',
  status: 'running',
  state: 'running',
  progress: 40,
  message: 'Collected 17 candidates',
  steps: [],
  result: null,
  source_report: [],
  errors: [],
  ...over,
});

describe('useScan', () => {
  it('starts a scan, polls the job with progress, and reports the finished scan', async () => {
    const done = vi.fn();
    let jobCalls = 0;
    mockFetch((c) => {
      const path = c.url.replace(/^.*\/api/, '');
      if (path === '/scan/status') return jsonResponse(200, { running_job_id: null });
      if (path === '/scan') return jsonResponse(202, { job_id: 'job_1', scan_id: 1, status: 'queued', scan: scanObj({ state: 'queued', progress: 0 }) });
      jobCalls++;
      return jobCalls < 2
        ? jsonResponse(200, scanObj({ progress: 60 }))
        : jsonResponse(200, scanObj({ state: 'done', status: 'completed', progress: 100, message: 'Scan finished', result: { new_detections: 3, sources_online: 8, sources_checked: 8, accounts_or_apps_checked: 17, partial_sources: [], unavailable_sources: [], finished_at: 'x' } }));
    });
    const { result } = renderHook(() => useScan('all', done, 5));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.scanning).toBe(false);
    expect(result.current.progress).toBe(100);
    expect(result.current.last?.result?.new_detections).toBe(3);
    expect(result.current.error).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
    expect(jobCalls).toBeGreaterThanOrEqual(2);
  });

  it('accepts a scan that is already finished in the POST response (inline executor, e.g. on Vercel) without polling', async () => {
    const done = vi.fn();
    let jobCalls = 0;
    mockFetch((c) => {
      const path = c.url.replace(/^.*\/api/, '');
      if (path === '/scan/status') return jsonResponse(200, { running_job_id: null });
      if (path === '/scan') return jsonResponse(202, { job_id: 'job_1', scan_id: 1, status: 'completed', scan: scanObj({ state: 'done', status: 'completed', progress: 100, message: 'Scan finished' }) });
      jobCalls++;
      return jsonResponse(200, scanObj({ state: 'done', status: 'completed', progress: 100 }));
    });
    const { result } = renderHook(() => useScan('all', done, 5));
    await act(async () => {
      await result.current.start();
    });
    expect(jobCalls).toBe(0);
    expect(result.current.scanning).toBe(false);
    expect(result.current.progress).toBe(100);
    expect(result.current.error).toBeNull();
    expect(result.current.last?.state).toBe('done');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('attaches to the running scan on 409 instead of failing', async () => {
    mockFetch((c) => {
      const path = c.url.replace(/^.*\/api/, '');
      if (path === '/scan/status') return jsonResponse(200, { running_job_id: null });
      if (path === '/scan') return jsonResponse(409, { detail: 'A scan is already running', job_id: 'job_9', scan_id: 9 });
      return jsonResponse(200, scanObj({ job_id: 'job_9', state: 'done', status: 'partial', progress: 100, message: 'Scan finished with some sources unavailable.' }));
    });
    const { result } = renderHook(() => useScan('social', undefined, 5));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.last?.status).toBe('partial');
  });

  it('shows a failed scan as an error', async () => {
    mockFetch((c) => {
      const path = c.url.replace(/^.*\/api/, '');
      if (path === '/scan/status') return jsonResponse(200, { running_job_id: null });
      return jsonResponse(202, { job_id: 'job_1', scan_id: 1, status: 'failed', scan: scanObj({ state: 'error', status: 'failed', progress: 100, message: 'Every active source was unavailable.' }) });
    });
    const { result } = renderHook(() => useScan('all', undefined, 5));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error).toBe('Every active source was unavailable.');
  });

  it('surfaces a start failure such as 403 for a viewer', async () => {
    mockFetch((c) => (c.url.endsWith('/scan/status') ? jsonResponse(200, { running_job_id: null }) : jsonResponse(403, { detail: 'Your role cannot do that' })));
    const { result } = renderHook(() => useScan('all', undefined, 5));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error).toBe('Your role cannot do that');
    expect(result.current.scanning).toBe(false);
  });
});

const row = (id: number, status = 'new') => ({
  id, category: 'social', type: 'scam_account', platform: 'x', name: `n${id}`, handle: `@h${id}`, package_id: null, publisher: null, profile_url: null,
  score: 90 - id, risk_band: 'high', status, summary: '', tags: [], found_at: '2026-10-12T10:00:00Z', last_seen_at: '2026-10-12T10:00:00Z', stale: false, source: 'sample',
});
const listBody = (rows: ReturnType<typeof row>[]) => ({
  total: rows.length, limit: 200, offset: 0, data_mode: 'sample', is_sample: true,
  counts: { all: rows.length, by_type: {}, by_platform: {}, by_status: {}, by_band: {} }, items: rows,
});
const detailBody = (id: number, status = 'new') => ({ ...row(id, status), reasons: [], evidence: { page_url: null, captured_at: null, sha256: null, snapshot_url: null, screenshot_url: null, screenshot_sha256: null }, notes: [], history: [], official: null });

describe('useMonitor: optimistic actions', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

  function server(opts: { statusFails?: boolean; markFails?: boolean }) {
    return mockFetch((c) => {
      const path = c.url.replace(/^.*\/api/, '').split('?')[0];
      if (path === '/detections' ) return jsonResponse(200, listBody([row(1), row(2)]));
      if (path === '/detections/excluded' || path === '/detections/false-positives') return jsonResponse(200, { total: 0, items: [] });
      if (path === '/sources') return jsonResponse(200, { data_mode: 'sample', items: [], summary: {} });
      if (path === '/scan/status') return jsonResponse(200, { running_job_id: null });
      if (path === '/detections/1/status') return opts.statusFails ? jsonResponse(403, { detail: 'Your role cannot review detections' }) : jsonResponse(200, { ...detailBody(1, 'confirmed'), audit_id: 5 });
      if (path === '/detections/1/mark-official') return opts.markFails ? jsonResponse(422, { detail: 'A third-party APK listing is never official' }) : jsonResponse(200, { detection: detailBody(1, 'marked_official'), allowlist_entry: { kind: 'account', id: 1 }, official_assets: 3 });
      if (path === '/me') return jsonResponse(200, { id: 1, name: 'x', email: 'x@y.z', role: 'admin', default_brand_id: 1 });
      if (path.startsWith('/detections/')) return jsonResponse(200, detailBody(Number(path.split('/')[2])));
      return jsonResponse(404, { detail: 'nope' });
    });
  }

  it('confirm: the row flips at once and stays confirmed when the server agrees', async () => {
    server({});
    const { result } = renderHook(() => useMonitor('social'), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    await waitFor(() => expect(result.current.detail.data?.id).toBe(1));
    await act(async () => {
      await result.current.review(1, 'confirmed');
    });
    expect(result.current.items.find((r) => r.id === 1)?.status).toBe('confirmed');
    expect(result.current.actionError).toBeNull();
  });

  it('confirm: rolls back the row and the detail and shows the server error when the server refuses', async () => {
    server({ statusFails: true });
    const { result } = renderHook(() => useMonitor('social'), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    await waitFor(() => expect(result.current.detail.data?.id).toBe(1));
    await act(async () => {
      await result.current.review(1, 'confirmed');
    });
    expect(result.current.items.find((r) => r.id === 1)?.status).toBe('new');
    expect(result.current.detail.data?.status).toBe('new');
    expect(result.current.actionError).toBe('Your role cannot review detections');
  });

  it('mark as official: the row leaves the list; if the server refuses it comes back with the error', async () => {
    server({ markFails: true });
    const { result } = renderHook(() => useMonitor('social'), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    let p: Promise<void>;
    act(() => {
      p = result.current.markOfficial(1);
    });
    expect(result.current.items.map((r) => r.id)).toEqual([2]); // optimistic
    await act(async () => {
      await p;
    });
    expect(result.current.items.map((r) => r.id)).toEqual([1, 2]); // rolled back
    expect(result.current.actionError).toBe('A third-party APK listing is never official');
  });
});

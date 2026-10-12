import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SourceHealthPage } from './SourceHealthPage';
import { SourcesBar } from '../components/monitor/MonitorParts';
import { resetBrand } from '../hooks/useBrand';
import { jsonResponse, mockFetch, signIn, USER } from '../test/helpers';

const src = (over: Record<string, unknown>) => ({
  id: 1, slug: 'instagram', name: 'Instagram', kind: 'social', description: 'Public profile and page search', status: 'online', monitored: true,
  message: 'Working normally.', last_sync_at: '2026-10-12T11:58:00Z', detail: '214 profiles checked', retry_in_minutes: null, next_retry_at: null,
  stale_since: null, cached_at: null, cached_age_seconds: null, collectors: ['tavily'], source: 'live', ...over,
});

const list = (items: ReturnType<typeof src>[]) => ({
  data_mode: 'live', is_sample: false, requested_data_mode: 'auto',
  summary: { online: items.filter((i) => i.status === 'online').length, slow: items.filter((i) => i.status === 'slow').length, unavailable: items.filter((i) => i.status === 'unavailable').length, total: items.length, next_scan_at: '2026-10-12T12:10:00Z', schedule: '5m', last_full_sync_at: '2026-10-12T12:05:00Z', retry_policy: '1m,5m,15m,1h,6h' },
  items,
  tavily_credits: { provider: 'tavily', month: '2026-10', used: 12, budget: 900, remaining: 888, reported_used: 15 },
});

beforeEach(() => {
  localStorage.clear();
  signIn();
  resetBrand();
});
afterEach(() => vi.unstubAllGlobals());

function server(opts: { retryStatus?: number; patchStatus?: number } = {}) {
  const slow = src({ id: 4, slug: 'telegram', name: 'Telegram', status: 'slow', message: 'Rate limited. Partial results are kept.', next_retry_at: '2026-10-12T12:15:00Z' });
  const down = src({ id: 7, slug: 'app_store', name: 'Apple App Store', kind: 'store', status: 'unavailable', message: 'The store could not be reached.', cached_at: '2026-10-12T09:40:00Z', cached_age_seconds: 7200 });
  return mockFetch((c) => {
    const path = c.url.replace(/^.*\/api/, '').split('?')[0];
    const method = c.init.method || 'GET';
    if (path === '/me') return jsonResponse(200, USER);
    if (path.startsWith('/brands/')) return jsonResponse(200, { id: 1, name: 'Acme Bank', official_assets: 3 });
    if (path === '/sources') return jsonResponse(200, list([src({}), slow, down]));
    if (path === '/scans') return jsonResponse(200, { total: 0, items: [] });
    if (path === '/sources/4/retry' && method === 'POST') {
      return opts.retryStatus ? jsonResponse(opts.retryStatus, { detail: 'Nothing to retry: the source is online' }) : jsonResponse(202, { job_id: 'retry_1', source_id: 4, state: 'done', status: 'online', source: { ...slow, status: 'online', message: 'Working normally.', next_retry_at: null } });
    }
    if (path === '/sources/1' && method === 'PATCH') return opts.patchStatus ? jsonResponse(opts.patchStatus, { detail: 'Your role cannot change sources' }) : jsonResponse(200, { ...src({}), monitored: false });
    return jsonResponse(404, { detail: 'nope' });
  });
}

describe('SourceHealthPage', () => {
  it('shows status counts, the real next scan, cached age, and the credit meter from the API', async () => {
    server();
    render(<MemoryRouter><SourceHealthPage /></MemoryRouter>);
    expect(await screen.findByTestId('kpi-online')).toHaveTextContent('1');
    expect(screen.getByText('of 3 sources')).toBeInTheDocument();
    expect(screen.getByText(/cached 2 hours ago/)).toBeInTheDocument();
    expect(screen.getByTestId('credit-meter')).toHaveTextContent('15 of 900 credits used'); // the larger of ours and Tavily's own count
    expect(screen.getByText(/Checked every 5 minutes/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retry now' })).toHaveLength(2); // only slow and unavailable sources
  });

  it('retry calls the server, then shows the new status', async () => {
    const { calls } = server();
    render(<MemoryRouter><SourceHealthPage /></MemoryRouter>);
    const user = userEvent.setup();
    const retry = (await screen.findAllByRole('button', { name: 'Retry now' }))[0];
    await user.click(retry);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/sources/4/retry') && c.init.method === 'POST')).toBe(true));
    expect(await screen.findByText(/Telegram: retry finished, source is online/)).toBeInTheDocument();
  });

  it('shows the server message when a retry is refused', async () => {
    server({ retryStatus: 409 });
    render(<MemoryRouter><SourceHealthPage /></MemoryRouter>);
    await userEvent.setup().click((await screen.findAllByRole('button', { name: 'Retry now' }))[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing to retry: the source is online');
  });

  it('monitor toggle is optimistic and rolls back with the error when the server refuses', async () => {
    server({ patchStatus: 403 });
    render(<MemoryRouter><SourceHealthPage /></MemoryRouter>);
    const box = await screen.findByLabelText('Monitor Instagram');
    expect(box).toBeChecked();
    await userEvent.setup().click(box);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role cannot change sources');
    await waitFor(() => expect(screen.getByLabelText('Monitor Instagram')).toBeChecked());
  });
});

describe('SourcesBar (Social and App Store pages)', () => {
  it('shows a warning with the server message, cached time and a working Retry for an unavailable store', async () => {
    const { calls } = server();
    const down = src({ id: 4, slug: 'telegram', name: 'Telegram', status: 'unavailable', message: 'The store could not be reached.', cached_at: '2026-10-12T09:40:00Z' });
    const onRetried = vi.fn();
    render(
      <MemoryRouter>
        <SourcesBar variant="apps" state={{ data: { items: [src({}), down] } as never, loading: false, error: null, reload: () => {} }} onRetried={onRetried} />
      </MemoryRouter>
    );
    expect(screen.getByText(/Telegram · unavailable/)).toBeInTheDocument();
    expect(screen.getByTestId('source-warning')).toHaveTextContent('The store could not be reached.');
    expect(screen.getByTestId('source-warning')).toHaveTextContent('Cached results from');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onRetried).toHaveBeenCalled());
    expect(calls.some((c) => c.url.endsWith('/api/sources/4/retry'))).toBe(true);
  });

  it('shows no warning when every source is online', () => {
    render(
      <MemoryRouter>
        <SourcesBar variant="social" state={{ data: { items: [src({})] } as never, loading: false, error: null, reload: () => {} }} onRetried={() => {}} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('source-warning')).not.toBeInTheDocument();
  });
});

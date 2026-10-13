import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { InvestigationsPage } from './InvestigationsPage';
import { resetBrand } from '../hooks/useBrand';
import { jsonResponse, mockFetch, signIn, USER } from '../test/helpers';

const row = (over: Record<string, unknown> = {}) => ({
  id: 7, category: 'web', type: 'lookalike_domain', platform: 'web', name: 'acmebank-login.test', handle: 'acmebank-login.test', package_id: null, publisher: null,
  profile_url: null, score: 82, risk_band: 'high', severity: 'HIGH', resolution: null, status: 'new', summary: 'Look-alike domain', tags: [], found_at: '2026-10-12T11:00:00Z',
  last_seen_at: '2026-10-12T11:00:00Z', stale: false, source: 'live', ...over,
});

beforeEach(() => {
  localStorage.clear();
  signIn();
  resetBrand();
});
afterEach(() => vi.unstubAllGlobals());

describe('InvestigationsPage', () => {
  it('saves a resolution through the API and shows it', async () => {
    let resolution: string | null = null;
    const { calls } = mockFetch((c) => {
      const path = c.url.replace(/^.*\/api/, '').split('?')[0];
      if (path === '/me') return jsonResponse(200, USER);
      if (path.startsWith('/brands')) return jsonResponse(200, { id: 1, name: 'Acme Bank', official_assets: 1 });
      if (path === '/detections') return jsonResponse(200, { total: 1, limit: 200, offset: 0, counts: {}, items: [row({ resolution })] });
      if (path === '/detections/7/resolution') {
        resolution = JSON.parse(String(c.init.body)).resolution;
        return jsonResponse(200, { ...row({ resolution }), history: [], reasons: [], notes: [], audit_id: 1 });
      }
      if (path === '/detections/7') return jsonResponse(200, { ...row({ resolution }), history: [], reasons: [], notes: [], evidence: {} });
      return jsonResponse(404, { detail: 'nope' });
    });
    render(<MemoryRouter><InvestigationsPage /></MemoryRouter>);
    expect(await screen.findByTestId('case-detail')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Resolution' }), 'false_positive');
    await userEvent.click(screen.getByRole('button', { name: 'Save resolution' }));
    await waitFor(() => expect(screen.getByTestId('case-resolution')).toHaveTextContent(/false positive/i));
    expect(calls.some((c) => c.url.includes('/detections/7/resolution') && c.init.method === 'POST')).toBe(true);
  });

  it('shows an empty state when nothing matches', async () => {
    mockFetch((c) => {
      const path = c.url.replace(/^.*\/api/, '').split('?')[0];
      if (path === '/me') return jsonResponse(200, USER);
      if (path.startsWith('/brands')) return jsonResponse(200, { id: 1, name: 'Acme Bank', official_assets: 1 });
      return jsonResponse(200, { total: 0, limit: 200, offset: 0, counts: {}, items: [] });
    });
    render(<MemoryRouter><InvestigationsPage /></MemoryRouter>);
    expect(await screen.findByText(/No detections match/)).toBeInTheDocument();
  });
});

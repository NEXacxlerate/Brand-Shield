import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WebThreatsPage } from './WebThreatsPage';
import { resetBrand } from '../hooks/useBrand';
import { jsonResponse, mockFetch, signIn, USER } from '../test/helpers';

const parts = (over: Record<string, unknown> = {}) => ({
  ok: true, hostname: 'zenithpay.net', hostname_unicode: 'zenithpay.net', subdomain_labels: [], subdomain: '', registrable_domain: 'zenithpay.net',
  registrable_unicode: 'zenithpay.net', domain_label: 'zenithpay', tld: 'net', is_idn: false, punycode: null, port: null, has_credentials: false,
  is_ip: false, scheme: 'http', warnings: [], ...over,
});
const result = (over: Record<string, unknown> = {}) => ({
  input: 'zenithpay.net', brand: 'Zenith Pay', verdict: 'lookalike', verdict_label: 'Look-alike domain', headline: 'Look-alike of Zenith Pay: zenithpay.net is not an official domain',
  explanation: 'The real registrable domain is not on your list.', official_domains: ['zenithpay.com'], has_official_domains: true, compared_with: 'zenithpay.com',
  parts: parts(), techniques: ['Top-level domain swap'], score: 40, name_match_percent: 100, reasons: [{ signal: 'domain_similarity', points: 40, note: 'Same name, other TLD.' }],
  reputation_checked: false, reputation_note: 'Reputation (Google Safe Browsing) is NOT checked here.', ...over,
});
const examples = (over: Record<string, unknown> = {}) => ({
  brand: 'Zenith Pay', official_domain: 'zenithpay.com', derived: false, note: null,
  items: [
    { input: 'zenithpay.com', expected: 'official', technique: 'The official domain itself' },
    { input: 'zenithpay.net', expected: 'lookalike', technique: 'Top-level domain swap' },
    { input: 'zenithbakery.com', expected: 'unrelated', technique: 'Another business' },
  ], ...over,
});

function server(opts: { domains?: string[]; ex?: Record<string, unknown> } = {}) {
  const domains = opts.domains ?? ['zenithpay.com'];
  return mockFetch((c) => {
    const path = c.url.replace(/^.*\/api/, '').split('?')[0];
    if (path === '/me') return jsonResponse(200, USER);
    if (path.startsWith('/brands/')) return jsonResponse(200, { id: 1, name: 'Zenith Pay', domains, aliases: [], keywords: [], official_assets: 1 });
    if (path === '/lookalike/test-urls') return jsonResponse(200, examples(opts.ex));
    if (path === '/lookalike/test-url') {
      const url = JSON.parse(String(c.init.body)).url as string;
      if (url === 'zenithpay.com') return jsonResponse(200, result({ input: url, verdict: 'official', headline: 'Official: zenithpay.com is a registered domain of Zenith Pay', techniques: [], reasons: [] }));
      if (url === 'zenithbakery.com') return jsonResponse(200, result({ input: url, verdict: 'unrelated', headline: 'No look-alike signal', techniques: [], reasons: [] }));
      return jsonResponse(200, result({ input: url }));
    }
    if (path === '/detections') return jsonResponse(200, { total: 0, items: [] });
    return jsonResponse(404, { detail: 'nope' });
  });
}

const renderPage = () => render(<MemoryRouter><WebThreatsPage /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  signIn();
  resetBrand();
});
afterEach(() => vi.unstubAllGlobals());

describe('WebThreatsPage lab', () => {
  it('compares against the registered brand and shows a look-alike result with parts and techniques', async () => {
    server();
    renderPage();
    expect(await screen.findByTestId('compare-target')).toHaveTextContent('Comparing against: Zenith Pay · official domains: zenithpay.com');
    expect(await screen.findByTestId('verdict-chip')).toHaveTextContent('Look-alike domain');
    expect(screen.getByTestId('technique')).toHaveTextContent('Top-level domain swap');
    expect(screen.getByTestId('host-parts')).toHaveTextContent('zenithpay.net');
    expect(screen.getByTestId('reasons')).toHaveTextContent('Same name, other TLD.');
    expect(screen.getByText(/NOT checked here/)).toBeInTheDocument();
    expect(document.body.textContent?.toLowerCase()).not.toContain('acme');
  });

  it('runs a typed lookalike through the API and N of M examples', async () => {
    const { calls } = server();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: 'zenithbakery.com' }); // examples loaded (they seed the first input)
    const input = await screen.findByLabelText(/Domain or URL/);
    await user.clear(input);
    await user.type(input, 'zenithpay.com');
    await waitFor(() => expect(screen.getByTestId('verdict-chip')).toHaveTextContent('Official domain'));
    expect(calls.some((c) => c.url.endsWith('/lookalike/test-url') && String(c.init.body).includes('zenithpay.com'))).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Run examples' }));
    await waitFor(() => expect(screen.getByTestId('pass-rate')).toHaveTextContent('3 of 3 pass'));
  });

  it('shows an honest empty state when no official domain is registered', async () => {
    server({ domains: [], ex: { derived: true, note: 'No official domain is registered, so zenithpay.com was derived from the brand name.' } });
    renderPage();
    expect(await screen.findByText(/No official domain is registered for Zenith Pay/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add your official domains in Brand Registry/ })).toHaveAttribute('href', '/brand');
    expect(await screen.findByText(/was derived from the brand name/)).toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LogoCompareCard } from './LogoCompareCard';
import type { Brand } from '../../api/types';
import { jsonResponse, mockFetch, signIn } from '../../test/helpers';

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const png = (name = 'logo.png') => new File([new Uint8Array([...PNG_HEAD, 1, 2, 3])], name, { type: 'image/png' });

const brand = (over: Record<string, unknown> = {}) =>
  ({
    id: 1, name: 'Zenith Pay', industry: '', aliases: [], keywords: [], domains: [], official_accounts: [], official_apps: [], official_assets: 1,
    updated_at: '', source: 'live', profile_health: { percent: 0, message: '', checks: [], missing: [] }, allowlist: { accounts: 0, apps: 0, domains: 0 },
    logo: { url: '/api/brands/1/logo', format: 'png', width: 300, height: 300, size_bytes: 10, square: true, meets_requirements: true, sha256: 'a' },
    extra_logos: [{ id: 7, label: 'Dark mark', url: '', format: 'png', width: 300, height: 300, size_bytes: 10, sha256: 'b' }],
    ...over,
  }) as unknown as Brand;

const algos = { phash: 96, dhash: 90, whash: 88, colorhash: 70 };
const result = (over: Record<string, unknown> = {}) => ({
  similarity: 93.4, verdict: 'same_logo', algorithm: 'image-1', mode: 'official', best: { id: 'primary', label: 'Primary logo' }, algorithms: algos,
  results: [
    { id: 'primary', label: 'Primary logo', similarity: 93.4, verdict: 'same_logo', width: 300, height: 300, algorithms: algos },
    { id: '7', label: 'Dark mark', similarity: 20, verdict: 'different', width: 300, height: 300, algorithms: algos },
  ],
  candidate: { width: 300, height: 300 }, thresholds: { same_logo: 90, very_similar: 80, somewhat_similar: 55 },
  explanation: 'Hash similarity is a risk signal, not proof of reuse.', warnings: ['The candidate logo is very small (40 x 40 px).'], is_sample: false, sample_note: null, ...over,
});

function server(opts: { compare?: () => Response } = {}) {
  return mockFetch((c) => {
    const path = c.url.replace(/^.*\/api/, '').split('?')[0];
    if (path === '/brands/1/logo' || path === '/brands/1/logos/7/file') return new Response('x', { status: 200, headers: { 'Content-Type': 'image/png' } }); // a plain body: Node 22 (CI) does not accept jsdom's Blob here
    if (path === '/lookalike/test-logo') return opts.compare ? opts.compare() : jsonResponse(200, result());
    if (path === '/brands/1/logos') return jsonResponse(201, { id: 9, label: 'Added', url: '', format: 'png', width: 300, height: 300, size_bytes: 1, sha256: 'c' });
    if (path === '/brands/1') return jsonResponse(200, brand());
    return jsonResponse(404, { detail: 'nope' });
  });
}

const renderCard = (b: Brand | null = brand(), canWrite = true) =>
  render(<MemoryRouter><LogoCompareCard brand={b} missing={false} canWrite={canWrite} /></MemoryRouter>);

let created: string[] = [];
let revoked: string[] = [];
beforeEach(() => {
  localStorage.clear();
  signIn();
  created = [];
  revoked = [];
  let n = 0;
  URL.createObjectURL = vi.fn(() => {
    const u = `blob:test/${++n}`;
    created.push(u);
    return u;
  });
  URL.revokeObjectURL = vi.fn((u: string) => {
    revoked.push(u);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('LogoCompareCard', () => {
  it('shows the official logo thumbnails fetched with the Bearer header', async () => {
    const { calls } = server();
    renderCard();
    expect(await screen.findByAltText('Primary logo')).toBeInTheDocument();
    expect(await screen.findByAltText('Dark mark')).toBeInTheDocument();
    expect(screen.getByText('Official logos you are comparing against')).toBeInTheDocument();
    const logoCalls = calls.filter((c) => /\/brands\/1\/logo/.test(c.url));
    expect(logoCalls.length).toBe(2);
    logoCalls.forEach((c) => expect((c.init.headers as Record<string, string>).Authorization).toBe('Bearer access-1'));
  });

  it('keeps Compare disabled until a logo is chosen, then shows the result', async () => {
    const { calls } = server();
    renderCard();
    const btn = screen.getByRole('button', { name: 'Compare' });
    expect(btn).toBeDisabled();
    await userEvent.upload(screen.getByTestId('lc-candidate'), png());
    await waitFor(() => expect(btn).toBeEnabled());
    await userEvent.click(btn);
    expect(await screen.findByTestId('lc-score')).toHaveTextContent('93%');
    expect(screen.getByTestId('lc-verdict')).toHaveTextContent('Same logo');
    expect(screen.getByTestId('lc-table')).toHaveTextContent('Dark mark');
    expect(screen.getByTestId('lc-warnings')).toHaveTextContent('very small');
    expect(screen.getByText(/not proof of reuse/)).toBeInTheDocument();
    const post = calls.find((c) => c.url.includes('/lookalike/test-logo'))!;
    expect(post.init.method).toBe('POST');
    expect((post.init.body as FormData).has('reference')).toBe(false);
  });

  it('shows the server message for a rejected file', async () => {
    server({ compare: () => jsonResponse(415, { detail: 'The logo is not a valid PNG, JPEG or WebP picture' }) });
    renderCard();
    await userEvent.upload(screen.getByTestId('lc-candidate'), png());
    await userEvent.click(await screen.findByRole('button', { name: 'Compare' }));
    expect(await screen.findByText('The logo is not a valid PNG, JPEG or WebP picture')).toBeInTheDocument();
  });

  it('refuses a wrong type before uploading', async () => {
    const { calls } = server();
    renderCard();
    const bad = new File([new Uint8Array([0x3c, 0x73, 0x76, 0x67])], 'x.svg', { type: 'image/svg+xml' });
    await userEvent.upload(screen.getByTestId('lc-candidate'), bad, { applyAccept: false });
    expect(await screen.findByText(/must be a PNG, JPEG or WebP/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('test-logo'))).toBe(false);
  });

  it('shows the empty state when the brand has no logo', () => {
    server();
    renderCard(brand({ logo: null, extra_logos: [] }));
    expect(screen.getByTestId('lc-empty')).toHaveTextContent('Add an official logo in Brand Registry or upload a reference logo.');
    expect(screen.getByRole('link', { name: 'Brand Registry' })).toHaveAttribute('href', '/brand');
  });

  it('offers to add a manual reference as an official logo (writers only)', async () => {
    const { calls } = server({ compare: () => jsonResponse(200, result({ mode: 'manual', best: { id: 'manual', label: 'Manual reference' }, results: [] })) });
    renderCard();
    await userEvent.click(screen.getByTestId('lc-use-ref'));
    await userEvent.upload(screen.getByTestId('lc-candidate'), png('a.png'));
    await userEvent.upload(screen.getByTestId('lc-reference'), png('b.png'));
    await userEvent.click(await screen.findByRole('button', { name: 'Compare' }));
    const post = calls.find((c) => c.url.includes('/lookalike/test-logo'))!;
    await waitFor(() => expect((post.init.body as FormData).has('reference')).toBe(true));
    await userEvent.click(await screen.findByRole('button', { name: 'Add this reference as an official logo' }));
    expect(await screen.findByText(/Added to your official logos/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/brands/1/logos') && c.init.method === 'POST')).toBe(true);
  });

  it('hides the add-as-official button for viewers', async () => {
    server({ compare: () => jsonResponse(200, result({ mode: 'manual', best: { id: 'manual', label: 'Manual reference' }, results: [] })) });
    renderCard(brand(), false);
    await userEvent.click(screen.getByTestId('lc-use-ref'));
    await userEvent.upload(screen.getByTestId('lc-candidate'), png('a.png'));
    await userEvent.upload(screen.getByTestId('lc-reference'), png('b.png'));
    await userEvent.click(await screen.findByRole('button', { name: 'Compare' }));
    expect(await screen.findByTestId('lc-result')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add this reference as an official logo' })).toBeNull();
  });

  it('revokes object URLs on unmount', async () => {
    server();
    const { unmount } = renderCard();
    await screen.findByAltText('Primary logo');
    await userEvent.upload(screen.getByTestId('lc-candidate'), png());
    await waitFor(() => expect(created.length).toBeGreaterThanOrEqual(3));
    unmount();
    expect(revoked.sort()).toEqual([...created].sort());
  });
});

describe('LogoCompareCard AI vision (CLIP)', () => {
  const clipResult = () =>
    result({
      method: 'clip+hash',
      clip: { available: true, cosine: 0.9954, score: 98.5, model: 'Qdrant/clip-ViT-B-32-vision' },
      similarity: 98.5,
      results: [
        { id: 'primary', label: 'Primary logo', similarity: 98.5, hash_similarity: 96, clip: { cosine: 0.9954, score: 98.5 }, verdict: 'same_logo', width: 300, height: 300, algorithms: algos },
        { id: '7', label: 'Dark mark', similarity: 12, hash_similarity: 20, clip: { cosine: 0.7, score: 12 }, verdict: 'different', width: 300, height: 300, algorithms: algos },
      ],
    });
  const fetchWith = (engine: Record<string, unknown>, compare: () => Response) =>
    mockFetch((c) => {
      const path = c.url.replace(/^.*\/api/, '').split('?')[0];
      if (path === '/brands/1/logo' || path === '/brands/1/logos/7/file') return new Response('x', { status: 200, headers: { 'Content-Type': 'image/png' } }); // a plain body: Node 22 (CI) does not accept jsdom's Blob here
      if (path === '/lookalike/logo-engine') return jsonResponse(200, engine);
      if (path === '/lookalike/test-logo') return compare();
      return jsonResponse(404, { detail: 'nope' });
    });
  const run = async () => {
    await userEvent.upload(screen.getByTestId('lc-candidate'), png());
    const btn = screen.getByRole('button', { name: 'Compare' });
    await waitFor(() => expect(btn).toBeEnabled());
    await userEvent.click(btn);
  };

  it('shows the CLIP bar first, the driver note and a CLIP column', async () => {
    fetchWith({ available: true, reason: null, model: 'm', mode: 'auto', cached: true, hint: null }, () => jsonResponse(200, clipResult()));
    renderCard();
    await run();
    const row = await screen.findByTestId('lc-clip-row');
    expect(row).toHaveTextContent('AI vision (CLIP)');
    expect(row).toHaveTextContent('99');
    const algos = row.parentElement!;
    expect(algos.firstElementChild).toBe(row);
    expect(screen.getByTestId('lc-uses')).toHaveTextContent('Score uses: AI vision + fingerprints');
    expect(screen.getByText('AI vision', { selector: 'th' })).toBeInTheDocument();
    expect(screen.getAllByTestId('lc-clip-cell').map((e) => e.textContent)).toEqual(['99%', '12%']);
    expect(screen.queryByTestId('lc-clip-hint')).toBeNull();
  });

  it('shows the loading note while the first comparison runs', async () => {
    let release: (r: Response) => void = () => undefined;
    const gate = new Promise<Response>((r) => (release = r));
    mockFetch(async (c) => {
      const path = c.url.replace(/^.*\/api/, '').split('?')[0];
      if (path === '/lookalike/logo-engine') return jsonResponse(200, { available: true, reason: null, model: 'm', mode: 'auto', cached: false, hint: null });
      if (path === '/lookalike/test-logo') return gate;
      return new Response('x', { status: 200, headers: { 'Content-Type': 'image/png' } }); // a plain body: Node 22 (CI) does not accept jsdom's Blob here
    });
    renderCard();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled());
    await userEvent.upload(screen.getByTestId('lc-candidate'), png());
    await userEvent.click(await screen.findByRole('button', { name: 'Compare' }));
    expect(await screen.findByTestId('lc-loading')).toHaveTextContent('up to half a minute');
    release(jsonResponse(200, clipResult()));
    await screen.findByTestId('lc-result');
    expect(screen.queryByTestId('lc-loading')).toBeNull();
  });

  it('shows an install hint and no CLIP bar or column when CLIP is unavailable', async () => {
    const hint = 'pip install fastembed (or: pip install -r requirements-extra.txt).';
    fetchWith({ available: false, reason: 'not_installed', model: 'm', mode: 'auto', cached: false, hint }, () =>
      jsonResponse(200, result({ method: 'hash', clip: { available: false, reason: 'not_installed', hint } })),
    );
    renderCard();
    expect(await screen.findByTestId('lc-clip-hint')).toHaveTextContent('pip install fastembed');
    await run();
    await screen.findByTestId('lc-result');
    expect(screen.queryByTestId('lc-clip-row')).toBeNull();
    expect(screen.queryByTestId('lc-clip-cell')).toBeNull();
    expect(screen.getByTestId('lc-uses')).toHaveTextContent('fingerprints only');
    expect(screen.getByTestId('lc-clip-hint')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /install/i })).toBeNull();
  });
});

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { buildPayload, checkLogoMeta, deriveAliases, deriveKeywords, fitSquare, mapFieldErrors, normalizeDomain, registerBrand, type BrandForm } from './brandshield';
import { json, putSession, setLocks } from '../test/helpers';

describe('derivations', () => {
  it('derives name variants without the name itself, deduplicated and capped', () => {
    expect(deriveAliases('Acme Bank')).toEqual(['acmebank', 'acme-bank', 'acme_bank', 'acme']);
    expect(deriveAliases('Acme')).toEqual([]);
    expect(deriveAliases('  ')).toEqual([]);
    expect(deriveAliases('A B C D E F G H I J K', 3).length).toBeLessThanOrEqual(3);
    expect(new Set(deriveAliases('Nova Pay Plus')).size).toBe(deriveAliases('Nova Pay Plus').length);
  });

  it('derives keywords from the name and tagline', () => {
    expect(deriveKeywords('Acme Bank', 'Banking made simple for you')).toEqual(['acmebank', 'acme', 'bank', 'banking', 'made', 'simple']);
  });

  it('normalizes domains', () => {
    expect(normalizeDomain('https://www.Acme-Bank.com/login?x=1')).toBe('acme-bank.com');
    expect(normalizeDomain('shop.acme.co.in')).toBe('shop.acme.co.in');
    expect(normalizeDomain('not a domain')).toBeNull();
    expect(normalizeDomain('localhost')).toBeNull();
  });
});

describe('logo rules', () => {
  const ok = { type: 'image/png', size: 100_000, width: 512, height: 512 };
  it('accepts a good logo as is', () => {
    expect(checkLogoMeta(ok)).toEqual({ usable: true, needsResize: false, notes: [] });
  });
  it('rejects other file types', () => {
    expect(checkLogoMeta({ ...ok, type: 'image/gif' }).usable).toBe(false);
    expect(checkLogoMeta({ ...ok, type: 'image/svg+xml' }).usable).toBe(false);
  });
  it('asks for a resize when too small, not square or too heavy, and explains why', () => {
    expect(checkLogoMeta({ ...ok, width: 200, height: 200 })).toMatchObject({ needsResize: true });
    const wide = checkLogoMeta({ ...ok, width: 800, height: 400 });
    expect(wide.needsResize).toBe(true);
    expect(wide.notes[0]).toMatch(/square/);
    expect(checkLogoMeta({ ...ok, size: 3 * 1024 * 1024 }).needsResize).toBe(true);
  });
  it('allows the 0.8..1.25 aspect band', () => {
    expect(checkLogoMeta({ ...ok, width: 400, height: 500 }).needsResize).toBe(false);
    expect(checkLogoMeta({ ...ok, width: 500, height: 400 }).needsResize).toBe(false);
    expect(checkLogoMeta({ ...ok, width: 500, height: 390 }).needsResize).toBe(true);
  });
  it('fits a picture into 512 x 512 centred without distortion', () => {
    expect(fitSquare(800, 400)).toEqual({ scale: 0.64, dw: 512, dh: 256, dx: 0, dy: 128 });
    expect(fitSquare(100, 100)).toMatchObject({ dw: 512, dh: 512, dx: 0, dy: 0 });
  });
});

describe('payload', () => {
  it('trims, de-duplicates, drops the name from aliases and omits an empty description', () => {
    const p = buildPayload({ name: ' Acme  Bank ', industry: 'Banking', description: '  ', aliases: ['acmebank', 'ACMEBANK', 'Acme Bank'], keywords: ['a', 'a'], domains: ['https://www.AcmeBank.com/x'] });
    expect(p).toEqual({ name: 'Acme Bank', industry: 'Banking', aliases: ['acmebank'], keywords: ['a'], domains: ['acmebank.com'] });
  });
  it('maps 422 fields to form fields', () => {
    expect(mapFieldErrors({ name: 'x', domains: 'y', file: 'z', body: 'q' })).toEqual({ name: 'x', domains: 'y', logo: 'z' });
  });
});

// --------------------------------------------------- registration + 409 flow ---
const form: BrandForm = { name: 'Acme Bank', industry: 'Banking', description: 'We bank.', aliases: ['acmebank'], keywords: ['acme'], domains: ['acmebank.com'] };
const logo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
const brand = { id: 7, name: 'Acme Bank', industry: 'Banking', aliases: ['acmebank'], keywords: ['acme'], domains: ['acmebank.com'] };

function mockApi(handlers: Record<string, () => Response>) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method || 'GET'} ${url}`;
    const h = handlers[key];
    if (!h) throw new Error(`unexpected call ${key}`);
    return h();
  });
  vi.stubGlobal('fetch', f);
  return f;
}
const calls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => `${(c[1] as RequestInit | undefined)?.method || 'GET'} ${c[0]}`);

beforeEach(() => { localStorage.clear(); putSession(); setLocks(undefined); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('registerBrand', () => {
  it('creates the brand, then uploads the logo as multipart', async () => {
    const f = mockApi({
      'POST /api/brands': () => json(brand, 201),
      'POST /api/brands/7/logo': () => json({ url: '/api/brands/7/logo' }),
    });
    const confirm = vi.fn();
    const out = await registerBrand(form, logo, confirm);
    expect(out).toMatchObject({ status: 'created', logo: { ok: true } });
    expect(confirm).not.toHaveBeenCalled();
    expect(calls(f)).toEqual(['POST /api/brands', 'POST /api/brands/7/logo']);
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ name: 'Acme Bank', industry: 'Banking', aliases: ['acmebank'], keywords: ['acme'], domains: ['acmebank.com'], description: 'We bank.' });
    expect((f.mock.calls[1][1] as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('on 409 asks for confirmation; "no" changes nothing', async () => {
    const f = mockApi({
      'POST /api/brands': () => json({ detail: 'A brand already exists. Edit it instead.' }, 409),
      'GET /api/brands': () => json([{ id: 3, name: 'Old Name' }]),
    });
    const confirm = vi.fn(async () => false);
    const out = await registerBrand(form, logo, confirm);
    expect(confirm).toHaveBeenCalledWith({ id: 3, name: 'Old Name' });
    expect(out.status).toBe('cancelled');
    expect(calls(f)).toEqual(['POST /api/brands', 'GET /api/brands']);
  });

  it('on 409 and "yes" updates the existing brand with PUT, shows the refresh, then uploads the logo', async () => {
    const refresh = { results_retired: 4, rescan: 'needed', message: 'Brand details changed: earlier results were retired.' };
    const f = mockApi({
      'POST /api/brands': () => json({ detail: 'A brand already exists. Edit it instead.' }, 409),
      'GET /api/brands': () => json([{ id: 3, name: 'Old Name' }]),
      'PUT /api/brands/3': () => json({ ...brand, id: 3, refresh }),
      'POST /api/brands/3/logo': () => json({ url: '/api/brands/3/logo' }),
    });
    const out = await registerBrand(form, logo, async () => true);
    expect(out.status).toBe('updated');
    expect(out.brand?.refresh).toEqual(refresh);
    expect(out.logo).toEqual({ ok: true });
    expect(calls(f)).toEqual(['POST /api/brands', 'GET /api/brands', 'PUT /api/brands/3', 'POST /api/brands/3/logo']);
  });

  it('keeps the brand when only the logo upload fails', async () => {
    mockApi({
      'POST /api/brands': () => json(brand, 201),
      'POST /api/brands/7/logo': () => json({ detail: 'Logo is too small' }, 422),
    });
    const out = await registerBrand(form, logo, async () => true);
    expect(out.status).toBe('created');
    expect(out.logo).toEqual({ ok: false, error: 'Logo is too small' });
  });

  it('does not touch the logo endpoint without a logo, and surfaces 422 field errors', async () => {
    mockApi({ 'POST /api/brands': () => json({ detail: [{ loc: ['body', 'name'], msg: 'String should have at least 1 character' }] }, 422) });
    await expect(registerBrand({ ...form, name: '' }, null, async () => true)).rejects.toMatchObject({ status: 422, fields: { name: 'String should have at least 1 character' } });
  });
});

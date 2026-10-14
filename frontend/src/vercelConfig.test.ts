// frontend/vercel.json: the SPA rewrite must not swallow real files, and the headers must mirror the nginx ones.
import { describe, expect, it } from 'vitest';

import raw from '../vercel.json?raw';

const cfg = JSON.parse(raw);
const rewrite = new RegExp(`^/${(cfg.rewrites[0].source as string).replace(/^\//, '')}$`);

describe('frontend/vercel.json', () => {
  it('builds the Vite app into dist', () => {
    expect(cfg.framework).toBe('vite');
    expect(cfg.buildCommand).toBe('npm run build');
    expect(cfg.outputDirectory).toBe('dist');
    expect(cfg.rewrites[0].destination).toBe('/index.html');
  });

  it('falls back to index.html for app routes only', () => {
    for (const p of ['/', '/dashboard', '/protect-brand', '/investigations', '/some/deep/route', '/login']) expect(rewrite.test(p), p).toBe(true);
  });

  it('does not rewrite real files or missing assets (those must 404 instead of returning HTML)', () => {
    for (const p of ['/config.js', '/favicon.svg', '/states.geojson', '/hero-banner.jpg', '/icons.svg', '/assets/index-abc123.js', '/assets/missing.css', '/assets/']) {
      expect(rewrite.test(p), p).toBe(false);
    }
  });

  it('sets the same security headers as nginx, with a CSP that can reach any https API origin', () => {
    const all = cfg.headers.find((h: { source: string }) => h.source === '/(.*)').headers as { key: string; value: string }[];
    const get = (k: string) => all.find((h) => h.key === k)?.value ?? '';
    expect(get('X-Content-Type-Options')).toBe('nosniff');
    expect(get('X-Frame-Options')).toBe('DENY');
    expect(get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(get('Strict-Transport-Security')).toContain('max-age=31536000');
    const csp = get('Content-Security-Policy');
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self' https:");
    expect(csp).toContain("frame-ancestors 'none'");
    const assets = cfg.headers.find((h: { source: string }) => h.source === '/assets/(.*)');
    expect(assets.headers[0].value).toContain('immutable');
  });
});

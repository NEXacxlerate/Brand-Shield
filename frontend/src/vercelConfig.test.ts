// The root vercel.json (one Vercel project, two services): routing, SPA fallback and security headers.
/// <reference types="node" />
// (the file sits outside the frontend folder, so it is read with Node's fs; @types/node is already installed as a dependency of the toolchain)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cfg = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8'));
const spa = new RegExp(`^/${(cfg.services.frontend.rewrites[0].source as string).replace(/^\//, '')}$`);
const route = (path: string): string => {
  for (const r of cfg.rewrites as { source: string; destination: { service: string } }[]) {
    if (new RegExp(`^${r.source}$`).test(path)) return r.destination.service;
  }
  return 'none';
};

describe('root vercel.json', () => {
  it('declares the backend (FastAPI) and frontend (Vite) services and no bindings', () => {
    expect(cfg.services.backend).toMatchObject({ root: 'backend', framework: 'fastapi' });
    expect(cfg.services.frontend).toMatchObject({ root: 'frontend', framework: 'vite' });
    expect(cfg.services.backend.bindings).toBeUndefined();
    expect(cfg.services.frontend.bindings).toBeUndefined();
  });

  it('sends /api and the health endpoints to the backend and everything else to the frontend', () => {
    for (const p of ['/api/me', '/api/cron/scan', '/api/detections', '/health', '/health/live']) expect(route(p), p).toBe('backend');
    for (const p of ['/', '/dashboard', '/protect-brand', '/assets/x.js', '/config.js', '/docs', '/openapi.json']) expect(route(p), p).toBe('frontend');
    expect(cfg.rewrites.at(-1).source).toBe('/(.*)'); // the catch-all is last
  });

  it('falls back to index.html for app routes only', () => {
    for (const p of ['/', '/dashboard', '/protect-brand', '/investigations', '/some/deep/route', '/login']) expect(spa.test(p), p).toBe(true);
  });

  it('does not rewrite real files or missing assets (those must 404 instead of returning HTML)', () => {
    for (const p of ['/config.js', '/favicon.svg', '/states.geojson', '/hero-banner.jpg', '/icons.svg', '/assets/index-abc123.js', '/assets/missing.css', '/assets/']) {
      expect(spa.test(p), p).toBe(false);
    }
  });

  it('keeps the daily scan cron and sets the nginx-equivalent security headers with a same-origin-only CSP', () => {
    expect(cfg.crons).toEqual([{ path: '/api/cron/scan', schedule: '0 6 * * *' }]);
    const all = cfg.headers.find((h: { source: string }) => h.source === '/(.*)').headers as { key: string; value: string }[];
    const get = (k: string) => all.find((h) => h.key === k)?.value ?? '';
    expect(get('X-Content-Type-Options')).toBe('nosniff');
    expect(get('X-Frame-Options')).toBe('DENY');
    expect(get('Strict-Transport-Security')).toContain('max-age=31536000');
    const csp = get('Content-Security-Policy');
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self';"); // one origin now: the browser only talks to its own site
    expect(csp).not.toContain("connect-src 'self' https:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(cfg.headers.find((h: { source: string }) => h.source === '/assets/(.*)').headers[0].value).toContain('immutable');
  });
});

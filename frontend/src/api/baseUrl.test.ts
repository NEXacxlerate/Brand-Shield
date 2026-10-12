import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadBaseUrl(): Promise<string> {
  vi.resetModules();
  return (await import('./client')).BASE_URL;
}

describe('API base URL precedence', () => {
  afterEach(() => {
    delete window.__SCAMMIND_CONFIG__;
    vi.unstubAllEnvs();
  });

  it('prefers the runtime config written by the container', async () => {
    vi.stubEnv('VITE_API_URL', 'http://build-time.example');
    window.__SCAMMIND_CONFIG__ = { API_URL: 'https://api.example.com/' };
    expect(await loadBaseUrl()).toBe('https://api.example.com');
  });

  it('falls back to VITE_API_URL when the runtime config is empty (development)', async () => {
    vi.stubEnv('VITE_API_URL', 'http://build-time.example/');
    window.__SCAMMIND_CONFIG__ = {};
    expect(await loadBaseUrl()).toBe('http://build-time.example');
  });

  it('falls back to the local default when nothing is set', async () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(await loadBaseUrl()).toBe('http://127.0.0.1:8000');
  });
});

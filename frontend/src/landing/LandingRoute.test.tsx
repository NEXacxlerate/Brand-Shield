import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { resetBrand } from '../hooks/useBrand';
import { jsonResponse, mockFetch, signIn } from '../test/helpers';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetBrand();
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(() => vi.unstubAllGlobals());

describe('/ route', () => {
  it('shows the marketing page to a signed-out visitor, scoped under .bs-landing', async () => {
    mockFetch(() => jsonResponse(200, {}));
    window.history.pushState({}, '', '/');
    const { container } = render(<App />);
    expect(await screen.findByRole('heading', { name: /Threat detection/ }, { timeout: 15_000 })).toBeInTheDocument();
    expect(container.querySelector('.bs-landing')).not.toBeNull();
  });

  it('still sends a signed-in user to the dashboard', async () => {
    signIn('acc-1', 'ref-1');
    mockFetch(() => jsonResponse(404, {}));
    window.history.pushState({}, '', '/');
    render(<App />);
    await vi.waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  });
});

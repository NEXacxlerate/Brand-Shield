import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { resetBrand } from './hooks/useBrand';
import { jsonResponse, mockFetch, signIn, USER } from './test/helpers';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetBrand();
});
afterEach(() => vi.unstubAllGlobals());

describe('route guard', () => {
  it('sends a visitor without a token to the login page (no silent offline session)', async () => {
    const { calls } = mockFetch(() => jsonResponse(200, {}));
    window.history.pushState({}, '', '/dashboard');
    render(<App />);
    expect(await screen.findByText('Welcome back')).toBeInTheDocument();
    expect(localStorage.getItem('scammind.offline-session')).toBeNull();
    expect(calls).toHaveLength(0); // nothing is requested without a session
  });

  it('protects /setup too: the admin must be signed in first', async () => {
    mockFetch(() => jsonResponse(200, {}));
    window.history.pushState({}, '', '/setup');
    render(<App />);
    expect(await screen.findByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByText(/Sign in as an administrator to set up your brand profile/)).toBeInTheDocument();
  });
});

describe('header: user and sign-out', () => {
  it('shows the user from /api/me (not a hard-coded identity) and sign-out revokes the token and clears the session key', async () => {
    signIn('acc-1', 'ref-1');
    const { calls } = mockFetch((c) => {
      const path = c.url.replace(/^.*\/api/, '');
      if (path === '/me') return jsonResponse(200, { ...USER, name: 'Real Person', email: 'real@example.test' });
      if (path === '/auth/logout') return jsonResponse(200, { ok: true, detail: '' });
      if (path.startsWith('/brands/1')) return jsonResponse(404, { detail: 'Brand not found' });
      return jsonResponse(404, { detail: 'No brand profile yet. Create one first.' });
    });
    window.history.pushState({}, '', '/dashboard');
    render(<App />);
    expect(await screen.findByText('real@example.test')).toBeInTheDocument();
    expect(screen.queryByText('Harini')).not.toBeInTheDocument();
    expect(screen.queryByText('admin@company.com')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByText('Real Person'));
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));
    await waitFor(() => expect(screen.getByText('Welcome back')).toBeInTheDocument());

    const logout = calls.find((c) => c.url.endsWith('/api/auth/logout'));
    expect(logout).toBeDefined();
    expect(JSON.parse(logout!.init.body as string)).toEqual({ refresh_token: 'ref-1' });
    expect(localStorage.getItem('scammind.auth')).toBeNull();
    expect(localStorage.getItem('scammind.user')).toBeNull();
    expect(sessionStorage.getItem('scammind.auth')).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { jsonResponse, mockFetch } from '../test/helpers';

afterEach(() => vi.unstubAllEnvs());

const renderLogin = () => render(<MemoryRouter><LoginPage /></MemoryRouter>);

describe('login demo credentials', () => {
  it('is hidden when the server has no demo account and no local fallback is set', async () => {
    vi.stubEnv('VITE_DEMO_EMAIL', '');
    vi.stubEnv('VITE_DEMO_PASSWORD', '');
    const { calls } = mockFetch(() => jsonResponse(200, { enabled: false }));
    renderLogin();
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/auth/demo'))).toBe(true));
    expect(screen.queryByTestId('demo-credentials')).not.toBeInTheDocument();
  });

  it('shows the button when the server advertises a demo account, and prefills the form when clicked', async () => {
    vi.stubEnv('VITE_DEMO_EMAIL', '');
    vi.stubEnv('VITE_DEMO_PASSWORD', '');
    mockFetch(() => jsonResponse(200, { enabled: true, email: 'demo@brandshield.app', password: 'Demo-Brand-2026!' }));
    renderLogin();
    const btn = await screen.findByTestId('demo-credentials');
    expect(screen.getByTestId('demo-note')).toHaveTextContent(/Shared demo account/);
    await userEvent.setup().click(btn);
    expect(screen.getByDisplayValue('demo@brandshield.app')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Demo-Brand-2026!')).toBeInTheDocument();
  });

  it('still works with the local VITE_DEMO_* fallback when the server has none', async () => {
    vi.stubEnv('VITE_DEMO_EMAIL', 'local@example.test');
    vi.stubEnv('VITE_DEMO_PASSWORD', 'local-pass-123');
    mockFetch(() => jsonResponse(200, { enabled: false }));
    renderLogin();
    await userEvent.setup().click(await screen.findByTestId('demo-credentials'));
    expect(screen.getByDisplayValue('local@example.test')).toBeInTheDocument();
  });

  it('shows no button (and no error) when the demo request fails', async () => {
    vi.stubEnv('VITE_DEMO_EMAIL', '');
    vi.stubEnv('VITE_DEMO_PASSWORD', '');
    mockFetch(() => jsonResponse(500, { detail: 'boom' }));
    renderLogin();
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument());
    expect(screen.queryByTestId('demo-credentials')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

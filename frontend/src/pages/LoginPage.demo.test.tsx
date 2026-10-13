import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

afterEach(() => vi.unstubAllEnvs());

describe('login demo credentials', () => {
  it('is hidden unless demo credentials are configured', () => {
    vi.stubEnv('VITE_DEMO_EMAIL', '');
    vi.stubEnv('VITE_DEMO_PASSWORD', '');
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(screen.queryByTestId('demo-credentials')).not.toBeInTheDocument();
  });

  it('prefills the email and password when clicked', async () => {
    vi.stubEnv('VITE_DEMO_EMAIL', 'demo@example.test');
    vi.stubEnv('VITE_DEMO_PASSWORD', 'demo-pass-123');
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await userEvent.setup().click(screen.getByTestId('demo-credentials'));
    expect(screen.getByDisplayValue('demo@example.test')).toBeInTheDocument();
    expect(screen.getByDisplayValue('demo-pass-123')).toBeInTheDocument();
  });
});

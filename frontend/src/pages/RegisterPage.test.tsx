import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';
import { LoginPage } from './LoginPage';
import { jsonResponse, mockFetch, USER } from '../test/helpers';

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/protect-brand" element={<div>PROTECT BRAND PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function fill(password = 'correct horse battery', confirm = password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Full name'), 'Rita Shah');
  await user.type(screen.getByLabelText('Work email'), 'rita@company.com');
  await user.type(screen.getByLabelText('Password'), password);
  await user.type(screen.getByLabelText('Confirm password'), confirm);
  await user.click(screen.getByRole('button', { name: /create account/i }));
  return user;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('RegisterPage', () => {
  it('registers, stores the session like login and goes to /protect-brand', async () => {
    const { calls } = mockFetch(() =>
      jsonResponse(201, { access_token: 'a1', refresh_token: 'r1', token_type: 'bearer', expires_in: 900, user: { ...USER, role: 'analyst', default_brand_id: null } })
    );
    renderRegister();
    await fill();
    expect(await screen.findByText('PROTECT BRAND PAGE')).toBeInTheDocument();
    expect(calls[0].url).toMatch(/\/api\/auth\/register$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ name: 'Rita Shah', email: 'rita@company.com', password: 'correct horse battery' });
    expect(JSON.parse(localStorage.getItem('scammind.auth') as string)).toEqual({ access: 'a1', refresh: 'r1' });
  });

  it('blocks a weak password and a mismatch before calling the server', async () => {
    const { calls } = mockFetch(() => jsonResponse(201, {}));
    renderRegister();
    await fill('short', 'different');
    expect(await screen.findByText('Password must be at least 10 characters.')).toBeInTheDocument();
    expect(screen.getAllByText('The two passwords do not match.').length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });

  it('shows the live policy hints', async () => {
    renderRegister();
    await userEvent.setup().type(screen.getByLabelText('Password'), 'abc');
    const hints = screen.getByTestId('pw-hints').querySelectorAll('li');
    expect(hints[0].getAttribute('data-state')).toBe('bad');
  });

  it('toggles password visibility', async () => {
    renderRegister();
    const user = userEvent.setup();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });

  it('409: duplicate email message', async () => {
    mockFetch(() => jsonResponse(409, { detail: 'An account with this email already exists.' }));
    renderRegister();
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.');
    expect(localStorage.getItem('scammind.auth')).toBeNull();
  });

  it('422: per-field message from the server', async () => {
    mockFetch(() => jsonResponse(422, { detail: [{ loc: ['body', 'password'], msg: 'That password is too easy to guess.', type: 'value_error' }] }));
    renderRegister();
    await fill();
    expect(await screen.findByText('That password is too easy to guess.')).toBeInTheDocument();
  });

  it('429: shows the Retry-After seconds', async () => {
    mockFetch(() => jsonResponse(429, { detail: 'Too many sign-up attempts. Try again later.' }, { 'Retry-After': '120' }));
    renderRegister();
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 120 seconds');
  });

  it('403: hides the form and explains that sign-up is disabled', async () => {
    mockFetch(() => jsonResponse(403, { detail: 'Sign-up is disabled' }));
    renderRegister();
    await fill();
    expect(await screen.findByTestId('signup-disabled')).toHaveTextContent('Sign-up is disabled');
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
  });

  it('network error shows the connection message', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    renderRegister();
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i);
  });

  it('links back to the login page, and login links here', async () => {
    renderRegister();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Sign in' }));
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
  });
});

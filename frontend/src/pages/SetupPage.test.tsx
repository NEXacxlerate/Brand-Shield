import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SetupPage } from './SetupPage';
import { jsonResponse, mockFetch } from '../test/helpers';
import { resetBrand, setBrandCache } from '../hooks/useBrand';
import type { Brand } from '../api/types';

const MOCK_BRAND: Brand = {
  id: 1,
  name: 'Zenith Pay',
  industry: 'Fintech & Banking',
  description: 'Enterprise payment protection',
  aliases: ['Zenith', 'ZenithPay'],
  keywords: ['login', 'support'],
  domains: ['zenithpay.com'],
  logo: null,
  official_accounts: [
    { id: 101, platform: 'x', handle: '@zenithpay', url: 'https://x.com/zenithpay', status: 'verified', last_checked_at: null, source: 'local' }
  ],
  official_apps: [
    { id: 201, name: 'Zenith Pay Mobile', package_id: 'com.zenith.pay', publisher: 'Zenith Financial', stores: ['google_play'], status: 'verified', source: 'local' }
  ],
  official_assets: 2,
  profile_health: { percent: 100, message: 'Good', checks: [], missing: [] },
  allowlist: { accounts: 1, apps: 1, domains: 1 },
  updated_at: '2026-10-14T00:00:00Z',
  source: 'local'
};

function renderSetup() {
  return render(
    <MemoryRouter initialEntries={['/setup']}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/dashboard" element={<div>DASHBOARD PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetBrand();
  setBrandCache(MOCK_BRAND);
});

describe('SetupPage detailed input fields', () => {
  it('renders Step 1 with complete brand identity fields (name, industry, description, aliases, keywords, domains, logo)', async () => {
    mockFetch(() => jsonResponse(200, {}));

    renderSetup();

    expect(await screen.findByLabelText(/company or brand name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/industry \/ sector/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/brand description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/aliases, abbreviations & alternate spellings/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/high-risk keywords to watch/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/official primary domains/i)).toBeInTheDocument();
    expect(screen.getByTestId('setup-logo-input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue to next step/i })).toBeInTheDocument();
  });

  it('allows filling brand inputs and progressing to Step 2 with social accounts and mobile apps input fields', async () => {
    mockFetch((call) => {
      if (call.url.includes('/api/brands/1') && call.init.method === 'PUT') {
        return jsonResponse(200, MOCK_BRAND);
      }
      return jsonResponse(200, {});
    });

    renderSetup();

    const nameInput = await screen.findByLabelText(/company or brand name/i);
    expect(nameInput).toHaveValue('Zenith Pay');

    const user = userEvent.setup();
    const continueBtn = screen.getByRole('button', { name: /continue to next step/i });
    await user.click(continueBtn);

    // Step 2 should display detailed asset input fields
    expect(await screen.findByText('Official Social Media Profiles')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/official_handle/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add account/i })).toBeInTheDocument();

    expect(screen.getByText('Official Mobile Apps')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/acme mobile banking/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/com\.acme\.banking/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add app/i })).toBeInTheDocument();
  });

  it('progresses to Step 3 with scan scope cards, analysis mode, alert email, and launch button', async () => {
    mockFetch((call) => {
      if (call.url.includes('/api/sources')) {
        return jsonResponse(200, { summary: { total: 4 }, items: [{ id: 'tavily', name: 'Tavily', status: 'ok' }] });
      }
      if (call.url.includes('/api/brands/1') && call.init.method === 'PUT') {
        return jsonResponse(200, MOCK_BRAND);
      }
      return jsonResponse(200, {});
    });

    renderSetup();
    const user = userEvent.setup();

    // Step 1 -> Step 2
    const step1Btn = await screen.findByRole('button', { name: /continue to next step/i });
    await user.click(step1Btn);

    // Step 2 -> Step 3
    const step2Btn = await screen.findByRole('button', { name: /continue to next step/i });
    await user.click(step2Btn);

    // Step 3 inputs
    expect(await screen.findByText('Select initial scan scope')).toBeInTheDocument();
    expect(screen.getByText('Full Coverage (Recommended)')).toBeInTheDocument();
    expect(screen.getByText('Social Profiles & Impersonators')).toBeInTheDocument();
    expect(screen.getByText('Mobile App Marketplaces')).toBeInTheDocument();
    expect(screen.getByLabelText(/scan analysis mode/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/alert recipient email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start first scan & open dashboard/i })).toBeInTheDocument();
  });
});

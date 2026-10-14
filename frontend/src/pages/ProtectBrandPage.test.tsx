import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectBrandPage } from './ProtectBrandPage';

function renderProtectBrand() {
  return render(
    <MemoryRouter initialEntries={['/protect-brand']}>
      <Routes>
        <Route path="/protect-brand" element={<ProtectBrandPage />} />
        <Route path="/setup" element={<div data-testid="setup-destination">BRAND SETUP PAGE</div>} />
        <Route path="/dashboard" element={<div>DASHBOARD PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectBrandPage', () => {
  it('renders the heading, subtitle, and branding elements', () => {
    renderProtectBrand();
    expect(screen.getByRole('heading', { level: 1, name: /protect your brand/i })).toBeInTheDocument();
    expect(screen.getByText(/choose how you want to get started with brandshield ai/i)).toBeInTheDocument();
    expect(screen.getByText(/enterprise security verified/i)).toBeInTheDocument();
  });

  it('renders "Create a Brand" card and button as UI-only without navigation or side effects', async () => {
    renderProtectBrand();
    expect(screen.getByRole('heading', { level: 2, name: /create a brand/i })).toBeInTheDocument();
    expect(screen.getByText(/set up a new brand profile/i)).toBeInTheDocument();

    const createBtn = screen.getByTestId('btn-create-brand');
    expect(createBtn).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(createBtn);

    // Verify no navigation happened: still on the same page
    expect(screen.queryByTestId('setup-destination')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /protect your brand/i })).toBeInTheDocument();
  });

  it('renders "Protect a Brand" card and navigates to the existing setup page when clicked', async () => {
    renderProtectBrand();
    expect(screen.getByRole('heading', { level: 2, name: /protect a brand/i })).toBeInTheDocument();
    expect(screen.getByText(/configure protection for an existing brand/i)).toBeInTheDocument();

    const protectCard = screen.getByTestId('card-protect-brand');
    expect(protectCard).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(protectCard);

    // Verify it navigated to /setup
    expect(screen.getByTestId('setup-destination')).toBeInTheDocument();
    expect(screen.getByText('BRAND SETUP PAGE')).toBeInTheDocument();
  });
});

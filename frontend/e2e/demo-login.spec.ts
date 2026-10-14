// The login page's "Use demo credentials" button: the server advertises a shared demo account (DEMO_EMAIL / DEMO_PASSWORD).
import { expect, test } from '@playwright/test';

test('demo credentials: the button fills the form and the demo account signs in as a normal (non-admin) user', async ({ page }) => {
  await page.goto('/login');
  const btn = page.getByTestId('demo-credentials');
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('demo-note')).toContainText('Shared demo account');
  await expect(page.locator('#email')).toHaveValue('');

  await btn.click();
  await expect(page.locator('#email')).toHaveValue('demo@brandshield.app');
  await expect(page.locator('#password')).toHaveValue('Demo-Brand-2026!');

  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/protect-brand$/, { timeout: 30_000 });

  // a normal account: it has no administrator rights (the data-mode switch is admin-only)
  await page.goto('/settings');
  await expect(page.getByText('Only administrators can change settings')).toBeVisible({ timeout: 30_000 });
});

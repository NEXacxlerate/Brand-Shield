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
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 }); // Settings is for administrators only
});

test('admin demo: the button signs in as a guarded administrator (editable settings, no live data, own audit rows only)', async ({ page, request }) => {
  await page.goto('/login');
  const btn = page.getByTestId('demo-admin-credentials');
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('demo-admin-note')).toContainText('cannot switch to live data');
  await btn.click();
  await expect(page.locator('#email')).toHaveValue('demoadmin@brandshield.app');
  await expect(page.locator('#password')).toHaveValue('Demo-Admin-2026!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/protect-brand$/, { timeout: 30_000 });

  // an administrator: settings are editable (Save becomes enabled once something changes)
  await page.goto('/settings');
  await expect(page.getByText('Only administrators can change settings')).toHaveCount(0);
  await page.locator('.settings-tab-btn', { hasText: 'Notifications' }).click();
  await page.getByLabel('Send email alerts for risk scores above 85').click();
  await expect(page.getByTestId('settings-save')).toBeEnabled();

  // ...but the shared demo cannot switch to live data
  await page.locator('.settings-tab-btn', { hasText: 'Account' }).click();
  await page.getByRole('radio', { name: 'Live' }).click();
  await expect(page.getByText('Disabled for the shared demo administrator')).toBeVisible();
  await expect(page.getByTestId('effective-mode')).toContainText('sample');

  // the audit log shows only its own rows (never other accounts' sign-ups or logins)
  const api = process.env.E2E_API_URL as string;
  const login = await request.post(`${api}/api/auth/login`, { data: { email: 'demoadmin@brandshield.app', password: 'Demo-Admin-2026!' } });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).access_token as string;
  const audit = await request.get(`${api}/api/audit?limit=200`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await audit.json();
  expect(body.total).toBeGreaterThan(0);
  expect(new Set(body.items.map((i: { actor_id: number }) => i.actor_id)).size).toBe(1);
  expect(JSON.stringify(body)).not.toContain(process.env.E2E_ADMIN_EMAIL as string);
});

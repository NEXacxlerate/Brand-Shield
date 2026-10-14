// Create account + Protect Brand -> Brand Studio, against the REAL backend (sign-up enabled) and the Vite dev server.
// Brand Studio itself is NOT started here: the /studio/ navigation is intercepted. The full cross-app flow lives elsewhere.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

test.describe.configure({ mode: 'serial' });

// Throwaway account for this run only (never logged).
const stamp = randomBytes(4).toString('hex');
const NEW = { name: 'Rita Shah', email: `rita.${stamp}@example.com`, password: `Tr1cky-${randomBytes(6).toString('hex')}-pass` };

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

async function fillRegister(page: Page, v: { name: string; email: string; password: string; confirm?: string }) {
  await page.locator('#reg-name').fill(v.name);
  await page.locator('#reg-email').fill(v.email);
  await page.locator('#reg-password').fill(v.password);
  await page.locator('#reg-confirm').fill(v.confirm ?? v.password);
}

test('login page links to Create an account and back', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('register: password policy hints and messages (nothing is sent for a weak password)', async ({ page }) => {
  const registerCalls: string[] = [];
  page.on('request', (r) => r.url().includes('/api/auth/register') && registerCalls.push(r.url()));
  await page.goto('/register');
  await page.locator('#reg-password').fill('short');
  await expect(page.getByTestId('pw-hints').locator('li').first()).toHaveAttribute('data-state', 'bad');
  await fillRegister(page, { name: NEW.name, email: NEW.email, password: 'short', confirm: 'different' });
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByText('Password must be at least 10 characters.')).toBeVisible();
  await expect(page.getByText('The two passwords do not match.').first()).toBeVisible();

  await fillRegister(page, { name: NEW.name, email: NEW.email, password: '1234567890123' });
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByText('That password is too easy to guess. Choose a longer or less common one.')).toBeVisible();

  // show / hide toggle
  await expect(page.locator('#reg-password')).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.locator('#reg-password')).toHaveAttribute('type', 'text');
  expect(registerCalls).toHaveLength(0);
});

test('register: a new account is created, signed in, and lands on /protect-brand', async ({ page }) => {
  await page.goto('/register');
  await fillRegister(page, NEW);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/protect-brand$/);
  await expect(page.getByRole('heading', { level: 1, name: /protect your brand/i })).toBeVisible();
  // the session is the same one login writes
  expect(await page.evaluate(() => !!localStorage.getItem('scammind.auth'))).toBe(true);
});

test('register: the same email again shows the duplicate error and does not sign in', async ({ page }) => {
  await page.goto('/register');
  await fillRegister(page, NEW);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('alert')).toContainText('An account with this email already exists.');
  await expect(page).toHaveURL(/\/register$/);
  expect(await page.evaluate(() => localStorage.getItem('scammind.auth'))).toBeNull();
});

test('Protect Brand: "Create a Brand" navigates to /studio/ (intercepted, Studio is not started)', async ({ page }) => {
  await page.route(/\/studio\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Studio stub</title><h1>Studio stub</h1>' }));
  await page.goto('/login');
  await page.locator('#email').fill(NEW.email);
  await page.locator('#password').fill(NEW.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/protect-brand$/);
  await page.getByTestId('btn-create-brand').click();
  await expect(page).toHaveURL(/\/studio\/$/);
  expect(new URL(page.url()).pathname.startsWith('/studio/')).toBe(true);
  await expect(page.getByRole('heading', { name: 'Studio stub' })).toBeVisible();
});

test('Protect Brand: "Protect a Brand" still goes to /setup', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill(NEW.email);
  await page.locator('#password').fill(NEW.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/protect-brand$/);
  await page.getByTestId('card-protect-brand').click();
  await expect(page).toHaveURL(/\/setup$/);
});

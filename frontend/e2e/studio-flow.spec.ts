// The whole cross-app flow: create an account, go to Brand Studio from "Protect Your Brand", create a brand there, see it protected in
// BrandShield, and prove that a second account cannot see it. Studio's AI features need provider keys that the test backend does not
// have, so the flow uses what works without them: typing the brand details.
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

test.describe.configure({ mode: 'serial' });

const PASSWORD = () => `Tr1cky-${randomBytes(6).toString('hex')}-pass`;
const stamp = Date.now().toString(36);
const A = { name: 'Studio Owner', email: `owner-${stamp}@example.com`, password: PASSWORD() };
const B = { name: 'Other Person', email: `other-${stamp}@example.com`, password: PASSWORD() };
const BRAND = `Zenith Pay ${stamp}`;

async function register(page: Page, who: { name: string; email: string; password: string }) {
  await page.goto('/register');
  await page.locator('#reg-name').fill(who.name);
  await page.locator('#reg-email').fill(who.email);
  await page.locator('#reg-password').fill(who.password);
  await page.locator('#reg-confirm').fill(who.password);
  await page.getByRole('button', { name: /create account|sign up|register/i }).first().click();
  await expect(page).toHaveURL(/\/protect-brand$/, { timeout: 30_000 });
}

test('account A: sign up, Create a Brand opens Brand Studio on the same login, brand is created and protected in BrandShield', async ({ page }) => {
  await register(page, A);

  // "Create a Brand" -> Brand Studio dashboard (same origin, same session: no second login)
  await page.getByTestId('btn-create-brand').click();
  await expect(page).toHaveURL(/\/studio\/$/, { timeout: 30_000 });
  await expect(page.getByText(A.name).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: /Back to BrandShield/i }).first()).toBeVisible();

  // the Studio's own login and landing pages are gone: nothing asks for a login
  await expect(page.getByRole('button', { name: /sign in with google/i })).toHaveCount(0);

  // create the brand in Studio and register it in BrandShield
  await page.getByText('Protect in BrandShield').first().click();
  await page.locator('#pb-name').fill(BRAND);
  await page.locator('#pb-industry').fill('Payments');
  await page.locator('#pb-desc').fill('Payments for everyone.');
  await page.getByRole('button', { name: 'Create brand & protect it in BrandShield' }).click();
  await expect(page.getByText('Brand registered in BrandShield')).toBeVisible({ timeout: 30_000 });

  // back in BrandShield the brand is there
  await page.getByRole('link', { name: /Open BrandShield dashboard/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(BRAND).first()).toBeVisible({ timeout: 30_000 });
  await page.goto('/brand');
  // the Brand Registry form holds the brand's name (some text field has exactly that value)
  await expect.poll(() => page.locator('input').evaluateAll((els, v) => els.some((e) => (e as HTMLInputElement).value === v), BRAND), { timeout: 30_000 }).toBe(true);
  await expect(page.locator('.sidebar-brand-card')).toContainText(BRAND);
});

test('account A signed out of Studio is sent to the BrandShield login and comes back to /studio/', async ({ page }) => {
  await page.goto('/studio/');
  await expect(page).toHaveURL(/\/login\?next=%2Fstudio%2F|\/login\?next=\/studio\//, { timeout: 30_000 });
  await page.locator('#email').fill(A.email);
  await page.locator('#password').fill(A.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/studio\/$/, { timeout: 30_000 });
  await expect(page.getByText(A.name).first()).toBeVisible({ timeout: 30_000 });
});

test('account B cannot see account A\'s brand anywhere', async ({ page }) => {
  await register(page, B);
  await page.goto('/dashboard');
  await expect(page.getByText('No brand profile yet.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(BRAND)).toHaveCount(0);
  await page.goto('/brand');
  await expect(page.locator('.sidebar-brand-card')).not.toContainText(BRAND);
  expect(await page.locator('input').evaluateAll((els, v) => els.some((e) => (e as HTMLInputElement).value === v), BRAND)).toBe(false);
  // the API agrees: B's own brand list does not contain A's brand
  const mine = await page.evaluate(async () => {
    const raw = localStorage.getItem('scammind.auth') || sessionStorage.getItem('scammind.auth') || '{}';
    const t = JSON.parse(raw);
    const token = t.access_token || t.tokens?.access_token;
    const r = await fetch('/api/brands', { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, text: await r.text() };
  });
  expect(mine.text).not.toContain(BRAND);
});

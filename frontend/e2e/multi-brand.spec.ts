// Several brands per account, Studio remembering what was typed, saving a large picture to Collections, and going straight back to BrandShield.
import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';

test.describe.configure({ mode: 'serial' });

const stamp = Date.now().toString(36);
const USER = { name: 'Multi Owner', email: `multi-${stamp}@example.com`, password: `Tr1cky-${randomBytes(6).toString('hex')}-pass` };
const ONE = `Alpha Pay ${stamp}`;
const TWO = `Beta Bank ${stamp}`;

/** A valid, nearly incompressible RGB PNG of about 1.9 MB (bigger than the server accepts without shrinking). */
function bigPng(): Buffer {
  const w = 800, h = 800;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) randomBytes(w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}

test('sign up, register two brands from Studio, switch between them in BrandShield', async ({ page }) => {
  await page.goto('/register');
  await page.locator('#reg-name').fill(USER.name);
  await page.locator('#reg-email').fill(USER.email);
  await page.locator('#reg-password').fill(USER.password);
  await page.locator('#reg-confirm').fill(USER.password);
  await page.getByRole('button', { name: /create account|sign up|register/i }).first().click();
  await expect(page).toHaveURL(/\/protect-brand$/, { timeout: 30_000 });

  await page.getByTestId('btn-create-brand').click();
  await expect(page).toHaveURL(/\/studio\/$/, { timeout: 30_000 });
  await page.getByText('Protect in BrandShield').first().click();
  await page.locator('#pb-name').fill(ONE);
  await page.locator('#pb-industry').fill('Payments');
  await page.getByRole('button', { name: 'Create brand & protect it in BrandShield' }).click();
  await expect(page.getByText('Brand registered in BrandShield')).toBeVisible({ timeout: 30_000 });

  // what was typed is remembered: a reload brings the same name and industry back
  await page.reload();
  await page.getByText('Protect in BrandShield').first().click();
  await expect(page.locator('#pb-name')).toHaveValue(ONE);
  await expect(page.locator('#pb-industry')).toHaveValue('Payments');

  // a second brand on the same account
  await page.locator('#pb-name').fill(TWO);
  await page.getByRole('button', { name: 'Create brand & protect it in BrandShield' }).click();
  await expect(page.getByText('Brand registered in BrandShield')).toBeVisible({ timeout: 30_000 });

  // "BrandShield" in Studio goes straight to the dashboard (no choice page), showing the newest brand
  await page.getByRole('link', { name: /Open BrandShield dashboard/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('brand-switcher')).toContainText(TWO, { timeout: 30_000 });

  await page.getByTestId('brand-switcher').click();
  await page.getByRole('menuitem', { name: ONE }).click();
  await expect(page.getByTestId('brand-switcher')).toContainText(ONE, { timeout: 30_000 });
  await expect(page.getByText(ONE).first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('brand-switcher')).toContainText(ONE, { timeout: 30_000 }); // the choice is remembered by the server
});

test('Studio: "Back to BrandShield" lands on the dashboard; a big picture can be saved to Collections', async ({ page }) => {
  await page.goto('/login?next=/studio/');
  await page.locator('#email').fill(USER.email);
  await page.locator('#password').fill(USER.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/studio\/$/, { timeout: 30_000 });
  expect(await page.getByRole('link', { name: /Back to BrandShield/i }).first().getAttribute('href')).toBe('/dashboard');

  await page.getByRole('button', { name: /Logo Designer/ }).first().click();
  await page.getByTestId('logo-file').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: bigPng() });
  await page.getByRole('button', { name: /Save to Collection/ }).click();
  await expect(page.getByText('Saved to Collections')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /Collections/ }).first().click();
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible({ timeout: 30_000 }); // the saved picture, fetched with the login
  await expect(page.getByText(/Logo$/).first()).toBeVisible();
});

test('"Add another brand" opens an empty setup form instead of editing the current brand', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill(USER.email);
  await page.locator('#password').fill(USER.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/protect-brand$/, { timeout: 30_000 });
  await page.goto('/dashboard');
  await expect(page.getByTestId('brand-switcher')).toContainText(/Active brand/, { timeout: 30_000 });
  await page.getByTestId('brand-switcher').click();
  await page.getByTestId('add-brand').click();
  await expect(page).toHaveURL(/\/protect-brand\?add=1$/);
  await page.getByTestId('card-protect-brand').click();
  await expect(page).toHaveURL(/\/setup\?new=1$/);
  await expect(page.getByPlaceholder(/acme/i).first()).toHaveValue('');
});

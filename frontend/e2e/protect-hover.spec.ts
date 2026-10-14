// The "Create a Brand" card reacts to hover like the "Protect a Brand" card (lifts, glows, its button fills in).
import { expect, test } from '@playwright/test';

test('Protect Your Brand: hovering "Create a Brand" lifts the card and fills the button', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('demo-credentials').click({ timeout: 30_000 });
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/protect-brand$/, { timeout: 30_000 });

  const card = page.getByTestId('card-create-brand');
  await page.mouse.move(2, 2);
  await expect.poll(() => card.evaluate((e) => getComputedStyle(e).transform)).toBe('none');

  await card.hover();
  await expect.poll(() => card.evaluate((e) => getComputedStyle(e).transform)).toBe('matrix(1, 0, 0, 1, 0, -3)');
  expect(await page.getByTestId('btn-create-brand').evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('linear-gradient');
  expect(await page.getByTestId('btn-create-brand').evaluate((e) => getComputedStyle(e).cursor)).toBe('pointer');
});

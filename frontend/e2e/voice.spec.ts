// Voice assistant: the browser's speech recognition is replaced by a fake that "hears" the phrase the test sets, so the whole loop
// (button -> recognition -> POST /api/voice -> navigate / fill -> reply) runs without a microphone. Uses the fast path (no Gemini key).
import { expect, test, type Page } from '@playwright/test';

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL as string, password: process.env.E2E_ADMIN_PASSWORD as string };

async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__voice = { say: '', starts: 0, aborts: 0 };
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      private timer = 0;
      start() {
        const v = w.__voice as { say: string; starts: number };
        v.starts++;
        const phrase = v.say;
        v.say = '';
        if (phrase) this.timer = window.setTimeout(() => this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: phrase } }] }), 150);
      }
      abort() {
        (w.__voice as { aborts: number }).aborts++;
        window.clearTimeout(this.timer);
      }
    }
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
  });
}

const say = (page: Page, phrase: string) => page.evaluate((p) => ((window as unknown as { __voice: { say: string } }).__voice.say = p), phrase);

test('voice assistant: off until pressed, navigates and fills by voice, stays on across pages, releases the mic when off', async ({ page }) => {
  await fakeSpeech(page);
  await page.goto('/login');
  await page.locator('#email').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/protect-brand$/, { timeout: 30_000 });

  const fab = page.getByTestId('voice-fab');
  await expect(fab).toBeVisible();
  await expect(fab).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => (window as unknown as { __voice: { starts: number } }).__voice.starts)).toBe(0); // never listens before the press

  await page.goto('/dashboard');
  await expect(fab).toBeVisible();
  await say(page, 'take me to the look-alike lab');
  await fab.press('Enter'); // keyboard works too
  await expect(page).toHaveURL(/\/lookalike$/, { timeout: 15_000 });
  await expect(page.getByTestId('voice-panel')).toContainText('Opening look-alike lab');
  await expect(fab).toHaveAttribute('aria-pressed', 'true'); // still ON after the route change

  await say(page, 'fill test name with acm3bank');
  await expect(page.locator('[data-voice="test_name"]')).toHaveValue('acm3bank', { timeout: 15_000 });
  await expect(page.getByTestId('voice-panel')).toContainText('Filled test name with acm3bank');

  await expect(page.getByTestId('voice-panel')).toContainText('Listening', { timeout: 20_000 }); // back to listening after the reply
  const before = await page.evaluate(() => (window as unknown as { __voice: { aborts: number } }).__voice.aborts);
  await fab.click(); // OFF
  await expect(fab).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('voice-panel')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __voice: { aborts: number } }).__voice.aborts)).toBeGreaterThan(before);
  // the controlled input kept its value (React state was updated, not just the DOM)
  await page.locator('[data-voice="test_name"]').press('End');
  await expect(page.locator('[data-voice="test_name"]')).toHaveValue('acm3bank');
});

test('voice assistant: a friendly message where speech recognition is missing', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  });
  await page.goto('/login');
  await page.locator('#email').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/protect-brand$/, { timeout: 30_000 });
  await page.getByTestId('voice-fab').click();
  await expect(page.getByTestId('voice-panel')).toContainText('Chrome or Edge');
});

test('voice assistant: pressing the button and saying "hey Vlura" both greet the person by name', async ({ page }) => {
  await fakeSpeech(page);
  await page.goto('/login');
  await page.locator('#email').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/protect-brand$/, { timeout: 30_000 });
  await page.goto('/dashboard');

  const fab = page.getByTestId('voice-fab');
  await fab.click(); // press: greets
  await expect(page.getByTestId('voice-panel')).toContainText(/Hello \S+, how can I help you\?/, { timeout: 15_000 });
  await fab.click(); // off again

  await fab.click(); // on again
  await expect(page.getByTestId('voice-panel')).toContainText('Listening', { timeout: 20_000 });
  await say(page, 'hey Vlura');
  await expect(page.getByTestId('voice-panel')).toContainText(/Hello \S+, how can I help you\?/, { timeout: 15_000 });
  await fab.click();
});

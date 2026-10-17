// A13 smoke check against the deployed site. Runs only when LIVE_URL is set:
//   LIVE_URL=https://finalhope487.github.io/the-deep-end/ npx playwright test live --project=desktop
import { test, expect } from '@playwright/test';

const LIVE = process.env.LIVE_URL;

for (const path of ['', 'dist/']) {
  test(`線上網址可開啟並操作：/${path}`, async ({ page }) => {
    test.skip(!LIVE, 'LIVE_URL not set');
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(new URL(path + '?test=1&seed=42', LIVE).href);
    await page.waitForFunction(() => window.__deepend?.ready === true, null, { timeout: 60_000 });
    await page.getByRole('button', { name: '開始' }).click();
    await page.keyboard.down('w');
    await page.waitForTimeout(1500);
    await page.keyboard.up('w');
    const s = await page.evaluate(() => window.__deepend.state());
    expect(8 - s.z).toBeGreaterThan(3);
    await expect.poll(async () => (await page.evaluate(() => window.__deepend.state())).audio.sounds, { timeout: 20_000 }).toBe(14);
    expect(errors).toEqual([]);
  });
}

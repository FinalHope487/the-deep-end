// A11: approximate a mid-range phone — phone viewport, DPR 3, touch, CPU slowed 4× — and measure frame pacing.
import { test, expect } from '@playwright/test';

test('A11 手機尺寸＋4 倍降速 CPU，移動 30 秒平均 ≥ 58 fps', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/?test=1&seed=42');
  await page.waitForFunction(() => window.__deepend?.ready === true, null, { timeout: 60_000 });
  await page.getByRole('button', { name: '開始' }).click();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__deepend.resetFrameStats());

  // 30 s of walking, jumping to a new area every 5 s so chunks keep streaming in
  for (let i = 0; i < 6; i++) {
    await page.evaluate((i) => window.__deepend.teleport(8 + i * 37, 8 - i * 29, i * 1.1, false), i);
    await page.keyboard.down('w');
    await page.waitForTimeout(5000);
    await page.keyboard.up('w');
  }
  const fs = await page.evaluate(() => window.__deepend.frameStats());
  const s = await page.evaluate(() => window.__deepend.state());
  console.log('A11', JSON.stringify({ ...fs, quality: s.quality }));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  expect(fs.frames).toBeGreaterThan(1500);
  expect(1000 / fs.avgMs).toBeGreaterThanOrEqual(58);
  expect(fs.slowPct).toBeLessThanOrEqual(2);
  await ctx.close();
});

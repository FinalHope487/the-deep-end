// User layer: the title screen and HUD at phone, tablet, desktop, ultrawide and short-window ratios.
import { test, expect } from '@playwright/test';
import { boot, state } from './helpers.js';

const RATIOS = [[360, 640], [390, 844], [844, 390], [640, 360], [768, 1024], [1024, 768], [1366, 768], [1920, 1080], [2560, 1080], [1280, 500]];
const short = (w, h) => w > h && h <= 500;

const boxes = (page, sels) => page.evaluate((sels) => sels.flatMap((s) => [...document.querySelectorAll(s)]
  .filter((e) => e.getClientRects().length)
  .map((e) => { const r = e.getBoundingClientRect(); return { s, l: r.left, t: r.top, r: r.right, b: r.bottom }; })), sels);
const overlap = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

for (const [w, h] of RATIOS) {
  test(`${w}×${h} 標題畫面：標題、按鈕、提示、連結都在畫面內不重疊；宣傳連結在右下角${short(w, h) ? '；矮畫面左右兩欄' : ''}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    const all = await boxes(page, ['#title h1', '#title .en', '#title .stack .btn', '#hint', '#credit a']);
    for (const b of all) {
      expect(b.l, `${b.s} left`).toBeGreaterThanOrEqual(0);
      expect(b.t, `${b.s} top`).toBeGreaterThanOrEqual(0);
      expect(b.r, `${b.s} right`).toBeLessThanOrEqual(w);
      expect(b.b, `${b.s} bottom`).toBeLessThanOrEqual(h);
    }
    const links = all.filter((b) => b.s === '#credit a'), rest = all.filter((b) => b.s !== '#credit a');
    expect(links).toHaveLength(2);
    for (const a of links) {
      for (const b of rest) expect(overlap(a, b), `${a.s} over ${b.s}`).toBe(false);
      expect(w - a.r, 'link hugs the right edge').toBeLessThanOrEqual(40);
      expect(h - a.b, 'link sits at the bottom').toBeLessThanOrEqual(80);
    }
    if (short(w, h)) {
      const [h1] = all.filter((b) => b.s === '#title h1'), btns = all.filter((b) => b.s === '#title .stack .btn');
      for (const b of btns) expect(h1.r, 'title column left of the buttons').toBeLessThanOrEqual(b.l);
    }
  });
}

test('844×390 遊戲中：「跳轉中」標籤不壓在暫停鈕上', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await boot(page);
  await page.getByRole('button', { name: '跳轉關卡' }).click();
  await page.locator('#jump-list .btn').first().click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  await expect(page.locator('#jump-flag')).toBeVisible();
  const [flag] = await boxes(page, ['#jump-flag']), [pause] = await boxes(page, ['#btn-pause']);
  expect(overlap(flag, pause)).toBe(false);
});

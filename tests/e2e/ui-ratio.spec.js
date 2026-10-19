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
    // a saved game, so 「繼續」 shows too: all four buttons
    await page.addInitScript(() => localStorage.setItem('deepend.save.v1', JSON.stringify({ v: 1, seed: 42, x: 8, z: 8, yaw: 0, visited: [false, false, false, false], found: [], elapsed: 30, distance: 10 })));
    await boot(page);
    const all = await boxes(page, ['#title h1', '#title .en', '#title .stack .btn', '#hint', '#credit a']);
    expect(all.filter((b) => b.s === '#title .stack .btn')).toHaveLength(4);
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
      // the two columns sit at one height: the buttons with the hint centred where the title with its subtitle is
      const mid = (list) => (Math.min(...list.map((b) => b.t)) + Math.max(...list.map((b) => b.b))) / 2;
      const left = mid(all.filter((b) => b.s === '#title h1' || b.s === '#title .en')), right = mid(all.filter((b) => b.s === '#title .stack .btn' || b.s === '#hint'));
      expect(Math.abs(left - right), `title column centred at ${left.toFixed(0)} px, buttons at ${right.toFixed(0)} px`).toBeLessThanOrEqual(h * 0.06);
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

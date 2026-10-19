// User layer, batch 4: the title links, the presence's soft edge, and (below) the rest of L-items.
import { test, expect } from '@playwright/test';
import { boot, api, state } from './helpers.js';

test('L1 標題連結有效、新分頁開啟、手機點得到且在畫面內', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  const links = page.locator('#title #credit a');
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute('href', 'https://github.com/FinalHope487/the-deep-end');
  await expect(links.nth(0)).toContainText('在 GitHub 按星星');
  await expect(links.nth(0)).toContainText('⭐');
  await expect(links.nth(1)).toHaveAttribute('href', 'https://github.com/FinalHope487');
  for (const i of [0, 1]) {
    await expect(links.nth(i)).toHaveAttribute('target', '_blank');
    await expect(links.nth(i)).toHaveAttribute('rel', /noopener/);
  }
  for (const i of [0, 1]) {
    const box = await links.nth(i).boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(844);              // on the screen
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(24);                    // a thumb can hit it
    // nothing else sits on top of it
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href'), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(top).toBe(await links.nth(i).getAttribute('href'));
  }
});

test('L3 走向圓角深水池的角落：被圓角擋住，不會掉進深水', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: '開始' }).click();
  const spot = await page.evaluate(() => {
    const d = window.__deepend;
    for (let r = 0; r < 25; r++) for (let cz = -r; cz <= r; cz++) for (let cx = -r; cx <= r; cx++) {
      if (Math.max(Math.abs(cx), Math.abs(cz)) !== r) continue;
      const L = d.layoutAt(cx, cz);
      if (L.kind !== 'zone') continue;   // since the region floor (batch 6) rounded deep-pool corners are the landmark zones' only
      for (let i = 0; i < 256; i++) if (L.corner[i]) {
        const c = L.corner[i], sx = (c - 1) & 1 ? 1 : -1, sz = (c - 1) & 2 ? 1 : -1;
        return { x: L.ox + (i % 16) + 0.5 + sx * 2.6, z: L.oz + ((i / 16) | 0) + 0.5 + sz * 2.6, yaw: Math.atan2(sx, sz) };
      }
    }
    return null;
  });
  expect(spot).not.toBeNull();
  await api(page, 'teleport', spot.x, spot.z, spot.yaw);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(3500);
  await page.keyboard.up('KeyW');
  const s = await page.evaluate(() => window.__deepend.state());
  expect(s.floorH).toBeGreaterThan(-0.6);   // the pool floor is at -2.4: the body never went in
});

test('舊存檔（沒有 h 欄位）照常載入：繼續後站在地面，不報錯', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => localStorage.setItem('deepend.save.v1', JSON.stringify({ v: 1, seed: 42, x: 8.5, z: 8.5, yaw: 0, elapsed: 5, distance: 3, visited: [true, false, false, false], found: [] })));
  await page.reload();
  await page.waitForFunction(() => window.__deepend?.ready === true, null, { timeout: 60_000 });
  await page.getByRole('button', { name: '繼續' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const s = await state(page);
  expect(Math.abs(s.floorH)).toBeLessThan(0.5);
  expect(s.visited[0]).toBe(true);
  expect(errors).toEqual([]);
});

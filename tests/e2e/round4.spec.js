// User layer, batch 4: the title links, the presence's soft edge, and (below) the rest of L-items.
import { test, expect } from '@playwright/test';
import { boot, api } from './helpers.js';

test('L1 標題畫面：開始鈕下方有 repo 與作者主頁連結，新分頁開啟、手機點得到、不擋按鈕', async ({ page }) => {
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
  const start = await page.locator('#btn-start').boundingBox();
  for (const i of [0, 1]) {
    const box = await links.nth(i).boundingBox();
    expect(box.y).toBeGreaterThan(start.y + start.height);          // below the start button
    expect(box.y + box.height).toBeLessThanOrEqual(844);              // on the screen
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(24);                    // a thumb can hit it
    // nothing else sits on top of it
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href'), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(top).toBe(await links.nth(i).getAttribute('href'));
  }
  const op = await page.evaluate(() => getComputedStyle(document.querySelector('#credit')).color);
  expect(op).toMatch(/rgba\(.*0\.\d+\)/);                              // semi-transparent small text
});

test('L2 人影：剪影邊緣在貼圖裡做了柔邊（約 8% 以上的寬度從 10% 漸到 90% 不透明）', async ({ page }) => {
  await boot(page);
  const edge = await api(page, 'presenceEdge');
  expect(edge).toBeGreaterThanOrEqual(0.08);
});

test('L3 走向圓角深水池的角落：被圓角擋住，不會掉進深水', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: '開始' }).click();
  const spot = await page.evaluate(() => {
    const d = window.__deepend;
    for (let r = 0; r < 25; r++) for (let cz = -r; cz <= r; cz++) for (let cx = -r; cx <= r; cx++) {
      if (Math.max(Math.abs(cx), Math.abs(cz)) !== r) continue;
      const L = d.layoutAt(cx, cz);
      if (L.kind !== 'pool') continue;
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

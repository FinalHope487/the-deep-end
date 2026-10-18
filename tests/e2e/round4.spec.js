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

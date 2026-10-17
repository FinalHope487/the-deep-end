// User layer: stairs, the upper floor, slides and the quieter guides, driven by real keys in real Chromium.
import { test, expect } from '@playwright/test';
import { boot, state, api, start, hold } from './helpers.js';

test('長樓梯：按住前進，從水裡走上樓梯到二樓', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  const f = await api(page, 'findFlight', 8, 8);
  expect(f).not.toBeNull();
  await api(page, 'teleport', f.x, f.z, f.yaw, true, f.h);
  expect((await state(page)).floorH).toBeLessThan(0.1);
  await hold(page, ['KeyW'], 5000);
  await expect.poll(async () => (await state(page)).floorH, { timeout: 3000 }).toBeGreaterThan(2.9);
  expect(errors).toEqual([]);
});

async function nearestSlide(page) {
  let sl = await api(page, 'findSlide', 8, 8);
  if (!sl) { const z2 = (await api(page, 'zones'))[1]; sl = await api(page, 'findSlide', z2.x, z2.z); }
  return sl;
}

test('溜滑梯：在二樓的入口往前走就滑下去，落進淺水濺起水滴', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  const sl = await nearestSlide(page);
  expect(sl).not.toBeNull();
  await api(page, 'teleport', sl.x, sl.z, sl.yaw, true, sl.h);
  expect((await state(page)).floorH).toBeGreaterThan(2.9);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await state(page)).riding, { timeout: 3000 }).toBe(true);
  await page.keyboard.up('KeyW');
  await expect.poll(async () => (await state(page)).riding, { timeout: 8000 }).toBe(false);
  const s = await state(page);
  expect(s.inWater).toBe(true);
  expect(s.wet).toBeGreaterThan(0);
  expect(s.floorH).toBeLessThan(0);
  expect(Math.hypot(s.x - sl.land.x, s.z - sl.land.z)).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('在二樓存檔，重新整理後「繼續」回到二樓同一處', async ({ page }) => {
  await boot(page);
  await start(page);
  const u = await api(page, 'findUpper', 8, 8);
  expect(u).not.toBeNull();
  await api(page, 'teleport', u.x, u.z, 0, true, u.h);
  expect((await state(page)).floorH).toBeCloseTo(u.h, 2);
  await page.getByRole('button', { name: '暫停' }).click();
  await page.reload();
  await page.waitForFunction(() => window.__deepend?.ready === true, null, { timeout: 60_000 });
  await page.getByRole('button', { name: '繼續' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const s = await state(page);
  expect(s.floorH).toBeCloseTo(u.h, 2);
  expect(Math.hypot(s.x - u.x, s.z - u.z)).toBeLessThan(0.3);
});

test('二樓的小發現從樓下撿不到，上了二樓才撿得到', async ({ page }) => {
  await boot(page);
  await start(page);
  const items = (await api(page, 'items')).filter((i) => i.up);
  expect(items.length).toBeGreaterThan(0);
  // stand right under one of them on the ground floor
  let it = null;
  for (const c of items) {
    for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      await api(page, 'teleport', c.x + ox, c.z + oz, 0, true, 0);
      const s = await state(page);
      if (s.floorH < 1) { it = c; break; }
    }
    if (it) break;
  }
  expect(it).not.toBeNull();
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  expect((await state(page)).found).toEqual([]);
  await api(page, 'teleport', it.x, it.z + 0.01, 0, true, it.h);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await state(page)).found).toEqual([it.id]);
});

test('引導光暈會被牆擋住（深度測試），不再穿牆顯示', async ({ page }) => {
  await boot(page);
  await start(page);
  await expect.poll(async () => (await state(page)).guideOpacity).toBeGreaterThan(0);
  expect((await state(page)).guideDepthTest).toBe(true);
});

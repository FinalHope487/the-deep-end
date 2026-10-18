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

test('A2 區域 2 的樓梯欄杆：貼著欄杆正面走向欄杆端點，會繞過去而不是卡住', async ({ page }) => {
  const errors = await boot(page, { seed: 1 });
  await start(page);
  // seed 1, zone 2: the foot of the L stair has rails on both sides; walk north along the west rail's line
  await api(page, 'teleport', 62.75, 225, 0, true);
  const before = await state(page);
  expect(before.z).toBeCloseTo(225, 1);
  await hold(page, ['KeyW'], 2000);
  expect((await state(page)).z).toBeLessThan(222.5);
  expect(errors).toEqual([]);
});

test('C8 顆粒感只在「高」畫質出現，中／低畫質沒有', async ({ page }) => {
  const errors = await boot(page);
  const setQuality = (q) => page.evaluate((v) => {
    const sel = document.getElementById('opt-quality');
    sel.value = v;
    sel.dispatchEvent(new Event('change'));
  }, q);
  const grainShown = () => page.evaluate(() => {
    const el = document.getElementById('grain');
    return !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).backgroundImage.startsWith('url(');
  });
  await setQuality('high');
  expect(await grainShown()).toBe(true);
  await setQuality('mid');
  expect(await grainShown()).toBe(false);
  await setQuality('low');
  expect(await grainShown()).toBe(false);
  await setQuality('high');
  expect(await grainShown()).toBe(true);
  expect(errors).toEqual([]);
});

const saveOf = (page) => page.evaluate(() => localStorage.getItem('deepend.save.v1'));

test('F 從標題跳轉到區域 3：所有區域與出口開放、旗標亮起、不計入進度、不存檔', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.getByRole('button', { name: '跳轉關卡' }).first()).toBeVisible();
  await page.getByRole('button', { name: '跳轉關卡' }).first().click();
  await expect(page.locator('#jump-list button')).toHaveCount(5);
  await page.locator('#jump-list button[data-jump="zone3"]').click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const zone3 = (await api(page, 'zones'))[2];
  const s = await state(page);
  expect(s.jumped).toBe(true);
  expect(Math.abs(s.x - zone3.x)).toBeLessThanOrEqual(16);
  expect(Math.abs(s.z - zone3.z)).toBeLessThanOrEqual(16);
  expect(s.exitUnlocked).toBe(true);
  expect(s.doorVisible).toBe(true);
  expect(s.explore).toBe(0);
  expect(s.distance).toBe(0);
  await expect(page.locator('#jump-flag')).toBeVisible();
  await hold(page, ['KeyW'], 1500);
  const after = await state(page);
  expect(after.explore).toBe(0);
  expect(after.distance).toBe(0);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  expect(await saveOf(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('F 暫停選單跳轉到出口：真實進度與存檔原封不動，回標題後繼續仍是跳轉前的進度', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  const z1 = (await api(page, 'zones'))[0];
  await api(page, 'teleport', z1.x, z1.z, 0);
  await expect.poll(async () => (await state(page)).visited[0]).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  const before = await saveOf(page);
  expect(before).not.toBeNull();
  const explore = (await state(page)).explore;
  await page.getByRole('button', { name: '跳轉關卡' }).last().click();
  await page.locator('#jump-list button[data-jump="exit"]').click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const s = await state(page);
  expect(s.jumped).toBe(true);
  expect(s.explore).toBe(explore);
  const w = (await api(page, 'zones')).length;
  expect(w).toBe(4);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  expect(await saveOf(page)).toBe(before);
  await page.getByRole('button', { name: '回標題' }).click();
  expect(await saveOf(page)).toBe(before);
  await page.getByRole('button', { name: '繼續' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const back = await state(page);
  expect(back.jumped).toBe(false);
  expect(back.explore).toBe(explore);
  expect(back.exitUnlocked).toBe(false);
  await expect(page.locator('#jump-flag')).toBeHidden();
  expect(errors).toEqual([]);
});

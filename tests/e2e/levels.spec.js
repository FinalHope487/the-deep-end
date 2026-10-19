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

test('溜滑梯：在二樓或平台塔的入口往前走就滑下去，落進淺水', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  const sl = await nearestSlide(page);
  expect(sl).not.toBeNull();
  await api(page, 'teleport', sl.x, sl.z, sl.yaw, true, sl.h);
  expect(Math.abs((await state(page)).floorH - sl.h)).toBeLessThan(0.05);   // at the mouth, 2F or a tower's platform
  expect(sl.h).toBeGreaterThan(1.4);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await state(page)).riding, { timeout: 3000 }).toBe(true);
  await page.keyboard.up('KeyW');
  await expect.poll(async () => (await state(page)).riding, { timeout: 8000 }).toBe(false);
  const s = await state(page);
  expect(s.inWater).toBe(true);   // the lens only gets wet in water 0.9 m deep and more (K3), so no check on it here
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

test('A2 區域 2 的樓梯欄杆：貼著欄杆正面走向欄杆端點，會繞過去而不是卡住', async ({ page }) => {
  const errors = await boot(page, { seed: 1 });
  await start(page);
  // seed 1, zone 2: the foot of the L stair has rails on both sides; walk north along the west rail's line
  await api(page, 'teleport', -82.75, 16.2, 0, true);
  const before = await state(page);
  expect(before.z).toBeCloseTo(16.2, 1);
  await hold(page, ['KeyW'], 2000);
  expect((await state(page)).z).toBeLessThan(13.7);
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

test('F 從標題（沒有進度）跳轉到區域 3：直接跳、前兩區算已走過、旗標亮起、之後的探索照常計入並存檔', async ({ page }) => {
  const errors = await boot(page);
  await page.getByRole('button', { name: '跳轉關卡' }).first().click();
  await expect(page.locator('#jump-list button')).toHaveCount(6);
  await page.locator('#jump-list button[data-jump="zone3"]').click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const zone3 = (await api(page, 'zones'))[2];
  const s = await state(page);
  expect(s.jumped).toBe(true);
  expect(Math.abs(s.x - zone3.x)).toBeLessThanOrEqual(16);
  expect(Math.abs(s.z - zone3.z)).toBeLessThanOrEqual(16);
  expect(s.visited.slice(0, 2)).toEqual([true, true]);
  expect(s.exitUnlocked).toBe(false);
  expect(s.explore).toBeGreaterThanOrEqual(30);
  expect(s.distance).toBe(0);
  await expect(page.locator('#jump-flag')).toBeVisible();
  await hold(page, ['KeyW'], 1500);
  expect((await state(page)).distance).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  expect(await saveOf(page)).not.toBeNull();
  expect(errors).toEqual([]);
});

test('F 有進度時往回跳（4→1）：先警告進度會遺失，確認後進度、存檔、氛圍都回到區域 1 的樣子', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  const zs = await api(page, 'zones');
  for (const z of zs) { await api(page, 'teleport', z.x, z.z, 0); await page.waitForTimeout(150); }
  await expect.poll(async () => (await state(page)).visited.every(Boolean)).toBe(true);
  await expect.poll(async () => (await state(page)).tension, { timeout: 15000 }).toBeGreaterThan(0.2);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  const before = await saveOf(page);
  expect(before).not.toBeNull();
  await page.getByRole('button', { name: '跳轉關卡' }).last().click();
  const btn = page.locator('#jump-list button[data-jump="zone1"]');
  await btn.click();
  await expect(btn).toContainText('遺失');                      // the first press only warns
  expect((await state(page)).mode).toBe('paused');
  expect(await saveOf(page)).toBe(before);
  await btn.click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const s = await state(page);
  expect(s.jumped).toBe(true);
  expect(s.visited.filter(Boolean).length).toBeLessThanOrEqual(1);   // the zone it lands in may count as entered
  expect(s.tension).toBeLessThan(0.2);
  expect(s.exitUnlocked).toBe(false);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  expect(await saveOf(page)).not.toBe(before);                   // the save was overwritten with the new progress
  expect(errors).toEqual([]);
});

test('G 從 1F 走樓梯：往上到區域 3 的 2F，往下到區域 4 的 B1，樓梯直接通進區域', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  const zones = await api(page, 'zones');
  expect(zones.map((z) => z.level)).toEqual([0, 0, 1, -1]);
  for (const [i, sign] of [[2, 1], [3, -1]]) {
    const s = await api(page, 'stairInto', i);
    expect(s.stair).toMatchObject({ dir: 0, level: sign });
    await api(page, 'teleport', s.x, s.z, s.yaw, true, 0);
    expect(Math.abs((await state(page)).floorH)).toBeLessThan(0.1);
    await hold(page, ['KeyW'], 7000);
    const after = await state(page);
    expect(after.floorH * sign).toBeGreaterThan(2.9);       // 3 m up / 3 m down
    expect(after.visited[i]).toBe(true);                      // the stair ends inside the zone
  }
  expect(errors).toEqual([]);
});

// ---------- H: mega rooms ----------

// the mega room whose footprint holds the player
const megaAround = async (page) => {
  const s = await state(page);
  return (await api(page, 'megas', 12)).find((m) => s.x >= m.cx0 * 16 && s.x < m.cx0 * 16 + 32 && s.z >= m.cz0 * 16 && s.z < m.cz0 * 16 + 32);
};

test('H5 從標題跳轉到巨大房間：落在地面入口、四區算已走過、存檔', async ({ page }) => {
  const errors = await boot(page);
  await page.getByRole('button', { name: '跳轉關卡' }).first().click();
  await page.locator('#jump-list button[data-jump="mega"]').click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const s = await state(page);
  const m = await megaAround(page);
  expect(m, 'the player stands inside a mega room').toBeTruthy();
  expect(Math.abs(s.floorH)).toBeLessThan(0.05);
  const edge = Math.min(s.x - m.cx0 * 16, m.cx0 * 16 + 32 - s.x, s.z - m.cz0 * 16, m.cz0 * 16 + 32 - s.z);
  expect(edge).toBeLessThan(4);                       // just inside a doorway
  expect(s.jumped).toBe(true);
  expect(s.visited.every(Boolean)).toBe(true);
  await expect(page.locator('#jump-flag')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  expect(await saveOf(page)).not.toBeNull();
  expect(errors).toEqual([]);
});

test('H3 深淵邊的欄杆：朝池子一直走，停在欄杆前，不會掉進去也不會下沉', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  const m = (await api(page, 'megas', 14)).find((r) => r.type === 'abyss');
  expect(m, 'an abyss room near the start').toBeTruthy();
  const X = m.cx0 * 16, Z = m.cz0 * 16;
  // the north walkway, 5 m from the board tower, facing the pool
  await api(page, 'teleport', X + 20.5, Z + 3.5, Math.PI, true, 0);
  expect(Math.abs((await state(page)).floorH)).toBeLessThan(0.05);
  await hold(page, ['KeyW'], 5000);
  const s = await state(page);
  expect(s.z).toBeGreaterThan(Z + 3.5);              // it did walk
  expect(s.z).toBeLessThan(Z + 6);                   // and stopped before the pool's edge
  expect(Math.abs(s.floorH)).toBeLessThan(0.05);
  expect(Math.abs(s.x - (X + 20.5))).toBeLessThan(0.5);
  expect(errors).toEqual([]);
});

test('H4 2F 入口：從樓梯走上去，進到巨大房間平台', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  const m = (await api(page, 'megas', 14))[0];
  // the room's own stair chunk: E0 faces west (plaza on its east half), S0 faces north (plaza on its south half)
  const plaza = m.f2 === 0 ? { x: (m.cx0 + 2) * 16 + 12, z: m.cz0 * 16 + 8, yaw: Math.PI / 2 } : { x: m.cx0 * 16 + 8, z: (m.cz0 + 2) * 16 + 12, yaw: 0 };
  await api(page, 'teleport', plaza.x, plaza.z, plaza.yaw, true, 0);
  expect(Math.abs((await state(page)).floorH)).toBeLessThan(0.05);
  await hold(page, ['KeyW'], 7000);
  const up = await state(page);
  expect(up.floorH).toBeGreaterThan(2.9);
  expect((await megaAround(page))?.i).toBe(m.i);
  await api(page, 'teleport', plaza.x, plaza.z, plaza.yaw, true, 0);
  expect(errors).toEqual([]);
});

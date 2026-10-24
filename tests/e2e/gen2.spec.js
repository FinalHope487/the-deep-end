// Generator v2 prototype (?gen=v2) in the real game: boots clean, walks up and down the flights, wades, saves and continues.
import { test, expect } from '@playwright/test';
import { state, api, start, hold } from './helpers.js';

async function bootV2(page, seed = 42) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/?test=1&seed=${seed}&gen=v2`);
  await page.waitForFunction(() => window.__deepend?.ready === true, null, { timeout: 60_000 });
  return errors;
}

test('v2 開機無錯誤，起點站在乾地上，周圍的格子已載入', async ({ page }) => {
  const errors = await bootV2(page);
  await start(page);
  const s = await state(page);
  expect(s.gen).toBe(2);
  expect(s.floorH).toBe(0);
  expect(s.inWater).toBe(false);
  expect(s.loadedChunks).toBeGreaterThan(0);
  await hold(page, ['w'], 800);
  const s2 = await state(page);
  expect(Math.hypot(s2.x - s.x, s2.z - s.z)).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

for (const lv of [1, -1]) {
  test(`v2 走樓梯${lv > 0 ? '上 2F' : '下 B1'}再走回 1F`, async ({ page }) => {
    const errors = await bootV2(page);
    await start(page);
    const f = await api(page, 'gen2Flight', lv);
    expect(f).not.toBeNull();
    await api(page, 'teleport', f.x, f.z, f.yaw, true, 0);
    await hold(page, ['w'], f.ms);
    const up = await state(page);
    // on the far floor (or wading in a B1 flood at the foot of the flight)
    expect(up.floorH).toBeLessThanOrEqual(f.y + 0.01);
    expect(up.floorH).toBeGreaterThanOrEqual(f.y - 1.25);
    await api(page, 'teleport', up.x, up.z, f.yaw + Math.PI, false, up.floorH);
    await hold(page, ['w'], f.ms);
    expect((await state(page)).floorH).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('v2 淺水可以涉水走', async ({ page }) => {
  await bootV2(page);
  await start(page);
  const w = await api(page, 'gen2Wade');
  expect(w).not.toBeNull();
  await api(page, 'teleport', w.x, w.z, 0, true, w.h);
  await expect.poll(async () => (await state(page)).inWater).toBe(true);
  expect((await state(page)).floorH).toBeLessThan(0);
});

test('v2 存檔後繼續，回到存的位置', async ({ page }) => {
  await bootV2(page);
  await start(page);
  await hold(page, ['w'], 1500);
  await page.getByRole('button', { name: '暫停' }).click();
  const saved = await state(page);
  await page.getByRole('button', { name: '回標題' }).click();
  await page.reload();
  await page.waitForFunction(() => window.__deepend?.ready === true);
  await page.getByRole('button', { name: '繼續' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const s = await state(page);
  expect(Math.hypot(s.x - saved.x, s.z - saved.z)).toBeLessThan(0.3);
  expect(s.gen).toBe(2);
});

test('v1 走完四個地標的存檔，在 v2 繼續也不會出錯（v2 還沒有出口）', async ({ page }) => {
  await page.goto('/?test=1&gen=v2');
  await page.evaluate(() => localStorage.setItem('deepend.save.v1', JSON.stringify({
    v: 1, seed: 42, x: 8.5, z: 8.5, h: 0, yaw: 0, visited: [true, true, true, true], found: [], elapsed: 60, distance: 50, last: 3,
  })));
  const errors = await bootV2(page);
  await page.getByRole('button', { name: '繼續' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  await hold(page, ['w'], 500);
  const s = await state(page);
  expect(s.visited).toEqual([true, true, true, true]);
  expect(s.doorVisible).toBe(false);
  expect(errors).toEqual([]);
});

test('v2 巨型廳：從西端走過格邊到東端，再走回來', async ({ page }) => {
  const errors = await bootV2(page);
  await start(page);
  const g = await api(page, 'gen2Giant');
  expect(g).not.toBeNull();
  // at the seam both cells of the hall are built and in the scene (not only walkable: drawn)
  await api(page, 'teleport', g.seam, g.z, g.yaw, true, 0);
  await expect.poll(async () => (await api(page, 'gen2Loaded', g.i, g.j)) && (await api(page, 'gen2Loaded', g.i + 1, g.j)), { timeout: 60_000 }).toBe(true);
  await api(page, 'teleport', g.x, g.z, g.yaw, true, 0);
  await hold(page, ['w'], g.ms);
  const far = await state(page);
  expect(far.x).toBeGreaterThan(g.seam + 20);
  expect(far.floorH).toBe(0);
  expect(far.inWater).toBe(false);
  await api(page, 'teleport', far.x, far.z, g.yaw + Math.PI, false, 0);
  await hold(page, ['w'], g.ms);
  const back = await state(page);
  expect(back.x).toBeLessThan(g.seam - 20);
  expect(back.floorH).toBe(0);
  expect(errors).toEqual([]);
});

test('v2 L 形大廳：從外面的普通走廊走進一臂、過格邊進轉角、轉彎過另一條格邊到另一臂，再走回走廊', async ({ page }) => {
  const errors = await bootV2(page);
  await start(page);
  const g = await api(page, 'gen2L');
  expect(g).not.toBeNull();
  // all three cells of the hall built and drawn
  await api(page, 'teleport', g.turnX, g.z, g.yawA, true, 0);
  await expect.poll(async () => { for (const c of g.cells) if (!(await api(page, 'gen2Loaded', c.i, c.j))) return false; return true; }, { timeout: 60_000 }).toBe(true);
  // stand in the corridor outside the far end of arm A (the only placement), then walk: into the hall, through seam A,
  // turn on the spot, through seam B
  await api(page, 'teleport', g.x, g.z, g.yawA, true, 0);
  expect((g.x - g.hallX) * g.dx).toBeGreaterThan(0);   // outside the hall
  await hold(page, ['w'], g.msA);
  const corner = await state(page);
  expect((corner.x - g.seamX) * g.dx).toBeLessThan(-2);   // past seam A, in the corner part
  expect(corner.floorH).toBe(0);
  await api(page, 'teleport', corner.x, corner.z, g.yawB, false, 0);   // turn where it stands
  await hold(page, ['w'], g.msB);
  const armB = await state(page);
  expect((armB.z - g.seamZ) * g.dz).toBeGreaterThan(10);   // well past seam B, in arm B
  expect(armB.floorH).toBe(0);
  expect(armB.inWater).toBe(false);
  // and back the same way
  await api(page, 'teleport', armB.x, armB.z, g.yawB + Math.PI, false, 0);
  await hold(page, ['w'], g.msB);
  const back = await state(page);
  expect((back.z - g.seamZ) * g.dz).toBeLessThan(-2);
  await api(page, 'teleport', back.x, back.z, g.yawA + Math.PI, false, 0);
  await hold(page, ['w'], g.msA);
  const home = await state(page);
  expect((home.x - g.hallX) * g.dx).toBeGreaterThan(0.25);   // back out in the corridor
  expect(home.floorH).toBe(0);
  expect(errors).toEqual([]);
});

for (const lv of [1, -1]) {
  test(`v2 折返梯${lv > 0 ? '上 2F' : '下 B1'}：只用前進、橫移、後退走過去再走回來`, async ({ page }) => {
    const errors = await bootV2(page);
    await start(page);
    const g = await api(page, 'gen2Switch', lv);
    expect(g).not.toBeNull();
    await api(page, 'teleport', g.x, g.z, g.yaw, true, 0);   // only to stand in front of the way in
    const lat = (st) => (g.crossAxis === 'x' ? st.x : st.z);
    // strafe across the landing: the key that moves towards leg B is found by trying one (the legs are 3.5 m apart)
    const strafe = async (towards) => {
      const start = lat(await state(page));
      await hold(page, ['d'], 250);
      const first = (lat(await state(page)) - start) * towards;
      const key = first > 0 ? 'd' : 'a';
      for (let k = 0; k < 20 && Math.abs(lat(await state(page)) - start) < 3.2; k++) await hold(page, [key], 150);
      return key;
    };
    await hold(page, ['w'], g.fwdMs);
    const landing = await state(page);
    expect(Math.abs(landing.floorH - g.half)).toBeLessThan(0.6);   // half way up, on the landing
    const key = await strafe(1);
    await hold(page, ['s'], g.backMs);
    const far = await state(page);
    expect(far.floorH).toBeLessThanOrEqual(g.farY + 0.01);
    expect(far.floorH).toBeGreaterThanOrEqual(g.farY - 1.25);
    // and back: forward to the landing, across the other way, backwards down leg A
    await hold(page, ['w'], g.backMs);
    expect(Math.abs((await state(page)).floorH - g.half)).toBeLessThan(0.6);
    const before = lat(await state(page));
    for (let k = 0; k < 20 && Math.abs(lat(await state(page)) - before) < 3.2; k++) await hold(page, [key === 'd' ? 'a' : 'd'], 150);
    await hold(page, ['s'], g.fwdMs);
    expect((await state(page)).floorH).toBe(0);
    expect(errors).toEqual([]);
  });
}

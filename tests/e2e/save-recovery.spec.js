// A save whose position is lost: progress kept, the player put back at the landmark visited last, or at the start.
import { test, expect } from '@playwright/test';
import { boot, state, api } from './helpers.js';

async function continueWith(page, save) {
  await page.evaluate((s) => localStorage.setItem('deepend.save.v1', JSON.stringify(s)), save);
  await page.reload();
  await page.waitForFunction(() => window.__deepend?.ready === true);
  await page.getByRole('button', { name: '繼續' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  return state(page);
}

const BROKEN = { v: 1, seed: 42, x: 'lost', z: 8, yaw: 0, found: [1], elapsed: 300, distance: 900 };

test('位置壞掉、記得最後去過的地標：回那個地標的安全點，進度保留', { tag: '@smoke' }, async ({ page }) => {
  await boot(page);
  const k = 1;
  const safe = await api(page, 'safePoint', k);
  const s = await continueWith(page, { ...BROKEN, visited: [true, true, false, false], last: k });
  expect(Math.hypot(s.x - safe.x, s.z - safe.z)).toBeLessThan(1);
  expect(Math.abs(s.floorH - safe.h)).toBeLessThan(0.05);
  expect(s.visited).toEqual([true, true, false, false]);
  expect(s.found).toEqual([1]);
  expect(s.elapsed).toBeGreaterThanOrEqual(300);
  expect(s.seed).toBe(42);
  // the landmark seen last is still the one saved
  await page.evaluate(() => window.__deepend.state());
  await expect.poll(async () => JSON.parse(await page.evaluate(() => localStorage.getItem('deepend.save.v1'))).last, { timeout: 15_000 }).toBe(k);
});

test('位置壞掉、沒有最後地標紀錄（舊存檔）：回起點，進度保留', async ({ page }) => {
  await boot(page);
  const s = await continueWith(page, { ...BROKEN, visited: [true, false, false, false] });
  expect(Math.hypot(s.x - 8, s.z - 8)).toBeLessThan(1);
  expect(s.floorH).toBe(0);
  expect(s.visited).toEqual([true, false, false, false]);
  expect(s.found).toEqual([1]);
});

test('別的生成器存的位置不用：回起點', async ({ page }) => {
  await boot(page);
  const s = await continueWith(page, { ...BROKEN, x: 40.5, z: 8.5, gen: 2, visited: [false, false, false, false] });
  expect(Math.hypot(s.x - 8, s.z - 8)).toBeLessThan(1);
});

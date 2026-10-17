// Shared helpers for the user-layer tests.
import { expect } from '@playwright/test';

export async function boot(page, { seed = 42, path = '/' } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${path}?test=1&seed=${seed}`);
  await page.waitForFunction(() => window.__deepend?.ready === true, null, { timeout: 60_000 });
  return errors;
}

export const state = (page) => page.evaluate(() => window.__deepend.state());
export const api = (page, fn, ...args) => page.evaluate(([f, a]) => window.__deepend[f](...a), [fn, args]);

export async function start(page) {
  await page.getByRole('button', { name: '開始' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
}

export async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
}

// a corner of the deep black pool, looking across it: long open sight lines for the presence
export async function deepPoolCorner(page) {
  const z = (await api(page, 'zones'))[3];
  await api(page, 'teleport', z.x - 16 + 3.5, z.z - 16 + 3.5, -3 * Math.PI / 4);   // walkway corner inside the ring wall
}

export async function visitAllZones(page) {
  for (const z of await api(page, 'zones')) {
    await api(page, 'teleport', z.x, z.z);
    await expect.poll(async () => (await state(page)).visited[z.index]).toBe(true);
  }
}

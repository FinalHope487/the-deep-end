// Regressions found by the adversarial review (2026-10-18). Each test failed before its fix.
import { test, expect } from '@playwright/test';
import { boot, state, api, start, hold, visitAllZones, deepPoolCorner } from './helpers.js';

test('遠處的「存在」在壓抑度最高時仍在可視距離內', async ({ page }) => {
  await boot(page);
  await start(page);
  await visitAllZones(page);
  await api(page, 'setElapsed', 1500);
  await deepPoolCorner(page);
  await expect.poll(async () => (await state(page)).tension, { timeout: 15_000 }).toBeGreaterThan(0.95);
  await expect.poll(async () => { await api(page, 'forcePresence'); return (await state(page)).presence.active; }, { timeout: 20_000 }).toBe(true);
  const s = await state(page);
  expect(s.presence.dist).toBeLessThan(s.cameraFar - 0.5);
});

test('存檔位置在牆裡：繼續後被移到最近的地板並能走動', async ({ page }) => {
  await boot(page);
  const wall = await api(page, 'findTile', 'wall', 8, 8, 20);
  await page.evaluate(([x, z]) => localStorage.setItem('deepend.save.v1', JSON.stringify({
    v: 1, seed: 42, x, z, yaw: 0, visited: [false, false, false, false], found: [], elapsed: 30, distance: 10,
  })), [wall.x, wall.z]);
  await page.reload();
  await page.waitForFunction(() => window.__deepend?.ready === true);
  await page.getByRole('button', { name: '繼續' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const s0 = await state(page);
  let moved = 0;
  for (const k of ['w', 'a', 's', 'd']) {
    await hold(page, [k], 400);
    const s = await state(page);
    moved = Math.max(moved, Math.hypot(s.x - s0.x, s.z - s0.z));
  }
  expect(moved).toBeGreaterThan(0.5);
});

// 2026-10-24 decision: a broken field is dropped, not the whole save (docs/decisions/2026-10-24-save-recovery.md)
test('不合理的存檔欄位（負的時間、超大座標）不採用，其餘進度保留', async ({ page }) => {
  await boot(page);
  for (const bad of [{ elapsed: -5 }, { x: 1e30 }, { z: 640000 }, { distance: -1 }]) {
    await page.evaluate((bad) => localStorage.setItem('deepend.save.v1', JSON.stringify({
      v: 1, seed: 42, x: 30.5, z: 8.5, yaw: 0, visited: [true, false, false, false], found: [2], elapsed: 30, distance: 10, ...bad,
    })), bad);
    await page.reload();
    await page.waitForFunction(() => window.__deepend?.ready === true);
    await page.getByRole('button', { name: '繼續' }).click();
    await expect.poll(async () => (await state(page)).mode).toBe('playing');
    const st = await state(page);
    expect(st.visited).toEqual([true, false, false, false]);
    expect(st.found).toEqual([2]);
    expect(Math.abs(st.x) < 1e5 && Math.abs(st.z) < 1e5).toBe(true);   // never the bad coordinate
    expect(st.elapsed).toBeGreaterThanOrEqual(0);
    expect(st.distance).toBeGreaterThanOrEqual(0);
    if (bad.x || bad.z) expect(Math.hypot(st.x - 8, st.z - 8)).toBeLessThan(1);   // position lost, no landmark recorded: the start
    await page.getByRole('button', { name: '暫停' }).click();
    await page.getByRole('button', { name: '回標題' }).click();
  }
});

test('回標題再按開始，會是新的世界', async ({ page }) => {
  await boot(page);
  await start(page);
  const first = (await state(page)).seed;
  await page.getByRole('button', { name: '暫停' }).click();
  await page.getByRole('button', { name: '回標題' }).click();
  await start(page);
  expect((await state(page)).seed).not.toBe(first);
});

test('回標題時遠處的「存在」不會留在畫面上', async ({ page }) => {
  await boot(page);
  await start(page);
  await api(page, 'setElapsed', 1500);
  await deepPoolCorner(page);
  await expect.poll(async () => (await state(page)).tension, { timeout: 15_000 }).toBeGreaterThan(0.5);
  await expect.poll(async () => { await api(page, 'forcePresence'); return (await state(page)).presence.visible; }, { timeout: 20_000 }).toBe(true);
  await page.getByRole('button', { name: '暫停' }).click();
  await page.getByRole('button', { name: '回標題' }).click();
  expect((await state(page)).presence.visible).toBe(false);
});

test('按住 W 暫停再繼續，不用放開重按就能走', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  await page.getByRole('button', { name: '繼續探索' }).click();
  const s0 = await state(page);
  for (let i = 0; i < 10; i++) { await page.keyboard.down('w'); await page.waitForTimeout(60); }   // OS auto-repeat
  const s1 = await state(page);
  await page.keyboard.up('w');
  expect(s0.z - s1.z).toBeGreaterThan(0.8);
});

test('觸控筆電（有觸控、但有滑鼠）用電腦版操作說明', async ({ browser }) => {
  const ctx = await browser.newContext({ hasTouch: true, isMobile: false });
  const page = await ctx.newPage();
  await boot(page);
  await page.mouse.move(200, 200);
  await page.mouse.move(260, 240);
  await expect(page.locator('#hint')).toContainText('WASD');
  await page.touchscreen.tap(640, 600);
  await expect(page.locator('#hint')).toContainText('左半邊');
  await ctx.close();
});

test('卡住的音檔 15 秒後放棄下載', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/amb_drone.mp3', () => { /* never answers */ });
  await boot(page);
  await start(page);
  await page.waitForTimeout(16_500);
  expect((await state(page)).audio.failed).toBe(1);
});

test('舊瀏覽器（不支援 importmap）或模組載不到時，開始鈕說明原因', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/three.module.min.js', (r) => r.abort());
  await page.addInitScript(() => { delete HTMLScriptElement.supports; });
  await page.goto('/?test=1&seed=42');
  await expect(page.locator('#btn-start')).toContainText('瀏覽器版本太舊');
  await page.unroute('**/three.module.min.js');
  const page2 = await page.context().newPage();
  await page2.route('**/three.module.min.js', (r) => r.abort());
  await page2.goto('/?test=1&seed=42');
  await expect(page2.locator('#btn-start')).toContainText('載入失敗', { timeout: 30_000 });
});

test('某個音檔一直載不到時，其他聲音照常可用', async ({ page }) => {
  await page.route('**/amb_drone.mp3', () => { /* never answers */ });
  await boot(page);
  await start(page);
  await expect.poll(async () => (await state(page)).audio, { timeout: 15_000 }).toMatchObject({ ready: true, sounds: 13 });
});

test('音訊被系統暫停後，點一下畫面就恢復', async ({ page }) => {
  await boot(page);
  await start(page);
  await expect.poll(async () => (await state(page)).audio.state).toBe('running');
  await api(page, 'audioSuspend');
  await expect.poll(async () => (await state(page)).audio.state).toBe('suspended');
  await page.mouse.click(640, 400);
  await expect.poll(async () => (await state(page)).audio.state).toBe('running');
});

test('瀏覽器不支援 WebGL2 時，開始鈕說明原因而不是一直轉圈', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : orig.call(this, type, ...rest); };
  });
  await page.goto('/?test=1&seed=42');
  await expect(page.locator('#btn-start')).toContainText('WebGL2', { timeout: 15_000 });
  await expect(page.locator('#btn-start')).toBeDisabled();
});

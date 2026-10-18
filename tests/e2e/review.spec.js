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
  expect(s.presence.dist).toBeGreaterThanOrEqual(20);
  expect(s.presence.dist).toBeLessThanOrEqual(30.5);
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

test('不合理的存檔（負的時間、超大座標）會被忽略', async ({ page }) => {
  await boot(page);
  for (const bad of [{ elapsed: -5 }, { x: 1e30 }, { z: 640000 }, { distance: -1 }]) {
    await page.evaluate((bad) => localStorage.setItem('deepend.save.v1', JSON.stringify({
      v: 1, seed: 42, x: 8, z: 8, yaw: 0, visited: [false, false, false, false], found: [], elapsed: 30, distance: 10, ...bad,
    })), bad);
    await page.reload();
    await page.waitForFunction(() => window.__deepend?.ready === true);
    await expect(page.getByRole('button', { name: '繼續' })).toBeHidden();
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

test('目標換成下一區後，已載入區塊的門邊指示牌改指向新目標', async ({ page }) => {
  await boot(page);
  await start(page);
  await expect.poll(async () => (await api(page, 'guideTargets')).length).toBeGreaterThan(0);
  expect(new Set(await api(page, 'guideTargets'))).toEqual(new Set([0]));
  const [z1] = await api(page, 'zones');
  await api(page, 'teleport', z1.x, z1.z);
  await expect.poll(async () => (await state(page)).visited[0]).toBe(true);
  await api(page, 'teleport', 8, 8, 0);
  await expect.poll(async () => (await api(page, 'guideTargets')).filter((z) => z === 0).length, { timeout: 15_000 }).toBe(0);
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

test('暫停中不重畫，燈光閃爍也停住', async ({ page }) => {
  await boot(page);
  await start(page);
  await visitAllZones(page);
  await api(page, 'setElapsed', 1500);
  await expect.poll(async () => (await state(page)).tension, { timeout: 15_000 }).toBeGreaterThan(0.9);
  await api(page, 'forceFlicker');
  await page.getByRole('button', { name: '暫停' }).click();
  await page.waitForTimeout(300);
  const a = await state(page);
  await page.waitForTimeout(600);
  const b = await state(page);
  expect(b.renders - a.renders).toBeLessThanOrEqual(2);
  expect(b.lamp).toBe(b.lampNominal);   // the frozen frame shows steady lamps, not a mid-flicker dark
});

test('結算畫面不重畫', async ({ page }) => {
  await boot(page);
  await start(page);
  await visitAllZones(page);
  const ex = await api(page, 'exit');
  await api(page, 'teleport', ex.x + 0.4, ex.z);
  await expect(page.locator('#end')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
  const a = await state(page);
  await page.waitForTimeout(800);
  expect((await state(page)).renders - a.renders).toBeLessThanOrEqual(1);
});

test('找不到看得到的位置時，人影幾秒後再找（不是等一兩分鐘）', async ({ page }) => {
  await boot(page);
  await start(page);
  await api(page, 'setElapsed', 1500);
  const pipes = (await api(page, 'zones'))[2];
  const spot = await api(page, 'findTile', 'floor', pipes.x, pipes.z, 6);
  await api(page, 'teleport', spot.x, spot.z, 0);
  await expect.poll(async () => (await state(page)).tension, { timeout: 15_000 }).toBeGreaterThan(0.5);
  await api(page, 'forcePresence');
  await page.waitForTimeout(200);
  const s = await state(page);
  expect(s.presence.active || s.presenceCooldown <= 4.01).toBe(true);
});

test('卡住的音檔 15 秒後放棄下載', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/amb_drone.mp3', () => { /* never answers */ });
  await boot(page);
  await start(page);
  await page.waitForTimeout(16_500);
  expect((await state(page)).audio.failed).toBe(1);
});

test('建區塊與更新門邊指示牌加起來，一幀最多建 1 塊', async ({ page }) => {
  await boot(page);
  await start(page);
  const [z1] = await api(page, 'zones');
  await api(page, 'teleport', z1.x, z1.z);
  await expect.poll(async () => (await state(page)).visited[0]).toBe(true);
  // guides are now stale everywhere; walk-teleport one chunk at a time so new chunks queue up meanwhile
  for (let i = 1; i <= 6; i++) {
    await api(page, 'teleport', z1.x + i * 16, z1.z, 0, false);
    await page.waitForTimeout(120);
  }
  await expect.poll(async () => (await state(page)).pendingChunks, { timeout: 15_000 }).toBe(0);
  await page.waitForTimeout(1500);
  expect((await state(page)).maxChunkBuildsPerFrame).toBe(1);
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

test('第一次踏進水裡不會臨時編譯 shader', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.waitForTimeout(300);
  const before = (await state(page)).programs;
  const run = await api(page, 'findRun', 'shallow', 3);
  await api(page, 'teleport', run.x, run.z, run.yaw);
  await expect.poll(async () => (await state(page)).wet).toBeGreaterThan(0.5);
  await page.waitForTimeout(300);
  expect((await state(page)).programs).toBe(before);
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

test('K2 燈閃爍時只有燈板變暗，地磚與牆的顏色不變', async ({ page }) => {
  await boot(page);
  await start(page);
  await visitAllZones(page);
  await api(page, 'setElapsed', 1500);
  await expect.poll(async () => (await state(page)).tension, { timeout: 15_000 }).toBeGreaterThan(0.9);
  await api(page, 'forceFlicker');
  await expect.poll(async () => { const s = await state(page); return s.lamp !== s.lampNominal; }).toBe(true);
  const s = await state(page);
  expect(s.tile).toBe(s.tileNominal);
});

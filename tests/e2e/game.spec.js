// User layer: real Chromium against the real page. One test per acceptance condition in docs/spec.md §10.
import { test, expect } from '@playwright/test';
import { boot, state, api, start, hold } from './helpers.js';


// A walkable tile next to (x,z) at `dist`, plus the yaw that faces (x,z) from there
async function standoff(page, x, z, dist) {
  return page.evaluate(([x, z, dist]) => {
    const w = window.__deepend;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const px = x + Math.cos(ang) * dist, pz = z + Math.sin(ang) * dist;
      const t = w.findTile('floor', px, pz, 0);
      if (!t) continue;
      return { x: px, z: pz, yaw: Math.atan2(-(x - px), -(z - pz)) };
    }
    return null;
  }, [x, z, dist]);
}

test('A1 開始後進入遊戲，畫面只剩暫停鈕', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator('#title')).toBeVisible();
  await start(page);
  await expect(page.locator('#title')).toBeHidden();
  await expect(page.getByRole('button', { name: '暫停' })).toBeVisible();
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('#end')).toBeHidden();
  await expect(page.locator('#bubble')).toBeHidden();
  expect(errors).toEqual([]);
});

test('A2 按住前進 5 秒約前進 15 m，Shift 跑更快', async ({ page }) => {
  await boot(page);
  await start(page);
  const s0 = await state(page);
  await hold(page, ['w'], 5000);
  const s1 = await state(page);
  const walked = s0.z - s1.z;
  expect(walked).toBeGreaterThan(12.5);
  expect(walked).toBeLessThan(15.6);
  expect(Math.abs(s1.x - s0.x)).toBeLessThan(0.01);

  await api(page, 'teleport', 8, 8, 0);
  await hold(page, ['w'], 1500);
  const walk15 = 8 - (await state(page)).z;
  await api(page, 'teleport', 8, 8, 0);
  await hold(page, ['Shift', 'w'], 1500);
  const run15 = 8 - (await state(page)).z;
  expect(run15).toBeGreaterThan(walk15 * 1.5);
});

test('A3 往同方向走 200 m，區塊持續生成且數量不增加', async ({ page }) => {
  await boot(page);
  await start(page);
  const counts = [];
  for (let i = 1; i <= 13; i++) {
    await api(page, 'teleport', 8, 8 - i * 16, 0, false);
    await expect.poll(async () => (await state(page)).pendingChunks, { timeout: 20_000 }).toBe(0);
    counts.push((await state(page)).loadedChunks);
  }
  const early = Math.max(...counts.slice(0, 4)), late = Math.max(...counts.slice(-4));
  expect(late).toBeLessThanOrEqual(early + 4);
  expect(Math.min(...counts)).toBeGreaterThan(15);
});

test('A4 同一種子重新生成，同座標區塊相同', async ({ page }) => {
  await boot(page);
  const same = await page.evaluate(() => [[3, -2], [-9, 4], [15, 15]].every(([x, z]) =>
    window.__deepend.layoutHash(x, z, 7) === window.__deepend.layoutHash(x, z, 7)));
  expect(same).toBe(true);
  const differ = await page.evaluate(() => [[3, -2], [-9, 4], [15, 15], [6, 6], [-4, -8]]
    .filter(([x, z]) => window.__deepend.layoutHash(x, z, 7) !== window.__deepend.layoutHash(x, z, 8)).length);
  expect(differ).toBeGreaterThanOrEqual(3);
});

test('A5 進入區域 1，出現區名且探索度 15%', async ({ page }) => {
  await boot(page);
  await start(page);
  const [z1] = await api(page, 'zones');
  await api(page, 'teleport', z1.x, z1.z);
  await expect(page.locator('#toast-zone')).toHaveText('淺水大廳');
  await expect.poll(async () => (await state(page)).explore).toBeCloseTo(15, 5);
  await page.getByRole('button', { name: '暫停' }).click();
  await expect(page.locator('#st-explore')).toHaveText('15%');
  await expect(page.locator('#st-zones')).toHaveText('淺水大廳');
});

test('A6 靠近小發現出現泡泡，點擊後拾取、探索度 +3.33%', async ({ page }) => {
  await boot(page);
  await start(page);
  // teleporting next to the item also enters its zone (+15%), so compare against the post-zone value
  const items = await api(page, 'items');
  const it = items[0];
  const spot = await standoff(page, it.x, it.z, 2.4);
  await api(page, 'teleport', spot.x, spot.z, spot.yaw);
  await expect.poll(async () => (await state(page)).visited[it.zone]).toBe(true);
  const before = (await state(page)).explore;
  const bubble = page.getByRole('button', { name: '可以拿' });
  await expect(bubble).toBeVisible();
  await bubble.click();
  await expect.poll(async () => (await state(page)).found).toEqual([it.id]);
  expect((await state(page)).explore - before).toBeCloseTo(40 / 12, 5);
  await expect(page.locator('#toast-item')).toHaveText(it.name);
  await expect(bubble).toBeHidden();
});

test('A7 去過 4 區後出口出現，走進出口顯示結算且不顯示種子', async ({ page }) => {
  const seed = 918273645;
  await boot(page, { seed });
  await start(page);
  for (const z of await api(page, 'zones')) {
    expect((await state(page)).exitUnlocked).toBe(false);
    await api(page, 'teleport', z.x, z.z);
    await expect.poll(async () => (await state(page)).visited[z.index]).toBe(true);
  }
  const s = await state(page);
  expect(s.exitUnlocked).toBe(true);
  expect(s.doorVisible).toBe(true);
  const ex = await api(page, 'exit');
  await api(page, 'teleport', ex.x + 0.5, ex.z);
  await expect(page.locator('#end')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#end-explore')).toHaveText('60%');
  const text = await page.locator('body').innerText();
  expect(text).toContain('探索距離');
  expect(text).not.toContain(String(seed));
  await page.getByRole('button', { name: '再玩一次' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  expect((await state(page)).seed).not.toBe(seed);
  await expect(page.locator('#end')).toBeHidden();
  await expect(page.locator('#fade')).toHaveCSS('opacity', '0');   // the white-out must lift for the new run
});

test('A8 淺水減速、水滴濾鏡出現，離水 4 秒後消失', async ({ page }) => {
  await boot(page);
  await start(page);
  const run = await api(page, 'findRun', 'shallow', 3);
  expect(run).not.toBeNull();
  await api(page, 'teleport', run.x, run.z, run.yaw);
  await expect.poll(async () => (await state(page)).wet).toBeGreaterThan(0.5);
  const a = await state(page);
  expect(a.inWater).toBe(true);
  await hold(page, ['w'], 1000);
  const b = await state(page);
  const waded = Math.hypot(b.x - a.x, b.z - a.z);
  expect(b.inWater).toBe(true);
  expect(waded).toBeGreaterThan(1.2);
  expect(waded).toBeLessThan(2.3);   // 3 m/s × 0.6 ≈ 1.8 m

  await api(page, 'teleport', 8, 8, 0);
  await page.waitForTimeout(1500);
  expect((await state(page)).wet).toBeGreaterThan(0);
  await page.waitForTimeout(3200);
  expect((await state(page)).wet).toBe(0);
});

test('A9 經過時間拉長，壓抑度上升、霧距離縮短', async ({ page }) => {
  await boot(page);
  await start(page);
  const s0 = await state(page);
  expect(s0.tension).toBeLessThan(0.01);
  await api(page, 'setElapsed', 900);
  await page.waitForTimeout(3000);
  const s1 = await state(page);
  expect(s1.tension).toBeGreaterThan(0.25);
  expect(s1.tension).toBeLessThanOrEqual(0.61);
  expect(s1.fogFar).toBeLessThan(s0.fogFar - 3);
});

test('A10 重新整理後標題出現「繼續」，回到原位置與進度', async ({ page }) => {
  await boot(page);
  await expect(page.getByRole('button', { name: '繼續' })).toBeHidden();
  await start(page);
  const [z1] = await api(page, 'zones');
  await api(page, 'teleport', z1.x, z1.z);
  await expect.poll(async () => (await state(page)).visited[0]).toBe(true);
  const saved = await state(page);
  await page.reload();
  await page.waitForFunction(() => window.__deepend?.ready === true, null, { timeout: 60_000 });
  await page.getByRole('button', { name: '繼續' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const s = await state(page);
  expect(Math.hypot(s.x - saved.x, s.z - saved.z)).toBeLessThan(0.5);
  expect(s.visited).toEqual([true, false, false, false]);
  expect(s.seed).toBe(saved.seed);
});

test('合併版 dist/index.html 可開啟並操作', async ({ page }) => {
  const errors = await boot(page, { path: '/dist/index.html' });
  const scripts = await page.locator('script[src]').count();
  expect(scripts).toBe(0);
  await start(page);
  await hold(page, ['w'], 1000);
  expect(8 - (await state(page)).z).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

// A11b: A11's frame-pacing check again, on the integrated GPU (Chromium started with --force_low_power_gpu, the
// `perf-igpu` project), over the places that cost the most: deep water, a zone entered (the guide rebuilds), a mega room,
// B1; then one lap at full CPU speed on the high quality setting to catch a fill-rate regression.
// Run alone: `npx playwright test --project=perf-igpu --no-deps`, with no other Playwright run or build going.
import { test, expect } from '@playwright/test';

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

async function open(browser, { throttle = 4, quality = null } = {}) {
  const ctx = await browser.newContext(PHONE);
  if (quality) await ctx.addInitScript((q) => localStorage.setItem('deepend.settings.v1', JSON.stringify({ volume: 0.8, quality: q, showFps: false, bgm: false })), quality);
  const page = await ctx.newPage();
  await page.goto('/?test=1&seed=42');
  await page.waitForFunction(() => window.__deepend?.ready === true, null, { timeout: 60_000 });
  await page.getByRole('button', { name: '開始' }).click();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.waitForTimeout(1000);
  return { ctx, page, cdp };
}

// teleport to each spot in turn (x, z, yaw, [h]) and walk forward `ms` from it; frames are counted over the whole run
async function lap(page, spots, ms) {
  await page.evaluate(() => window.__deepend.resetFrameStats());
  const info = [];
  for (const [x, z, yaw, h] of spots) {
    await page.evaluate(([x, z, yaw, h]) => window.__deepend.teleport(x, z, yaw, false, h), [x, z, yaw, h]);
    await page.keyboard.down('w');
    await page.waitForTimeout(ms);
    info.push(await page.evaluate(() => window.__deepend.drawInfo()));
    await page.keyboard.up('w');
  }
  const fs = await page.evaluate(() => window.__deepend.frameStats());
  const s = await page.evaluate(() => window.__deepend.state());
  return { fs, info, quality: s.quality };
}

function report(name, { fs, info, quality }) {
  const fps = 1000 / fs.avgMs;
  console.log(name, JSON.stringify({ fps: +fps.toFixed(1), slowPct: +fs.slowPct.toFixed(2), frames: fs.frames, maxMs: +fs.maxMs.toFixed(1), quality, draw: info }));
  expect(fs.frames).toBeGreaterThan(500);
  expect(fps).toBeGreaterThanOrEqual(58);
  expect(fs.slowPct).toBeLessThanOrEqual(2);
}

test('A11b-1 在深水裡游：≥ 58 fps', async ({ browser }) => {
  const { ctx, page } = await open(browser);
  const z = (await page.evaluate(() => window.__deepend.zones()))[3];   // the deep black pool (B1)
  // deep water west and east of the causeway, swimming across it
  const spots = [[z.x - 8, z.z - 8, 0.7], [z.x + 6, z.z + 9, -2.2], [z.x - 9, z.z + 7, 3.5]];
  report('A11b-1', await lap(page, spots, 5000));
  await ctx.close();
});

test('A11b-2 走進區域、目標換掉、門邊指示牌重建：≥ 58 fps', async ({ browser }) => {
  const { ctx, page } = await open(browser);
  const zs = await page.evaluate(() => window.__deepend.zones());
  // into the middle of zone 1, then zone 2: each entry changes the way on, so the loaded chunks' guides are rebuilt
  const spots = [[zs[0].x, zs[0].z, 0], [zs[1].x, zs[1].z, 0]];
  const r = await lap(page, spots, 7000);
  const s = await page.evaluate(() => window.__deepend.state());
  expect(s.visited[0] && s.visited[1]).toBe(true);
  report('A11b-2', r);
  await ctx.close();
});

test('A11b-3 在巨大房間裡走：≥ 58 fps', async ({ browser }) => {
  const { ctx, page } = await open(browser);
  const rooms = await page.evaluate(() => window.__deepend.megas(14));
  const abyss = rooms.filter((m) => m.type === 'abyss').slice(0, 2), solemn = rooms.find((m) => m.type === 'solemn');
  const at = (m, x, z, yaw) => [m.cx0 * 16 + x, m.cz0 * 16 + z, yaw];
  // the north walkway looking across the pool, the west one, a solemn hall's middle
  const spots = [...abyss.flatMap((m) => [at(m, 20.5, 3.5, Math.PI), at(m, 3.5, 22.5, -Math.PI / 2)]), at(solemn, 16.5, 4.5, Math.PI)];
  report('A11b-3', await lap(page, spots, 6000));
  await ctx.close();
});

test('A11b-4 在 B1 走：≥ 58 fps', async ({ browser }) => {
  const { ctx, page } = await open(browser);
  const spots = [];
  let at = { x: 8, z: 8 };
  for (let k = 0; k < 4; k++) {   // four different B1 chunks, each further out
    const c = await page.evaluate(([x, z]) => window.__deepend.findLevelChunk(-1, x, z), [at.x + 60, at.z + 60 * (k % 2 ? -1 : 1)]);
    spots.push([c.x, c.z, k * 1.6]);
    at = c;
  }
  report('A11b-4', await lap(page, spots, 6000));
  await ctx.close();
});

test('A11b-5 不降速 CPU、畫質固定「高」，繞一圈（巨大房間、B1、區域）：≥ 58 fps', async ({ browser }) => {
  const { ctx, page, cdp } = await open(browser, { throttle: 1, quality: 'high' });
  const rooms = await page.evaluate(() => window.__deepend.megas(14));
  const m = rooms.find((r) => r.type === 'abyss' && r.water) || rooms.find((r) => r.type === 'abyss');
  const zs = await page.evaluate(() => window.__deepend.zones());
  const b1 = await page.evaluate(() => window.__deepend.findLevelChunk(-1));
  const spots = [[m.cx0 * 16 + 20.5, m.cz0 * 16 + 3.5, Math.PI], [b1.x, b1.z, 0.4], [zs[3].x - 8, zs[3].z - 8, 0.7], [zs[0].x - 30, zs[0].z, -Math.PI / 2]];
  const r = await lap(page, spots, 7000);
  expect(r.quality.setting).toBe('high');
  // the high setting's own pixel ratio, not the auto ladder's. Pinned from both sides because this iGPU has headroom
  // to spare: raising the cap to 3 (2.5 times the pixels) measured 59.5-60 fps, the same as 1.5, so fps alone cannot see it
  expect(r.quality.scale).toBeGreaterThan(1.4);
  expect(r.quality.scale).toBeLessThanOrEqual(1.5);
  report('A11b-5', r);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await ctx.close();
});

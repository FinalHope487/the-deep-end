// P1-S01: capture v1 and v2 baselines for the NP-01..NP-11 measurements. MEASURE-AND-RECORD only: no pass/fail, no limits.
// usage (repo root): node tools/measure-np.mjs --gen v1|v2 [--seed 42] [--runs 3] [--walk-s 60] [--cycles 3] [--away-m 192] [--out file.json]
// Serves the repo root on a free local port, drives real Chromium (same GPU flags as playwright.config.js) through the
// `?test` debug API, and writes only the --out file. GPU memory has no reliable reading: the GPU figures are a PROXY
// (geometry attribute bytes plus texture bytes of the objects currently in the scene). JS heap is reported separately.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const GEN = arg('--gen', 'v1');
const SEED = Number(arg('--seed', 42));
const RUNS = Number(arg('--runs', 3));
const WALK_S = Number(arg('--walk-s', 60));
const CYCLES = Number(arg('--cycles', 3));
const AWAY_M = Number(arg('--away-m', 192)); // each axis; the first smoke run used 640 and one v2 teleport took 136 s
const OUT = arg('--out', '');
if (!['v1', 'v2'].includes(GEN)) { console.error('--gen must be v1 or v2'); process.exit(2); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    if (rel.includes('..')) throw new Error('bad path');
    let file = join(ROOT, rel);
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

const round = (n, d = 2) => (Number.isFinite(n) ? +n.toFixed(d) : null);
const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Runs inside the page. Proxy GPU bytes of everything in the scene, counted once per geometry and per texture.
const sceneProxy = () => {
  const geos = new Set(), texs = new Set();
  window.__deepend.scene.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    for (const m of [].concat(o.material || [])) for (const k in m) { if (m[k] && m[k].isTexture) texs.add(m[k]); }
  });
  let geoBytes = 0, texBytes = 0;
  for (const g of geos) {
    for (const a of Object.values(g.attributes)) geoBytes += a.array.byteLength;
    if (g.index) geoBytes += g.index.array.byteLength;
  }
  for (const t of texs) { const im = t.image; if (im && im.width) texBytes += im.width * im.height * 4 * (t.generateMipmaps ? 4 / 3 : 1); }
  if (window.gc) window.gc(); // collect first: an uncollected heap only measures garbage timing
  const heap = performance.memory ? performance.memory.usedJSHeapSize : null;
  const st = window.__deepend.state();
  return { geometries: geos.size, textures: texs.size, geoMiB: geoBytes / 1048576, texMiB: texBytes / 1048576,
    heapMiB: heap === null ? null : heap / 1048576, loadedChunks: st.loadedChunks, pendingChunks: st.pendingChunks, drawCalls: st.draw.calls, triangles: st.draw.triangles };
};

const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const results = [];
try {
  for (let run = 1; run <= RUNS; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const url = `${base}index.html?test=1&seed=${SEED}${GEN === 'v2' ? '&gen=v2' : ''}`;
    const tLoad = Date.now();
    await page.goto(url, { waitUntil: 'commit', timeout: 15_000 });
    await page.waitForFunction(() => window.__deepend?.ready === true, null, { timeout: 120_000, polling: 50 });
    const bootToReadyMs = Date.now() - tLoad;
    const idle = await page.evaluate(sceneProxy);

    // NP-01: Start click to the first measurable movement after holding W.
    const tClick = Date.now();
    await page.getByRole('button', { name: '開始', exact: true }).click({ timeout: 5_000 });
    await page.waitForFunction(() => window.__deepend.state().mode === 'playing', null, { timeout: 30_000, polling: 20 });
    const modePlayingMs = Date.now() - tClick;
    const s0 = await page.evaluate(() => window.__deepend.state());
    await page.keyboard.down('w');
    let firstMoveMs = null;
    for (let i = 0; i < 400 && firstMoveMs === null; i++) {
      const s = await page.evaluate(() => window.__deepend.state());
      if (Math.hypot(s.x - s0.x, s.z - s0.z) >= 0.25) firstMoveMs = Date.now() - tClick;
      else await page.waitForTimeout(15);
    }
    await page.keyboard.up('w');
    const atStart = await page.evaluate(sceneProxy);

    // NP-04 / NP-07 / NP-10: fixed walk, sampled every 10 s.
    await page.evaluate(() => window.__deepend.resetFrameStats());
    const samples = [];
    const plan = [['w', 4000], ['d', 1000], ['w', 4000], ['a', 1000]];
    const t0 = Date.now();
    let nextSample = 10_000;
    for (let i = 0; Date.now() - t0 < WALK_S * 1000; i++) {
      const [key, ms] = plan[i % plan.length];
      await page.keyboard.down(key);
      try { await page.waitForTimeout(Math.min(ms, WALK_S * 1000 - (Date.now() - t0))); } finally { await page.keyboard.up(key); }
      if (Date.now() - t0 >= nextSample) {
        samples.push({ tS: round((Date.now() - t0) / 1000, 1), ...(await page.evaluate(sceneProxy)) });
        nextSample += 10_000;
      }
    }
    const frame = await page.evaluate(() => window.__deepend.frameStats());
    const build = await page.evaluate(() => window.__deepend.state().buildMs);
    const afterWalk = await page.evaluate(sceneProxy);

    // NP-03 / NP-08: leave and return, CYCLES times. The teleport waits for the destination to be ready (v2 includes Worker planning).
    const home = await page.evaluate(() => { const s = window.__deepend.state(); return { x: s.x, z: s.z }; });
    const away = { x: home.x + AWAY_M, z: home.z + AWAY_M };
    const legs = [];
    for (let c = 1; c <= CYCLES; c++) {
      const timed = (to) => page.evaluate(async ({ x, z }) => { const a = performance.now(); await window.__deepend.teleport(x, z, undefined, true); return performance.now() - a; }, to);
      const awayMs = await timed(away);
      await page.waitForTimeout(1500);
      const atAway = await page.evaluate(sceneProxy);
      const homeMs = await timed(home);
      await page.waitForTimeout(1500);
      const atHome = await page.evaluate(sceneProxy);
      legs.push({ cycle: c, awayMs: round(awayMs), homeMs: round(homeMs), atAway, atHome });
    }
    const workers = page.workers().length;
    const state = await page.evaluate(() => window.__deepend.state());
    const problems = [];
    if (state.mode !== 'playing') problems.push(`mode ${state.mode}`);
    if (firstMoveMs === null) problems.push('no movement after Start');
    if (errors.length) problems.push(`${errors.length} page/console errors`);
    results.push({ run, bootToReadyMs, modePlayingMs, firstMoveMs, idle, atStart, frame, build, afterWalk, samples, legs, workers,
      quality: state.quality, valid: problems.length === 0, problems, errors });
    console.log(`run ${run}: boot ${bootToReadyMs} ms, start->move ${firstMoveMs} ms, walk ${round(frame.avgMs)} ms/frame (slow ${round(frame.slowPct)}%), workers ${workers}${problems.length ? ' INVALID: ' + problems.join('; ') : ''}`);
    await ctx.close();
  }
} finally {
  const chromium_ = browser.version();
  await browser.close();
  server.close();
  const summary = {
    label: `np-baseline-${GEN}`, gen: GEN, seed: SEED, runs: results.length, walkSeconds: WALK_S, cycles: CYCLES, awayMetresPerAxis: AWAY_M,
    env: { chromium: chromium_, platform: process.platform, node: process.version, cpu: cpus()[0]?.model, cores: cpus().length, ramGiB: round(totalmem() / 2 ** 30, 1),
      viewport: '1280x720', gpuArgs: 'enable-gpu,ignore-gpu-blocklist,use-angle=d3d11,enable-precise-memory-info,js-flags=--expose-gc (heap sampled after gc())', note: 'implementer Windows machine, not a phone' },
    median: {
      bootToReadyMs: median(results.map((r) => r.bootToReadyMs)),
      startToFirstMoveMs: median(results.map((r) => r.firstMoveMs)),
      walkAvgFrameMs: median(results.map((r) => r.frame.avgMs)),
      walkSlowPct: median(results.map((r) => r.frame.slowPct)),
      walkMaxFrameMs: median(results.map((r) => r.frame.maxMs)),
      chunkBuildAvgMs: median(results.map((r) => r.build.avg)),
      chunkBuildMaxMs: median(results.map((r) => r.build.max)),
      proxyGpuMiBAfterWalk: median(results.map((r) => r.afterWalk.geoMiB + r.afterWalk.texMiB)),
      heapMiBAfterWalk: median(results.map((r) => r.afterWalk.heapMiB)),
      teleportAwayMs: median(results.flatMap((r) => r.legs.map((l) => l.awayMs))),
    },
    results,
  };
  summary.valid = results.length === RUNS && results.every((r) => r.valid);
  if (OUT) writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ label: summary.label, valid: summary.valid, median: summary.median }));
  if (!summary.valid) process.exitCode = 1;
}

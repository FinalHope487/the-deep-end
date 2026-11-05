// Measure frame rate of a built game: title screen, then a fixed scripted walk. Used for the P0 before/after comparison.
// usage (repo root): node tools/measure-fps.mjs --dir <built dir> --page "index.html?test=1&seed=42" --label <name> [--runs 5] [--title-s 5] [--play-s 60] [--out file.json]
// The script serves --dir on a free local port, opens the page in real Chromium (same GPU flags as playwright.config.js) and records
// requestAnimationFrame timestamps. It writes only the --out file and never touches dist/ or the shared work/ tree.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const DIR = resolve(arg('--dir', ''));
const PAGE = arg('--page', 'index.html?test=1&seed=42');
const LABEL = arg('--label', 'run');
const RUNS = Number(arg('--runs', 5));
const TITLE_S = Number(arg('--title-s', 5));
const PLAY_S = Number(arg('--play-s', 60));
const OUT = arg('--out', '');
if (!arg('--dir', '')) { console.error('missing --dir'); process.exit(2); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mp3': 'audio/mpeg', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    if (rel.includes('..')) throw new Error('bad path');
    let file = join(DIR, rel);
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

const stats = (ts) => {
  const d = [];
  for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
  const sorted = [...d].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const span = ts[ts.length - 1] - ts[0];
  return { frames: ts.length, meanFps: +((ts.length - 1) / (span / 1000)).toFixed(2), p95FrameMs: +q(0.95).toFixed(2), maxFrameMs: +sorted[sorted.length - 1].toFixed(2), over50ms: d.filter((x) => x > 50).length };
};
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
try {
  for (let run = 1; run <= RUNS; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + PAGE, { waitUntil: 'commit', timeout: 15_000 });
    await page.waitForFunction(() => window.__deepend?.ready === true, null, { timeout: 60_000, polling: 100 });
    await page.evaluate(() => {
      window.__fps = { t: [], on: false };
      const tick = (t) => { if (window.__fps.on) window.__fps.t.push(t); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    const take = async (ms) => {
      await page.evaluate(() => { window.__fps.t = []; window.__fps.on = true; });
      await page.waitForTimeout(ms);
      return page.evaluate(() => { window.__fps.on = false; return window.__fps.t; });
    };
    const title = stats(await take(TITLE_S * 1000));
    await page.getByRole('button', { name: '開始', exact: true }).click({ timeout: 5_000 });
    await page.waitForFunction(() => window.__deepend.state().mode === 'playing', null, { timeout: 5_000 });
    const start = await page.evaluate(() => window.__deepend.state());
    await page.evaluate(() => { window.__fps.t = []; window.__fps.on = true; });
    // fixed walk: forward 4 s, strafe right 1 s, forward 4 s, strafe left 1 s, repeated until PLAY_S
    const plan = [['w', 4000], ['d', 1000], ['w', 4000], ['a', 1000]];
    const t0 = Date.now();
    for (let i = 0; Date.now() - t0 < PLAY_S * 1000; i++) {
      const [key, ms] = plan[i % plan.length];
      const left = PLAY_S * 1000 - (Date.now() - t0);
      await page.keyboard.down(key);
      try { await page.waitForTimeout(Math.min(ms, left)); } finally { await page.keyboard.up(key); }
    }
    const playTs = await page.evaluate(() => { window.__fps.on = false; return window.__fps.t; });
    const end = await page.evaluate(() => window.__deepend.state());
    const moved = +Math.hypot(end.x - start.x, end.z - start.z).toFixed(1);
    // a run counts only when the game really played: playing mode, chunks loaded, movement, frames, no page or console error
    const problems = [];
    if (end.mode !== 'playing') problems.push(`mode ${end.mode}`);
    if (!(end.loadedChunks >= 1)) problems.push('no chunk loaded');
    if (!(moved > 0)) problems.push('no movement');
    if (errors.length) problems.push(`${errors.length} page/console errors`);
    if (title.frames < 2 || playTs.length < 2) problems.push('missing frame timestamps');
    results.push({ run, title, play: stats(playTs), moved, mode: end.mode, loadedChunks: end.loadedChunks, errors, valid: problems.length === 0, problems });
    console.log(`run ${run}: title ${title.meanFps} fps, play ${results.at(-1).play.meanFps} fps, moved ${moved} m, errors ${errors.length}${problems.length ? ' INVALID: ' + problems.join('; ') : ''}`);
    await ctx.close();
  }
} finally {
  const version = browser.version();
  await browser.close();
  server.close();
  const playFps = results.map((r) => r.play.meanFps), titleFps = results.map((r) => r.title.meanFps);
  const summary = {
    label: LABEL, page: PAGE, runs: results.length, titleSeconds: TITLE_S, playSeconds: PLAY_S,
    env: { chromium: version, platform: process.platform, node: process.version, viewport: '1280x720', gpuArgs: 'enable-gpu,ignore-gpu-blocklist,use-angle=d3d11' },
    playMeanFps: { median: median(playFps), min: Math.min(...playFps), max: Math.max(...playFps) },
    titleMeanFps: { median: median(titleFps), min: Math.min(...titleFps), max: Math.max(...titleFps) },
    results,
  };
  const allValid = results.length === RUNS && results.every((r) => r.valid);
  summary.valid = allValid;
  if (OUT) writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ label: LABEL, valid: allValid, playMeanFps: summary.playMeanFps, titleMeanFps: summary.titleMeanFps }));
  if (!allValid) process.exitCode = 1;
}

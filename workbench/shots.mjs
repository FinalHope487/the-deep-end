// The one command that makes workbench pictures.
//   node workbench/shots.mjs <sheet> [--stage=tile|sun|water|indirect|final] [--out=<name>] [--serve]
// --serve keeps the local server running and prints the walk URL (first-person walk in the viewer).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const args = process.argv.slice(2);
const sheet = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
if (!sheet) { console.error('usage: node workbench/shots.mjs <sheet> [--stage=...] [--out=name] [--serve]'); process.exit(2); }
const stage = opt('stage', 'final');
const outName = opt('out', `${sheet}-${stage}`);
if (!/^[\w.-]+$/.test(sheet) || !/^[\w.-]+$/.test(outName)) { console.error('bad sheet or out name'); process.exit(2); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.jpg': 'image/jpeg', '.png': 'image/png' };
const roots = [['/vendor/', path.join(repo, 'tools', 'vendor')], ['/pictures/', path.join(repo, 'pictures')], ['/', here]];

function startServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    for (const [prefix, dir] of roots) {
      if (!url.startsWith(prefix)) continue;
      const f = path.resolve(dir, url === '/' ? 'index.html' : url.slice(prefix.length));
      if (!f.startsWith(dir + path.sep) && f !== dir) break;
      if (prefix === '/' && f.startsWith(path.join(here, 'out'))) break;
      if (!fs.existsSync(f) || !fs.statSync(f).isFile()) continue;
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(res);
      return;
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

const git = (c) => { try { return execSync(`git ${c}`, { cwd: repo, encoding: 'utf8' }).trim(); } catch { return ''; } };
const hash = (git('rev-parse --short HEAD') || 'nogit') + (git('status --porcelain -- workbench') ? '+dirty' : '');

const { server, base } = await startServer();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

if (args.includes('--serve')) {
  console.log(`walk in the room: ${base}/index.html?sheet=${sheet}\n(press Ctrl+C to stop)`);
} else {
  const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-webgl'] });
  try {
    const page = await browser.newPage({ viewport: { width: 888, height: 900 }, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(`[page ${m.type()}]`, m.text()); });
    page.on('pageerror', (e) => console.log('[page exception]', e.message));
    await page.goto(`${base}/index.html?sheet=${sheet}&shot=1&stage=${stage}`);
    await page.waitForFunction(() => window.__wb && (window.__wb.ready || window.__wb.error), null, { timeout: 120000 });
    const err = await page.evaluate(() => window.__wb.error);
    if (err) throw new Error(`viewer error: ${err}`);
    const info = await page.evaluate(() => ({ room: window.__wb.room.id, ref: window.__wb.room.ref, sheet: window.__wb.sheet, gl: window.__wb.glRenderer, verts: window.__wb.vertices }));
    const ft = await page.evaluate(() => window.__wb.measure(300, 30));
    const shot = await page.evaluate(() => window.__wb.still(4.0));
    const ids = `${info.sheet.room} | light ${info.sheet.light} | water ${info.sheet.water} | material ${info.sheet.material}`;
    const when = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const stats = `frame mean ${ft.mean.toFixed(1)} ms  p99 ${ft.p99.toFixed(1)} ms  (render cost, 300 frames)`;

    const cmp = await browser.newPage({ viewport: { width: 1776, height: 960 }, deviceScaleFactor: 1 });
    await cmp.setContent(`<!doctype html><body style="margin:0;background:#111"><div id="comparison" style="width:1776px;background:#111;color:#fff;font:15px/20px monospace">
      <div style="display:flex;height:900px"><img id="a" src="${shot}" style="width:888px;height:900px">
      <div style="width:888px;height:900px;display:flex;align-items:center;justify-content:center;background:#000"><img id="b" src="${base}/${info.ref}" style="width:888px;height:900px;object-fit:contain"></div></div>
      <div style="padding:8px 12px;height:44px">render (left) vs ${esc(info.ref)} (right) | commit ${esc(hash)} | ${esc(when)} | stage ${esc(stage)}<br>${esc(ids)} | ${esc(stats)}</div></div></body>`);
    await cmp.waitForFunction(() => document.getElementById('a').complete && document.getElementById('b').complete && document.getElementById('b').naturalWidth > 0);
    fs.mkdirSync(path.join(here, 'out'), { recursive: true });
    const outPath = path.join(here, 'out', `${outName}.png`);
    await cmp.locator('#comparison').screenshot({ path: outPath });
    console.log(`picture: ${outPath}`);
    console.log(`commit ${hash} | ${when} | ${ids} | stage ${stage}`);
    console.log(`frame time: mean ${ft.mean.toFixed(2)} ms, p99 ${ft.p99.toFixed(2)} ms, min ${ft.min.toFixed(2)}, max ${ft.max.toFixed(2)} (n=${ft.n}, render cost with GPU sync)`);
    console.log(`webgl renderer: ${info.gl} | vertices: ${info.verts}`);
  } finally {
    await browser.close();
    server.close();
  }
}

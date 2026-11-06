// Check IDs: P1-A09 (real Chromium Worker from a nested, self-contained build).
// New builder CLI: --entry js/v3/entry/main.js --html js/v3/diagnostic/index.html.
// The Worker URL is new URL('js/v3/workers/echo.js', document.baseURI),
// not an import.meta.url-relative path and not a root-relative URL.
// No external network, fixture server, files or processes survive the test.
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
function put(root, path, text) {
  const file = join(root, ...path.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
function makeFixture(root) {
  put(root, 'js/v3/core/value.js', 'export const fixtureWorkerValue = 42;\n');
  put(root, 'js/v3/package.json', '{"type":"module"}\n');
  put(root, 'js/v3/entry/main.js', [
    "import { fixtureWorkerValue } from '../core/value.js';",
    "const fixtureEchoWorker = new Worker(new URL('js/v3/workers/echo.js', document.baseURI), { type: 'module' });",
    'fixtureEchoWorker.onmessage = (event) => {',
    '  document.getElementById("worker-output").textContent = String(event.data);',
    '  fixtureEchoWorker.terminate();',
    '};',
    'fixtureEchoWorker.postMessage(fixtureWorkerValue);', '',
  ].join('\n'));
  put(root, 'js/v3/workers/echo.js', 'self.onmessage = (event) => self.postMessage(event.data);\n');
  put(root, 'js/v3/diagnostic/index.html', [
    '<!doctype html><html><head><title>Worker fixture</title>',
    '<script type="importmap">{"imports":{"three":"./vendor/three.js"}}</script>',
    '</head><body><output id="worker-output">pending</output>',
    "<script type=\"module\">import './js/v3/entry/main.js';</script>",
    '</body></html>', '',
  ].join('\n'));
}
function serveArtifact(out) {
  const prefix = '/archive/p1/';
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(prefix)) { res.writeHead(404); res.end(); return; }
    const suffix = path.slice(prefix.length) || 'index.html';
    const file = resolve(out, suffix);
    const rel = relative(out, file);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !existsSync(file)) {
      res.writeHead(404); res.end(); return;
    }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8'
      : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
    res.writeHead(200);
    res.end(readFileSync(file));
  });
  return server;
}

test('[P1-A09] sub-path Worker starts, replies and uses artifact-relative URL', async ({ page }) => {
  const temp = mkdtempSync(join(tmpdir(), 'p1-worker-url-'));
  const source = join(temp, 'source'), out = join(temp, 'artifact');
  let server;
  try {
    makeFixture(source);
    const built = spawnSync(process.execPath,
      [join(REPO, 'tools/build.mjs'), '--root', source, '--out', out,
        '--entry', 'js/v3/entry/main.js', '--html', 'js/v3/diagnostic/index.html'],
      { cwd: REPO, encoding: 'utf8', timeout: 30000, windowsHide: true });
    assertBuild(built);
    put(out, 'vendor/three.js', 'export const fixtureThree = true;\n');
    server = serveArtifact(out);
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(0, '127.0.0.1', resolveListen);
    });
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}/archive/p1/`;
    const workerURL = new URL('js/v3/workers/echo.js', base).href;
    const failures = [];
    const workerAppeared = page.waitForEvent('worker');
    page.on('pageerror', (error) => failures.push(String(error)));
    const response = await page.goto(base, { waitUntil: 'load' });
    expect(response.status()).toBe(200);
    const worker = await workerAppeared;
    await expect(page.locator('#worker-output')).toHaveText('42');
    expect(failures).toEqual([]);
    expect(worker.url()).toBe(workerURL);
    expect(existsSync(join(out, 'js/v3/workers/echo.js'))).toBe(true);
  } finally {
    if (server) await new Promise((done) => server.close(done));
    rmSync(temp, { recursive: true, force: true });
  }
});

function assertBuild(result) {
  if (result.error) throw result.error;
  expect(result.status, `builder error: ${result.stderr}\n${result.stdout}`).toBe(0);
}

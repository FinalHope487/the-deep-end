// Check IDs: P0-S01, P0-S02, P0-S03, P0-G01, TR-06
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const VENDOR = join(REPO, 'tools', 'vendor', 'three-0.170.0.module.min.js');
const COMMIT = 'a'.repeat(40);
const HASH = 'b'.repeat(64);
const ROOT = '/project/';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
};
let scratch;
let server;
let origin;

function put(root, name, content) {
  const path = join(root, ...name.split('/'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function archiveFixture(project, routerScript, fullId) {
  const baseId = fullId.replace(/-r[1-9][0-9]*$/, '');
  const version = JSON.stringify({
    phase: baseId, base: baseId, ns: baseId,
    sha7: COMMIT.slice(0, 7), label: `P0 fixture ${baseId}`,
  });
  const folder = `versions/${fullId}`;
  put(project, `${folder}/manifest.json`, JSON.stringify({
    phase: fullId, commit: COMMIT, payloadHash: HASH,
    builtAt: '2026-11-06T00:00:00.000Z',
  }) + '\n');
  // The target is a route-only fixture. The router script is copied from the real entry.
  put(project, `${folder}/index.html`, `<!doctype html>\n<html><head><meta charset="utf-8">\n` +
    `<script>window.__deependVersion = ${version};</script>\n${routerScript}\n` +
    `<script src="./assets/loaded.js"></script><title>${fullId}</title></head>\n` +
    `<body><main id="route-target" data-phase="${fullId}">${fullId}</main></body></html>\n`);
  put(project, `${folder}/assets/loaded.js`,
    `window.__p0AssetPath = new URL('./assets/loaded.js', location.href).pathname;\n`);
}

async function serve(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (path === `${ROOT}versions/p3a/manifest.json`) {
      await delay(1100);
      res.writeHead(503);
      res.end('not released');
      return;
    }
    if (path === `${ROOT}versions/p3m/manifest.json`) {
      res.writeHead(503);
      res.end('not released');
      return;
    }
    if (path === `${ROOT}versions/p3v/manifest.json`) {
      res.writeHead(200, { 'Content-Type': TYPES['.json'] });
      res.end('{not valid json');
      return;
    }
    if (path === `${ROOT}versions/p3s/manifest.json`) {
      res.writeHead(200, { 'Content-Type': TYPES['.json'] });
      res.end(JSON.stringify({ phase: 'p1', commit: COMMIT, payloadHash: HASH }));
      return;
    }
    const dest = resolve(scratch, '.' + path);
    const rel = relative(scratch, dest);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('path escapes test root');
    let target = dest;
    if (statSync(target).isDirectory()) target = join(target, 'index.html');
    const body = readFileSync(target);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}

test.beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'deepend-p0-route-'));
  const project = join(scratch, 'project');
  mkdirSync(project, { recursive: true });
  cpSync(join(REPO, 'index.html'), join(project, 'index.html'));
  cpSync(join(REPO, 'js'), join(project, 'js'), { recursive: true });
  cpSync(join(REPO, 'audio'), join(project, 'audio'), { recursive: true });
  const entry = readFileSync(join(project, 'index.html'), 'utf8');
  const routerScript = entry.match(/<script>[^]*?<\/script>/)?.[0];
  expect(routerScript, '[P0-S01] real inline head router script must exist').toBeTruthy();
  for (const phase of ['p0', 'p1', 'p2m', 'p0-r1']) {
    archiveFixture(project, routerScript, phase);
  }
  put(project, 'legacy/pre-column/index.html',
    '<!doctype html><html><body><main id="legacy-target">legacy</main></body></html>\n');
  put(project, 'landing.html',
    '<!doctype html><html><body><main id="landing">prior history page</main></body></html>\n');
  server = createServer(serve);
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server?.listening) await new Promise((done) => server.close(done));
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

function requestsFor(page) {
  const paths = [];
  page.on('request', (request) => paths.push(new URL(request.url()).pathname));
  return paths;
}

async function visit(page, path) {
  const response = await page.goto(origin + path, { waitUntil: 'commit', timeout: 15_000 });
  expect(response?.status(), `[P0-S01] initial URL ${path} HTTP status`).toBe(200);
}

async function errorPage(page, path) {
  const requests = requestsFor(page);
  await visit(page, path);
  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /error|failed|unavailable|not found|unknown|invalid|錯誤|失敗|無法|不存在|找不到|無效|未發布|不支援/i.test(text)
      && !document.querySelector('#view');
  }, null, { timeout: 7000, polling: 100 });
  const value = (await page.locator('body').innerText()).trim().replace(/\s+/g, ' ');
  const state = await page.evaluate(() => ({
    booted: window.__deepend !== undefined || window.__deepEndBooted === true,
    hasCanvas: document.querySelector('#view') !== null,
    hasModuleScript: document.querySelector('script[type="module"]') !== null,
  }));
  expect(state, `[P0-S02] v1 loaded for ${path}: ${JSON.stringify(state)}`).toEqual({
    booted: false, hasCanvas: false, hasModuleScript: false,
  });
  expect(requests.filter((p) => p.endsWith('/js/main.js')),
    `[P0-S02] v1 module requested for ${path}`).toEqual([]);
  return value;
}

async function supplyPinnedThree(page) {
  await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js',
    async (route) => route.fulfill({
      status: 200, contentType: 'text/javascript', body: readFileSync(VENDOR),
    }));
}

test('[P0-S01] valid phase and candidate URLs use the real generic router', async ({ page }) => {
  const requests = requestsFor(page);
  for (const phase of ['p0', 'p1', 'p2m', 'p0-r1']) {
    await visit(page, `${ROOT}index.html?gen=v3&phase=${phase}&v=pre-column&keep=yes#spot`);
    await expect(page, `[P0-S01] phase=${phase} did not route`).toHaveURL(
      new RegExp(`/project/versions/${phase}/index\\.html\\?keep=yes#spot$`));
    await expect(page.locator('#route-target')).toHaveAttribute('data-phase', phase);
    const version = await page.evaluate(() => window.__deependVersion);
    expect(version?.phase, `[P0-S01] phase=${phase} base identifier`).toBe(phase.replace(/-r\d+$/, ''));
    expect(await page.evaluate(() => window.__p0AssetPath),
      `[P0-S03] phase=${phase} asset did not load from project sub-path`)
      .toBe(`/project/versions/${phase}/assets/loaded.js`);
  }
  expect(requests.filter((p) => p === `${ROOT}js/main.js`),
    '[P0-S01] the v1 module loaded during v3 routing').toEqual([]);
});

test('[P0-S02] unknown, missing, invalid and unreleased manifests show one plain error page', async ({ browser }) => {
  const paths = [
    `${ROOT}index.html?gen=v3&phase=p5`,
    `${ROOT}index.html?gen=v3&phase=..%2Fp0`,
    `${ROOT}index.html?gen=v3`,
    `${ROOT}index.html?gen=v3&phase=p4`,
    `${ROOT}index.html?gen=v3&phase=p3v`,
    `${ROOT}index.html?gen=v3&phase=p3s`,
    `${ROOT}index.html?gen=v3&phase=p3m`,
  ];
  let expected;
  for (const path of paths) {
    const page = await browser.newPage();
    try {
      const actual = await errorPage(page, path);
      expect(actual.length, `[P0-S02] blank error page for ${path}`).toBeGreaterThan(3);
      if (expected === undefined) expected = actual;
      expect(actual, `[P0-S02] error page changed for path=${path}`).toBe(expected);
      expect(actual, `[P0-S02] error page echoes invalid input=${path}`).not.toContain('..%2F');
    } finally {
      await page.close();
    }
  }
});

test('[P0-S02] a delayed failed lookup never starts v1 while loading', async ({ page }) => {
  const requests = requestsFor(page);
  await visit(page, `${ROOT}index.html?gen=v3&phase=p3a`);
  await page.waitForTimeout(150);
  const during = await page.evaluate(() => ({
    v1: window.__deepend !== undefined || window.__deepEndBooted === true,
    hasCanvas: document.querySelector('#view') !== null,
    text: document.body?.innerText || '',
  }));
  expect(during.v1, `[P0-S02] v1 started during lookup: ${JSON.stringify(during)}`).toBe(false);
  expect(during.hasCanvas, '[P0-S02] v1 canvas exists during lookup').toBe(false);
  expect(during.text.trim().length, '[P0-S02] loading state is empty').toBeGreaterThan(0);
  await page.waitForFunction(() => /error|failed|unavailable|not found|unknown|invalid|錯誤|失敗|無法|不存在|找不到|無效|未發布|不支援/i
    .test(document.body?.innerText || ''), null, { timeout: 6000 });
  expect(requests.filter((p) => p.endsWith('/js/main.js')),
    '[P0-S02] v1 module loaded after delayed failure').toEqual([]);
});

test('[P0-S03] direct URL, reload, history back and new tab work under a sub-path', async ({ page, browser }) => {
  await visit(page, `${ROOT}landing.html`);
  await visit(page, `${ROOT}index.html?gen=v3&phase=p0`);
  await expect(page).toHaveURL(/\/project\/versions\/p0\/index\.html$/);
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#route-target')).toHaveAttribute('data-phase', 'p0');
  expect(await page.evaluate(() => window.__p0AssetPath),
    '[P0-S03] reload did not load the archived asset')
    .toBe('/project/versions/p0/assets/loaded.js');
  await page.goBack({ waitUntil: 'load' });
  await expect(page).toHaveURL(`${origin}${ROOT}landing.html`);
  await expect(page.locator('#landing')).toBeVisible();
  const tab = await browser.newPage();
  try {
    await visit(tab, `${ROOT}versions/p2m/index.html`);
    await expect(tab.locator('#route-target')).toHaveAttribute('data-phase', 'p2m');
    await visit(tab, `${ROOT}versions/p0/index.html?gen=v3&phase=p1`);
    await expect(tab.locator('#route-target'),
      '[P0-S03] archived-page guard redirected to another phase')
      .toHaveAttribute('data-phase', 'p0');
  } finally {
    await tab.close();
  }
});

test('[P0-G01] default v1, v2 query and pre-column legacy keep their entry behavior', async ({ browser }) => {
  const page = await browser.newPage();
  await supplyPinnedThree(page);
  try {
    await visit(page, `${ROOT}index.html?test=1&seed=42`);
    await page.waitForFunction(() => window.__deepend?.ready === true,
      null, { timeout: 25000, polling: 100 });
    const state = await page.evaluate(() => ({
      gen: window.__deepend.state().gen,
      archived: window.__deependVersion !== undefined,
    }));
    expect(state, `[P0-G01] default game=${JSON.stringify(state)}`)
      .toEqual({ gen: 1, archived: false });
    await visit(page, `${ROOT}index.html?v=pre-column#saved`);
    await expect(page, '[P0-G01] pre-column redirect changed')
      .toHaveURL(new RegExp('/project/legacy/pre-column/?#saved$'));
    await expect(page.locator('#legacy-target')).toBeVisible();
  } finally {
    await page.close();
  }
  const v2 = await browser.newPage();
  await supplyPinnedThree(v2);
  try {
    await visit(v2, `${ROOT}index.html?gen=v2&test=1&seed=42`);
    await v2.waitForFunction(() => window.__deepend?.state?.().gen === 2,
      null, { timeout: 20000, polling: 100 });
    const state = await v2.evaluate(() => ({
      gen: window.__deepend.state().gen,
      archived: window.__deependVersion !== undefined,
      href: location.pathname,
    }));
    expect(state.gen, `[P0-G01] v2 generator=${state.gen}; expected 2`).toBe(2);
    expect(state.archived, '[P0-G01] v2 wrongly marked archived').toBe(false);
    expect(state.href, '[P0-G01] v2 unexpectedly redirected').toBe(`${ROOT}index.html`);
  } finally {
    await v2.close();
  }
});

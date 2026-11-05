// Check IDs: P0-B06, P0-B09, P0-G01, P0-L01, P0-SV01, P0-V01
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURE = join(REPO, 'tests', 'fixtures', 'nested-entry');
const VENDOR_NAME = 'three-0.170.0.module.min.js';
const VENDOR = join(REPO, 'tools', 'vendor', VENDOR_NAME);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
};
let scratch;
let project;
let server;
let origin;
let sourceSha;

function run(id, program, args, cwd) {
  const result = spawnSync(program, args, {
    cwd, encoding: 'utf8', timeout: 30_000, windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  expect(result.error, `[${id}] process error: ${result.error}`).toBeUndefined();
  expect(result.status, `[${id}] ${program} ${args.join(' ')} exited ${result.status}: ${result.stderr}`).toBe(0);
  return result.stdout.trim();
}

function git(args) {
  return run('P0-B06', 'git', args, project);
}

function bootUrl(phase = 'p0-r1') {
  return `${origin}/project/versions/${phase}/index.html?test=1&seed=42`;
}

async function ready(page, id) {
  await page.waitForFunction(() => window.__deepend?.ready === true,
    null, { timeout: 25_000, polling: 100 });
  const state = await page.evaluate(() => window.__deepend.state());
  expect(state.gen, `[${id}] generator=${state.gen}; expected v1 (1)`).toBe(1);
  expect(state.loadedChunks, `[${id}] loadedChunks=${state.loadedChunks}`).toBeGreaterThan(0);
  return state;
}

async function serve(req, res) {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = resolve(scratch, '.' + pathname);
    const rel = relative(scratch, target);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('outside test root');
    const path = statSync(target).isDirectory() ? join(target, 'index.html') : target;
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}

test.beforeAll(async () => {
  test.setTimeout(90_000);
  scratch = mkdtempSync(join(tmpdir(), 'deepend-p0-artifact-'));
  project = join(scratch, 'project');
  mkdirSync(join(project, 'tools', 'vendor'), { recursive: true });
  cpSync(join(REPO, 'index.html'), join(project, 'index.html'));
  cpSync(join(REPO, 'js'), join(project, 'js'), { recursive: true });
  cpSync(join(REPO, 'audio'), join(project, 'audio'), { recursive: true });
  cpSync(join(REPO, 'tools', 'build.mjs'), join(project, 'tools', 'build.mjs'));
  cpSync(join(REPO, 'tools', 'package-version.mjs'), join(project, 'tools', 'package-version.mjs'));
  cpSync(VENDOR, join(project, 'tools', 'vendor', VENDOR_NAME));
  writeFileSync(join(project, 'package.json'), JSON.stringify({
    name: 'p0-artifact-browser-test', private: true, type: 'module',
    scripts: { 'package:version': 'node tools/package-version.mjs' },
  }, null, 2) + '\n');
  git(['init', '-q']);
  git(['add', '-A']);
  git(['-c', 'user.name=P0 Reviewer', '-c', 'user.email=p0@example.invalid',
    'commit', '-qm', 'fixture: committed P0 browser source']);
  sourceSha = git(['rev-parse', 'HEAD']);
  run('P0-B06', process.execPath, [join(project, 'tools', 'package-version.mjs'),
    'p0-r1', '--versions-dir', join(project, 'versions')], project);
  const manifest = JSON.parse(readFileSync(join(project, 'versions', 'p0-r1', 'manifest.json'), 'utf8'));
  expect(manifest.commit, '[P0-B06] packaged source commit differs').toBe(sourceSha);
  const fixtureOut = join(project, 'nested');
  run('P0-B09', process.execPath, [join(project, 'tools', 'build.mjs'),
    '--root', FIXTURE, '--out', fixtureOut], project);
  mkdirSync(join(fixtureOut, 'vendor'), { recursive: true });
  cpSync(VENDOR, join(fixtureOut, 'vendor', VENDOR_NAME));
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

async function useLocalThree(page) {
  await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js',
    (route) => route.fulfill({
      status: 200, contentType: 'text/javascript', body: readFileSync(VENDOR),
    }));
}

test('[P0-B09] the built nested entry executes in Chromium and reports ready:43', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const response = await page.goto(`${origin}/project/nested/index.html`, { waitUntil: 'load' });
  expect(response?.status(), '[P0-B09] fixture HTTP status').toBe(200);
  await page.waitForFunction(() => window.__p0NestedReady === true,
    null, { timeout: 10_000 });
  await expect(page.locator('#fixture-status')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#fixture-status')).toHaveText('ready:43');
  expect(errors, `[P0-B09] uncaught browser errors=${JSON.stringify(errors)}`).toEqual([]);
});

test('[P0-B06] [P0-G01] the self-contained artifact boots and plays v1 without a CDN', async ({ page }) => {
  const external = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.route('**/*', async (route) => {
    const address = new URL(route.request().url());
    if (address.origin !== origin) {
      external.push(route.request().url());
      await route.abort();
    } else {
      await route.continue();
    }
  });
  const response = await page.goto(bootUrl(), { waitUntil: 'commit' });
  expect(response?.status(), '[P0-B06] artifact HTTP status').toBe(200);
  const state = await ready(page, 'P0-G01');
  expect(state.mode, `[P0-G01] initial mode=${state.mode}`).toBe('title');
  const resources = await page.evaluate(async () => {
    const map = JSON.parse(document.querySelector('script[type="importmap"]')?.textContent || '{}');
    const names = ['js/gen2-s2-worker.js', 'js/gen2-s2-runtime.js', 'audio/amb_drip.mp3'];
    const statuses = await Promise.all(names.map(async (name) => {
      const response = await fetch(new URL(name, location.href));
      return { name, status: response.status };
    }));
    return { importPath: map.imports?.three, statuses };
  });
  expect(resources.importPath, '[P0-B06] import map must use local vendor')
    .toBe(`./vendor/${VENDOR_NAME}`);
  for (const item of resources.statuses) {
    expect(item.status, `[P0-B06] ${item.name} returned HTTP ${item.status}`).toBe(200);
  }
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__deepend.state().mode))
    .toBe('playing');
  expect(external, `[P0-B06] external requests=${JSON.stringify(external)}`).toEqual([]);
  expect(errors, `[P0-B06] uncaught errors=${JSON.stringify(errors)}`).toEqual([]);
});

test('[P0-L01] candidate label and title use the base phase and source SHA', async ({ page }) => {
  await page.goto(bootUrl(), { waitUntil: 'commit' });
  await ready(page, 'P0-L01');
  const label = `P0｜v1 封存版｜${sourceSha.slice(0, 7)}`;
  const version = await page.evaluate(() => window.__deependVersion);
  expect(version, '[P0-L01] missing version object').toMatchObject({
    phase: 'p0', base: 'p0', ns: 'p0', sha7: sourceSha.slice(0, 7), label,
  });
  await expect(page, '[P0-L01] page title').toHaveTitle(label);
  await expect(page.locator('#version-label'), '[P0-L01] corner label').toHaveText(label);
  await expect(page.locator('#version-label')).toBeVisible();
  const bounds = await page.locator('#version-label').boundingBox();
  const viewport = page.viewportSize();
  expect(bounds?.x, `[P0-L01] label x=${bounds?.x}`).toBeGreaterThan(viewport.width / 2);
  expect(bounds?.y, `[P0-L01] label y=${bounds?.y}`).toBeGreaterThan(viewport.height / 2);
});

test('[P0-SV01] starting and resuming a candidate preserves byte-identical v1 progress', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const v1 = '{ "v":1, "seed":17, "x":2, "z":3, "yaw":0, "gen":1, "visited":[false,false,false,false], "found":[], "elapsed":0, "distance":0 }';
  try {
    await page.goto(bootUrl(), { waitUntil: 'commit' });
    await ready(page, 'P0-SV01');
    await page.evaluate((raw) => localStorage.setItem('deepend.save.v1', raw), v1);
    await page.getByRole('button', { name: '開始', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__deepend.state().mode))
      .toBe('playing');
    const saved = await page.evaluate(() => ({
      legacy: localStorage.getItem('deepend.save.v1'),
      candidate: localStorage.getItem('deepend.save.v1.p0'),
      wrong: localStorage.getItem('deepend.save.v1.p0-r1'),
      seed: window.__deepend.state().seed,
    }));
    expect(saved.legacy, '[P0-SV01] v1 save bytes changed').toBe(v1);
    expect(saved.wrong, '[P0-SV01] revision-suffixed key must not be used').toBeNull();
    expect(saved.candidate, '[P0-SV01] no candidate progress was written').not.toBeNull();
    expect(JSON.parse(saved.candidate).seed, '[P0-SV01] wrong candidate seed').toBe(saved.seed);
    await page.reload({ waitUntil: 'commit' });
    await ready(page, 'P0-SV01');
    await expect(page.locator('#btn-continue')).toBeVisible();
    await page.locator('#btn-continue').click();
    await expect.poll(() => page.evaluate(() => window.__deepend.state().mode))
      .toBe('playing');
    expect(await page.evaluate(() => window.__deepend.state().seed),
      '[P0-SV01] preview did not restore its own seed').toBe(saved.seed);
    expect(await page.evaluate(() => localStorage.getItem('deepend.save.v1')),
      '[P0-SV01] resume modified v1 save bytes').toBe(v1);
    await useLocalThree(page);
    await page.goto(`${origin}/project/index.html?test=1&seed=42`, { waitUntil: 'commit' });
    await ready(page, 'P0-SV01');
    expect(await page.evaluate(() => localStorage.getItem('deepend.save.v1')),
      '[P0-SV01] default page did not retain raw progress').toBe(v1);
    expect(await page.locator('#btn-continue').isVisible(),
      '[P0-SV01] default v1 does not recognize its existing save').toBe(true);
  } finally {
    await context.close();
  }
});

test('[P0-V01] the actual settings UI shares volume and quality with the default page', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(bootUrl(), { waitUntil: 'commit' });
    await ready(page, 'P0-V01');
    await page.locator('#btn-settings').click();
    await page.locator('#opt-volume').evaluate((element) => {
      element.value = '37';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#opt-quality').selectOption('low');
    const source = await page.evaluate(() => localStorage.getItem('deepend.settings.v1'));
    expect(source, '[P0-V01] settings were not written to the shared key').not.toBeNull();
    expect(JSON.parse(source).volume, '[P0-V01] preview volume').toBe(0.37);
    expect(JSON.parse(source).quality, '[P0-V01] preview quality').toBe('low');
    await useLocalThree(page);
    await page.goto(`${origin}/project/index.html?test=1&seed=42`, { waitUntil: 'commit' });
    await ready(page, 'P0-V01');
    await page.locator('#btn-settings').click();
    const displayed = await page.evaluate(() => ({
      volume: document.getElementById('opt-volume').value,
      quality: document.getElementById('opt-quality').value,
      saved: localStorage.getItem('deepend.settings.v1'),
    }));
    expect(displayed.volume, `[P0-V01] default volume=${displayed.volume}`).toBe('37');
    expect(displayed.quality, `[P0-V01] default quality=${displayed.quality}`).toBe('low');
    expect(displayed.saved, '[P0-V01] shared settings bytes changed').toBe(source);
  } finally {
    await context.close();
  }
});

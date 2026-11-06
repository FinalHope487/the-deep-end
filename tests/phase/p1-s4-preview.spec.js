// Reviewer-owned P1-V01 / P1-A09. Uses a real committed scratch artifact,
// the existing root router, Chromium, and an artifact mounted at /project/.
// p1-r2 below is explicitly a Worker TEST FIXTURE; p1-r1 is the exact P1 source.
import { test, expect } from '@playwright/test';
import { composeWorld, queryWorld } from '../../js/v3/core/world.js';
import { makeQueryKey } from '../../js/v3/core/ids.js';
import { validateWorkerReply } from '../../js/v3/core/worker.js';
import { createDefaultRegistry } from '../../js/v3/modules/registry-config.js';
import { createDefaultAdapters } from '../../js/v3/modules/adapters.js';
import { DEFAULT_STRUCTURAL_CONFIG } from '../../js/v3/modules/world-config.js';
import { DEFAULT_JOURNEY_CONFIG } from '../../js/v3/modules/journey-config.js';
import { createScratch, successful, packageScratch, commitScratch,
  manifestOf, put, serveScratch } from '../fixtures/v3/s4-fixture.mjs';

const BOUNDS = {
  min: { x: 0, y: -2, z: 0 }, max: { x: 32, y: 8, z: 16 },
};
const PROBE_WORKER = String.raw`
import { validateWorkerRequest } from '../core/worker.js';
import { composeWorld, queryWorld } from '../core/world.js';
import { createDefaultRegistry } from '../modules/registry-config.js';
import { createDefaultAdapters } from '../modules/adapters.js';
let context = null;
self.onmessage = (event) => {
  const checked = validateWorkerRequest(event.data);
  if (!checked.ok) { self.postMessage({ invalidRequest: checked.code }); return; }
  const request = checked.value;
  const common = {
    formatVersion: 1, protocolVersion: 1, requestId: request.requestId,
    jobType: request.jobType, worldId: request.worldId,
    configFingerprint: request.configFingerprint,
    generationEpoch: request.generationEpoch,
  };
  if (request.jobType === 'init') {
    const descriptor = request.descriptor;
    const config = {
      seed: descriptor.seed, generatorFormat: descriptor.generatorFormat,
      structuralConfig: descriptor.structuralConfig,
      journeyConfig: descriptor.journeyConfig,
      modules: descriptor.modules, adapters: descriptor.adapters,
    };
    const registry = createDefaultRegistry();
    const world = registry.ok &&
      composeWorld(config, registry.value, createDefaultAdapters());
    if (!world?.ok || world.value.descriptor.worldId !== descriptor.worldId ||
        world.value.descriptor.configFingerprint !== descriptor.configFingerprint) {
      self.postMessage({ ...common, error: { code: 'WORLD_MISMATCH' } });
      return;
    }
    context = world.value.context;
    self.postMessage({ ...common, result: { worldId: descriptor.worldId } });
    return;
  }
  if (request.jobType === 'query') {
    const answer = context && queryWorld(context, request.queryBounds);
    if (!answer?.ok) {
      self.postMessage({ ...common, queryKey: request.queryKey,
        error: { code: 'NOT_INITIALIZED' } });
      return;
    }
    self.postMessage({ ...common, queryKey: request.queryKey,
      result: answer.value });
  }
};
`;
let scratch;
let server;

function value(result) {
  expect(result?.ok, JSON.stringify(result)).toBe(true);
  return result.value;
}
function expectedWorld(seed) {
  const registry = value(createDefaultRegistry());
  const modules = [...registry.regions, ...registry.landmarks].map(({ descriptor: d }) => ({
    kind: d.kind, slotId: d.slotId, moduleId: d.moduleId,
    moduleVersion: d.moduleVersion,
  }));
  const world = value(composeWorld({
    seed, generatorFormat: 1, structuralConfig: DEFAULT_STRUCTURAL_CONFIG,
    journeyConfig: DEFAULT_JOURNEY_CONFIG, modules, adapters: [],
  }, registry, createDefaultAdapters()));
  return { descriptor: world.descriptor, snapshot: value(queryWorld(world.context, BOUNDS)) };
}
function monitor(page, origin, phase) {
  const failures = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error}`));
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    const parsed = new URL(url);
    if (parsed.origin !== origin) failures.push(`external: ${url}`);
    else if (parsed.pathname !== '/project/' &&
             !parsed.pathname.startsWith(`/project/versions/${phase}/`)) {
      failures.push(`escaped artifact sub-path: ${parsed.pathname}`);
    }
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && url.pathname.includes('/versions/p1') &&
        response.status() !== 200) failures.push(`HTTP ${response.status()}: ${url.pathname}`);
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes('/versions/p1')) {
      failures.push(`requestfailed: ${url.pathname}: ${request.failure()?.errorText}`);
    }
  });
  return failures;
}

// Never use an uncommitted working-tree source as a "package success" witness.
test.beforeAll(async () => {
  scratch = createScratch();
  try {
    successful(packageScratch(scratch.repo, 'p1-r1'));
    successful(packageScratch(scratch.repo, 'p1', ['--match', 'p1-r1']));
    const a = manifestOf(scratch.repo, 'p1-r1');
    const b = manifestOf(scratch.repo, 'p1');
    expect(a.payloadHash).toBe(b.payloadHash);
    // Separate committed fixture for the real Chromium init/query Worker contract.
    put(scratch.repo, 'js/v3/workers/s4-probe.js', PROBE_WORKER);
    commitScratch(scratch.repo, 'test fixture: real P1 Worker protocol probe');
    successful(packageScratch(scratch.repo, 'p1-r2'));
    server = await serveScratch(scratch.repo);
  } catch (error) {
    if (server) await server.close();
    scratch.cleanup();
    scratch = null;
    throw error;
  }
});
test.afterAll(async () => {
  if (server) await server.close();
  if (scratch) scratch.cleanup();
});

test('[P1-V01] real p1-r1 build loads by router at 390x844 DPR3', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  try {
    const failures = monitor(page, server.origin, 'p1-r1');
    await page.goto(`${server.origin}/project/?gen=v3&phase=p1-r1&seed=61`);
    await expect(page.locator('#p1-status')).toHaveText('P1 diagnostic ready');
    const state = await page.evaluate(() => window.__deependV3);
    const expected = expectedWorld(61);
    expect(state).toEqual({
      ready: true, error: null,
      summary: {
        seed: 61,
        worldId: expected.descriptor.worldId,
        moduleCount: expected.descriptor.modules.length,
        spaceCount: expected.snapshot.spaces.length,
        structuralDigest: expected.snapshot.structuralDigest,
      },
    });
    expect(new URL(page.url()).pathname).toBe('/project/versions/p1-r1/index.html');
    expect(await page.evaluate(() => typeof window.__deepend)).toBe('undefined');
    await expect(page.locator('#p1-error')).toBeHidden();
    await expect(page.locator('#p1-module-count')).toHaveText('5');
    await expect(page.locator('#p1-space-count')).toHaveText('5');
    await test.info().attach('SC-01B-candidate-fixture.png', {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    });
    await page.reload();
    await expect(page.locator('#p1-status')).toHaveText('P1 diagnostic ready');
    expect((await page.evaluate(() => window.__deependV3.summary))).toEqual(state.summary);
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
});

test('[P1-A09] default deployment root remains v1; p1-r1 direct URL is diagnostic', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${server.origin}/project/?seed=42`);
    await expect(page.locator('#title')).toBeVisible();
    await expect(page.locator('#p1-title')).toHaveCount(0);
    await test.info().attach('SC-01A-v1-root-fixture.png', {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    });
    await page.close(); // v1 may be loading public assets; do not mix its requests with P1
    const direct = await context.newPage();
    const failures = monitor(direct, server.origin, 'p1-r1');
    await direct.goto(`${server.origin}/project/versions/p1-r1/?seed=42`);
    await expect(direct.locator('#p1-status')).toHaveText('P1 diagnostic ready');
    expect((await direct.evaluate(() => window.__deependV3.summary.seed))).toBe(42);
    await expect(direct.locator('#title')).toHaveCount(0);
    await expect(direct.locator('#view')).toHaveCount(0);
    expect(await direct.evaluate(() => typeof window.__deepend)).toBe('undefined');
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
});

test('[P1-V01] invalid seed reports an error without booting v1', async ({ page }) => {
  const failures = monitor(page, server.origin, 'p1-r1');
  await page.goto(`${server.origin}/project/versions/p1-r1/?seed=-1`);
  await expect(page.locator('#p1-error')).toBeVisible();
  expect(await page.evaluate(() => window.__deependV3)).toEqual({
    ready: false,
    error: { code: 'P1_INVALID_SEED', message: 'seed must be a decimal uint32' },
    summary: null,
  });
  expect(await page.evaluate(() => typeof window.__deepend)).toBe('undefined');
  expect(failures).toEqual([]);
});

test('[P1-A09] real module Worker init/query replies match main-thread digest (test fixture)', async ({ page }) => {
  const failures = monitor(page, server.origin, 'p1-r2');
  await page.goto(`${server.origin}/project/versions/p1-r2/?seed=61`);
  await expect(page.locator('#p1-status')).toHaveText('P1 diagnostic ready');
  const { descriptor, snapshot } = expectedWorld(61);
  const queryKey = makeQueryKey(descriptor.worldId, BOUNDS);
  const workerAppeared = page.waitForEvent('worker');
  const replies = await page.evaluate(async ({ descriptor, bounds, queryKey }) => {
    const worker = new Worker(new URL('js/v3/workers/s4-probe.js', document.baseURI),
      { type: 'module' });
    const send = (message) => new Promise((resolve, reject) => {
      worker.onmessage = (event) => resolve(event.data);
      worker.onerror = (event) => reject(new Error(event.message));
      worker.postMessage(message);
    });
    const base = {
      formatVersion: 1, protocolVersion: 1,
      worldId: descriptor.worldId, configFingerprint: descriptor.configFingerprint,
      generationEpoch: 1,
    };
    try {
      const init = await send({ ...base, jobType: 'init', requestId: 'p1-init', descriptor });
      const query = await send({ ...base, jobType: 'query', requestId: 'p1-query',
        queryKey, queryBounds: bounds });
      return { init, query };
    } finally { worker.terminate(); }
  }, { descriptor, bounds: BOUNDS, queryKey });
  const worker = await workerAppeared;
  expect(worker.url()).toBe(`${server.origin}/project/versions/p1-r2/js/v3/workers/s4-probe.js`);
  expect(value(validateWorkerReply(replies.init)).result.worldId).toBe(descriptor.worldId);
  expect(value(validateWorkerReply(replies.query)).result.structuralDigest)
    .toBe(snapshot.structuralDigest);
  expect(replies.query.result.spaces.length).toBe(snapshot.spaces.length);
  expect(failures).toEqual([]);
});

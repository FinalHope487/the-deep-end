// Check IDs: P0-SV01, P0-V01
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const SAVE_SOURCE = fileURLToPath(new URL('../../js/save.js', import.meta.url));
const GPU_ARGS = [
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--use-angle=d3d11',
  '--autoplay-policy=no-user-gesture-required',
];
let server;
let browser;
let origin;

before(async () => {
  server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><meta charset="utf-8"></head><body>save contract</body></html>');
      return;
    }
    if (path !== '/js/save.js') {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    try {
      const source = await readFile(SAVE_SOURCE);
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(source);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ args: GPU_ARGS });
});

after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

async function withPage(run) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const response = await page.goto(origin + '/', { waitUntil: 'load' });
    assert.equal(response.status(), 200, '[P0-SV01] test origin must return HTTP 200');
    return await run(page, context);
  } finally {
    await context.close();
  }
}

test('[P0-SV01] a preview saves, reloads and clears without touching raw v1 bytes or another phase', async () => {
  await withPage(async (page) => {
    const result = await page.evaluate(async () => {
      const { loadGame, saveGame, clearGame } = await import('/js/save.js');
      localStorage.clear();
      const legacyRaw = '{ "v":1, "seed":17, "x":2, "z":3, "yaw":0, "gen":1, "visited":[false,false,false,false], "found":[], "elapsed":0, "distance":0 }';
      localStorage.setItem('deepend.save.v1', legacyRaw);
      const progress = {
        seed: 42, x: 12, z: -4, yaw: 1, h: 0, gen: 1,
        visited: [true, false, false, false], found: [2], elapsed: 8, distance: 10,
      };
      saveGame(progress, 'p0');
      const afterSave = localStorage.getItem('deepend.save.v1');
      const preview = loadGame(1, 'p0');
      const otherPhase = loadGame(1, 'p1');
      const defaultSave = loadGame(1);
      const otherGenerator = loadGame(2, 'p0');
      const rawPreview = localStorage.getItem('deepend.save.v1.p0');
      return {
        legacyRaw, afterSave, preview, otherPhase, defaultSave, otherGenerator,
        rawPreview,
      };
    });
    assert.equal(result.afterSave, result.legacyRaw,
      `[P0-SV01] raw v1 bytes changed: ${JSON.stringify(result.afterSave)}`);
    assert.equal(result.preview?.seed, 42,
      `[P0-SV01] preview seed=${result.preview?.seed}; expected 42`);
    assert.equal(result.preview?.pos?.x, 12,
      `[P0-SV01] preview x=${result.preview?.pos?.x}; expected 12`);
    assert.equal(result.otherPhase, null,
      `[P0-SV01] p1 imported p0 progress: ${JSON.stringify(result.otherPhase)}`);
    assert.equal(result.defaultSave?.seed, 17,
      `[P0-SV01] default seed=${result.defaultSave?.seed}; expected 17`);
    assert.equal(result.otherGenerator?.pos, null,
      `[P0-SV01] mismatched generator retained position: ${JSON.stringify(result.otherGenerator?.pos)}`);
    assert.ok(result.rawPreview?.includes('"seed":42'),
      `[P0-SV01] missing p0 raw save: ${JSON.stringify(result.rawPreview)}`);

    await page.reload({ waitUntil: 'load' });
    const reloaded = await page.evaluate(async () => {
      const { loadGame, clearGame } = await import('/js/save.js');
      const beforeClear = loadGame(1, 'p0');
      clearGame('p0');
      return {
        beforeClear,
        afterClear: loadGame(1, 'p0'),
        v1Bytes: localStorage.getItem('deepend.save.v1'),
      };
    });
    assert.equal(reloaded.beforeClear?.seed, 42,
      `[P0-SV01] reload seed=${reloaded.beforeClear?.seed}; expected 42`);
    assert.equal(reloaded.afterClear, null,
      `[P0-SV01] phase progress not cleared: ${JSON.stringify(reloaded.afterClear)}`);
    assert.equal(reloaded.v1Bytes, result.legacyRaw,
      `[P0-SV01] clearing p0 changed v1 bytes: ${JSON.stringify(reloaded.v1Bytes)}`);
  });
});

test('[P0-SV01] invalid explicit namespaces throw before storage access', async () => {
  await withPage(async (page) => {
    const actual = await page.evaluate(async () => {
      const { loadGame, saveGame, clearGame } = await import('/js/save.js');
      localStorage.clear();
      localStorage.setItem('deepend.save.v1', '{"v":1,"seed":23}');
      localStorage.setItem('deepend.save.v1.p0', '{"v":1,"seed":42}');
      const snapshot = () => Object.keys(localStorage).sort()
        .map((key) => [key, localStorage.getItem(key)]);
      const before = snapshot();
      const invalid = ['../p0', 'p0-r1', 'P0', 'a.b', 'a b', null, 42, {}];
      const accepted = [];
      for (const ns of invalid) {
        const actions = {
          load: () => loadGame(1, ns),
          save: () => saveGame({ seed: 91 }, ns),
          clear: () => clearGame(ns),
        };
        for (const [action, call] of Object.entries(actions)) {
          try {
            call();
            accepted.push(`${action}(${JSON.stringify(ns)})`);
          } catch (error) {
            if (!(error instanceof Error)) accepted.push(`${action} non-Error(${String(error)})`);
          }
        }
      }
      return { accepted, before, after: snapshot() };
    });
    assert.deepEqual(actual.accepted, [],
      `[P0-SV01] invalid namespaces accepted: ${actual.accepted.join(', ')}`);
    assert.deepEqual(actual.after, actual.before,
      `[P0-SV01] invalid namespaces changed storage: ${JSON.stringify(actual)}`);
  });
});

test('[P0-V01] volume and quality settings stay on the shared key across phase pages', async () => {
  await withPage(async (page, context) => {
    const first = await page.evaluate(async () => {
      const { saveSettings, loadSettings, saveGame } = await import('/js/save.js');
      localStorage.clear();
      saveSettings({ volume: 0.37, quality: 'low', showFps: true, bgm: false });
      const settingsBefore = localStorage.getItem('deepend.settings.v1');
      saveGame({ seed: 42 }, 'p0');
      return {
        settingsBefore,
        settingsAfter: localStorage.getItem('deepend.settings.v1'),
        parsed: loadSettings(),
      };
    });
    assert.equal(first.settingsAfter, first.settingsBefore,
      `[P0-V01] phase save modified shared settings: ${JSON.stringify(first)}`);
    assert.equal(first.parsed.volume, 0.37,
      `[P0-V01] volume=${first.parsed.volume}; expected 0.37`);
    assert.equal(first.parsed.quality, 'low',
      `[P0-V01] quality=${first.parsed.quality}; expected low`);
    const second = await context.newPage();
    await second.goto(origin + '/', { waitUntil: 'load' });
    const shared = await second.evaluate(async () => {
      const { loadSettings } = await import('/js/save.js');
      return { settings: loadSettings(), raw: localStorage.getItem('deepend.settings.v1') };
    });
    assert.equal(shared.settings.volume, 0.37,
      `[P0-V01] shared volume=${shared.settings.volume}; expected 0.37`);
    assert.equal(shared.settings.quality, 'low',
      `[P0-V01] shared quality=${shared.settings.quality}; expected low`);
    assert.equal(shared.raw, first.settingsBefore,
      `[P0-V01] settings key bytes differ across pages: ${JSON.stringify(shared.raw)}`);
  });
});

// Implementer-owned regression tests for the pre-push cold review of the P1 batch
// (findings B01 to B09, A01; the import-graph check backs B10). Each test failed
// before its fix. Builder tests run the real tools/build.mjs in OS temp trees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { composeWorld, queryWorld, validateWorld } from '../../js/v3/core/world.js';
import { validateSave } from '../../js/v3/core/save.js';
import { validateSpace, DEFAULT_SHAPE_ADAPTERS } from '../../js/v3/core/space.js';
import { validateTraversal } from '../../js/v3/core/traversal.js';
import { validateModuleDescriptor } from '../../js/v3/core/module.js';
import { makeWorldObjectId, parseWorldObjectId } from '../../js/v3/core/ids.js';
import { createRegistry } from '../../js/v3/modules/registry.js';
import { createDefaultRegistry } from '../../js/v3/modules/registry-config.js';
import { createDefaultAdapters } from '../../js/v3/modules/adapters.js';
import { DEFAULT_STRUCTURAL_CONFIG } from '../../js/v3/modules/world-config.js';
import { DEFAULT_JOURNEY_CONFIG } from '../../js/v3/modules/journey-config.js';
import { stubRegion } from '../../js/v3/modules/regions/stub-region.js';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const BUILDER = join(REPO, 'tools', 'build.mjs');
const copy = (x) => JSON.parse(JSON.stringify(x));
const ok = (r) => { assert.equal(r?.ok, true, JSON.stringify(r)); return r.value; };
const failed = (r, code) => { assert.equal(r?.ok, false, 'accepted'); if (code) assert.equal(r.code, code); };

// ---- builder -------------------------------------------------------------
const ENTRY_TAG = "<script type=\"module\">import './js/v3/entry/main.js';</script>";
const SRC_TAG = '<script type="module" src="js/v3/entry/main.js"></script>';
const FLAGS = ['--entry', 'js/v3/entry/main.js', '--html', 'js/v3/diagnostic/index.html'];
function put(root, path, text) {
  const file = join(root, ...path.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
function fixture(root) {
  put(root, 'index.html', '<title>Legacy</title><script type="module" src="js/main.js"></script>\n');
  put(root, 'js/main.js', 'export const legacyReady = true;\n');
  put(root, 'js/v3/entry/main.js', 'export const answer = 42;\n');
  put(root, 'js/v3/workers/echo.js', 'self.onmessage = (e) => self.postMessage(e.data);\n');
  put(root, 'js/v3/diagnostic/index.html', `<title>V3</title>\n${ENTRY_TAG}\n`);
  return root;
}
function build(root, out, flags = FLAGS) {
  const r = spawnSync(process.execPath, [BUILDER, '--root', root, '--out', out, ...flags],
    { cwd: REPO, encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(r.error, undefined, String(r.error));
  return r;
}
async function temp(action) {
  const dir = mkdtempSync(join(tmpdir(), 'p1-review-'));
  try { return await action(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('[B01] --out reached through a link to the root or to js/ is rejected before any write', async () => {
  await temp((dir) => {
    const root = fixture(join(dir, 'source'));
    const before = readFileSync(join(root, 'index.html'), 'utf8');
    symlinkSync(root, join(dir, 'to-root'), 'junction');
    symlinkSync(join(root, 'js'), join(dir, 'to-js'), 'junction');
    for (const link of ['to-root', 'to-js']) {
      const r = build(root, join(dir, link));
      assert.equal(r.status, 1, `${link}: exit=${r.status}; ${r.stderr}`);
    }
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), before, 'source index.html was overwritten');
    assert.match(readFileSync(join(root, 'js/main.js'), 'utf8'), /legacyReady/);
  });
});

test('[B02] a js/ folder that is a link leaving the root is rejected', async () => {
  await temp((dir) => {
    const external = join(dir, 'external-js');
    put(external, 'v3/entry/main.js', 'export const escaped = 1;\n');
    const root = join(dir, 'source');
    put(root, 'index.html', '<title>Legacy</title>\n');
    put(root, 'v3template/index.html', `<title>V3</title>\n${ENTRY_TAG}\n`);
    symlinkSync(external, join(root, 'js'), 'junction');
    const r = build(root, join(dir, 'out'), ['--entry', 'js/v3/entry/main.js', '--html', 'v3template/index.html']);
    assert.equal(r.status, 1, `exit=${r.status}; ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /^build: .*outside/m, 'must fail with a containment message, not a later crash');
    assert.equal(existsSync(join(dir, 'out', 'index.html')), false, 'output was written from an external js/');
  });
});

test('[B09] the entry tag counts once across both accepted forms', async () => {
  await temp((dir) => {
    const root = fixture(join(dir, 'source'));
    put(root, 'js/v3/diagnostic/index.html', `<title>Mixed</title>\n${SRC_TAG}\n${ENTRY_TAG}\n`);
    const r = build(root, join(dir, 'out'));
    assert.equal(r.status, 1, `exit=${r.status}; ${r.stdout}${r.stderr}`);
    put(root, 'js/v3/diagnostic/index.html', `<title>Single src form</title>\n${SRC_TAG}\n`);
    assert.equal(build(root, join(dir, 'out2')).status, 0);
  });
});

test('[A01] v3 mode rejects a link inside js/ instead of copying it', async () => {
  await temp((dir) => {
    const root = fixture(join(dir, 'source'));
    const external = join(dir, 'elsewhere');
    put(external, 'secret.js', 'export const secret = 1;\n');
    symlinkSync(external, join(root, 'js', 'v3', 'workers', 'linked'), 'junction');
    const r = build(root, join(dir, 'out'));
    assert.equal(r.status, 1, `exit=${r.status}; ${r.stdout}${r.stderr}`);
  });
});

test('[C1] an output folder whose js/ is a link to another folder is rejected before any write', async () => {
  await temp((dir) => {
    const root = fixture(join(dir, 'source'));
    const out = join(dir, 'out');
    const elsewhere = join(dir, 'elsewhere');
    mkdirSync(out); mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(out, 'js'), 'junction');
    const r = build(root, out);
    assert.equal(r.status, 1, `exit=${r.status}; ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /^build: .*link/m, 'must fail with a link message, not a later crash');
    assert.deepEqual(readdirSync(elsewhere), [], 'the build wrote through the link');
    assert.equal(existsSync(join(out, 'index.html')), false, 'output page written before the check');
  });
});

test('[C1] an existing output index.html that is a link cannot overwrite the source', async (t) => {
  await temp((dir) => {
    const root = fixture(join(dir, 'source'));
    const out = join(dir, 'out');
    mkdirSync(out);
    const before = readFileSync(join(root, 'index.html'), 'utf8');
    try { symlinkSync(join(root, 'index.html'), join(out, 'index.html'), 'file'); }
    catch (e) { // file links need a privilege on Windows; the directory-link case above still covers the check
      if (e.code === 'EPERM') return t.skip('cannot create a file symlink without privilege');
      throw e;
    }
    const r = build(root, out);
    assert.equal(r.status, 1, `exit=${r.status}; ${r.stdout}${r.stderr}`);
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), before, 'source index.html was overwritten');
  });
});

test('[C4] a js/ folder that is itself a link inside the root is rejected', async () => {
  await temp((dir) => {
    const root = join(dir, 'source');
    put(root, 'index.html', '<title>Legacy</title>\n');
    put(root, 'v3template/index.html', `<title>V3</title>\n${ENTRY_TAG}\n`);
    put(root, 'internal-js/v3/entry/main.js', 'export const answer = 42;\n');
    symlinkSync(join(root, 'internal-js'), join(root, 'js'), 'junction');
    const out = join(dir, 'out');
    const r = build(root, out, ['--entry', 'js/v3/entry/main.js', '--html', 'v3template/index.html']);
    assert.equal(r.status, 1, `exit=${r.status}; ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /^build: .*link/m);
    assert.equal(existsSync(join(out, 'index.html')), false, 'output written from a linked js/');
  });
});

// ---- core contracts --------------------------------------------------------
const FP ='0123456789ab';
const worldId = makeWorldObjectId('w', 42, FP, 'root');
const saveBase = () => ({
  formatVersion: 1, phaseId: 'p1', worldId, lineageId: 'a'.repeat(12), seed: 42, configFingerprint: FP,
  player: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
  progress: { visitedSlotIds: [], foundKeys: [], exitState: 'locked', lastFreePosition: null } });

test('[B03] Save accepts every base phase id and still rejects revision ids', () => {
  for (const phaseId of ['p0', 'p1', 'p2', 'p2m', 'p3w', 'p3v', 'p3s', 'p3m', 'p3a', 'p3u', 'p4']) {
    ok(validateSave({ ...saveBase(), phaseId }));
  }
  for (const phaseId of ['p1-r1', 'p9', 'P1', '', 'p2x']) failed(validateSave({ ...saveBase(), phaseId }));
});

test('[B07] a missing formatVersion is BAD_VERSION in every contract family', () => {
  const save = saveBase(); delete save.formatVersion;
  failed(validateSave(save), 'BAD_VERSION');
  const descriptor = { moduleId: 'm', moduleVersion: 1, kind: 'region', slotId: 'region01', featureSpecs: [] };
  const missing = validateModuleDescriptor(descriptor);
  failed(missing, 'BAD_VERSION');
  assert.equal(missing.path, '/formatVersion');
  failed(validateWorld({ worldId }), 'BAD_VERSION');
});

// A composed default world, one cell, for Space and ownership fixtures.
const config = (registry) => ({
  seed: 61, generatorFormat: 1, structuralConfig: copy(DEFAULT_STRUCTURAL_CONFIG),
  journeyConfig: copy(DEFAULT_JOURNEY_CONFIG),
  modules: [...registry.regions, ...registry.landmarks].map(({ descriptor: d }) => ({
    kind: d.kind, slotId: d.slotId, moduleId: d.moduleId, moduleVersion: d.moduleVersion })),
  adapters: [] });
const BOX = { min: { x: 0, y: -2, z: 0 }, max: { x: 40, y: 8, z: 20 } };
function defaultWorld(adapters = createDefaultAdapters()) {
  const registry = ok(createDefaultRegistry());
  return ok(composeWorld(config(registry), registry, adapters));
}

test('[B08] Space and Traversal arrays that must be sorted by id reject reversed order', () => {
  const { context } = defaultWorld();
  const snapshot = ok(queryWorld(context, BOX));
  const space = copy(snapshot.spaces[0]);
  const volume = (id) => ({ ...copy(space.volumes[0]), volumeId: id });
  space.volumes = [volume('a'), volume('b')];
  space.levels = [{ levelId: 'ground', datumY: 0 }, { levelId: 'upper', datumY: 5 }];
  ok(validateSpace(space));
  failed(validateSpace({ ...space, volumes: [volume('b'), volume('a')] }), 'BAD_FIELD');
  failed(validateSpace({ ...space, levels: [...space.levels].reverse() }), 'BAD_FIELD');
  const traversal = { formatVersion: 1, spaceId: space.spaceId, nodes: [], surfaces: [], links: [],
    blockedVolumeIds: ['a', 'b'] };
  ok(validateTraversal(traversal, space));
  failed(validateTraversal({ ...traversal, blockedVolumeIds: ['b', 'a'] }, space), 'BAD_FIELD');
});

test('[B05] a composed context keeps its own frozen copy of the adapter tables', () => {
  const adapters = createDefaultAdapters();
  const shapeAdapters = Object.fromEntries(Object.entries(adapters.shapeAdapters)
    .map(([kind, adapter]) => [kind, { ...adapter }]));
  const { context } = defaultWorld({ ...adapters, shapeAdapters });
  const before = JSON.stringify(ok(queryWorld(context, BOX)));
  shapeAdapters.box.validate = () => { throw new Error('tampered'); };
  delete shapeAdapters.prism;
  assert.equal(JSON.stringify(ok(queryWorld(context, BOX))), before);
  assert.ok(Object.isFrozen(context.adapters.shapeAdapters));
  assert.ok(Object.isFrozen(context.adapters.shapeAdapters.box));
  assert.ok(Object.isFrozen(context.adapters.featureAdapters));
});

test('[B04] the context reserves an optional frozen surfaceAdapters table', () => {
  const plain = defaultWorld().context;
  assert.deepEqual(plain.adapters.surfaceAdapters, {});
  assert.ok(Object.isFrozen(plain.adapters.surfaceAdapters));
  const resolver = { height: () => 0 };
  const custom = defaultWorld({ ...createDefaultAdapters(), surfaceAdapters: { ramp: resolver } }).context;
  assert.equal(typeof custom.adapters.surfaceAdapters.ramp.height, 'function');
  assert.ok(Object.isFrozen(custom.adapters.surfaceAdapters.ramp));
});

// A region module that emits a Space owned by something else.
function lyingRegion(mutate) {
  const real = stubRegion('region01');
  return { descriptor: real.descriptor, generate(ctx) {
    const out = real.generate(ctx);
    mutate(out.spaces[0], parseWorldObjectId(ctx.worldId).value);
    return out;
  } };
}
function worldWith(region) {
  const regions = ['region02', 'region03', 'region04'].map((s) => stubRegion(s));
  const registry = ok(createRegistry({ regions: [region, ...regions], landmarks: [] }));
  const cfg = config(registry);
  cfg.journeyConfig.landmarkSlotIds = [];
  return ok(composeWorld(cfg, registry, createDefaultAdapters()));
}

test('[B06] a module cannot publish a Space owned by another kind or slot', () => {
  const claimsLandmark = worldWith(lyingRegion((space, id) => {
    space.ownerKind = 'landmark';
    space.ownerId = makeWorldObjectId('l', id.seed, id.configFingerprint, 'landmark01');
  }));
  failed(queryWorld(claimsLandmark.context, BOX), 'BAD_REF');
  const claimsSlot = worldWith(lyingRegion((space, id) => {
    space.ownerId = makeWorldObjectId('r', id.seed, id.configFingerprint, 'region02');
  }));
  failed(queryWorld(claimsSlot.context, BOX), 'BAD_REF');
  const honest = worldWith(lyingRegion(() => {}));
  ok(queryWorld(honest.context, BOX));
});

test('[C3] adapter data nested inside an adapter is copied and frozen too', () => {
  const box = DEFAULT_SHAPE_ADAPTERS.box;
  const custom = { ...box, options: { enabled: true, tags: ['a'] }, validate(p, path) {
    if (!this.options.enabled) throw new Error('adapter was changed after compose');
    return box.validate(p, path);
  } };
  const adapters = createDefaultAdapters();
  const { context } = defaultWorld({ ...adapters, shapeAdapters: { ...adapters.shapeAdapters, box: custom } });
  const before = JSON.stringify(ok(queryWorld(context, BOX)));
  custom.options.enabled = false;
  custom.options.tags.push('b');
  assert.equal(JSON.stringify(ok(queryWorld(context, BOX))), before);
  assert.ok(Object.isFrozen(context.adapters.shapeAdapters.box.options));
  assert.ok(Object.isFrozen(context.adapters.shapeAdapters.box.options.tags));
  failed(composeWorld(config(ok(createDefaultRegistry())), ok(createDefaultRegistry()),
    { ...adapters, shapeAdapters: { ...adapters.shapeAdapters, box: { ...box, state: new Map() } } }), 'BAD_TYPE');
});

test('[C2] a query whose cell indexes are not safe integers is BAD_RANGE, never a hang', () => {
  const script = `
    import { composeWorld, queryWorld } from ${JSON.stringify(new URL('../../js/v3/core/world.js', import.meta.url).href)};
    import { createDefaultRegistry } from ${JSON.stringify(new URL('../../js/v3/modules/registry-config.js', import.meta.url).href)};
    import { createDefaultAdapters } from ${JSON.stringify(new URL('../../js/v3/modules/adapters.js', import.meta.url).href)};
    // modules that publish nothing: a valid answer exists for every cell, so only the loop bound can fail
    const real = createDefaultRegistry().value;
    const empty = ({ descriptor }) => ({ descriptor, generate: () => ({ spaces: [], traversals: [] }) });
    const registry = { regions: real.regions.map(empty), landmarks: real.landmarks.map(empty) };
    const cfg = JSON.parse(${JSON.stringify(JSON.stringify(config(ok(createDefaultRegistry()))))});
    const { context } = composeWorld(cfg, registry, createDefaultAdapters()).value;
    const box = (x0, x1) => ({ min: { x: x0, y: 0, z: 0 }, max: { x: x1, y: 1, z: 1 } });
    const results = [box(1e20, 1e20 + 32768), box(1e300, 2e300)].map((b) => queryWorld(context, b));
    console.log(JSON.stringify(results.map((r) => [r.ok, r.code])));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script],
    { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(r.error, undefined, `the query did not finish: ${r.error}`);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [[false, 'BAD_RANGE'], [false, 'BAD_RANGE']]);
});

// ---- import graph (backs B10; the reviewer-owned boundary test cannot see these edges) ----
const V3 = join(REPO, 'js', 'v3');
const FORBIDDEN = new Set(['js/v3/core/save.js', 'js/v3/core/render.js', 'js/v3/core/worker.js']);
function importsOf(file) {
  const source = readFileSync(join(REPO, ...file.split('/')), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[^;]*?\s+from\s*)?['"](\.[^'"]+)['"]/g)]
    .map((m) => posix.normalize(posix.join(posix.dirname(file), m[1])));
}
function reach(start) {
  const seen = new Set(); const stack = [start];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    stack.push(...importsOf(file));
  }
  return seen;
}
function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? jsFiles(join(dir, e.name)) : e.name.endsWith('.js')
      ? [relative(REPO, join(dir, e.name)).split(sep).join('/')] : []));
}

test('[B10] the generation path never reaches Save, Render or Worker code transitively', () => {
  const generation = [
    ...['world', 'space', 'traversal', 'snapshot', 'journey', 'module', 'ids', 'hash', 'check', 'constants']
      .map((n) => `js/v3/core/${n}.js`),
    ...jsFiles(join(V3, 'modules')),
  ];
  for (const file of generation) {
    const hit = [...reach(file)].filter((f) => FORBIDDEN.has(f));
    assert.deepEqual(hit, [], `${file} reaches ${hit.join(', ')}`);
  }
});

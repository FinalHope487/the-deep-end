// Implementer-owned regression tests for the pre-push cold review of the P1 batch
// (findings B01 to B09, A01; the import-graph check backs B10). Each test failed
// before its fix. Builder tests run the real tools/build.mjs in OS temp trees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { composeWorld, queryWorld, validateWorld } from '../../js/v3/core/world.js';
import { validateSave, validateLoadResult } from '../../js/v3/core/save.js';
import { validateSpace, DEFAULT_SHAPE_ADAPTERS } from '../../js/v3/core/space.js';
import { validateTraversal, validateResolved } from '../../js/v3/core/traversal.js';
import { resolveJourneyAnchors } from '../../js/v3/core/journey.js';
import { acceptReply, applyCancel, beginRequest, validateWorkerReply, validateWorkerRequest } from '../../js/v3/core/worker.js';
import { validateSnapshot, snapshotDigest } from '../../js/v3/core/snapshot.js';
import { json, run } from '../../js/v3/core/check.js';
import { validateModuleDescriptor } from '../../js/v3/core/module.js';
import { makeConfigFingerprint, makeWorldObjectId, parseWorldObjectId, encodeCoordinate, decodeCoordinate, makeQueryKey, validateUniqueLocalKeys } from '../../js/v3/core/ids.js';
import { createRegistry } from '../../js/v3/modules/registry.js';
import { createDefaultRegistry } from '../../js/v3/modules/registry-config.js';
import { createDefaultAdapters } from '../../js/v3/modules/adapters.js';
import { DEFAULT_STRUCTURAL_CONFIG } from '../../js/v3/modules/world-config.js';
import { DEFAULT_JOURNEY_CONFIG } from '../../js/v3/modules/journey-config.js';
import { stubRegion } from '../../js/v3/modules/regions/stub-region.js';
import { stubLandmark } from '../../js/v3/modules/landmarks/stub-landmark.js';

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

// A stale entry in the output folder (link or hard link) is removed before the build writes, so the build
// can never write through it. Both rounds of review found a way past a check; removal leaves nothing to check.
const isLink = (path) => lstatSync(path).isSymbolicLink();

test('[C1] a linked <out>/js or <out>/audio is replaced by real folders, never written through', async () => {
  await temp((dir) => {
    const root = fixture(join(dir, 'source'));
    put(root, 'audio/a.txt', 'a');
    const out = join(dir, 'out');
    const elsewhere = join(dir, 'elsewhere');
    mkdirSync(out); mkdirSync(elsewhere);
    put(dir, 'keep/keep.txt', 'keep');
    symlinkSync(elsewhere, join(out, 'js'), 'junction');
    symlinkSync(join(dir, 'keep'), join(out, 'audio'), 'junction');
    const r = build(root, out);
    assert.equal(r.status, 0, `exit=${r.status}; ${r.stdout}${r.stderr}`);
    assert.deepEqual(readdirSync(elsewhere), [], 'the build wrote through <out>/js');
    assert.deepEqual(readdirSync(join(dir, 'keep')), ['keep.txt'], 'the build wrote through <out>/audio');
    assert.equal(isLink(join(out, 'js')), false);
    assert.equal(isLink(join(out, 'audio')), false);
    assert.equal(existsSync(join(out, 'js', 'v3', 'entry', 'main.js')), true);
  });
});

test('[R3-F1] a link below an existing <out>/js cannot redirect the copy outside --out', async () => {
  await temp((dir) => {
    const root = fixture(join(dir, 'source'));
    const out = join(dir, 'out');
    const elsewhere = join(dir, 'elsewhere');
    mkdirSync(join(out, 'js'), { recursive: true }); mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(out, 'js', 'v3'), 'junction');
    const r = build(root, out);
    assert.equal(r.status, 0, `exit=${r.status}; ${r.stdout}${r.stderr}`);
    assert.deepEqual(readdirSync(elsewhere), [], 'the build wrote through <out>/js/v3');
    assert.equal(isLink(join(out, 'js', 'v3')), false);
  });
});

test('[R3-F2] a hard link at <out>/index.html cannot overwrite the source page', async () => {
  await temp((dir) => {
    const root = fixture(join(dir, 'source'));
    const out = join(dir, 'out');
    mkdirSync(out);
    const before = readFileSync(join(root, 'index.html'), 'utf8');
    linkSync(join(root, 'index.html'), join(out, 'index.html')); // no privilege needed on NTFS or POSIX
    const r = build(root, out);
    assert.equal(r.status, 0, `exit=${r.status}; ${r.stdout}${r.stderr}`);
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), before, 'source index.html was overwritten');
    assert.match(readFileSync(join(out, 'index.html'), 'utf8'), /V3/);
  });
});

test('[C1] a file symlink at <out>/index.html cannot overwrite the source page', async (t) => {
  await temp((dir) => {
    const root = fixture(join(dir, 'source'));
    const out = join(dir, 'out');
    mkdirSync(out);
    const before = readFileSync(join(root, 'index.html'), 'utf8');
    try { symlinkSync(join(root, 'index.html'), join(out, 'index.html'), 'file'); }
    catch (e) { // file links need a privilege on Windows; the hard-link test above covers the same write
      if (e.code === 'EPERM') return t.skip('cannot create a file symlink without privilege');
      throw e;
    }
    const r = build(root, out);
    assert.equal(r.status, 0, `exit=${r.status}; ${r.stdout}${r.stderr}`);
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

// ---- review 3 (fresh ChatGPT chat) ---------------------------------------------------------------
// A composed default world's first Space, copied, and a Traversal over its `air` volume.
function airSpace() {
  const snapshot = ok(queryWorld(defaultWorld().context, BOX));
  return copy(snapshot.spaces[0]);
}
const node = (nodeId) => ({ nodeId, volumeId: 'air', levelId: 'ground', surfaceId: 'floor' });
const traversalFor = (space, links = [], nodes = ['n1', 'n2']) => ({
  formatVersion: 1, spaceId: space.spaceId, nodes: nodes.map(node),
  surfaces: [{ surfaceId: 'floor', kind: 'walkable', supportRef: { volumeId: 'air', face: 'bottom' } }],
  links, blockedVolumeIds: [] });
const walk = (linkId, fromSpace, toSpace) => ({ linkId, kind: 'walk', direction: 'forward',
  from: { spaceId: fromSpace, nodeId: 'n1' }, to: { spaceId: toSpace, nodeId: 'n2' } });

test('[R3-F3] adapter data that is cyclic, has accessors, holes or array properties is BAD_TYPE', () => {
  const box = DEFAULT_SHAPE_ADAPTERS.box;
  const adapters = createDefaultAdapters();
  const compose = (adapter) => {
    const registry = ok(createDefaultRegistry());
    return composeWorld(config(registry), registry,
      { ...adapters, shapeAdapters: { ...adapters.shapeAdapters, box: adapter } });
  };
  const withProp = (name, descriptor) => Object.defineProperty({ ...box }, name, { enumerable: true, ...descriptor });
  const cyclic = {}; cyclic.self = cyclic;
  failed(compose({ ...box, options: cyclic }), 'BAD_TYPE');
  failed(compose(withProp('options', { get() { throw new Error('getter ran'); } })), 'BAD_TYPE');
  const tagged = ['a']; tagged.extra = 'required';
  failed(compose({ ...box, options: tagged }), 'BAD_TYPE');
  failed(compose({ ...box, options: new Array(2) }), 'BAD_TYPE');
  failed(compose({ ...box, options: { [Symbol('s')]: 1 } }), 'BAD_TYPE');
  const shared = { x: 1 };
  ok(compose({ ...box, options: { a: shared, b: shared } })); // a shared reference is not a cycle
});

test('[R3-B5] a link endpoint in another world is BAD_REF, one in the same world is not', () => {
  const space = airSpace();
  const id = parseWorldObjectId(space.spaceId).value;
  const other = makeWorldObjectId('s', 43, FP, 'elsewhere');
  const neighbour = makeWorldObjectId('s', id.seed, id.configFingerprint, 'neighbour');
  const check = (target) => validateTraversal(traversalFor(space, [walk('l1', space.spaceId, target)]), space);
  const foreign = check(other);
  failed(foreign, 'BAD_REF');
  assert.equal(foreign.path, '/links/0/to/spaceId');
  ok(check(neighbour));
});

test('[R3-B6] a non-finite adapter elevation cannot satisfy a walk link', () => {
  const space = airSpace();
  const snapshots = [{ spaces: [space], traversals: [traversalFor(space, [walk('l1', space.spaceId, space.spaceId)])] }];
  const shapeAdapters = (faceElevation) => ({ shapeAdapters: { box: { faceElevation } } });
  ok(validateResolved(snapshots, shapeAdapters(() => 0)));
  for (const bad of [NaN, Infinity, -Infinity]) failed(validateResolved(snapshots, shapeAdapters(() => bad)), 'UNKNOWN_SURFACE');
});

test('[R3-B7] coordinates beyond the safe integer range are rejected both ways', () => {
  assert.equal(decodeCoordinate('p9007199254740991').ok, true);
  for (const text of ['p9007199254740993', `p${'9'.repeat(400)}`, `n${'9'.repeat(400)}`]) {
    failed(decodeCoordinate(text), 'BAD_RANGE');
  }
  assert.throws(() => encodeCoordinate(2 ** 53), RangeError);
  assert.throws(() => encodeCoordinate(1e21), RangeError);
  assert.equal(encodeCoordinate(-5), 'n5');
});

test('[R3-B8] journey anchors that overflow to Infinity are BAD_RANGE', () => {
  const registry = ok(createDefaultRegistry());
  const cfg = config(registry);
  cfg.journeyConfig.segments = cfg.journeyConfig.segments.map(() => 1e308);
  const composed = composeWorld(cfg, registry, createDefaultAdapters());
  if (composed.ok) failed(resolveJourneyAnchors(composed.value.context), 'BAD_RANGE');
  else failed(composed, 'BAD_RANGE');
  ok(resolveJourneyAnchors(defaultWorld().context));
});

test('[R3-B9] a request id of __proto__ is stored as an own pending entry', () => {
  const request = { formatVersion: 1, protocolVersion: 1, requestId: '__proto__', jobType: 'query', worldId,
    configFingerprint: FP, generationEpoch: 0, queryBounds: BOX, queryKey: makeQueryKey(worldId, BOX) };
  const state = { worldId, configFingerprint: FP, epoch: 0, pending: {} };
  const next = ok(beginRequest(state, request));
  assert.equal(Object.hasOwn(next.pending, '__proto__'), true, 'the entry became the prototype instead');
  failed(beginRequest(next, request), 'DUP_ID');
});

test('[R3-B10] a __proto__ key in a Save extension survives validation', () => {
  const ext = JSON.parse('{"__proto__":{"keep":1},"vendor":{"__proto__":[1]}}');
  const save = { ...saveBase(), progress: { ...saveBase().progress, ext } };
  const out = ok(validateSave(save));
  assert.equal(Object.hasOwn(out.progress.ext, '__proto__'), true);
  assert.equal(JSON.stringify(out.progress.ext), JSON.stringify(ext));
  assert.equal(Object.getPrototypeOf(out.progress.ext), Object.prototype);
});

test('[R3-B11] local ids follow the localKey charset', () => {
  const space = airSpace();
  for (const bad of ['room/invalid', '', 'a b']) {
    const volumes = copy(space.volumes); volumes[0].volumeId = bad;
    failed(validateSpace({ ...space, volumes }), 'BAD_FIELD');
    const levels = copy(space.levels); levels[0].levelId = bad;
    failed(validateSpace({ ...space, levels }), 'BAD_FIELD');
    const t = traversalFor(space, [walk(bad, space.spaceId, space.spaceId)]);
    failed(validateTraversal(t, space), 'BAD_FIELD');
    const n = traversalFor(space); n.nodes[0].nodeId = bad;
    failed(validateTraversal(n, space), 'BAD_FIELD');
  }
  ok(validateSpace(space));
  ok(validateTraversal(traversalFor(space, [walk('l.1~x_y-z', space.spaceId, space.spaceId)]), space));
  const registry = ok(createDefaultRegistry());
  const cfg = config(registry);
  cfg.journeyConfig.exitSlotId = 'exit/x';
  failed(composeWorld(cfg, registry, createDefaultAdapters()));
});

test('[R3-B12] the stub modules stay inside their owner cell for any cell size', () => {
  const registry = ok(createRegistry({
    regions: ['region01', 'region02', 'region03', 'region04'].map((s) => stubRegion(s)),
    landmarks: [stubLandmark('landmark01')] }));
  for (const cellSize of [5, 16, 64, 100]) {
    const cfg = config(registry);
    cfg.structuralConfig = { cellSize, maxSpaceExtent: 64 };
    const { context } = ok(composeWorld(cfg, registry, createDefaultAdapters()));
    ok(queryWorld(context, { min: { x: 0, y: -2, z: 0 }, max: { x: cellSize * 2, y: 8, z: cellSize * 2 } }));
  }
});

// ---- review 4 (fresh ChatGPT chat) ----------------------------------------------------------------
test('[R4-B4] a node surface must be supported by its own volume (rev6:36)', () => {
  const space = airSpace();
  space.volumes.push({ volumeId: 'slab', kind: 'solid', levelId: 'ground',
    shape: { kind: 'box', v: 1, p: { min: { x: 0, y: -1, z: 0 }, max: { x: 8, y: 0, z: 8 } } } });
  const t = traversalFor(space);
  t.surfaces.push({ surfaceId: 'slabTop', kind: 'walkable', supportRef: { volumeId: 'slab', face: 'top' } });
  t.surfaces.sort((a, b) => (a.surfaceId < b.surfaceId ? -1 : 1));
  ok(validateTraversal(t, space));
  t.nodes[0].surfaceId = 'slabTop';
  const bad = validateTraversal(t, space);
  failed(bad, 'BAD_REF');
  assert.equal(bad.path, '/nodes/0/surfaceId');
});

// A registry whose `slot` region is replaced by a custom generator; the other slots stay stubs.
function registryWith(slot, generate) {
  const regions = ['region01', 'region02', 'region03', 'region04']
    .map((s) => (s === slot ? { descriptor: stubRegion(s).descriptor, generate } : stubRegion(s)));
  return ok(createRegistry({ regions, landmarks: [stubLandmark('landmark01')] }));
}
const composeWith = (registry, adapters = createDefaultAdapters()) => composeWorld(config(registry), registry, adapters);
const stubOut = (slot, ctx) => stubRegion(slot).generate({ ...ctx, slotId: slot });

test('[R4-02] a module cannot publish or replace a traversal of a Space it does not publish', () => {
  const walkable = (spaceId) => ({ formatVersion: 1, spaceId, nodes: [node('n1')],
    surfaces: [{ surfaceId: 'floor', kind: 'walkable', supportRef: { volumeId: 'air', face: 'bottom' } }],
    links: [], blockedVolumeIds: [] });
  const foreign = registryWith('region02', (ctx) => ({
    spaces: [], traversals: stubOut('region01', ctx).traversals.map((t) => walkable(t.spaceId)) }));
  failed(queryWorld(ok(composeWith(foreign)).context, BOX), 'BAD_REF');
  const twice = registryWith('region02', (ctx) => {
    const out = stubOut('region02', ctx);
    return { spaces: out.spaces, traversals: [...out.traversals, ...out.traversals] };
  });
  failed(queryWorld(ok(composeWith(twice)).context, BOX));
  ok(queryWorld(defaultWorld().context, BOX));
});

test('[R4-03] a generator that emits NaN gets a failed Result, never a thrown error', () => {
  const registry = registryWith('region01', (ctx) => {
    const out = stubOut('region01', ctx);
    out.spaces[0].volumes[0].shape.p.max.y = NaN;
    return out;
  });
  let result;
  assert.doesNotThrow(() => { result = queryWorld(ok(composeWith(registry)).context, BOX); });
  failed(result);
});

test('[R4-04] a world elevation that overflows to Infinity cannot satisfy a walk link', () => {
  const space = airSpace();
  space.frame.origin.y = 1e308;
  const snapshots = [{ spaces: [space], traversals: [traversalFor(space, [walk('l1', space.spaceId, space.spaceId)])] }];
  failed(validateResolved(snapshots, { shapeAdapters: { box: { faceElevation: () => 1e308 } } }), 'UNKNOWN_SURFACE');
});

test('[R4-05] module slot ids and visited slot ids follow the localKey charset', () => {
  const descriptor = copy(stubRegion('region01').descriptor);
  ok(validateModuleDescriptor(descriptor));
  failed(validateModuleDescriptor({ ...descriptor, slotId: 'region/invalid' }), 'BAD_FIELD');
  const save = saveBase();
  save.progress.visitedSlotIds = ['region/invalid'];
  failed(validateSave(save), 'BAD_FIELD');
  save.progress.visitedSlotIds = ['region01'];
  ok(validateSave(save));
});

test('[R4-06] --out may sit inside the template folder; only build-owned entries are protected', async () => {
  await temp((dir) => {
    const root = fixture(join(dir, 'source'));
    const flags = (template) => ['--entry', 'js/v3/entry/main.js', '--html', template];
    put(root, 'pages/template.html', `<title>Pages</title>\n${ENTRY_TAG}\n`);
    const deep = build(root, join(root, 'pages', 'dist'), flags('pages/template.html'));
    assert.equal(deep.status, 0, deep.stderr);
    assert.equal(existsSync(join(root, 'pages', 'dist', 'index.html')), true);
    const same = build(root, join(root, 'pages'), flags('pages/template.html'));
    assert.equal(same.status, 0, same.stderr);
    assert.match(readFileSync(join(root, 'pages', 'template.html'), 'utf8'), /Pages/);
    put(root, 'pages/index.html', `<title>Index</title>\n${ENTRY_TAG}\n`);
    const clash = build(root, join(root, 'pages'), flags('pages/index.html'));
    assert.equal(clash.status, 1, 'the template is <out>/index.html');
    assert.match(readFileSync(join(root, 'pages', 'index.html'), 'utf8'), /Index/);
    put(root, 'pages/js/owned.html', `<title>Owned</title>\n${ENTRY_TAG}\n`);
    const owned = build(root, join(root, 'pages'), flags('pages/js/owned.html'));
    assert.equal(owned.status, 1, 'the template sits inside <out>/js, which the build deletes');
    assert.equal(existsSync(join(root, 'pages', 'js', 'owned.html')), true);
  });
});

test('[R4-07] Shape.v is an integer of at least 1: transport keeps it, strict needs an adapter for it', () => {
  const space = airSpace();
  const custom = (v) => { const s = copy(space); s.volumes[0].shape = { kind: 'custom-shape', v, p: { a: 1 } }; return s; };
  const kept = ok(validateSpace(custom(2), { mode: 'transport' }));
  assert.equal(kept.volumes[0].shape.v, 2);
  failed(validateSpace(custom(2)), 'UNKNOWN_SHAPE');
  failed(validateSpace(custom(0), { mode: 'transport' }));
  const boxV2 = copy(space); boxV2.volumes[0].shape.v = 2;
  failed(validateSpace(boxV2), 'UNKNOWN_SHAPE');
  ok(validateSpace(copy(space)));
});

test('[R4-08] extension adapters registered at composition validate generated Space.ext', () => {
  const calls = [];
  const extAdapters = { demo: { validate: (value) => { calls.push(value); return value; } } };
  const registry = registryWith('region01', (ctx) => {
    const out = stubOut('region01', ctx);
    out.spaces[0].ext = { demo: { n: 1 } };
    return out;
  });
  failed(queryWorld(ok(composeWith(registry)).context, BOX), 'UNKNOWN_FIELD');
  const { context } = ok(composeWith(registry, { ...createDefaultAdapters(), extAdapters }));
  ok(queryWorld(context, BOX));
  assert.ok(calls.length > 0, 'the namespace validator never ran');
  assert.equal(Object.isFrozen(context.adapters.extAdapters), true);
});

test('[R4-09] World.adapters is sorted by adapterId whatever the config order', () => {
  const registry = ok(createDefaultRegistry());
  const make = (adapters) => ok(composeWorld({ ...config(registry), adapters }, registry, createDefaultAdapters()));
  const a = { adapterId: 'a', adapterVersion: 1 }, z = { adapterId: 'z', adapterVersion: 1 };
  const forward = make([a, z]), reverse = make([z, a]);
  assert.deepEqual(reverse.descriptor.adapters.map((x) => x.adapterId), ['a', 'z']);
  assert.equal(JSON.stringify(forward.descriptor), JSON.stringify(reverse.descriptor));
  failed(validateWorld({ ...copy(forward.descriptor), adapters: [z, a] }), 'BAD_FIELD');
});

test('[R4-10] a throwing getter or a hidden property is a failed Result, not an exception', () => {
  const space = airSpace();
  const getter = copy(space);
  Object.defineProperty(getter, 'access', { enumerable: true, get() { throw new Error('getter ran'); } });
  let result;
  assert.doesNotThrow(() => { result = validateSpace(getter); });
  failed(result, 'BAD_TYPE');
  const hidden = copy(space);
  Object.defineProperty(hidden, 'extra', { value: 1, enumerable: false });
  failed(validateSpace(hidden));
  const symbol = copy(space);
  symbol[Symbol('s')] = 1;
  failed(validateSpace(symbol));
  ok(validateSpace(copy(space)));
});

test('[R4-11] a cyclic Save extension is BAD_TYPE, a shared reference is fine', () => {
  const ext = {}; ext.self = ext;
  const save = saveBase(); save.progress.ext = { demo: ext };
  let result;
  assert.doesNotThrow(() => { result = validateSave(save); });
  failed(result, 'BAD_TYPE');
  const shared = { x: 1 };
  const fine = saveBase(); fine.progress.ext = { demo: { a: shared, b: shared } };
  ok(validateSave(fine));
});

test('[R4-A01] every stub room lies inside its owner cell for each cell size', () => {
  const registry = ok(createRegistry({
    regions: ['region01', 'region02', 'region03', 'region04'].map((s) => stubRegion(s)),
    landmarks: [stubLandmark('landmark01')] }));
  for (const cellSize of [5, 16, 64, 100]) {
    const cfg = config(registry);
    cfg.structuralConfig = { cellSize, maxSpaceExtent: 64 };
    const { context } = ok(composeWorld(cfg, registry, createDefaultAdapters()));
    const { spaces } = ok(queryWorld(context, { min: { x: 0, y: -2, z: 0 }, max: { x: cellSize * 2, y: 8, z: cellSize * 2 } }));
    assert.ok(spaces.length > 0);
    for (const { frame: { origin }, bounds: b } of spaces) {
      for (const axis of ['x', 'z']) {
        const cell = Math.floor(origin[axis] / cellSize);
        assert.ok(b.min[axis] >= cell * cellSize && b.max[axis] <= (cell + 1) * cellSize,
          `cellSize ${cellSize}: ${axis} ${b.min[axis]}..${b.max[axis]} leaves cell ${cell}`);
      }
    }
  }
});

// ---- review 5 (fresh ChatGPT chat) ----------------------------------------------------------------
test('[R5-01] a Worker reply carrying a Snapshot with registered extensions is accepted (transport consumer)', () => {
  const extAdapters = { demo: { validate: (value) => value } };
  const registry = registryWith('region01', (ctx) => {
    const out = stubOut('region01', ctx);
    out.spaces[0].ext = { demo: { n: 1 } };
    return out;
  });
  const { context } = ok(composeWith(registry, { ...createDefaultAdapters(), extAdapters }));
  const snapshot = ok(queryWorld(context, BOX));
  const { worldId: wid, configFingerprint } = context.descriptor;
  const reply = { formatVersion: 1, protocolVersion: 1, requestId: 'req1', jobType: 'query', worldId: wid,
    configFingerprint, generationEpoch: 0, queryKey: makeQueryKey(wid, BOX), result: snapshot };
  ok(validateWorkerReply(copy(reply)));
  const tampered = copy(reply);
  tampered.result.structuralDigest = 'f'.repeat(64);
  failed(validateWorkerReply(tampered), 'BAD_DIGEST');
});

test('[R5-02] Shape.kind matches [a-z][a-z0-9-]* in transport mode too (rev3:42)', () => {
  const space = airSpace();
  const withKind = (kind) => { const s = copy(space); s.volumes[0].shape = { kind, v: 1, p: {} }; return s; };
  for (const bad of ['Invalid Shape!', '', '1box', 'Box', 'a_b']) failed(validateSpace(withKind(bad), { mode: 'transport' }));
  ok(validateSpace(withKind('custom-shape-2'), { mode: 'transport' }));
});

test('[R5-03] extension namespaces are read as data and adapter output must be JSON', () => {
  const space = airSpace();
  const options = (validate) => ({ extAdapters: { demo: { validate } } });
  const getter = copy(space);
  getter.ext = {};
  Object.defineProperty(getter.ext, 'demo', { enumerable: true, get() { throw new Error('getter ran'); } });
  let result;
  assert.doesNotThrow(() => { result = validateSpace(getter, options((v) => v)); });
  failed(result, 'BAD_TYPE');
  const plain = copy(space); plain.ext = { demo: { n: 1 } };
  ok(validateSpace(plain, options((v) => v)));
  failed(validateSpace(plain, options(() => ({ n: Infinity }))));
  const hidden = copy(space); hidden.ext = {};
  Object.defineProperty(hidden.ext, 'demo', { value: { n: 1 }, enumerable: false });
  failed(validateSpace(hidden, { ...options((v) => v), mode: 'transport' }));
});

test('[R5-04] untrusted objects are never read through a getter before validation', () => {
  const trap = (object, key) => Object.defineProperty(object, key, {
    enumerable: true, get() { throw new Error(`getter ${key} ran`); } });
  const registry = registryWith('region01', (ctx) => {
    const out = stubOut('region01', ctx);
    delete out.spaces[0].frame;
    trap(out.spaces[0], 'frame');
    return out;
  });
  let result;
  assert.doesNotThrow(() => { result = queryWorld(ok(composeWith(registry)).context, BOX); });
  failed(result);
  const request = { formatVersion: 1, protocolVersion: 1, requestId: 'req1', worldId, configFingerprint: FP,
    generationEpoch: 0, queryBounds: BOX, queryKey: makeQueryKey(worldId, BOX) };
  trap(request, 'jobType');
  assert.doesNotThrow(() => { result = validateWorkerRequest(request); });
  failed(result, 'BAD_TYPE');
  const snapshot = copy(ok(queryWorld(defaultWorld().context, BOX)));
  const traversal = snapshot.traversals[0];
  delete traversal.spaceId;
  trap(traversal, 'spaceId');
  assert.doesNotThrow(() => { result = validateSnapshot(snapshot); });
  failed(result, 'BAD_TYPE');
});

test('[R5-05] adapter `versions` metadata is validated at composition', () => {
  const box = DEFAULT_SHAPE_ADAPTERS.box;
  const adapters = createDefaultAdapters();
  const compose = (versions) => {
    const registry = ok(createDefaultRegistry());
    return composeWorld(config(registry), registry,
      { ...adapters, shapeAdapters: { ...adapters.shapeAdapters, box: { ...box, versions } } });
  };
  failed(compose(42), 'BAD_TYPE');
  failed(compose([]), 'BAD_TYPE');
  failed(compose([0]), 'BAD_RANGE');
  failed(compose([1.5]), 'BAD_RANGE');
  ok(compose([1, 2]));
});

test('[R5-06] --out named like a parent segment but inside js/ is rejected (rev5 s1)', async () => {
  await temp((dir) => {
    const root = fixture(join(dir, 'source'));
    const r = build(root, join(root, 'js', '..cache'));
    assert.equal(r.status, 1, `exit=${r.status}; ${r.stderr}`);
    assert.equal(existsSync(join(root, 'js', '..cache')), false, 'the build wrote into js/');
  });
});

// ---- review 6 (fresh ChatGPT chat) ----------------------------------------------------------------
test('[R6-01] array elements are read as own data: accessors, inherited indices and array properties fail', () => {
  const getter = [null];
  Object.defineProperty(getter, '0', { enumerable: true, get() { throw new Error('getter ran'); } });
  let result;
  const registry = registryWith('region01', (ctx) => ({ ...stubOut('region01', ctx), spaces: getter }));
  assert.doesNotThrow(() => { result = queryWorld(ok(composeWith(registry)).context, BOX); });
  failed(result);
  const inherited = new Array(1);
  Object.setPrototypeOf(inherited, Object.create(Array.prototype, { 0: { value: 1, enumerable: true } }));
  assert.doesNotThrow(() => { result = run(() => json(inherited, '/x')); });
  failed(result, 'BAD_TYPE');
  const tagged = [1]; tagged.extra = 2;
  failed(run(() => json(tagged, '/x')), 'BAD_TYPE');
  const hiddenSymbol = [1]; hiddenSymbol[Symbol('s')] = 2;
  failed(run(() => json(hiddenSymbol, '/x')), 'BAD_TYPE');
  assert.deepEqual(ok(run(() => json([1, [2, 3], { a: [4] }], '/x'))), [1, [2, 3], { a: [4] }]);
});

test('[R6-02] shape and feature adapter output must be JSON again (a non-finite leaf is BAD_RANGE)', () => {
  const box = DEFAULT_SHAPE_ADAPTERS.box;
  const space = airSpace();
  failed(validateSpace(space, { shapeAdapters: { ...DEFAULT_SHAPE_ADAPTERS,
    box: { ...box, validate: (p) => ({ ...p, height: Infinity }) } } }), 'BAD_RANGE');
  ok(validateSpace(space, { shapeAdapters: { ...DEFAULT_SHAPE_ADAPTERS, box: { ...box, validate: (p) => p } } }));
  const withFeature = copy(space);
  withFeature.features = [{ featureId: 'f1', type: 'generic', ownerId: space.ownerId, anchor: { x: 0, y: 0, z: 0 },
    shape: null, params: { n: 1 }, waterBodyId: null, surfaceRefs: [] }];
  ok(validateSpace(withFeature));
  failed(validateSpace(withFeature, { featureAdapters: { generic: { validate: () => ({ n: Infinity }) } } }), 'BAD_RANGE');
  const trap = copy(withFeature);
  Object.defineProperty(trap.features[0].params, 'n', { enumerable: true, get() { throw new Error('getter ran'); } });
  let result;
  assert.doesNotThrow(() => { result = validateSpace(trap, { featureAdapters: { generic: { validate: (p) => p } } }); });
  failed(result, 'BAD_TYPE');
});

// ---- review 7 (fresh ChatGPT chat) ----------------------------------------------------------------
test('[R7-01] validateLoadResult picks its variant without running a getter', () => {
  const hostile = {};
  Object.defineProperty(hostile, 'ok', { enumerable: true, get() { throw new Error('getter ran'); } });
  let result;
  assert.doesNotThrow(() => { result = validateLoadResult(hostile); });
  failed(result, 'BAD_TYPE');
  assert.equal(result.path, '/ok');
  failed(validateLoadResult({ ok: false, code: 'NOT_A_CODE' }));
});

test('[R7-02] a malformed owner state is a BAD_TYPE Result, never a thrown error', () => {
  const common = { formatVersion: 1, protocolVersion: 1, requestId: 'req1', worldId, configFingerprint: FP, generationEpoch: 0 };
  const query = { ...common, jobType: 'query', queryBounds: BOX, queryKey: makeQueryKey(worldId, BOX) };
  const cancel = { ...common, jobType: 'cancel', targetRequestId: 'req1' };
  const reply = { ...common, jobType: 'init', result: { worldId } };
  const good = { worldId, configFingerprint: FP, epoch: 0, pending: {} };
  const calls = { beginRequest: () => (s) => beginRequest(s, query), applyCancel: () => (s) => applyCancel(s, cancel),
    acceptReply: () => (s) => acceptReply(s, reply) };
  const entry = { jobType: 'query', queryKey: makeQueryKey(worldId, BOX), epoch: 0, cancelled: false };
  const bad = [
    [{ ...good, pending: null }, '/pending'],
    [{ ...good, pending: { req1: null } }, '/pending/req1'],
    [{ ...good, pending: { req1: { ...entry, cancelled: 'no' } } }, '/pending/req1/cancelled'],
    [{ ...good, worldId: 7 }, '/worldId'],
    [{ ...good, epoch: '0' }, '/epoch'],
  ];
  for (const [name, make] of Object.entries(calls)) {
    const call = make();
    for (const [state, path] of bad) {
      let result;
      assert.doesNotThrow(() => { result = call(state); }, `${name} ${path}`);
      failed(result, 'BAD_TYPE');
      assert.equal(result.path, path, name);
    }
    ok(call(good));
  }
});

// ---- review 8 (fresh ChatGPT chat) ----------------------------------------------------------------
test('[R8-01] validateWorld enforces the Journey relations that composeWorld enforces (rev3:72)', () => {
  const resealed = (change) => {
    const d = copy(defaultWorld().context.descriptor);
    change(d);
    d.configFingerprint = makeConfigFingerprint(d);
    d.worldId = makeWorldObjectId('w', d.seed, d.configFingerprint, parseWorldObjectId(d.worldId).value.localKey);
    return validateWorld(d);
  };
  ok(resealed(() => {}));
  const segments = resealed((d) => { d.journeyConfig.segments = d.journeyConfig.segments.slice(1); });
  failed(segments, 'BAD_RANGE');
  assert.equal(segments.path, '/journeyConfig/segments');
  const negative = resealed((d) => { d.journeyConfig.segments[0] = -1; });
  failed(negative, 'BAD_RANGE');
  assert.equal(negative.path, '/journeyConfig/segments/0');
  failed(resealed((d) => { d.journeyConfig.landmarkSlotIds = [d.journeyConfig.regionSlotIds[0]]; }), 'DUP_ID');
  failed(resealed((d) => { d.modules[0].slotId = 'elsewhere'; }), 'BAD_REF');
});

test('[R8-02] validateResolved checks shared water across the Snapshots it is given (rev4:24)', () => {
  const base = airSpace();
  const other = parseWorldObjectId(base.spaceId).value;
  const idOf = (key) => makeWorldObjectId('s', other.seed, other.configFingerprint, key);
  const withWater = (spaceId, params) => {
    const s = copy(base);
    s.spaceId = spaceId;
    s.features = [{ featureId: 'f1', type: 'generic', ownerId: s.ownerId, anchor: { x: 0, y: 0, z: 0 }, shape: null,
      params, waterBodyId: 'water.shared', surfaceRefs: [] }];
    return s;
  };
  const snapshot = (space) => ({ spaces: [space], traversals: [traversalFor(space)] });
  const a = idOf('a-room');
  const b = idOf('b-room');
  const same = { levelY: 0.5, anchorSpaceId: a };
  ok(validateResolved([snapshot(withWater(a, same)), snapshot(withWater(b, same))]));
  const level = validateResolved([snapshot(withWater(a, same)), snapshot(withWater(b, { ...same, levelY: 0.75 }))]);
  failed(level, 'BAD_WATER_LEVEL');
  assert.equal(level.path, '/1/spaces/0/features/0/params/levelY');
  failed(validateResolved([snapshot(withWater(a, same)), snapshot(withWater(b, { ...same, anchorSpaceId: b }))]),
    'BAD_WATER_ANCHOR');
});

test('[R8-03] a registry entry without a usable descriptor is a failed Result, never a thrown error', () => {
  const generate = () => ({ spaces: [], traversals: [] });
  let result;
  assert.doesNotThrow(() => { result = createRegistry({ regions: [{ generate }], landmarks: [] }); });
  failed(result, 'MISSING_FIELD');
  assert.equal(result.path, '/regions/0/descriptor');
  failed(createRegistry({ regions: [{ descriptor: 5, generate }], landmarks: [] }), 'BAD_TYPE');
  const trap = { generate };
  Object.defineProperty(trap, 'descriptor', { enumerable: true, get() { throw new Error('getter ran'); } });
  assert.doesNotThrow(() => { result = createRegistry({ regions: [trap], landmarks: [] }); });
  failed(result, 'BAD_TYPE');
  const good = ok(createDefaultRegistry());
  const handBuilt = { regions: [{ generate }, ...good.regions.slice(1)], landmarks: good.landmarks };
  assert.doesNotThrow(() => { result = composeWorld(config(good), handBuilt, createDefaultAdapters()); });
  failed(result, 'MISSING_FIELD');
});

test('[R8-05] error paths escape ~ and / in dynamic keys as JSON Pointer segments (rev3:25)', () => {
  const id = 'req/a~b';
  const state = { worldId, configFingerprint: FP, epoch: 0,
    pending: { [id]: { jobType: 'query', queryKey: null, epoch: 0, cancelled: 'no' } } };
  const request = { formatVersion: 1, protocolVersion: 1, requestId: 'req1', worldId, configFingerprint: FP,
    generationEpoch: 0, jobType: 'query', queryBounds: BOX, queryKey: makeQueryKey(worldId, BOX) };
  const result = beginRequest(state, request);
  failed(result, 'BAD_TYPE');
  assert.equal(result.path, '/pending/req~1a~0b/cancelled');
});

// ---- review 9 (fresh ChatGPT chat) ----------------------------------------------------------------
const reseal = (change) => {
  const d = copy(defaultWorld().context.descriptor);
  change(d);
  d.configFingerprint = makeConfigFingerprint(d);
  d.worldId = makeWorldObjectId('w', d.seed, d.configFingerprint, parseWorldObjectId(d.worldId).value.localKey);
  return validateWorld(d);
};
const resealedSnapshot = (change) => {
  const s = copy(ok(queryWorld(defaultWorld().context, BOX)));
  change(s);
  s.structuralDigest = snapshotDigest(s);
  return s;
};

test('[R9-01] validateWorld rejects a Journey slot that has no pinned module (rev5:15)', () => {
  const missing = reseal((d) => { d.modules = d.modules.filter((m) => m.kind !== 'landmark'); });
  failed(missing, 'BAD_REF');
  assert.equal(missing.path, '/journeyConfig/landmarkSlotIds/0');
  failed(reseal((d) => { d.modules = d.modules.filter((m) => m.slotId !== 'region02'); }), 'BAD_REF');
});

test('[R9-02] one moduleId cannot fill two slots, in validateWorld or in a hand-built registry (rev3:36)', () => {
  failed(reseal((d) => { d.modules[1].moduleId = d.modules[0].moduleId; }), 'DUP_ID');
  const good = ok(createDefaultRegistry());
  const twin = { ...good.regions[1], descriptor: { ...good.regions[1].descriptor, moduleId: good.regions[0].descriptor.moduleId } };
  const handBuilt = { regions: [good.regions[0], twin, ...good.regions.slice(2)], landmarks: good.landmarks };
  failed(composeWorld(config(handBuilt), handBuilt, createDefaultAdapters()), 'DUP_ID');
});

test('[R9-03] a Snapshot pairs every Space with exactly one Traversal', () => {
  ok(validateSnapshot(resealedSnapshot(() => {})));
  const unpaired = resealedSnapshot((s) => { s.traversals = s.traversals.slice(0, -1); });
  failed(validateSnapshot(unpaired), 'BAD_REF');
  assert.equal(validateSnapshot(unpaired).path, '/traversals');
});

test('[R9-04] one Snapshot cannot carry the same link id in two Spaces (rev4:19)', () => {
  const base = airSpace();
  const other = parseWorldObjectId(base.spaceId).value;
  const idOf = (key) => makeWorldObjectId('s', other.seed, other.configFingerprint, key);
  const a = { ...copy(base), spaceId: idOf('a-room') };
  const b = { ...copy(base), spaceId: idOf('b-room') };
  const withLinks = (idB) => resealedSnapshot((s) => {
    s.spaces = [a, b];
    s.traversals = [traversalFor(a, [walk('shared', a.spaceId, a.spaceId)]),
      traversalFor(b, [walk(idB, b.spaceId, b.spaceId)])];
  });
  ok(validateSnapshot(withLinks('mine')));
  const dup = validateSnapshot(withLinks('shared'));
  failed(dup, 'DUP_ID');
  assert.equal(dup.path, '/traversals/1/links/0/linkId');
});

test('[R9-05] registry arrays and envelopes are read as own data (no getter runs, no hole passes)', () => {
  const good = ok(createDefaultRegistry());
  const trapped = (entry) => {
    const list = [entry];
    Object.defineProperty(list, '0', { enumerable: true, get() { throw new Error('getter ran'); } });
    return list;
  };
  let result;
  assert.doesNotThrow(() => { result = createRegistry({ regions: trapped(good.regions[0]), landmarks: [] }); });
  failed(result, 'BAD_TYPE');
  assert.doesNotThrow(() => { result = createRegistry({ regions: new Array(1), landmarks: [] }); });
  failed(result, 'BAD_TYPE');
  const envelope = { landmarks: [] };
  Object.defineProperty(envelope, 'regions', { enumerable: true, get() { throw new Error('getter ran'); } });
  assert.doesNotThrow(() => { result = createRegistry(envelope); });
  failed(result, 'BAD_TYPE');
  const handBuilt = { regions: trapped(good.regions[0]), landmarks: good.landmarks };
  assert.doesNotThrow(() => { result = composeWorld(config(good), handBuilt, createDefaultAdapters()); });
  failed(result, 'BAD_TYPE');
});

test('[R9-06] both registry entry points report a missing generate at <entry>/generate', () => {
  const good = ok(createDefaultRegistry());
  const handBuilt = { regions: [{ descriptor: good.regions[0].descriptor }, ...good.regions.slice(1)], landmarks: good.landmarks };
  const composed = composeWorld(config(good), handBuilt, createDefaultAdapters());
  failed(composed, 'BAD_TYPE');
  assert.equal(composed.path, '/registry/regions/0/generate');
  const built = createRegistry({ regions: [{ descriptor: good.regions[0].descriptor }], landmarks: [] });
  failed(built, 'BAD_TYPE');
  assert.equal(built.path, '/regions/0/generate');
});

test('[R9-07] a Traversal in a Snapshot with a missing or mistyped spaceId is MISSING_FIELD or BAD_TYPE', () => {
  const missing = validateSnapshot(resealedSnapshot((s) => { delete s.traversals[0].spaceId; }));
  failed(missing, 'MISSING_FIELD');
  assert.equal(missing.path, '/traversals/0/spaceId');
  failed(validateSnapshot(resealedSnapshot((s) => { s.traversals[0].spaceId = 7; })), 'BAD_TYPE');
  failed(validateSnapshot(resealedSnapshot((s) => { s.traversals[0].spaceId = 'nope'; })), 'BAD_FIELD');
  const absent = copy(ok(queryWorld(defaultWorld().context, BOX)));
  absent.traversals[0].spaceId = makeWorldObjectId('s', 61, parseWorldObjectId(absent.worldId).value.configFingerprint, 'nowhere');
  failed(validateSnapshot(absent), 'BAD_REF');
});

test('[R9-08] an explicit undefined descriptor is BAD_TYPE, an absent one is MISSING_FIELD', () => {
  const generate = () => ({ spaces: [], traversals: [] });
  const explicit = createRegistry({ regions: [{ descriptor: undefined, generate }], landmarks: [] });
  failed(explicit, 'BAD_TYPE');
  assert.equal(explicit.path, '/regions/0/descriptor');
  failed(createRegistry({ regions: [{ generate }], landmarks: [] }), 'MISSING_FIELD');
});

test('[R9-09] the generator error path escapes a ~ in the slot id (rev3:25)', () => {
  const regions = ['r~1', 'region02', 'region03', 'region04']
    .map((s) => (s === 'r~1' ? { descriptor: stubRegion(s).descriptor, generate: () => ({}) } : stubRegion(s)));
  const registry = ok(createRegistry({ regions, landmarks: [stubLandmark('landmark01')] }));
  const cfg = config(registry);
  cfg.journeyConfig.regionSlotIds[0] = 'r~1';
  const composed = ok(composeWorld(cfg, registry, createDefaultAdapters()));
  const result = queryWorld(composed.context, BOX);
  failed(result, 'BAD_TYPE');
  assert.ok(result.path.startsWith('/generate/r~01/'), result.path);
});

test('[R9-10] validateUniqueLocalKeys reports a non-string key as BAD_TYPE, a malformed one as BAD_FIELD', () => {
  const number = validateUniqueLocalKeys([123]);
  failed(number, 'BAD_TYPE');
  assert.equal(number.path, '/0');
  failed(validateUniqueLocalKeys(['bad/path']), 'BAD_FIELD');
});

// ---- review 10 (fresh ChatGPT chat) ---------------------------------------------------------------
test('[R10-02] a registered ModuleDescriptor ext adapter is honoured by both registry entry points (rev4:35)', () => {
  const good = ok(createDefaultRegistry());
  const extAdapters = { custom: { validate: (v) => v } };
  const regions = [{ ...good.regions[0], descriptor: { ...good.regions[0].descriptor, ext: { custom: { flag: true } } } },
    ...good.regions.slice(1)];
  const modules = { regions, landmarks: good.landmarks };
  // strict by default: an unregistered namespace is rejected, at the same path in both entry points
  const bare = createRegistry(modules);
  failed(bare, 'UNKNOWN_FIELD');
  assert.equal(bare.path, '/regions/0/descriptor/ext/custom');
  const composedBare = composeWorld(config(good), modules, createDefaultAdapters());
  failed(composedBare, 'UNKNOWN_FIELD');
  assert.equal(composedBare.path, '/registry/regions/0/descriptor/ext/custom');
  // a registered namespace passes in both, and the adapter's output is what the registry keeps
  assert.deepEqual(ok(createRegistry(modules, { extAdapters })).regions[0].descriptor.ext, { custom: { flag: true } });
  ok(composeWorld(config(good), modules, { ...createDefaultAdapters(), extAdapters }));
  assert.equal(validateModuleDescriptor(regions[0].descriptor, { extAdapters }).ok, true);
});

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

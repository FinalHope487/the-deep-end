// Check IDs: P1-A01 (AR-01), P1-A08 (AR-12).
// New public exports for slice 2:
//   world.js: composeWorld(config, registry, adapters)
//     -> Result<{descriptor:World, context:WorldContext}>;
//   world.js: queryWorld(context, bounds) -> Result<Snapshot>.
// Registry input (in-memory, not an imported composition file):
//   {regions:[{descriptor:ModuleDescriptor,generate(ctx)}], landmarks:[]}.
// generate({worldId,seed,slotId,cell:{ix,iz},config}) returns
//   {spaces:Space[], traversals:Traversal[]}; config is frozen world input.
// No source files are changed or executed by the import boundary scan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeWorld, queryWorld } from '../../js/v3/core/world.js';
import { makeWorldObjectId, parseWorldObjectId, encodeCoordinate } from '../../js/v3/core/ids.js';
import { DEFAULT_SHAPE_ADAPTERS, DEFAULT_FEATURE_ADAPTERS, validateSpace } from '../../js/v3/core/space.js';
import { validateTraversal, validateResolved } from '../../js/v3/core/traversal.js';
import { validateSnapshot } from '../../js/v3/core/snapshot.js';
import { makeQueryKey, makeSnapshotId } from '../../js/v3/core/ids.js';
import { canonicalJson, sha256Hex } from '../../js/v3/core/hash.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const COMPOSITION = new Set([
  'js/v3/modules/registry-config.js', 'js/v3/modules/adapters.js',
  'js/v3/modules/world-config.js', 'js/v3/modules/journey-config.js',
]);
const point = (x, y, z) => ({ x, y, z });
const bounds = (x0, x1, z0 = 1, z1 = 9) => ({
  min: point(x0, 0, z0), max: point(x1, 5, z1),
});
function ok(result) { assert.equal(result?.ok, true, JSON.stringify(result)); return result.value; }
function bad(result, code) {
  assert.equal(result?.ok, false, JSON.stringify(result));
  assert.equal(result.code, code);
}

function filesUnder(folder) {
  const found = [];
  for (const item of readdirSync(join(ROOT, folder), { withFileTypes: true })) {
    const path = posix.join(folder, item.name);
    if (item.isDirectory()) found.push(...filesUnder(path));
    else if (item.isFile() && item.name.endsWith('.js')) found.push(path);
  }
  return found.sort();
}
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
}
function category(file) {
  if (file.startsWith('js/v3/core/')) return 'core';
  if (COMPOSITION.has(file)) return 'composition';
  if (file.startsWith('js/v3/modules/') || /js\/v3\/(special|water|vertical)\//.test(file)) {
    return 'generator';
  }
  if (file.startsWith('js/v3/entry/')) return 'entry';
  if (file.startsWith('js/v3/diagnostic/')) return 'diagnostic';
  if (file.startsWith('js/v3/workers/')) return 'worker';
  return 'unknown';
}
function scanSource(file, source) {
  const errors = [];
  const clean = withoutComments(source);
  const kind = category(file);
  const fail = (reason) => errors.push(`${file}: ${reason}`);
  if (kind === 'unknown') fail('unowned source folder');
  const forbidden = [
    [/\bimport\s*\(/, 'dynamic import'],
    [/\beval\s*\(/, 'eval'],
    [/\bnew\s+Function\s*\(/, 'Function constructor'],
    [/\b(?:document\s*\.\s*)?createElement\s*\(\s*['"]script['"]/, 'script injection'],
    [/\b(?:registry|module)(?:Url|URL|Path)\b[\s\S]{0,40}\bfetch\s*\(/, 'URL plugin lookup'],
  ];
  for (const [pattern, reason] of forbidden) if (pattern.test(clean)) fail(reason);
  if (kind === 'core' || kind === 'generator' || kind === 'composition') {
    if (/\b(?:window|document|localStorage|sessionStorage|navigator|AudioContext|HTMLElement)\b/.test(clean)) {
      fail('browser or storage global in pure layer');
    }
    if (/\b(?:fetch|XMLHttpRequest)\s*\(/.test(clean)) fail('runtime network lookup');
  }
  const re = /(?:^|\n)\s*(?:import|export)\s+(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]/g;
  for (const match of clean.matchAll(re)) {
    const spec = match[1];
    if (!spec.startsWith('.')) {
      if (!['entry', 'diagnostic', 'worker'].includes(kind)) fail(`non-local import ${spec}`);
      continue;
    }
    const target = posix.normalize(posix.join(posix.dirname(file), spec));
    const targetKind = category(target);
    if (!target.startsWith('js/v3/')) { fail(`import outside v3 ${target}`); continue; }
    if (kind === 'core' && targetKind !== 'core') fail(`core imports ${targetKind}`);
    if (kind === 'generator' && targetKind !== 'core') fail(`generator imports ${targetKind}`);
    if (kind === 'composition' && !['core', 'generator', 'composition'].includes(targetKind)) {
      fail(`composition imports ${targetKind}`);
    }
    if (kind === 'diagnostic' && targetKind === 'entry') fail('diagnostic imports entry');
  }
  return errors;
}

test('[P1-A01] actual v3 imports respect core and generation boundaries', () => {
  const files = filesUnder('js/v3');
  assert.ok(files.some((f) => f.startsWith('js/v3/core/')));
  assert.deepEqual(files.flatMap((file) => scanSource(file, readFileSync(join(ROOT, file), 'utf8'))), []);
});

test('[P1-A01] planted forbidden imports and DOM dependencies turn scan red', () => {
  const planted = [
    ['js/v3/core/world.js', "import { x } from '../modules/registry.js';"],
    ['js/v3/modules/regions/a.js', "import { saveGame } from '../../../save.js';"],
    ['js/v3/modules/landmarks/a.js', "import { paint } from '../../entry/main.js';"],
    ['js/v3/modules/registry-config.js', "import { ui } from '../diagnostic/view.js';"],
    ['js/v3/diagnostic/view.js', "import { boot } from '../entry/main.js';"],
    ['js/v3/core/hash.js', 'window.localStorage.getItem("save");'],
  ];
  for (const [file, content] of planted) {
    assert.ok(scanSource(file, content).length > 0, `${file}: planted fault escaped scan`);
  }
});

test('[P1-A08] dynamic loaders, eval and injected scripts turn scan red', () => {
  const badSources = [
    "const plugin = import('./plugin.js');",
    'const x = eval("1+2");',
    'const ctor = new Function("return 1");',
    "document.createElement('script');",
    'const registryURL = "any"; fetch(registryURL);',
  ];
  for (const src of badSources) {
    assert.ok(scanSource('js/v3/modules/registry-config.js', src).length > 0, src);
  }
  assert.deepEqual(scanSource('js/v3/modules/registry-config.js',
    "import { createRegistry } from './registry.js';"), []);
});

function extentSetup(overreach) {
  const descriptor = { formatVersion: 1, moduleId: 'test.extent',
    moduleVersion: overreach === 0 ? 1 : 2, kind: 'region',
    slotId: 'region01', featureSpecs: [] };
  const registry = { regions: [{ descriptor, generate(ctx) {
    const size = ctx.config.structuralConfig.cellSize;
    const extent = ctx.config.structuralConfig.maxSpaceExtent;
    const start = ctx.cell.ix * size + size - 1;
    const end = (ctx.cell.ix + 1) * size + extent + overreach;
    const z = ctx.cell.iz * size + 1;
    const { configFingerprint: fp } = parseWorldObjectId(ctx.worldId).value;
    const local = `region01.${encodeCoordinate(ctx.cell.ix)}.${encodeCoordinate(ctx.cell.iz)}`;
    const spaceId = makeWorldObjectId('s', ctx.seed, fp, local);
    const s = { formatVersion: 1, spaceId, worldId: ctx.worldId,
      ownerKind: 'region', ownerId: makeWorldObjectId('r', ctx.seed, fp, 'region01'),
      frame: { origin: point(start, 0, z) },
      bounds: { min: point(start, 0, z), max: point(end, 5, z + 8) },
      levels: [{ levelId: 'ground', datumY: 0 }],
      volumes: [{ volumeId: 'air', kind: 'open', levelId: 'ground',
        shape: { kind: 'box', v: 1, p: {
          min: point(0, 0, 0), max: point(end - start, 5, 8),
        } } }],
      portals: [], features: [], access: 'traversable' };
    const t = { formatVersion: 1, spaceId, nodes: [], surfaces: [],
      links: [], blockedVolumeIds: [] };
    return { spaces: [s], traversals: [t] };
  } }], landmarks: [] };
  const config = { seed: 42, generatorFormat: 1,
    structuralConfig: { cellSize: 64, maxSpaceExtent: 16 },
    journeyConfig: { regionSlotIds: ['region01'], landmarkSlotIds: [],
      exitSlotId: 'exit', segments: [10, 10], objectiveIds: [] },
    modules: [{ kind: 'region', slotId: 'region01',
      moduleId: 'test.extent', moduleVersion: descriptor.moduleVersion }],
    adapters: [],
  };
  return { config, registry, adapters: {
    shapeAdapters: DEFAULT_SHAPE_ADAPTERS,
    featureAdapters: DEFAULT_FEATURE_ADAPTERS,
  } };
}

test('[P1-A01] horizontal extent at limit is legal, beyond limit is BAD_RANGE', () => {
  const query = bounds(65, 70, 2, 3);
  const within = extentSetup(0);
  const safeContext = ok(composeWorld(within.config, within.registry, within.adapters)).context;
  const accepted = ok(queryWorld(safeContext, query));
  assert.ok(accepted.spaces.some((s) => s.frame.origin.x === 63));
  const beyond = extentSetup(0.25);
  const badContext = ok(composeWorld(beyond.config, beyond.registry, beyond.adapters)).context;
  bad(queryWorld(badContext, query), 'BAD_RANGE');
});

// validateResolved already exists in slice 1; slice 2 adds elevation semantics.
function linkedSnapshot(elevation) {
  const fp = '0123456789ab';
  const worldId = makeWorldObjectId('w', 42, fp, 'root');
  const build = (key, y) => {
    const spaceId = makeWorldObjectId('s', 42, fp, key);
    const s = { formatVersion: 1, spaceId, worldId, ownerKind: 'region',
      ownerId: makeWorldObjectId('r', 42, fp, 'region01'),
      frame: { origin: point(key === 'a' ? 0 : 10, y, 0) },
      bounds: { min: point(key === 'a' ? 0 : 10, y, 0),
        max: point(key === 'a' ? 10 : 20, y + 5, 10) },
      levels: [{ levelId: 'ground', datumY: y }],
      volumes: [{ volumeId: 'air', kind: 'open', levelId: 'ground',
        shape: { kind: 'box', v: 1, p: {
          min: point(0, 0, 0), max: point(10, 5, 10),
        } } }], portals: [], features: [], access: 'traversable' };
    const t = { formatVersion: 1, spaceId,
      nodes: [{ nodeId: 'n', volumeId: 'air', levelId: 'ground', surfaceId: 'floor' }],
      surfaces: [{ surfaceId: 'floor', kind: 'walkable',
        supportRef: { volumeId: 'air', face: 'bottom' } }],
      links: [], blockedVolumeIds: [] };
    return { s, t };
  };
  const a = build('a', 0), b = build('z', elevation);
  a.t.links.push({ linkId: 'cross',
    from: { spaceId: a.s.spaceId, nodeId: 'n' },
    to: { spaceId: b.s.spaceId, nodeId: 'n' },
    kind: 'walk', direction: 'forward' });
  const spaces = [a.s, b.s], traversals = [a.t, b.t];
  for (const s of spaces) ok(validateSpace(s));
  ok(validateTraversal(a.t, a.s)); ok(validateTraversal(b.t, b.s));
  const queryBounds = { min: point(-1, -2, -1), max: point(21, 10, 11) };
  const snapshot = { formatVersion: 1, worldId, queryBounds,
    snapshotId: makeSnapshotId(makeQueryKey(worldId, queryBounds)),
    spaces, traversals, structuralDigest: sha256Hex(canonicalJson({
      worldId, spaces, traversals,
    })) };
  ok(validateSnapshot(snapshot));
  return snapshot;
}

test('[P1-A01] resolved walk elevations agree within tolerance; steps may differ', () => {
  const level = linkedSnapshot(0);
  ok(validateResolved([level]));
  const close = linkedSnapshot(0.0000005);
  ok(validateResolved([close]));
  const raised = linkedSnapshot(0.001);
  bad(validateResolved([raised]), 'BAD_REF');
  raised.traversals[0].links[0].kind = 'step';
  raised.structuralDigest = sha256Hex(canonicalJson({
    worldId: raised.worldId, spaces: raised.spaces, traversals: raised.traversals,
  }));
  ok(validateSnapshot(raised));
  ok(validateResolved([raised]));
});

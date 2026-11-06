// Implementer-owned tests for slice 2 gaps found in review (not reviewer files):
//   - a walk link whose support elevation cannot be resolved is UNKNOWN_SURFACE,
//     never silently accepted (Rev5 s4);
//   - queryWorld rejects a bounds value that spans more than MAX_QUERY_CELLS cells.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeWorld, queryWorld, MAX_QUERY_CELLS } from '../../js/v3/core/world.js';
import { validateResolved } from '../../js/v3/core/traversal.js';
import { DEFAULT_SHAPE_ADAPTERS, DEFAULT_FEATURE_ADAPTERS } from '../../js/v3/core/space.js';
import { makeWorldObjectId, makeQueryKey, makeSnapshotId } from '../../js/v3/core/ids.js';
import { canonicalJson, sha256Hex } from '../../js/v3/core/hash.js';

const point = (x, y, z) => ({ x, y, z });
const FP = '0123456789ab';

function build(key, x0, shape) {
  const worldId = makeWorldObjectId('w', 42, FP, 'root');
  const spaceId = makeWorldObjectId('s', 42, FP, key);
  const space = { formatVersion: 1, spaceId, worldId, ownerKind: 'region',
    ownerId: makeWorldObjectId('r', 42, FP, 'region01'),
    frame: { origin: point(x0, 0, 0) },
    bounds: { min: point(x0, 0, 0), max: point(x0 + 10, 5, 10) },
    levels: [{ levelId: 'ground', datumY: 0 }],
    volumes: [{ volumeId: 'air', kind: 'open', levelId: 'ground', shape }],
    portals: [], features: [], access: 'traversable' };
  const traversal = { formatVersion: 1, spaceId,
    nodes: [{ nodeId: 'n', volumeId: 'air', levelId: 'ground', surfaceId: 'floor' }],
    surfaces: [{ surfaceId: 'floor', kind: 'walkable',
      supportRef: { volumeId: 'air', face: 'bottom' } }],
    links: [], blockedVolumeIds: [] };
  return { space, traversal };
}

function snapshotOf(a, b, kind) {
  a.traversal.links.push({ linkId: 'cross',
    from: { spaceId: a.space.spaceId, nodeId: 'n' },
    to: { spaceId: b.space.spaceId, nodeId: 'n' }, kind, direction: 'forward' });
  const spaces = [a.space, b.space].sort((p, q) => (p.spaceId < q.spaceId ? -1 : 1));
  const traversals = spaces.map((s) => [a, b].find((x) => x.space === s).traversal);
  const worldId = a.space.worldId;
  const queryBounds = { min: point(-1, -1, -1), max: point(30, 9, 11) };
  return { formatVersion: 1, worldId, queryBounds,
    snapshotId: makeSnapshotId(makeQueryKey(worldId, queryBounds)), spaces, traversals,
    structuralDigest: sha256Hex(canonicalJson({ worldId, spaces, traversals })) };
}

const box = { kind: 'box', v: 1, p: { min: point(0, 0, 0), max: point(10, 5, 10) } };

test('[P1-A01] walk link with an unresolvable support elevation is UNKNOWN_SURFACE', () => {
  const snap = snapshotOf(build('a', 0, box), build('z', 10, box), 'walk');
  assert.equal(validateResolved([snap]).ok, true);
  const noElevation = { ...DEFAULT_SHAPE_ADAPTERS, box: { validate: DEFAULT_SHAPE_ADAPTERS.box.validate } };
  const result = validateResolved([snap], { shapeAdapters: noElevation });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_SURFACE');
});

test('[P1-A01] step link needs no support elevation', () => {
  const snap = snapshotOf(build('a', 0, box), build('z', 10, box), 'step');
  const noElevation = { ...DEFAULT_SHAPE_ADAPTERS, box: { validate: DEFAULT_SHAPE_ADAPTERS.box.validate } };
  assert.equal(validateResolved([snap], { shapeAdapters: noElevation }).ok, true);
});

test('[P1-A01] a bounds value spanning too many cells is BAD_RANGE', () => {
  const descriptor = { formatVersion: 1, moduleId: 'test.r', moduleVersion: 1,
    kind: 'region', slotId: 'region01', featureSpecs: [] };
  const registry = { regions: [{ descriptor, generate: () => ({ spaces: [], traversals: [] }) }],
    landmarks: [] };
  const config = { seed: 1, generatorFormat: 1,
    structuralConfig: { cellSize: 64, maxSpaceExtent: 0 },
    journeyConfig: { regionSlotIds: ['region01'], landmarkSlotIds: [], exitSlotId: 'exit',
      segments: [1, 1], objectiveIds: [] },
    modules: [{ kind: 'region', slotId: 'region01', moduleId: 'test.r', moduleVersion: 1 }],
    adapters: [] };
  const { context } = composeWorld(config, registry, {
    shapeAdapters: DEFAULT_SHAPE_ADAPTERS, featureAdapters: DEFAULT_FEATURE_ADAPTERS }).value;
  const side = Math.sqrt(MAX_QUERY_CELLS) * 64;
  const fits = queryWorld(context, { min: point(0, 0, 0), max: point(side, 1, side) });
  assert.equal(fits.ok, true, JSON.stringify(fits));
  const tooMany = queryWorld(context, { min: point(0, 0, 0), max: point(side + 64, 1, side + 64) });
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.code, 'BAD_RANGE');
});

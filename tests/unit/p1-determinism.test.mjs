// Check IDs: P1-A04 (AR-07); fifth-slot Journey ordering only (AR-05).
// Required new public exports:
//   world.js: composeWorld(config, registry, adapters)
//     -> Result<{descriptor:World,context:WorldContext}>;
//   world.js: queryWorld(context, bounds) -> Result<Snapshot>;
//   journey.js: resolveJourneyAnchors(context)
//     -> Result<{anchorsVersion:1,anchors:[{slotId,kind,position}]}>.
// In-memory registry interface for this test (not the slice-3 registry module):
//   {regions:[{descriptor:ModuleDescriptor,generate(ctx)}],landmarks:[]}.
// ctx = {worldId,seed,slotId,cell:{ix,iz},config}; generate(ctx) returns
//   {spaces:Space[],traversals:Traversal[]} without mutating any input.
// This test does not import or exercise the later static registry implementation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeWorld, queryWorld } from '../../js/v3/core/world.js';
import { resolveJourneyAnchors } from '../../js/v3/core/journey.js';
import { validateSpace, DEFAULT_SHAPE_ADAPTERS, DEFAULT_FEATURE_ADAPTERS } from '../../js/v3/core/space.js';
import { validateSnapshot } from '../../js/v3/core/snapshot.js';
import { makeWorldObjectId, parseWorldObjectId, encodeCoordinate } from '../../js/v3/core/ids.js';
import { canonicalJson } from '../../js/v3/core/hash.js';

const point = (x, y, z) => ({ x, y, z });
const query = (x0, x1, z0 = 7, z1 = 12) => ({
  min: point(x0, -2, z0), max: point(x1, 8, z1),
});
const SLOTS = ['region01', 'region02', 'region03', 'region04'];
const adapters = Object.freeze({
  shapeAdapters: DEFAULT_SHAPE_ADAPTERS,
  featureAdapters: DEFAULT_FEATURE_ADAPTERS,
});
function ok(r) { assert.equal(r?.ok, true, JSON.stringify(r)); return r.value; }
function clone(x) { return structuredClone(x); }
function sortedUnique(ids) {
  assert.equal(ids.length, new Set(ids).size, 'duplicate canonical Space id');
  assert.deepEqual(ids, [...ids].sort());
}

function region(slotId, index, variant) {
  const descriptor = { formatVersion: 1, moduleId: `test.${slotId}`,
    moduleVersion: variant, kind: 'region', slotId, featureSpecs: [] };
  return { descriptor, generate(ctx) {
    const { seed, cell, worldId } = ctx;
    const size = ctx.config.structuralConfig.cellSize;
    const { configFingerprint: fp } = parseWorldObjectId(worldId).value;
    const startX = cell.ix * size + (index === 0 ? size - 8 : 2 + index * 5);
    const startZ = cell.iz * size + 6;
    const width = (index === 0 ? 24 : 6) + (variant - 1);
    const key = `${slotId}.${encodeCoordinate(cell.ix)}.${encodeCoordinate(cell.iz)}`;
    const spaceId = makeWorldObjectId('s', seed, fp, key);
    const s = {
      formatVersion: 1, spaceId, worldId, ownerKind: 'region',
      ownerId: makeWorldObjectId('r', seed, fp, slotId),
      frame: { origin: point(startX, 0, startZ) },
      bounds: { min: point(startX, 0, startZ),
        max: point(startX + width, 6, startZ + 10) },
      levels: [{ levelId: 'ground', datumY: 0 }],
      volumes: [{ volumeId: 'air', kind: 'open', levelId: 'ground',
        shape: { kind: 'box', v: 1, p: {
          min: point(0, 0, 0), max: point(width, 6, 10),
        } } }],
      portals: [], features: [], access: 'traversable',
    };
    const t = {
      formatVersion: 1, spaceId,
      nodes: [
        { nodeId: 'near', volumeId: 'air', levelId: 'ground', surfaceId: 'floor' },
        { nodeId: 'far', volumeId: 'air', levelId: 'ground', surfaceId: 'floor' },
      ],
      surfaces: [{ surfaceId: 'floor', kind: 'walkable',
        supportRef: { volumeId: 'air', face: 'bottom' } }],
      links: [{ linkId: `walk.${key}`,
        from: { spaceId, nodeId: 'near' },
        to: { spaceId, nodeId: 'far' }, kind: 'walk', direction: 'both' }],
      blockedVolumeIds: [],
    };
    assert.equal(validateSpace(s).ok, true, 'fixture must use the accepted Space schema');
    return { spaces: [s], traversals: [t] };
  } };
}
function scenario({ seed = 42, cellSize = 64, variant = 1,
  slots = SLOTS, segments, atmosphere } = {}) {
  const regions = slots.map((slot, i) => region(slot, i, variant));
  const registry = { regions, landmarks: [] };
  const journeyConfig = {
    regionSlotIds: [...slots], landmarkSlotIds: [], exitSlotId: 'exit01',
    segments: segments ?? Array(slots.length + 1).fill(20), objectiveIds: [],
  };
  const config = {
    seed, generatorFormat: 1,
    structuralConfig: { cellSize, maxSpaceExtent: 64 }, journeyConfig,
    modules: regions.map((r) => {
      const { kind, slotId, moduleId, moduleVersion } = r.descriptor;
      return { kind, slotId, moduleId, moduleVersion };
    }), adapters: [],
  };
  if (atmosphere !== undefined) config.atmosphere = atmosphere;
  return { registry, config, adapters };
}
function compose(s) { return ok(composeWorld(s.config, s.registry, s.adapters)); }
function visit(context, bounds) {
  const result = ok(queryWorld(context, bounds));
  ok(validateSnapshot(result));
  assert.equal(result.formatVersion, 1);
  sortedUnique(result.spaces.map((s) => s.spaceId));
  assert.deepEqual(result.traversals.map((t) => t.spaceId),
    result.spaces.map((s) => s.spaceId));
  return result;
}
const POSITIVE = query(60, 72);
const NEGATIVE = query(-68, -56, -66, -54);

// A-B-A and B-A-B are both essential: a one-way cache can hide order dependence.
test('[P1-A04] two seeds and independent worlds preserve A-B-A and B-A-B', () => {
  for (const seed of [42, 61]) {
    const x = compose(scenario({ seed }));
    const y = compose(scenario({ seed }));
    assert.equal(x.descriptor.worldId, y.descriptor.worldId);
    const a1 = visit(x.context, POSITIVE);
    const b1 = visit(x.context, NEGATIVE);
    const a2 = visit(x.context, POSITIVE);
    const b2 = visit(y.context, NEGATIVE);
    const a3 = visit(y.context, POSITIVE);
    const b3 = visit(y.context, NEGATIVE);
    assert.ok(a1.spaces.length > 0 && b1.spaces.length > 0);
    assert.equal(a1.structuralDigest, a2.structuralDigest);
    assert.equal(a1.structuralDigest, a3.structuralDigest);
    assert.equal(b1.structuralDigest, b2.structuralDigest);
    assert.equal(b1.structuralDigest, b3.structuralDigest);
    assert.equal(a1.snapshotId, a2.snapshotId);
    assert.notEqual(a1.snapshotId, b1.snapshotId);
  }
});

test('[P1-A04] a later overlapping query retains the same canonical Space IDs', () => {
  const { context } = compose(scenario());
  const a = visit(context, query(60, 64));
  const b = visit(context, query(66, 70));
  const ownerHall = a.spaces.find((s) => s.frame.origin.x === 56 && s.frame.origin.z === 6);
  assert.ok(ownerHall, 'fixture hall generated from owner cell 0,0');
  assert.ok(b.spaces.some((s) => s.spaceId === ownerHall.spaceId),
    'query did not include the owner cell but intersects its Space bounds');
  assert.ok(ownerHall.frame.origin.x < b.queryBounds.min.x);
  assert.ok(b.spaces.every((s) => s.bounds.max.x > b.queryBounds.min.x &&
    s.bounds.min.x < b.queryBounds.max.x));
});

test('[P1-A04] half-open boundaries exclude touching but non-intersecting hall', () => {
  const { context } = compose(scenario());
  const justInside = visit(context, query(79, 80));
  const onNextSide = visit(context, query(80, 81));
  const ownerHall = justInside.spaces.find((s) => s.frame.origin.x === 56);
  assert.ok(ownerHall, 'fixture hall must terminate exactly at x=80');
  assert.ok(!onNextSide.spaces.some((s) => s.spaceId === ownerHall.spaceId));
});

test('[P1-A04] changing atmosphere has no structural effect', () => {
  const clear = compose(scenario());
  const fog = compose(scenario({ atmosphere: { density: 0.75, color: 'blue' } }));
  assert.equal(clear.descriptor.worldId, fog.descriptor.worldId);
  assert.equal(clear.descriptor.configFingerprint, fog.descriptor.configFingerprint);
  for (const area of [POSITIVE, NEGATIVE]) {
    assert.equal(visit(clear.context, area).structuralDigest,
      visit(fog.context, area).structuralDigest);
  }
});

test('[P1-A04] structural cell size changes world identity and fixture geometry', () => {
  const a = compose(scenario({ cellSize: 64 }));
  const b = compose(scenario({ cellSize: 32 }));
  assert.notEqual(a.descriptor.worldId, b.descriptor.worldId);
  const left = visit(a.context, POSITIVE);
  const right = visit(b.context, POSITIVE);
  assert.ok(left.spaces.length > 0 && right.spaces.length > 0);
  assert.notEqual(left.structuralDigest, right.structuralDigest);
  const geometryQuery = query(21, 26);
  assert.notEqual(canonicalJson(visit(a.context, geometryQuery).spaces.map((s) => s.bounds)),
    canonicalJson(visit(b.context, geometryQuery).spaces.map((s) => s.bounds)));
});

test('[P1-A04] separate registries have no cross-context mutable state', () => {
  const base = compose(scenario({ variant: 1 }));
  const revised = compose(scenario({ variant: 2 }));
  assert.notEqual(base.descriptor.worldId, revised.descriptor.worldId);
  const first = visit(base.context, POSITIVE);
  const different = visit(revised.context, POSITIVE);
  const again = visit(base.context, POSITIVE);
  assert.notEqual(first.structuralDigest, different.structuralDigest);
  assert.equal(first.structuralDigest, again.structuralDigest);
  assert.deepEqual(first.spaces, again.spaces);
});

test('[P1-A04] unload and rebuild from independent inputs is identical', () => {
  const first = compose(scenario());
  const original = visit(first.context, NEGATIVE);
  const copyWorld = compose(scenario());
  const rebuilt = visit(copyWorld.context, NEGATIVE);
  assert.equal(original.structuralDigest, rebuilt.structuralDigest);
  assert.equal(original.snapshotId, rebuilt.snapshotId);
  assert.deepEqual(original.spaces, rebuilt.spaces);
  assert.ok(Object.isFrozen(rebuilt.spaces[0]), 'published canonical Space must be frozen');
});

test('[P1-A04] journey anchors follow slot order and remain stable', () => {
  const a = compose(scenario());
  const before = ok(resolveJourneyAnchors(a.context));
  assert.equal(before.anchorsVersion, 1);
  assert.deepEqual(before.anchors.filter((p) => p.kind === 'region').map((p) => p.slotId), SLOTS);
  assert.ok(before.anchors.some((p) => p.kind === 'start'));
  assert.ok(before.anchors.some((p) => p.kind === 'exit'));
  visit(a.context, POSITIVE); visit(a.context, NEGATIVE);
  assert.deepEqual(ok(resolveJourneyAnchors(a.context)), before);
  const independent = compose(scenario());
  assert.deepEqual(ok(resolveJourneyAnchors(independent.context)), before);
  const otherSeed = compose(scenario({ seed: 61 }));
  assert.deepEqual(ok(resolveJourneyAnchors(otherSeed.context))
    .anchors.map((p) => [p.slotId, p.kind]), before.anchors.map((p) => [p.slotId, p.kind]));
  const moved = compose(scenario({ segments: [35, 20, 20, 20, 20] }));
  assert.notEqual(moved.descriptor.worldId, a.descriptor.worldId);
  const changedAnchors = ok(resolveJourneyAnchors(moved.context));
  const oldFirst = before.anchors.find((p) => p.kind === 'region');
  const newFirst = changedAnchors.anchors.find((p) => p.kind === 'region');
  assert.notEqual(canonicalJson(oldFirst.position), canonicalJson(newFirst.position));
});

test('[P1-A04] test-only fifth region appears in the derived journey order', () => {
  const five = [...SLOTS, 'region05'];
  const { descriptor, context } = compose(scenario({ slots: five }));
  assert.deepEqual(descriptor.journeyConfig.regionSlotIds, five);
  const anchors = ok(resolveJourneyAnchors(context));
  assert.deepEqual(anchors.anchors.filter((p) => p.kind === 'region')
    .map((p) => p.slotId), five);
  assert.ok(visit(context, query(24, 26)).spaces.some((s) => s.ownerId.endsWith(':region05')));
});

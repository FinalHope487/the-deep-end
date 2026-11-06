// Check IDs: P1-A02 (S2-C01 through S2-C07 schema addendum).
// Existing public exports (no new API):
//   ids.js: makeWorldObjectId(kind, seed, fingerprint, localKey) -> string.
//   space.js: validateSpace(value, options) -> Result<Space>.
//   traversal.js: validateTraversal(value, space, options) -> Result<Traversal>;
//     validateResolved(snapshots) -> Result<Snapshot[]>.
//   snapshot.js: validateSnapshot(value, options) -> Result<Snapshot>.
//   render.js: validateRender(value, options) -> Result<Render>.
//   contracts.js: validateModuleDescriptor(value, options) -> Result<Module>.
//   ids.js: makeQueryKey(worldId, bounds), makeSnapshotId(queryKey).
//   hash.js: canonicalJson(value), sha256Hex(text).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorldObjectId, makeQueryKey, makeSnapshotId } from '../../js/v3/core/ids.js';
import { validateSpace } from '../../js/v3/core/space.js';
import { validateTraversal, validateResolved } from '../../js/v3/core/traversal.js';
import { validateSnapshot } from '../../js/v3/core/snapshot.js';
import { validateRender } from '../../js/v3/core/render.js';
import { validateModuleDescriptor } from '../../js/v3/core/contracts.js';
import { canonicalJson, sha256Hex } from '../../js/v3/core/hash.js';

const fp = '0123456789ab';
const point = (x, y, z) => ({ x, y, z });
const clone = (x) => structuredClone(x);
const id = (kind, key) => makeWorldObjectId(kind, 42, fp, key);
const box = (min, max) => ({ kind: 'box', v: 1, p: { min, max } });
function success(r) { assert.equal(r?.ok, true, JSON.stringify(r)); return r.value; }
function failure(r, code, path) {
  assert.equal(r?.ok, false, JSON.stringify(r));
  assert.equal(r.code, code);
  if (path) assert.equal(r.path, path);
}
function space(key = 'a', ownerKind = 'region') {
  const ownerKey = { region: 'r', landmark: 'l', filler: 'f' }[ownerKind];
  return {
    formatVersion: 1, spaceId: id('s', key), worldId: id('w', 'root'),
    ownerKind, ownerId: id(ownerKey, `owner.${key}`),
    frame: { origin: point(0, 0, 0) },
    bounds: { min: point(0, -1, 0), max: point(10, 5, 10) },
    levels: [{ levelId: 'ground', datumY: 0 }],
    volumes: [
      { volumeId: 'air', kind: 'open', levelId: 'ground',
        shape: box(point(0, 0, 0), point(10, 5, 10)) },
      { volumeId: 'floor', kind: 'solid', levelId: 'ground',
        shape: box(point(0, -1, 0), point(10, 0, 10)) },
    ],
    portals: [], features: [], access: 'traversable',
  };
}
function traversal(s) {
  return {
    formatVersion: 1, spaceId: s.spaceId,
    nodes: [{ nodeId: 'a', volumeId: 'air', levelId: 'ground', surfaceId: 'airBottom' }],
    surfaces: [
      { surfaceId: 'airBottom', supportRef: { volumeId: 'air', face: 'bottom' }, kind: 'walkable' },
      { surfaceId: 'floorTop', supportRef: { volumeId: 'floor', face: 'top' }, kind: 'scenic' },
    ],
    links: [], blockedVolumeIds: [],
  };
}
function snapshot(spaces, traversals = spaces.map(traversal)) {
  const bounds = { min: point(-1, -2, -1), max: point(30, 8, 30) };
  const orderedSpaces = [...spaces].sort((a, b) => a.spaceId < b.spaceId ? -1 : 1);
  const orderedTraversals = [...traversals].sort((a, b) => a.spaceId < b.spaceId ? -1 : 1);
  const worldId = id('w', 'root');
  return {
    formatVersion: 1, worldId, queryBounds: bounds,
    snapshotId: makeSnapshotId(makeQueryKey(worldId, bounds)),
    spaces: orderedSpaces, traversals: orderedTraversals,
    structuralDigest: sha256Hex(canonicalJson({
      worldId, spaces: orderedSpaces, traversals: orderedTraversals,
    })),
  };
}
const prism = (base) => ({ kind: 'prism', v: 1, p: { base, y0: 0, y1: 3 } });
const square = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }];

// S2-C01: the third owner kind is an independently identified filler.
test('[P1-A02] region, landmark and filler have matching owner ID kinds', () => {
  for (const kind of ['region', 'landmark', 'filler']) success(validateSpace(space(kind, kind)));
  const wrong = space('filler', 'filler');
  wrong.ownerId = id('r', 'wrong');
  failure(validateSpace(wrong), 'BAD_FIELD', '/ownerId');
});

// S2-C02: the reserved non-traversable volume kinds are valid data, not water.
test('[P1-A02] solid open void scenic volumes and scenic access are valid', () => {
  const s = space();
  for (const kind of ['void', 'scenic']) s.volumes.push({
    volumeId: kind, kind, levelId: 'ground',
    shape: box(point(0, 0, 0), point(2, 1, 2)),
  });
  s.volumes.sort((a, b) => a.volumeId < b.volumeId ? -1 : a.volumeId > b.volumeId ? 1 : 0);
  s.access = 'scenic';
  success(validateSpace(s));
  for (const badKind of ['water', 'decorative']) {
    const invalid = clone(s);
    invalid.volumes[2].kind = badKind;
    failure(validateSpace(invalid), 'BAD_FIELD', '/volumes/2/kind');
  }
  const invalidAccess = clone(s);
  invalidAccess.access = 'visual';
  failure(validateSpace(invalidAccess), 'BAD_FIELD', '/access');
});

// S2-C03: outside portals have a null target and retain opening geometry.
test('[P1-A02] portals retain shape purpose and optional null destination', () => {
  const s = space();
  for (const purpose of ['pass', 'view', 'blind', 'niche']) s.portals.push({
    portalId: `portal.${purpose}`, fromVolumeId: 'air', toVolumeId: null,
    purpose, shape: { kind: 'arch', v: 1, p: {
      plane: 'xy', center: point(1, 0, 1), width: 2, springY: 1,
      rise: 1, depth: 0.2,
    } },
  });
  s.portals.sort((a, b) => a.portalId < b.portalId ? -1 : a.portalId > b.portalId ? 1 : 0);
  success(validateSpace(s));
  const missing = clone(s); delete missing.portals[0].shape;
  failure(validateSpace(missing), 'MISSING_FIELD', '/portals/0/shape');
  const badPurpose = clone(s); badPurpose.portals[0].purpose = 'door';
  failure(validateSpace(badPurpose), 'BAD_FIELD', '/portals/0/purpose');
  const dangling = clone(s); dangling.portals[0].toVolumeId = 'absent';
  failure(validateSpace(dangling), 'BAD_REF', '/portals/0/toVolumeId');
});

// S2-C04 is additionally checked by the scenic-access case above.
test('[P1-A02] access rejects blocked while accepting traversable', () => {
  success(validateSpace(space()));
  const s = space(); s.access = 'blocked';
  failure(validateSpace(s), 'BAD_FIELD', '/access');
});

// S2-C05: the support face and semantic surface kind are independent.
test('[P1-A02] traversal surface kinds and support pairs are strict', () => {
  const s = space(), t = traversal(s);
  t.surfaces.push({ surfaceId: 'blocked', kind: 'blocked',
    supportRef: { volumeId: 'floor', face: 'top' } });
  t.surfaces.sort((a, b) => a.surfaceId < b.surfaceId ? -1 : a.surfaceId > b.surfaceId ? 1 : 0);
  success(validateTraversal(t, s));
  const climb = clone(t); climb.surfaces[0].kind = 'climbable';
  failure(validateTraversal(climb, s), 'BAD_FIELD', '/surfaces/0/kind');
  const openTop = clone(t); openTop.surfaces[0].supportRef.face = 'top';
  failure(validateTraversal(openTop, s), 'BAD_FIELD', '/surfaces/0/supportRef/face');
  const solidBottom = clone(t); solidBottom.surfaces[1].supportRef.face = 'bottom';
  failure(validateTraversal(solidBottom, s), 'BAD_FIELD', '/surfaces/1/supportRef/face');
});

// S2-C06: positive signed area is necessary but not sufficient.
test('[P1-A02] prism requires simple counter-clockwise nondegenerate footprint', () => {
  const valid = space(); valid.volumes[1].shape = prism(square);
  success(validateSpace(valid));
  const badBases = [
    [...square].reverse(),
    [{ x: 0, z: 0 }, { x: 3, z: 3 }, { x: 0, z: 3 }, { x: 3, z: 0 }],
    [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 2, z: 0 },
      { x: 4, z: 4 }, { x: 0, z: 4 }],
    [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }],
    [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 },
      { x: 2, z: 2 }, { x: 0, z: 4 }, { x: 2, z: 2 }],
    [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 4, z: 0 }],
  ];
  for (const base of badBases) {
    const s = space(); s.volumes[1].shape = prism(base);
    failure(validateSpace(s), 'BAD_RANGE', '/volumes/1/shape/p/base');
  }
});

// S2-C07: namespaced extension transport cannot bypass strict validation.
test('[P1-A02] extensions reject unknown namespaces in strict mode', () => {
  const s = space(); s.ext = { later: { alpha: [1, false, null] } };
  failure(validateSpace(s), 'UNKNOWN_FIELD', '/ext/later');
  assert.deepEqual(success(validateSpace(s, { mode: 'transport' })).ext, s.ext);
  success(validateSpace(s, { extAdapters: { later: { validate: (v) => v } } }));
  const bad = clone(s); bad.ext.later.alpha = [Infinity];
  assert.equal(validateSpace(bad, { mode: 'transport' }).ok, false);
});

test('[P1-A02] shape transport keeps unknown kinds without making them drawable', () => {
  const s = space();
  s.volumes[0].shape = { kind: 'future-shape', v: 1, p: { data: [3, 2, 1] } };
  failure(validateSpace(s), 'UNKNOWN_SHAPE', '/volumes/0/shape');
  assert.deepEqual(success(validateSpace(s, { mode: 'transport' })).volumes[0].shape,
    s.volumes[0].shape);
});

test('[P1-A02] traversal, module, render and snapshot have optional ext', () => {
  const s = space(); const t = traversal(s);
  const module = { formatVersion: 1, moduleId: 'test.region', moduleVersion: 1,
    kind: 'region', slotId: 'region01', featureSpecs: [], ext: { later: { b: 2 } } };
  const render = { formatVersion: 1, renderId: 'r', spaceIds: [s.spaceId],
    surfaces: [], lightHints: [], effectHooks: [], resourceKeys: [], ext: { later: 2 } };
  t.ext = { later: { enabled: true } };
  failure(validateTraversal(t, s), 'UNKNOWN_FIELD', '/ext/later');
  assert.deepEqual(success(validateTraversal(t, s, { mode: 'transport' })).ext, t.ext);
  failure(validateModuleDescriptor(module), 'UNKNOWN_FIELD', '/ext/later');
  assert.deepEqual(success(validateModuleDescriptor(module, { mode: 'transport' })).ext,
    module.ext);
  failure(validateRender(render), 'UNKNOWN_FIELD', '/ext/later');
  assert.deepEqual(success(validateRender(render, { mode: 'transport' })).ext, render.ext);
  const snap = snapshot([s], [t]);
  failure(validateSnapshot(snap), 'UNKNOWN_FIELD', '/traversals/0/ext/later');
  success(validateSnapshot(snap, { mode: 'transport' }));
});

test('[P1-A02] water-body features require valid level and same-world anchor', () => {
  const s = space();
  s.features.push({ featureId: 'pool', type: 'generic', ownerId: s.ownerId,
    anchor: point(1, 0, 1), shape: null,
    params: { levelY: 0.5, anchorSpaceId: s.spaceId },
    waterBodyId: 'water.shared', surfaceRefs: [] });
  success(validateSpace(s));
  const missingLevel = clone(s); delete missingLevel.features[0].params.levelY;
  failure(validateSpace(missingLevel), 'MISSING_FIELD', '/features/0/params/levelY');
  const missingAnchor = clone(s); delete missingAnchor.features[0].params.anchorSpaceId;
  failure(validateSpace(missingAnchor), 'MISSING_FIELD', '/features/0/params/anchorSpaceId');
  const invalidAnchor = clone(s); invalidAnchor.features[0].params.anchorSpaceId = id('r', 'bad');
  failure(validateSpace(invalidAnchor), 'BAD_FIELD', '/features/0/params/anchorSpaceId');
  const otherWorld = clone(s);
  otherWorld.features[0].params.anchorSpaceId = makeWorldObjectId('s', 43, fp, 'elsewhere');
  failure(validateSpace(otherWorld), 'BAD_REF', '/features/0/params/anchorSpaceId');
});

test('[P1-A02] forward and both cross-space links have fixed owners', () => {
  const a = space('a'), z = space('z');
  const forward = traversal(a);
  forward.links.push({ linkId: 'forward',
    from: { spaceId: a.spaceId, nodeId: 'a' },
    to: { spaceId: z.spaceId, nodeId: 'a' },
    kind: 'walk', direction: 'forward' });
  success(validateTraversal(forward, a));
  const wrongForward = clone(forward); wrongForward.spaceId = z.spaceId;
  failure(validateTraversal(wrongForward, z), 'BAD_REF', '/links/0/direction');
  const both = traversal(a);
  both.links.push({ linkId: 'both',
    from: { spaceId: z.spaceId, nodeId: 'a' },
    to: { spaceId: a.spaceId, nodeId: 'a' },
    kind: 'walk', direction: 'both' });
  success(validateTraversal(both, a));
  const wrongBoth = clone(both); wrongBoth.spaceId = z.spaceId;
  failure(validateTraversal(wrongBoth, z), 'BAD_REF', '/links/0/direction');
});

test('[P1-A02] duplicate link IDs across Spaces fail resolved validation', () => {
  const a = space('a'), z = space('z');
  const ta = traversal(a), tz = traversal(z);
  ta.links.push({ linkId: 'same', from: { spaceId: a.spaceId, nodeId: 'a' },
    to: { spaceId: z.spaceId, nodeId: 'a' }, kind: 'walk', direction: 'forward' });
  tz.links.push({ linkId: 'same', from: { spaceId: z.spaceId, nodeId: 'a' },
    to: { spaceId: a.spaceId, nodeId: 'a' }, kind: 'walk', direction: 'forward' });
  const aSnap = snapshot([a, z], [ta, tz]);
  failure(validateResolved([aSnap]), 'DUP_ID');
  tz.links[0].linkId = 'unique.z';
  success(validateResolved([snapshot([a, z], [ta, tz])]));
});

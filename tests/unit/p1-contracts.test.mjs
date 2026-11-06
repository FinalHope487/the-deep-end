// Check IDs: P1-A02, P1-SV01 (codec only)
// Required exports:
// contracts.js: validateWorld(value), validateModuleDescriptor(value),
//   validateJourney(value), validateSnapshot(value), validateRender(value).
// space.js: validateSpace(value, options), DEFAULT_SHAPE_ADAPTERS,
//   DEFAULT_FEATURE_ADAPTERS.
// traversal.js: validateTraversal(value, space), validateResolved(snapshots).
// save.js: validateSave(value), encodeSave(value), decodeSave(text),
//   validateLoadResult(value) -> Result<LoadResult> (shape only; no I/O).
// worker.js: validateWorkerRequest(value), validateWorkerReply(value),
//   beginRequest(state, request), applyCancel(state, request),
//   acceptReply(state, reply).
// ids.js: makeConfigFingerprint(input), makeWorldObjectId(kind, seed, fp, key),
//   makeLineageId(input), makeQueryKey(worldId, bounds), makeSnapshotId(queryKey).
// hash.js: canonicalJson(value), sha256Hex(text).
// Validators and codecs return {ok:true,value} or {ok:false,code,path}.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorld, validateModuleDescriptor, validateJourney,
  validateSnapshot, validateRender } from '../../js/v3/core/contracts.js';
import { validateSpace, DEFAULT_SHAPE_ADAPTERS, DEFAULT_FEATURE_ADAPTERS
} from '../../js/v3/core/space.js';
import { validateTraversal, validateResolved } from '../../js/v3/core/traversal.js';
import { validateSave, encodeSave, decodeSave, validateLoadResult } from '../../js/v3/core/save.js';
import { validateWorkerRequest, validateWorkerReply, beginRequest,
  applyCancel, acceptReply } from '../../js/v3/core/worker.js';
import { makeConfigFingerprint, makeWorldObjectId, makeLineageId,
  makeQueryKey, makeSnapshotId } from '../../js/v3/core/ids.js';
import { canonicalJson, sha256Hex } from '../../js/v3/core/hash.js';

const vec = (x, y, z) => ({ x, y, z });
const box = (x0 = 0, x1 = 10) =>
  ({ min: vec(x0, 0, 0), max: vec(x1, 5, 10) });
const copy = (value) => structuredClone(value);
const shapeOptions = { shapeAdapters: DEFAULT_SHAPE_ADAPTERS,
  featureAdapters: DEFAULT_FEATURE_ADAPTERS, mode: 'strict' };

function ok(result) {
  assert.equal(result?.ok, true, JSON.stringify(result));
  assert.ok(Object.hasOwn(result, 'value'));
  return result.value;
}
function bad(result, code, path = '/') {
  assert.equal(result?.ok, false, JSON.stringify(result));
  assert.equal(result.code, code);
  assert.equal(typeof result.path, 'string');
  assert.ok(result.path.startsWith(path), `${result.path} not under ${path}`);
}
function world() {
  const input = {
    seed: 42, generatorFormat: 1,
    structuralConfig: { cellSize: 64, maxSpaceExtent: 64 },
    journeyConfig: { regionSlotIds: ['region01'], landmarkSlotIds: [],
      exitSlotId: 'exit01', segments: [12, 18], objectiveIds: [] },
    modules: [{ kind: 'region', slotId: 'region01',
      moduleId: 'test.region', moduleVersion: 1 }],
    adapters: [{ adapterId: 'test.geometry', adapterVersion: 1 }],
  };
  const fp = makeConfigFingerprint(input);
  return { formatVersion: 1,
    worldId: makeWorldObjectId('w', 42, fp, 'root'),
    configFingerprint: fp, units: 'm',
    regionSlotIds: ['region01'], ...input };
}
function space(w = world(), offset = 0) {
  return {
    formatVersion: 1,
    spaceId: makeWorldObjectId('s', w.seed, w.configFingerprint,
      offset === 0 ? 'space0' : 'space1'),
    worldId: w.worldId, ownerKind: 'region',
    ownerId: makeWorldObjectId('r', w.seed, w.configFingerprint, 'region01'),
    frame: { origin: vec(offset, 0, 0) }, bounds: box(offset, offset + 10),
    levels: [{ levelId: 'ground', datumY: 0 }],
    volumes: [{ volumeId: 'air', kind: 'open', levelId: 'ground',
      shape: { kind: 'box', v: 1, p: {
        min: vec(0, 0, 0), max: vec(10, 5, 10) } } }],
    portals: [], features: [], access: 'traversable',
  };
}
function traversal(s = space()) {
  return { formatVersion: 1, spaceId: s.spaceId,
    nodes: [
      { nodeId: 'a', volumeId: 'air', levelId: 'ground', surfaceId: 'floor' },
      { nodeId: 'b', volumeId: 'air', levelId: 'ground', surfaceId: 'floor' },
    ],
    surfaces: [{ surfaceId: 'floor',
      supportRef: { volumeId: 'air', face: 'bottom' }, kind: 'walkable' }],
    links: [{ linkId: s.spaceId.endsWith(':space0') ? 'walk-space0' : 'walk-space1',
      from: { spaceId: s.spaceId, nodeId: 'a' },
      to: { spaceId: s.spaceId, nodeId: 'b' },
      kind: 'walk', direction: 'both' }],
    blockedVolumeIds: [] };
}
function snapshot(w = world(), spaces = [space(w)], queryBounds = box(0, 20)) {
  const traversals = spaces.map((s) => traversal(s));
  return { formatVersion: 1, worldId: w.worldId, queryBounds,
    snapshotId: makeSnapshotId(makeQueryKey(w.worldId, queryBounds)),
    spaces, traversals,
    structuralDigest: sha256Hex(canonicalJson({
      worldId: w.worldId, spaces, traversals })) };
}
function save(w = world()) {
  const { seed, generatorFormat, journeyConfig: j } = w;
  return { formatVersion: 1, phaseId: 'p1',
    worldId: w.worldId, seed, configFingerprint: w.configFingerprint,
    lineageId: makeLineageId({ seed, generatorFormat,
      regionSlotIds: j.regionSlotIds, landmarkSlotIds: j.landmarkSlotIds,
      exitSlotId: j.exitSlotId }),
    player: { position: vec(2, 0, 3), yaw: 0 },
    progress: { visitedSlotIds: ['region01'],
      foundKeys: ['region01.item01'], exitState: 'locked',
      lastFreePosition: null } };
}
function request(jobType, w = world()) {
  const common = { formatVersion: 1, protocolVersion: 1,
    requestId: `req-${jobType}`, jobType, worldId: w.worldId,
    configFingerprint: w.configFingerprint, generationEpoch: 7 };
  if (jobType === 'init') return { ...common, descriptor: w };
  if (jobType === 'query') {
    const queryBounds = box();
    return { ...common, queryBounds,
      queryKey: makeQueryKey(w.worldId, queryBounds) };
  }
  return { ...common, targetRequestId: 'req-query' };
}
function reply(req, result) {
  const { formatVersion, protocolVersion, requestId, jobType, worldId,
    configFingerprint, generationEpoch } = req;
  return { formatVersion, protocolVersion, requestId, jobType, worldId,
    configFingerprint, generationEpoch,
    ...(jobType === 'query' ? { queryKey: req.queryKey } : {}), result };
}

test('[P1-A02] nine contracts accept minimal version-one data', () => {
  const w = world(), s = space(w);
  const module = { formatVersion: 1, moduleId: 'test.region',
    moduleVersion: 1, kind: 'region', slotId: 'region01', featureSpecs: [] };
  const journey = { formatVersion: 1, journeyId: 'journey01',
    worldId: w.worldId, regionIds: [
      makeWorldObjectId('r', 42, w.configFingerprint, 'region01')],
    landmarkIds: [], exitId: 'exit01', objectiveIds: [] };
  const render = { formatVersion: 1, renderId: 'render01',
    spaceIds: [s.spaceId], surfaces: [], lightHints: [], effectHooks: [],
    resourceKeys: [] };
  const checks = [
    validateWorld(w), validateSpace(s, shapeOptions),
    validateTraversal(traversal(s), s), validateModuleDescriptor(module),
    validateJourney(journey), validateSnapshot(snapshot(w, [s])),
    validateSave(save(w)), validateRender(render),
    validateWorkerRequest(request('init', w)),
  ];
  assert.equal(checks.length, 9);
  for (const result of checks) {
    const data = ok(result);
    assert.equal(data.formatVersion, 1);
    assert.doesNotThrow(() => JSON.stringify(data));
  }
});

test('[P1-A02] strict validators reject missing, unknown and invalid data', () => {
  const w = world();
  const missing = copy(w);
  delete missing.seed;
  bad(validateWorld(missing), 'MISSING_FIELD', '/seed');
  bad(validateWorld({ ...w, formatVersion: 2 }), 'BAD_VERSION');
  bad(validateWorld({ ...w, extraneous: true }), 'UNKNOWN_FIELD', '/extraneous');
  bad(validateWorld({ ...w, seed: '42' }), 'BAD_TYPE', '/seed');
  const invalidSpace = space(w);
  invalidSpace.bounds.max.x = Infinity;
  bad(validateSpace(invalidSpace, shapeOptions), 'BAD_RANGE', '/bounds');
});

test('[P1-A02] non-object arguments throw programmer TypeError', () => {
  const fns = [validateWorld, (x) => validateSpace(x, shapeOptions),
    (x) => validateTraversal(x, space()), validateModuleDescriptor,
    validateJourney, validateSnapshot, validateSave, validateRender,
    validateWorkerRequest, validateWorkerReply];
  for (const fn of fns) {
    assert.throws(() => fn(null), TypeError);
    assert.throws(() => fn(7), TypeError);
  }
});

test('[P1-A02] box, prism, cylinder and circular arch accept valid geometry', () => {
  const shapes = [
    { kind: 'box', v: 1, p: { min: vec(-1, 0, -1), max: vec(1, 2, 1) } },
    { kind: 'prism', v: 1, p: { base: [
      { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 2 }],
      y0: 0, y1: 5 } },
    { kind: 'cylinder', v: 1, p: {
      cx: 0, cz: 0, radius: 1, y0: 0, y1: 2 } },
    { kind: 'arch', v: 1, p: { plane: 'xy', center: vec(0, 0, 0),
      width: 4, springY: 2, rise: 1, depth: 0.5 } },
    { kind: 'arch', v: 1, p: { plane: 'zy', center: vec(0, 0, 0),
      width: 4, springY: 0, rise: 1, depth: 0.5 } },
  ];
  for (const shape of shapes) {
    const s = space();
    s.volumes[0].shape = shape;
    ok(validateSpace(s, shapeOptions));
  }
});

test('[P1-A02] shape bounds and unregistered shape kinds fail', () => {
  const shapes = [
    [{ kind: 'box', v: 1, p: {
      min: vec(0, 0, 0), max: vec(0, 2, 2) } }, 'BAD_RANGE'],
    [{ kind: 'prism', v: 1, p: { base: [
      { x: 0, z: 0 }, { x: 1, z: 0 }], y0: 0, y1: 1 } }, 'BAD_RANGE'],
    [{ kind: 'cylinder', v: 1, p: {
      cx: 0, cz: 0, radius: 0, y0: 0, y1: 1 } }, 'BAD_RANGE'],
    [{ kind: 'arch', v: 1, p: {
      plane: 'xy', center: vec(0, 0, 0),
      width: 4, springY: 0, rise: 0, depth: 1 } }, 'BAD_RANGE'],
    [{ kind: 'arch', v: 1, p: {
      plane: 'xy', center: vec(0, 0, 0),
      width: 4, springY: -1, rise: 1, depth: 1 } }, 'BAD_RANGE'],
    [{ kind: 'cone', v: 1, p: { radius: 1 } }, 'UNKNOWN_SHAPE'],
  ];
  for (const [shape, code] of shapes) {
    const s = space();
    s.volumes[0].shape = shape;
    bad(validateSpace(s, shapeOptions), code, '/volumes');
  }
});

test('[P1-A02] Space checks duplicate IDs and feature/volume references', () => {
  const s = space();
  s.features = [{ featureId: 'f1', type: 'generic', ownerId: s.ownerId,
    anchor: vec(1, 0, 1), shape: null, params: {}, waterBodyId: null,
    surfaceRefs: [{ volumeId: 'air', face: 'bottom' }] }];
  ok(validateSpace(s, shapeOptions));
  const dup = copy(s);
  dup.features.push(copy(dup.features[0]));
  bad(validateSpace(dup, shapeOptions), 'DUP_ID', '/features');
  const dangling = copy(s);
  dangling.features[0].surfaceRefs[0].volumeId = 'missing';
  bad(validateSpace(dangling, shapeOptions), 'BAD_REF', '/features');
  const badLevel = copy(s);
  badLevel.volumes[0].levelId = 'absent';
  bad(validateSpace(badLevel, shapeOptions), 'BAD_REF', '/volumes');
});

test('[P1-A02] Traversal supports reference canonical surfaces and link nodes', () => {
  const s = space(), t = traversal(s);
  ok(validateTraversal(t, s));
  assert.equal(Object.hasOwn(t, 'walls'), false);
  const noSurface = copy(t);
  noSurface.nodes[0].surfaceId = 'missing';
  bad(validateTraversal(noSurface, s), 'BAD_REF', '/nodes');
  const noVolume = copy(t);
  noVolume.surfaces[0].supportRef.volumeId = 'missing';
  bad(validateTraversal(noVolume, s), 'BAD_REF', '/surfaces');
  const noNode = copy(t);
  noNode.links[0].to.nodeId = 'missing';
  bad(validateTraversal(noNode, s), 'BAD_REF', '/links');
});

test('[P1-A02] cross-Space links validate locally and resolve later', () => {
  const w = world(), a = space(w), b = space(w, 10);
  const ta = traversal(a), tb = traversal(b);
  ta.links[0] = { linkId: 'cross1',
    from: { spaceId: a.spaceId, nodeId: 'a' },
    to: { spaceId: b.spaceId, nodeId: 'b' },
    kind: 'walk', direction: 'forward' };
  ok(validateTraversal(ta, a));
  const full = snapshot(w, [a, b]);
  full.traversals = [ta, tb];
  full.structuralDigest = sha256Hex(canonicalJson({
    worldId: w.worldId, spaces: full.spaces, traversals: full.traversals }));
  ok(validateResolved([full]));
  const invalidLink = copy(full);
  invalidLink.traversals[1].nodes = [];
  invalidLink.structuralDigest = sha256Hex(canonicalJson({
    worldId: w.worldId, spaces: invalidLink.spaces,
    traversals: invalidLink.traversals }));
  bad(validateResolved([invalidLink]), 'BAD_REF');
});

test('[P1-A02] shared water bodies require matching height and anchor', () => {
  const w = world(), a = space(w), b = space(w, 10);
  for (const s of [a, b]) s.features.push({
    featureId: 'pool', type: 'generic', ownerId: s.ownerId,
    anchor: vec(0, 0, 0), shape: null,
    params: { levelY: 0.5, anchorSpaceId: a.spaceId },
    waterBodyId: 'water.shared', surfaceRefs: [] });
  ok(validateSnapshot(snapshot(w, [a, b])));
  b.features[0].params.levelY = 0.75;
  bad(validateSnapshot(snapshot(w, [a, b])), 'BAD_WATER_LEVEL');
  b.features[0].params.levelY = 0.5;
  b.features[0].params.anchorSpaceId = b.spaceId;
  bad(validateSnapshot(snapshot(w, [a, b])), 'BAD_WATER_ANCHOR');
});

test('[P1-A02] minus zero normalizes and non-finite values fail', () => {
  const s = space();
  s.frame.origin.x = -0;
  assert.equal(Object.is(ok(validateSpace(s, shapeOptions)).frame.origin.x, -0), false);
  const badShape = space();
  badShape.volumes[0].shape.p.max.y = Infinity;
  bad(validateSpace(badShape, shapeOptions), 'BAD_RANGE', '/volumes');
});

test('[P1-A02] Save codec round trips a valid phase save exactly', () => {
  const original = save();
  const text = ok(encodeSave(original));
  assert.equal(typeof text, 'string');
  assert.deepEqual(ok(decodeSave(text)), original);
  assert.deepEqual(ok(validateSave(original)), original);
  bad(decodeSave('{"formatVersion":'), 'BAD_JSON');
  bad(decodeSave('{"formatVersion":2}'), 'BAD_VERSION');
  bad(decodeSave('{"formatVersion":1}'), 'BAD_FIELD');
});

test('[P1-A02] Save keeps known and unknown ext namespaces without loss', () => {
  const original = save();
  original.progress.ext = {
    atmosphere: { value: 0.25, visited: ['region01'] },
    future: { data: [1, false, null] },
  };
  assert.deepEqual(ok(decodeSave(ok(encodeSave(original)))).progress.ext,
    original.progress.ext);
  const oldSave = save();
  assert.equal(Object.hasOwn(
    ok(decodeSave(ok(encodeSave(oldSave)))).progress, 'ext'), false);
  const invalid = save();
  invalid.player.position.x = NaN;
  bad(validateSave(invalid), 'BAD_RANGE');
});

test('[P1-A02] Save phase, lineage and unique progress sets are checked', () => {
  ok(validateSave(save()));
  const duplicate = save();
  duplicate.progress.visitedSlotIds.push('region01');
  bad(validateSave(duplicate), 'DUP_ID');
  const wrongPhase = save();
  wrongPhase.phaseId = 'p1-r1';
  assert.equal(validateSave(wrongPhase).ok, false);
  const wrongLineage = save();
  wrongLineage.lineageId = 'not-hex';
  assert.equal(validateSave(wrongLineage).ok, false);
});

test('[P1-A02] Worker init, query and cancel are mutually exclusive', () => {
  for (const kind of ['init', 'query', 'cancel']) {
    ok(validateWorkerRequest(request(kind)));
  }
  const noBounds = request('query');
  delete noBounds.queryBounds;
  bad(validateWorkerRequest(noBounds), 'MISSING_FIELD', '/queryBounds');
  const extra = request('init');
  extra.queryKey = '0123456789abcdef';
  bad(validateWorkerRequest(extra), 'UNKNOWN_FIELD', '/queryKey');
  const noTarget = request('cancel');
  delete noTarget.targetRequestId;
  bad(validateWorkerRequest(noTarget), 'MISSING_FIELD', '/targetRequestId');
  const mismatchedKey = request('query');
  mismatchedKey.queryKey = '0000000000000000';
  bad(validateWorkerRequest(mismatchedKey), 'BAD_QUERY_KEY', '/queryKey');
});

test('[P1-A02] Worker reply validates the job-specific result shape', () => {
  const w = world(), init = request('init', w), query = request('query', w);
  ok(validateWorkerReply(reply(init, { worldId: w.worldId })));
  ok(validateWorkerReply(reply(query, snapshot(w, [space(w)], query.queryBounds))));
  assert.equal(validateWorkerReply(
    reply(query, { worldId: w.worldId })).ok, false);
  assert.equal(validateWorkerReply(reply(init, snapshot(w))).ok, false);
  const both = reply(query, snapshot(w, [space(w)], query.queryBounds));
  both.error = { code: 'BAD_REF' };
  assert.equal(validateWorkerReply(both).ok, false);
});

test('[P1-A02] pure Worker state accepts a reply and rejects cancelled/stale', () => {
  const w = world(), owner = { worldId: w.worldId,
    configFingerprint: w.configFingerprint, epoch: 7, pending: {} };
  const q = request('query', w);
  const pending = ok(beginRequest(owner, q));
  assert.deepEqual(owner.pending, {});
  assert.equal(Object.isFrozen(pending), true);
  assert.equal(pending.pending[q.requestId].jobType, 'query');
  assert.equal(ok(acceptReply(pending, reply(q, snapshot(w, [space(w)], q.queryBounds)))).accept, true);
  const cancelled = ok(applyCancel(pending, request('cancel', w)));
  assert.equal(pending.pending[q.requestId].cancelled, false);
  assert.equal(cancelled.pending[q.requestId].cancelled, true);
  assert.equal(ok(acceptReply(cancelled, reply(q, snapshot(w, [space(w)], q.queryBounds)))).accept, false);
  const stale = reply(q, snapshot(w, [space(w)], q.queryBounds));
  stale.generationEpoch++;
  assert.equal(ok(acceptReply(pending, stale)).accept, false);
  const unknown = request('cancel', w);
  unknown.targetRequestId = 'not-pending';
  ok(applyCancel(pending, unknown));
});

test('[P1-SV01] compatible-load result has fixed progress, position and reason shape', () => {
  const original = save();
  const compatible = { ok: true, value: {
    progress: original.progress, position: vec(2, 0, 3),
    worldChanged: true, fallbackReason: 'PLAYER_POSITION_INVALID',
  } };
  assert.deepEqual(ok(validateLoadResult(compatible)), compatible);
  assert.deepEqual(ok(validateLoadResult({
    ok: false, code: 'WORLD_MISMATCH',
  })), { ok: false, code: 'WORLD_MISMATCH' });
  const invalid = copy(compatible);
  invalid.value.fallbackReason = 'ANYTHING';
  assert.equal(validateLoadResult(invalid).ok, false);
  const missing = copy(compatible);
  delete missing.value.position;
  assert.equal(validateLoadResult(missing).ok, false);
});

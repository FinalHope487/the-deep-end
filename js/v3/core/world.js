// World descriptor: pure JSON that fully describes the structural identity of a
// world, so a Worker can rebuild it from the descriptor alone.
import {
  Fail, run, requireObject, isPlain, num, int, str, oneOf, listOf, record, version, literal,
  objectId, uniqueIds, json, bounds, vec3, deepFreeze,
} from './check.js';
import { SEED_MAX } from './constants.js';
import {
  makeConfigFingerprint, parseWorldObjectId, isFingerprint, makeWorldObjectId,
  makeQueryKey, makeSnapshotId,
} from './ids.js';
import { canonicalJson, sha256Hex } from './hash.js';
import { validateModuleDescriptor } from './module.js';
import { validateSnapshot } from './snapshot.js';

const slotList = listOf(str);

const fingerprintField = (v, p) => {
  if (!isFingerprint(v)) throw new Fail(typeof v === 'string' ? 'BAD_FIELD' : 'BAD_TYPE', p);
  return v;
};

export const structuralConfigShape = (v, p) => record(v, p, {
  cellSize: (x, pt) => { const n = num(x, pt); if (!(n > 0)) throw new Fail('BAD_RANGE', pt); return n; },
  maxSpaceExtent: (x, pt) => { const n = num(x, pt); if (!(n >= 0)) throw new Fail('BAD_RANGE', pt); return n; },
});

export const journeyConfigShape = (v, p) => record(v, p, {
  regionSlotIds: slotList, landmarkSlotIds: slotList, exitSlotId: str,
  segments: listOf(num), objectiveIds: slotList,
});

export const moduleRef = (v, p) => record(v, p, {
  kind: (k, pt) => oneOf(k, pt, ['region', 'landmark']), slotId: str, moduleId: str,
  moduleVersion: (x, pt) => int(x, pt, 1),
});

export const adapterRef = (v, p) => record(v, p, {
  adapterId: str, adapterVersion: (x, pt) => int(x, pt, 1),
});

export function validateWorld(value) {
  requireObject(value, 'validateWorld');
  return run(() => {
    const out = record(value, '', {
      formatVersion: version, worldId: objectId('w'),
      seed: (v, p) => int(v, p, 0, SEED_MAX), configFingerprint: fingerprintField,
      generatorFormat: (v, p) => int(v, p, 1), structuralConfig: structuralConfigShape,
      journeyConfig: journeyConfigShape, units: literal('m'), regionSlotIds: slotList,
      modules: listOf(moduleRef), adapters: listOf(adapterRef),
    });
    const id = parseWorldObjectId(out.worldId).value;
    if (id.seed !== out.seed) throw new Fail('BAD_REF', '/seed');
    if (id.configFingerprint !== out.configFingerprint) throw new Fail('BAD_REF', '/configFingerprint');
    uniqueIds(out.journeyConfig.regionSlotIds, '/journeyConfig/regionSlotIds');
    uniqueIds(out.journeyConfig.landmarkSlotIds, '/journeyConfig/landmarkSlotIds');
    uniqueIds(out.regionSlotIds, '/regionSlotIds');
    uniqueIds(out.modules, '/modules', (m) => `${m.kind}/${m.slotId}`);
    uniqueIds(out.adapters, '/adapters', (a) => a.adapterId);
    if (out.regionSlotIds.join('\n') !== out.journeyConfig.regionSlotIds.join('\n')) {
      throw new Fail('BAD_REF', '/regionSlotIds');
    }
    if (makeConfigFingerprint(out) !== out.configFingerprint) {
      throw new Fail('BAD_REF', '/configFingerprint');
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Composition and query (slice 2). A WorldContext is an immutable value built
// from explicit inputs; it holds no cache, so a query depends only on the
// context and the bounds, never on earlier queries.
//
// Region ownership: a Space belongs to the cell that holds its frame origin,
// cell = floor(origin / cellSize) on x and z. Its bounds may reach past that
// cell by at most structuralConfig.maxSpaceExtent on each side (x and z).
// Landmarks use the same cell-owned generate() contract as regions; they differ
// only in ownerKind ('landmark', l-kind ownerId) and add no journey segment.
// ---------------------------------------------------------------------------

// Guard against a bounds value that would enumerate an unreasonable cell count.
export const MAX_QUERY_CELLS = 4096;

const isAdapterTable = (v, p) => {
  if (!isPlain(v)) throw new Fail('BAD_TYPE', p);
  for (const [key, adapter] of Object.entries(v)) {
    if (adapter === null || typeof adapter !== 'object' || typeof adapter.validate !== 'function') {
      throw new Fail('BAD_TYPE', `${p}/${key}`);
    }
  }
  return v;
};

const configShape = (value) => record(value, '/config', {
  seed: (v, p) => int(v, p, 0, SEED_MAX), generatorFormat: (v, p) => int(v, p, 1),
  structuralConfig: structuralConfigShape, journeyConfig: journeyConfigShape,
  modules: listOf(moduleRef), adapters: listOf(adapterRef),
}, { atmosphere: json });

const sub = (path, p) => `${path}${p === '/' ? '' : p}`;

// Checks one registry list of `kind` and returns the entries for `slots`, in slot order.
function registryEntries(registry, kind, slots, config) {
  const list = `${kind}s`;
  if (!Array.isArray(registry[list])) throw new Fail('BAD_TYPE', `/registry/${list}`);
  const bySlot = new Map();
  registry[list].forEach((entry, i) => {
    const path = `/registry/${list}/${i}`;
    if (!isPlain(entry) || typeof entry.generate !== 'function') throw new Fail('BAD_TYPE', path);
    const checked = validateModuleDescriptor(entry.descriptor);
    if (!checked.ok) throw new Fail(checked.code, sub(`${path}/descriptor`, checked.path));
    const d = checked.value;
    if (d.kind !== kind) throw new Fail('BAD_FIELD', `${path}/descriptor/kind`);
    if (bySlot.has(d.slotId)) throw new Fail('DUP_ID', `${path}/descriptor/slotId`);
    bySlot.set(d.slotId, Object.freeze({
      slotId: d.slotId, kind, descriptor: deepFreeze(d), generate: entry.generate }));
  });
  return slots.map((slotId, i) => {
    const entry = bySlot.get(slotId);
    const pinned = config.modules.find((m) => m.kind === kind && m.slotId === slotId);
    if (!entry || !pinned) throw new Fail('BAD_REF', `/config/journeyConfig/${kind}SlotIds/${i}`);
    if (entry.descriptor.moduleId !== pinned.moduleId
      || entry.descriptor.moduleVersion !== pinned.moduleVersion) {
      throw new Fail('BAD_REF', `/config/modules/${config.modules.indexOf(pinned)}`);
    }
    return entry;
  });
}

function registryModules(registry, config) {
  const { regionSlotIds, landmarkSlotIds, segments } = config.journeyConfig;
  if (segments.length !== regionSlotIds.length + 1) throw new Fail('BAD_RANGE', '/config/journeyConfig/segments');
  segments.forEach((s, i) => {
    if (!(s >= 0)) throw new Fail('BAD_RANGE', `/config/journeyConfig/segments/${i}`);
  });
  landmarkSlotIds.forEach((id, i) => {
    if (regionSlotIds.includes(id)) throw new Fail('DUP_ID', `/config/journeyConfig/landmarkSlotIds/${i}`);
  });
  config.modules.forEach((m, i) => {
    const slots = m.kind === 'region' ? regionSlotIds : landmarkSlotIds;
    if (!slots.includes(m.slotId)) throw new Fail('BAD_REF', `/config/modules/${i}`);
  });
  return {
    regions: registryEntries(registry, 'region', regionSlotIds, config),
    landmarks: registryEntries(registry, 'landmark', landmarkSlotIds, config),
  };
}

// Builds the World descriptor and an immutable WorldContext from explicit
// inputs. `atmosphere` and other non-structural config never reaches the
// descriptor, the fingerprint or a module's generate().
export function composeWorld(config, registry, adapters) {
  requireObject(config, 'composeWorld(config)');
  requireObject(registry, 'composeWorld(registry)');
  requireObject(adapters, 'composeWorld(adapters)');
  return run(() => {
    const cfg = configShape(config);
    const table = record(adapters, '/adapters', {
      shapeAdapters: isAdapterTable, featureAdapters: isAdapterTable });
    const { regions, landmarks } = registryModules(registry, cfg);
    const configFingerprint = makeConfigFingerprint(cfg);
    const checked = validateWorld({
      formatVersion: 1, worldId: makeWorldObjectId('w', cfg.seed, configFingerprint, 'root'),
      seed: cfg.seed, configFingerprint, generatorFormat: cfg.generatorFormat,
      structuralConfig: cfg.structuralConfig, journeyConfig: cfg.journeyConfig, units: 'm',
      regionSlotIds: [...cfg.journeyConfig.regionSlotIds], modules: cfg.modules,
      adapters: cfg.adapters,
    });
    if (!checked.ok) throw new Fail(checked.code, sub('/descriptor', checked.path));
    const descriptor = deepFreeze(checked.value);
    const generatorConfig = deepFreeze({
      seed: descriptor.seed, generatorFormat: descriptor.generatorFormat,
      structuralConfig: descriptor.structuralConfig, journeyConfig: descriptor.journeyConfig,
      modules: descriptor.modules, adapters: descriptor.adapters,
    });
    const context = Object.freeze({
      descriptor, generatorConfig, regions: Object.freeze(regions), landmarks: Object.freeze(landmarks),
      adapters: Object.freeze({
        shapeAdapters: table.shapeAdapters, featureAdapters: table.featureAdapters }),
    });
    return { descriptor, context };
  });
}

// Programmer-error check for a context handed to queryWorld or the journey.
export function assertContext(context, name) {
  if (context === null || typeof context !== 'object' || !isPlain(context.descriptor)
    || !Array.isArray(context.regions) || !Array.isArray(context.landmarks)
    || !isPlain(context.generatorConfig)) {
    throw new TypeError(`${name}: expected a WorldContext from composeWorld`);
  }
}

const cellRange = (lo, hi, size, extent) => ({
  from: Math.floor((lo - extent) / size), to: Math.ceil((hi + extent) / size) - 1,
});

// A generated Space must sit in its owner cell and stay within maxSpaceExtent.
function checkOwnedSpace(space, cell, size, extent, path) {
  if (!isPlain(space) || !isPlain(space.frame)) throw new Fail('BAD_TYPE', path);
  const origin = vec3(space.frame.origin, `${path}/frame/origin`);
  const box = bounds(space.bounds, `${path}/bounds`);
  if (Math.floor(origin.x / size) !== cell.ix || Math.floor(origin.z / size) !== cell.iz) {
    throw new Fail('BAD_REF', `${path}/frame/origin`);
  }
  for (const [axis, index] of [['x', cell.ix], ['z', cell.iz]]) {
    if (box.min[axis] < index * size - extent || box.max[axis] > (index + 1) * size + extent) {
      throw new Fail('BAD_RANGE', `${path}/bounds`);
    }
  }
  return box;
}

const intersects = (a, b) => ['x', 'y', 'z'].every(
  (axis) => a.max[axis] > b.min[axis] && a.min[axis] < b.max[axis]);

const bySpaceId = (a, b) => (a.spaceId < b.spaceId ? -1 : a.spaceId > b.spaceId ? 1 : 0);

// Returns the Snapshot of every Space whose bounds intersect `queryBounds`
// (half-open: touching faces do not count), sorted by spaceId.
export function queryWorld(context, queryBounds) {
  assertContext(context, 'queryWorld');
  requireObject(queryBounds, 'queryWorld(bounds)');
  return run(() => {
    const q = bounds(queryBounds, '/bounds');
    const { descriptor, generatorConfig, adapters } = context;
    const { cellSize, maxSpaceExtent } = descriptor.structuralConfig;
    const xs = cellRange(q.min.x, q.max.x, cellSize, maxSpaceExtent);
    const zs = cellRange(q.min.z, q.max.z, cellSize, maxSpaceExtent);
    if ((xs.to - xs.from + 1) * (zs.to - zs.from + 1) > MAX_QUERY_CELLS) {
      throw new Fail('BAD_RANGE', '/bounds');
    }
    const spaces = [];
    const traversalBySpace = new Map();
    for (const module of [...context.regions, ...context.landmarks]) {
      for (let ix = xs.from; ix <= xs.to; ix++) {
        for (let iz = zs.from; iz <= zs.to; iz++) {
          const cell = { ix, iz };
          const where = `/generate/${module.slotId}/${ix},${iz}`;
          const out = module.generate({
            worldId: descriptor.worldId, seed: descriptor.seed, slotId: module.slotId,
            cell, config: generatorConfig });
          if (!isPlain(out) || !Array.isArray(out.spaces) || !Array.isArray(out.traversals)) {
            throw new Fail('BAD_TYPE', where);
          }
          for (const t of out.traversals) {
            if (!isPlain(t) || typeof t.spaceId !== 'string') {
              throw new Fail('BAD_TYPE', `${where}/traversals`);
            }
            traversalBySpace.set(t.spaceId, t);
          }
          out.spaces.forEach((space, i) => {
            const at = `${where}/spaces/${i}`;
            const box = checkOwnedSpace(space, cell, cellSize, maxSpaceExtent, at);
            if (!traversalBySpace.has(space.spaceId)) throw new Fail('BAD_REF', `${where}/traversals`);
            if (intersects(box, q)) spaces.push(space);
          });
        }
      }
    }
    spaces.sort(bySpaceId);
    const traversals = spaces.map((s) => traversalBySpace.get(s.spaceId));
    const snapshot = {
      formatVersion: 1, worldId: descriptor.worldId, queryBounds: q,
      snapshotId: makeSnapshotId(makeQueryKey(descriptor.worldId, q)), spaces, traversals,
      structuralDigest: sha256Hex(canonicalJson({ worldId: descriptor.worldId, spaces, traversals })),
    };
    const checked = validateSnapshot(snapshot, adapters);
    if (!checked.ok) throw new Fail(checked.code, checked.path);
    return deepFreeze(checked.value);
  });
}

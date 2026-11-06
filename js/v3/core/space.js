// Space: the canonical geometry fact of one owner (region, landmark or filler).
// Shapes and feature types are pluggable adapters ({validate(p, path) -> p});
// adding a shape kind adds one adapter, never an edit to the validator.
import {
  Fail, run, requireObject, num, int, str, oneOf, listOf, localKey,
  nullable, record, version, vec3, bounds, jsonObject, uniqueIds, checkOrdered, objectId, sameWorld, extChecker,
} from './check.js';

const positiveRange = (lo, hi, path) => {
  if (!(hi > lo)) throw new Fail('BAD_RANGE', path);
};

// An adapter may add faceElevation(p, face) -> local y of the 'top' or 'bottom'
// face. It returns undefined when the face has no single elevation (arch).
const boxAdapter = {
  validate(p, path) {
    const out = record(p, path, { min: vec3, max: vec3 });
    for (const axis of ['x', 'y', 'z']) positiveRange(out.min[axis], out.max[axis], path);
    return out;
  },
  faceElevation: (p, face) => (face === 'top' ? p.max.y : p.min.y),
};

const pointXZ = (value, path) => record(value, path, { x: num, z: num });

// Simple counter-clockwise polygon in (x, z): positive signed area, no
// zero-length edge, no spike, no crossing or touching of non-adjacent edges.
function checkSimpleCcw(base, path) {
  const n = base.length;
  const fail = () => { throw new Fail('BAD_RANGE', `${path}/base`); };
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = base[i], b = base[(i + 1) % n];
    if (a.x === b.x && a.z === b.z) fail();
    area2 += a.x * b.z - b.x * a.z;
  }
  if (!(area2 > 0)) fail();
  const onSegment = (a, b, c) => Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x)
    && Math.min(a.z, b.z) <= c.z && c.z <= Math.max(a.z, b.z);
  const touches = (a, b, c, d) => {
    const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return (d1 === 0 && onSegment(a, b, c)) || (d2 === 0 && onSegment(a, b, d))
      || (d3 === 0 && onSegment(c, d, a)) || (d4 === 0 && onSegment(c, d, b));
  };
  for (let i = 0; i < n; i++) {
    const a = base[i], b = base[(i + 1) % n], c = base[(i + 2) % n];
    const dot = (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z);
    if (cross(a, b, c) === 0 && dot < 0) fail();
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (touches(a, b, base[j], base[(j + 1) % n])) fail();
    }
  }
}

const prismAdapter = {
  validate(p, path) {
    const out = record(p, path, { base: listOf(pointXZ), y0: num, y1: num });
    if (out.base.length < 3) throw new Fail('BAD_RANGE', `${path}/base`);
    checkSimpleCcw(out.base, path);
    positiveRange(out.y0, out.y1, path);
    return out;
  },
  faceElevation: (p, face) => (face === 'top' ? p.y1 : p.y0),
};

const cylinderAdapter = {
  validate(p, path) {
    const out = record(p, path, { cx: num, cz: num, radius: num, y0: num, y1: num });
    if (!(out.radius > 0)) throw new Fail('BAD_RANGE', `${path}/radius`);
    positiveRange(out.y0, out.y1, path);
    return out;
  },
  faceElevation: (p, face) => (face === 'top' ? p.y1 : p.y0),
};

const archAdapter = {
  validate(p, path) {
    const out = record(p, path, {
      plane: (v, pt) => oneOf(v, pt, ['xy', 'zy']), center: vec3,
      width: num, springY: num, rise: num, depth: num,
    });
    if (!(out.width > 0)) throw new Fail('BAD_RANGE', `${path}/width`);
    if (!(out.rise > 0)) throw new Fail('BAD_RANGE', `${path}/rise`);
    if (!(out.depth > 0)) throw new Fail('BAD_RANGE', `${path}/depth`);
    if (!(out.springY >= 0)) throw new Fail('BAD_RANGE', `${path}/springY`);
    return out;
  },
};

export const DEFAULT_SHAPE_ADAPTERS = Object.freeze({
  box: boxAdapter, prism: prismAdapter, cylinder: cylinderAdapter, arch: archAdapter,
});

export const DEFAULT_FEATURE_ADAPTERS = Object.freeze({
  generic: { validate: (params, path) => jsonObject(params, path) },
});

// Strict mode rejects a shape kind with no adapter; transport mode keeps its
// well-formed JSON untouched (it cannot be drawn or collided).
function shapeChecker(adapters, strict) {
  return (value, path) => {
    const head = record(value, path, { kind: str, v: (x, p) => int(x, p, 1), p: (x) => x });
    // an adapter validates the versions it lists (default: version 1 only)
    const adapter = Object.hasOwn(adapters, head.kind) ? adapters[head.kind] : null;
    if (!adapter || !(adapter.versions ?? [1]).includes(head.v)) {
      if (strict) throw new Fail('UNKNOWN_SHAPE', path);
      return { kind: head.kind, v: head.v, p: jsonObject(head.p, `${path}/p`) };
    }
    return { kind: head.kind, v: head.v, p: adapter.validate(head.p, `${path}/p`) };
  };
}

export function shapeValidator(options = {}) {
  return shapeChecker(options.shapeAdapters ?? DEFAULT_SHAPE_ADAPTERS,
    (options.mode ?? 'strict') === 'strict');
}

// Reference to a support surface of a volume. `adapter` faces are resolved by
// the volume's shape adapter and need a surfaceKey; top and bottom must not.
export function supportRefShape(value, path) {
  const out = record(value, path, {
    volumeId: localKey, face: (v, p) => oneOf(v, p, ['top', 'bottom', 'adapter']),
  }, { surfaceKey: str });
  if ((out.face === 'adapter') !== Object.hasOwn(out, 'surfaceKey')) {
    throw new Fail(out.face === 'adapter' ? 'MISSING_FIELD' : 'UNKNOWN_FIELD', `${path}/surfaceKey`);
  }
  return out;
}

function featureChecker(shapeFn, featureAdapters, strict) {
  const surfaceRef = supportRefShape;
  return (value, path) => {
    const out = record(value, path, {
      featureId: localKey, type: str, ownerId: str, anchor: vec3,
      shape: nullable(shapeFn), params: (x) => x,
      waterBodyId: nullable(localKey), surfaceRefs: listOf(surfaceRef),
    });
    if (Object.hasOwn(featureAdapters, out.type)) {
      out.params = featureAdapters[out.type].validate(out.params, `${path}/params`);
    } else if (strict) {
      throw new Fail('UNKNOWN_FEATURE', `${path}/type`);
    } else {
      out.params = jsonObject(out.params, `${path}/params`);
    }
    return out;
  };
}

const OWNER_KIND_ID = { region: 'r', landmark: 'l', filler: 'f' };

export function validateSpace(value, options = {}) {
  requireObject(value, 'validateSpace');
  const shapeFn = shapeValidator(options);
  const featureFn = featureChecker(shapeFn, options.featureAdapters ?? DEFAULT_FEATURE_ADAPTERS,
    (options.mode ?? 'strict') === 'strict');
  return run(() => {
    const out = record(value, '', {
      formatVersion: version, spaceId: objectId('s'), worldId: objectId('w'),
      ownerKind: (v, p) => oneOf(v, p, Object.keys(OWNER_KIND_ID)), ownerId: str,
      frame: (v, p) => record(v, p, { origin: vec3 }), bounds,
      levels: listOf((v, p) => record(v, p, { levelId: localKey, datumY: num })),
      volumes: listOf((v, p) => record(v, p, {
        volumeId: localKey, kind: (k, pt) => oneOf(k, pt, ['solid', 'open', 'void', 'scenic']),
        levelId: localKey, shape: shapeFn })),
      portals: listOf((v, p) => record(v, p, {
        portalId: localKey, fromVolumeId: localKey, toVolumeId: nullable(localKey), shape: shapeFn,
        purpose: (k, pt) => oneOf(k, pt, ['pass', 'view', 'blind', 'niche']) })),
      features: listOf(featureFn),
      access: (v, p) => oneOf(v, p, ['traversable', 'scenic']),
    }, { ext: extChecker(options) });
    objectId(OWNER_KIND_ID[out.ownerKind])(out.ownerId, '/ownerId');
    sameWorld(out.spaceId, out.worldId, '/spaceId');
    sameWorld(out.ownerId, out.worldId, '/ownerId');
    // arrays are sorted by stable id so equal Spaces serialize equally (rev3:76)
    for (const [items, path, key] of [
      [out.levels, '/levels', (l) => l.levelId], [out.volumes, '/volumes', (v) => v.volumeId],
      [out.portals, '/portals', (p) => p.portalId], [out.features, '/features', (f) => f.featureId]]) {
      uniqueIds(items, path, key);
      checkOrdered(items, path, key);
    }
    const levels = new Set(out.levels.map((l) => l.levelId));
    const volumes = new Set(out.volumes.map((v) => v.volumeId));
    out.volumes.forEach((v, i) => {
      if (!levels.has(v.levelId)) throw new Fail('BAD_REF', `/volumes/${i}/levelId`);
    });
    out.portals.forEach((p, i) => {
      if (!volumes.has(p.fromVolumeId)) throw new Fail('BAD_REF', `/portals/${i}/fromVolumeId`);
      if (p.toVolumeId !== null && !volumes.has(p.toVolumeId)) {
        throw new Fail('BAD_REF', `/portals/${i}/toVolumeId`);
      }
    });
    out.features.forEach((f, i) => {
      f.surfaceRefs.forEach((ref, j) => {
        if (!volumes.has(ref.volumeId)) {
          throw new Fail('BAD_REF', `/features/${i}/surfaceRefs/${j}/volumeId`);
        }
      });
      if (f.waterBodyId !== null) checkWaterParams(f, `/features/${i}/params`, out.worldId);
    });
    return out;
  });
}

// A water feature carries params {levelY, anchorSpaceId}; the anchor must be a
// Space id of this world (rev4 s4). Sharing rules across Spaces: see snapshot.js.
function checkWaterParams(feature, path, worldId) {
  const { params } = feature;
  if (!Object.hasOwn(params, 'levelY')) throw new Fail('MISSING_FIELD', `${path}/levelY`);
  num(params.levelY, `${path}/levelY`);
  if (!Object.hasOwn(params, 'anchorSpaceId')) throw new Fail('MISSING_FIELD', `${path}/anchorSpaceId`);
  objectId('s')(params.anchorSpaceId, `${path}/anchorSpaceId`);
  sameWorld(params.anchorSpaceId, worldId, `${path}/anchorSpaceId`);
}

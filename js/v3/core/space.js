// Space: the canonical geometry fact of one owner (region or landmark).
// Shapes and feature types are pluggable adapters ({validate(p, path) -> p});
// adding a shape kind adds one adapter, never an edit to the validator.
import {
  Fail, run, requireObject, num, str, oneOf, literal, listOf,
  nullable, record, version, vec3, bounds, jsonObject, uniqueIds, objectId, sameWorld,
} from './check.js';

const positiveRange = (lo, hi, path) => {
  if (!(hi > lo)) throw new Fail('BAD_RANGE', path);
};

const boxAdapter = {
  validate(p, path) {
    const out = record(p, path, { min: vec3, max: vec3 });
    for (const axis of ['x', 'y', 'z']) positiveRange(out.min[axis], out.max[axis], path);
    return out;
  },
};

const pointXZ = (value, path) => record(value, path, { x: num, z: num });

const prismAdapter = {
  validate(p, path) {
    const out = record(p, path, { base: listOf(pointXZ), y0: num, y1: num });
    if (out.base.length < 3) throw new Fail('BAD_RANGE', `${path}/base`);
    positiveRange(out.y0, out.y1, path);
    return out;
  },
};

const cylinderAdapter = {
  validate(p, path) {
    const out = record(p, path, { cx: num, cz: num, radius: num, y0: num, y1: num });
    if (!(out.radius > 0)) throw new Fail('BAD_RANGE', `${path}/radius`);
    positiveRange(out.y0, out.y1, path);
    return out;
  },
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

function shapeChecker(adapters) {
  return (value, path) => {
    const head = record(value, path, { kind: str, v: literal(1), p: (x) => x });
    if (!Object.hasOwn(adapters, head.kind)) throw new Fail('UNKNOWN_SHAPE', path);
    return { kind: head.kind, v: 1, p: adapters[head.kind].validate(head.p, `${path}/p`) };
  };
}

export function shapeValidator(options = {}) {
  return shapeChecker(options.shapeAdapters ?? DEFAULT_SHAPE_ADAPTERS);
}

// Reference to a support surface of a volume. `adapter` faces are resolved by
// the volume's shape adapter and need a surfaceKey; top and bottom must not.
export function supportRefShape(value, path) {
  const out = record(value, path, {
    volumeId: str, face: (v, p) => oneOf(v, p, ['top', 'bottom', 'adapter']),
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
      featureId: str, type: str, ownerId: str, anchor: vec3,
      shape: nullable(shapeFn), params: (x) => x,
      waterBodyId: nullable(str), surfaceRefs: listOf(surfaceRef),
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

export function validateSpace(value, options = {}) {
  requireObject(value, 'validateSpace');
  const shapeFn = shapeValidator(options);
  const featureFn = featureChecker(shapeFn, options.featureAdapters ?? DEFAULT_FEATURE_ADAPTERS,
    (options.mode ?? 'strict') === 'strict');
  return run(() => {
    const out = record(value, '', {
      formatVersion: version, spaceId: objectId('s'), worldId: objectId('w'),
      ownerKind: (v, p) => oneOf(v, p, ['region', 'landmark']), ownerId: str,
      frame: (v, p) => record(v, p, { origin: vec3 }), bounds,
      levels: listOf((v, p) => record(v, p, { levelId: str, datumY: num })),
      volumes: listOf((v, p) => record(v, p, {
        volumeId: str, kind: (k, pt) => oneOf(k, pt, ['open', 'solid', 'water']),
        levelId: str, shape: shapeFn })),
      portals: listOf((v, p) => record(v, p, {
        portalId: str, fromVolumeId: str, toVolumeId: str })),
      features: listOf(featureFn),
      access: (v, p) => oneOf(v, p, ['traversable', 'visual', 'blocked']),
    });
    objectId(out.ownerKind === 'region' ? 'r' : 'l')(out.ownerId, '/ownerId');
    sameWorld(out.spaceId, out.worldId, '/spaceId');
    sameWorld(out.ownerId, out.worldId, '/ownerId');
    uniqueIds(out.levels, '/levels', (l) => l.levelId);
    uniqueIds(out.volumes, '/volumes', (v) => v.volumeId);
    uniqueIds(out.portals, '/portals', (p) => p.portalId);
    uniqueIds(out.features, '/features', (f) => f.featureId);
    const levels = new Set(out.levels.map((l) => l.levelId));
    const volumes = new Set(out.volumes.map((v) => v.volumeId));
    out.volumes.forEach((v, i) => {
      if (!levels.has(v.levelId)) throw new Fail('BAD_REF', `/volumes/${i}/levelId`);
    });
    out.portals.forEach((p, i) => {
      for (const key of ['fromVolumeId', 'toVolumeId']) {
        if (!volumes.has(p[key])) throw new Fail('BAD_REF', `/portals/${i}/${key}`);
      }
    });
    out.features.forEach((f, i) => f.surfaceRefs.forEach((ref, j) => {
      if (!volumes.has(ref.volumeId)) {
        throw new Fail('BAD_REF', `/features/${i}/surfaceRefs/${j}/volumeId`);
      }
    }));
    return out;
  });
}

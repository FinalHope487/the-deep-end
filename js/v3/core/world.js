// World descriptor: pure JSON that fully describes the structural identity of a
// world, so a Worker can rebuild it from the descriptor alone.
import {
  Fail, run, requireObject, num, int, str, oneOf, listOf, record, version, literal,
  objectId, uniqueIds,
} from './check.js';
import { SEED_MAX } from './constants.js';
import { makeConfigFingerprint, parseWorldObjectId, isFingerprint } from './ids.js';

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

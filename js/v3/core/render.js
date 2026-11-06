// Render descriptor: what to draw for a set of Spaces. Render reads canonical
// data and never edits it.
import {
  run, requireObject, str, nullable, listOf, record, version, objectId, uniqueIds,
  sortedUniqueStrings,
} from './check.js';
import { shapeValidator } from './space.js';

export function validateRender(value) {
  requireObject(value, 'validateRender');
  const shapeFn = shapeValidator();
  return run(() => {
    const out = record(value, '', {
      formatVersion: version, renderId: str, spaceIds: listOf(objectId('s')),
      surfaces: listOf((v, p) => record(v, p, {
        surfaceId: str, spaceId: objectId('s'), outline: shapeFn, materialKey: str })),
      lightHints: listOf((v, p) => record(v, p, {
        hintId: str, sourceFeatureId: nullable(str), kind: str })),
      effectHooks: listOf((v, p) => record(v, p, { hookId: str, kind: str })),
      resourceKeys: sortedUniqueStrings(),
    });
    uniqueIds(out.spaceIds, '/spaceIds');
    uniqueIds(out.surfaces, '/surfaces', (s) => s.surfaceId);
    uniqueIds(out.lightHints, '/lightHints', (h) => h.hintId);
    uniqueIds(out.effectHooks, '/effectHooks', (h) => h.hookId);
    return out;
  });
}

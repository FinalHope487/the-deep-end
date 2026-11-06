// Entry point for the nine v1 data contracts and their strict validators.
// Array ordering rules (canonical JSON vectors are tested):
//   ordered (given order kept): journeyConfig.regionSlotIds, landmarkSlotIds,
//     segments, objectiveIds, shape point lists.
//   sorted by stable id: Snapshot.spaces and traversals (spaceId).
//   sorted unique strings: Save visitedSlotIds / foundKeys, Render resourceKeys.
// Duplicate ids in a set -> DUP_ID.
import {
  run, requireObject, str, int, listOf, record, version, oneOf, vec3, jsonObject,
} from './check.js';

export { validateWorld } from './world.js';
export { validateJourney } from './journey.js';
export { validateSnapshot } from './snapshot.js';
export { validateRender } from './render.js';
export { validateSpace } from './space.js';
export { validateTraversal, validateResolved } from './traversal.js';
export { validateSave } from './save.js';
export { validateWorkerRequest, validateWorkerReply } from './worker.js';

// ModuleDescriptor: pure JSON identity and feature specs of one module slot.
export function validateModuleDescriptor(value) {
  requireObject(value, 'validateModuleDescriptor');
  return run(() => record(value, '', {
    formatVersion: version, moduleId: str, moduleVersion: (v, p) => int(v, p, 1),
    kind: (v, p) => oneOf(v, p, ['region', 'landmark']), slotId: str,
    featureSpecs: listOf((v, p) => record(v, p, {
      type: str, params: jsonObject, anchor: vec3, ownerId: str })),
  }));
}

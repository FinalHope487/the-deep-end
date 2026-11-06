// Entry point for the nine v1 data contracts and their strict validators.
// Array ordering rules (canonical JSON vectors are tested):
//   ordered (given order kept): journeyConfig.regionSlotIds, landmarkSlotIds,
//     segments, objectiveIds, shape point lists.
//   sorted by stable id: Snapshot.spaces and traversals (spaceId).
//   sorted unique strings: Save visitedSlotIds / foundKeys, Render resourceKeys.
// Duplicate ids in a set -> DUP_ID.
export { validateWorld } from './world.js';
export { validateModuleDescriptor } from './module.js';
export { validateJourney } from './journey.js';
export { validateSnapshot } from './snapshot.js';
export { validateRender } from './render.js';
export { validateSpace } from './space.js';
export { validateTraversal, validateResolved } from './traversal.js';
export { validateSave } from './save.js';
export { validateWorkerRequest, validateWorkerReply } from './worker.js';

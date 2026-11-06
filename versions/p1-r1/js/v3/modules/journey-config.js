// Composition file: the default journey. Slot IDs here must match registry-config.js.
// `segments` has one more entry than `regionSlotIds` (start -> region 1 ... region N -> exit).
export const DEFAULT_JOURNEY_CONFIG = Object.freeze({
  regionSlotIds: Object.freeze(['region01', 'region02', 'region03', 'region04']),
  landmarkSlotIds: Object.freeze(['landmark01']),
  exitSlotId: 'exit01',
  segments: Object.freeze([40, 40, 40, 40, 40]),
  objectiveIds: Object.freeze([]),
});

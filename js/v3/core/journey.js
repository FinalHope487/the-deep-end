// Journey: the ordered goal structure of one world (regions, landmarks, exit).
import {
  run, requireObject, str, listOf, record, version, objectId, uniqueIds, sameWorld,
} from './check.js';

export function validateJourney(value) {
  requireObject(value, 'validateJourney');
  return run(() => {
    const out = record(value, '', {
      formatVersion: version, journeyId: str, worldId: objectId('w'),
      regionIds: listOf(objectId('r')), landmarkIds: listOf(objectId('l')),
      exitId: str, objectiveIds: listOf(str),
    });
    uniqueIds(out.regionIds, '/regionIds');
    uniqueIds(out.landmarkIds, '/landmarkIds');
    uniqueIds(out.objectiveIds, '/objectiveIds');
    out.regionIds.forEach((id, i) => sameWorld(id, out.worldId, `/regionIds/${i}`));
    out.landmarkIds.forEach((id, i) => sameWorld(id, out.worldId, `/landmarkIds/${i}`));
    return out;
  });
}

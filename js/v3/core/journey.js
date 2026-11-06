// Journey: the ordered goal structure of one world (regions, landmarks, exit).
import {
  run, requireObject, str, listOf, record, version, objectId, uniqueIds, sameWorld, deepFreeze,
} from './check.js';
import { assertContext } from './world.js';

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

// Linear-spine layout: the start sits at the origin and each journey segment
// advances the spine by its length along +x. Anchors depend only on the
// journey config, never on the seed or on any query, so they stay stable.
// Order: start, regions in slot order, exit.
export function resolveJourneyAnchors(context) {
  assertContext(context, 'resolveJourneyAnchors');
  return run(() => {
    const { regionSlotIds, exitSlotId, segments } = context.descriptor.journeyConfig;
    let x = 0;
    const anchor = (slotId, kind, step) => {
      x += step;
      return { slotId, kind, position: { x, y: 0, z: 0 } };
    };
    const anchors = [anchor('start', 'start', 0)];
    regionSlotIds.forEach((slotId, i) => anchors.push(anchor(slotId, 'region', segments[i])));
    anchors.push(anchor(exitSlotId, 'exit', segments[regionSlotIds.length]));
    return deepFreeze({ anchorsVersion: 1, anchors });
  });
}

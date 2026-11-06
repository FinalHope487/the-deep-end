// P1 stub landmark: a placeholder that proves landmarks use the same Space contract.
// It owns one 8 m box room in every cell, offset from the region stub. Generation
// modules import core only, so this file carries its own small generator.
import { makeWorldObjectId, parseWorldObjectId, encodeCoordinate } from '../../core/ids.js';

const STUB_LANDMARK_ROOM = 8;
const STUB_LANDMARK_HEIGHT = 5;

export function stubLandmark(slotId) {
  return {
    descriptor: {
      formatVersion: 1, moduleId: `stub.${slotId}`, moduleVersion: 1, kind: 'landmark', slotId, featureSpecs: [],
    },
    generate(ctx) {
      const { configFingerprint } = parseWorldObjectId(ctx.worldId).value;
      const size = ctx.config.structuralConfig.cellSize;
      const x = ctx.cell.ix * size + 20;
      const z = ctx.cell.iz * size + 3;
      const key = `${slotId}.${encodeCoordinate(ctx.cell.ix)}.${encodeCoordinate(ctx.cell.iz)}`;
      const spaceId = makeWorldObjectId('s', ctx.seed, configFingerprint, key);
      const space = {
        formatVersion: 1, spaceId, worldId: ctx.worldId, ownerKind: 'landmark',
        ownerId: makeWorldObjectId('l', ctx.seed, configFingerprint, slotId),
        frame: { origin: { x, y: 0, z } },
        bounds: {
          min: { x, y: 0, z }, max: { x: x + STUB_LANDMARK_ROOM, y: STUB_LANDMARK_HEIGHT, z: z + STUB_LANDMARK_ROOM } },
        levels: [{ levelId: 'ground', datumY: 0 }],
        volumes: [{
          volumeId: 'air', kind: 'open', levelId: 'ground',
          shape: { kind: 'box', v: 1, p: {
            min: { x: 0, y: 0, z: 0 }, max: { x: STUB_LANDMARK_ROOM, y: STUB_LANDMARK_HEIGHT, z: STUB_LANDMARK_ROOM } } },
        }],
        portals: [], features: [], access: 'traversable',
      };
      return {
        spaces: [space],
        traversals: [{ formatVersion: 1, spaceId, nodes: [], surfaces: [], links: [], blockedVolumeIds: [] }],
      };
    },
  };
}

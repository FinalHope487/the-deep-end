// P1 stub region: a placeholder that proves the registry and query path.
// It owns one 8 m box room in every cell. Generation modules import core only,
// so the stub carries its own small generator instead of sharing one with the landmark stub.
import { makeWorldObjectId, parseWorldObjectId, encodeCoordinate } from '../../core/ids.js';

const STUB_REGION_ROOM = 8;
const STUB_REGION_HEIGHT = 5;

export function stubRegion(slotId) {
  return {
    descriptor: {
      formatVersion: 1, moduleId: `stub.${slotId}`, moduleVersion: 1, kind: 'region', slotId, featureSpecs: [],
    },
    generate(ctx) {
      const { configFingerprint } = parseWorldObjectId(ctx.worldId).value;
      const size = ctx.config.structuralConfig.cellSize;
      const x = ctx.cell.ix * size + 4;
      const z = ctx.cell.iz * size + 3;
      const key = `${slotId}.${encodeCoordinate(ctx.cell.ix)}.${encodeCoordinate(ctx.cell.iz)}`;
      const spaceId = makeWorldObjectId('s', ctx.seed, configFingerprint, key);
      const space = {
        formatVersion: 1, spaceId, worldId: ctx.worldId, ownerKind: 'region',
        ownerId: makeWorldObjectId('r', ctx.seed, configFingerprint, slotId),
        frame: { origin: { x, y: 0, z } },
        bounds: {
          min: { x, y: 0, z }, max: { x: x + STUB_REGION_ROOM, y: STUB_REGION_HEIGHT, z: z + STUB_REGION_ROOM } },
        levels: [{ levelId: 'ground', datumY: 0 }],
        volumes: [{
          volumeId: 'air', kind: 'open', levelId: 'ground',
          shape: { kind: 'box', v: 1, p: {
            min: { x: 0, y: 0, z: 0 }, max: { x: STUB_REGION_ROOM, y: STUB_REGION_HEIGHT, z: STUB_REGION_ROOM } } },
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

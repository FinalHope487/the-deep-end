// Level jump: the menu list and where each entry drops the player. Add a row to JUMP_TARGETS to add an entry.
import { FLOOR } from './tiles.js';
import { ZONE_NAMES } from './world.js';

// nearest dry ground-floor tile centre to (px, pz) that is at least minD from (cx, cz) and that canStand accepts
function spotNear(world, px, pz, cx, cz, minD, canStand, maxR = 14) {
  const tx0 = Math.floor(px), tz0 = Math.floor(pz);
  for (let rr = 0; rr <= maxR; rr++) {
    for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== rr) continue;
      const x = tx0 + dx, z = tz0 + dz;
      if (world.typeAt(x, z) !== FLOOR || Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < minD) continue;
      const h = world.hAt(x, z);
      if (canStand(x + 0.5, z + 0.5, h)) return { x: x + 0.5, z: z + 0.5, h, yaw: Math.atan2(-(cx - x - 0.5), -(cz - z - 0.5)) };
    }
  }
  return null;
}

export const JUMP_TARGETS = [
  ...ZONE_NAMES.map((name, i) => ({
    id: `zone${i + 1}`,
    label: `區域 ${i + 1}・${name}`,
    // a walkway corner inside the zone, looking at its middle
    spot: (w, canStand) => { const z = w.zones[i]; return spotNear(w, z.x - 12.5, z.z - 12.5, z.x, z.z, 0, canStand); },
  })),
  {
    id: 'exit',
    label: '出口',
    spot: (w, canStand) => spotNear(w, w.exit.x, w.exit.z, w.exit.x, w.exit.z, 3, canStand),
  },
];

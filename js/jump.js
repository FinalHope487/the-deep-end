// Level jump: the menu list and where each entry drops the player. Add a row to JUMP_TARGETS to add an entry.
import { FLOOR } from './tiles.js';
import { ZONE_NAMES } from './world.js';
import { MEGA_SEGS } from './levelmap.js';

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

// the nearest mega room to the start, entered by a ground doorway and facing its middle
function megaSpot(w, canStand) {
  for (const m of w.megasNear(8, 8, 14)) {
    const ports = w.lm.megaPorts(m);
    for (let s = 0; s < 8; s++) {
      if (ports[s] !== 0) continue;
      const g = MEGA_SEGS[s], X = m.cx0 * 16, Z = m.cz0 * 16, k = s & 1;
      // the tile just inside the doorway, in the middle of the room's 32-long side
      const [x, z] = g.d === 1 ? [X + 1.5, Z + 7.5 + 16 * k] : g.d === 3 ? [X + 7.5 + 16 * k, Z + 1.5] : g.d === 0 ? [X + 31.5, Z + 7.5 + 16 * k] : [X + 7.5 + 16 * k, Z + 31.5];
      const spot = spotNear(w, x, z, X + 16, Z + 16, 0, canStand, 3);
      if (spot) return spot;
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
  { id: 'mega', label: '巨大房間', spot: megaSpot },
];

// Inner layer, batch 5 M3 / M4: lamps keep clear of window and skylight light; only small lamps are round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, LAMP_CLEAR } from '../../js/world.js';
import { loadMesher } from './mesh-helper.mjs';

test('M3 no ceiling lamp stands within 2 m of a skylight or window light patch', () => {
  let near = 0, checked = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (let cz = -20; cz <= 20; cz++) for (let cx = -20; cx <= 20; cx++) {
      const L = w.layout(cx, cz);
      for (const s of L.suns) for (const l of L.lamps) {
        if (l.k !== 0) continue;
        checked++;
        const f = l.full || l;   // a lamp across a chunk edge counts whole
        const lx = L.ox + f.x + f.w / 2, lz = L.oz + f.z + f.d / 2;
        const gap = Math.hypot(Math.max(0, Math.abs(lx - s.x) - (f.w + s.w) / 2), Math.max(0, Math.abs(lz - s.z) - (f.d + s.d) / 2));
        if (gap < LAMP_CLEAR - 1e-6) near++;
      }
    }
  }
  assert.ok(checked > 500, `${checked} lamp / patch pairs`);
  assert.equal(near, 0, `${near} lamps too close to a patch of light`);
});

test('M4 a lamp with a side over 2 m is square (round only in mega rooms); only small lamps change shape with the chunk draw', async () => {
  const { buildChunkGeometry } = await loadMesher();
  const quads = (w, L) => buildChunkGeometry(w, L, { ceil: 4.5, T: 0, guide: null }).lamps.attributes.position.array.length / 12;
  let rooms = 0, withBig = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (let cz = -16; cz <= 16; cz++) for (let cx = -16; cx <= 16; cx++) {
      if (w.isRegion(cx, cz)) continue;   // region lamps take their region's shape (R7)
      const L = w.layout(cx, cz);
      if (L.kind === 'mega' || L.kind === 'zone' || L.up || !L.lamps.length) continue;
      // a disc is 6 quads where a square is 1: switching the chunk's shape adds 5 per small lamp whose centre lies in the chunk
      const small = L.lamps.filter((l) => { const f = l.full || l; return Math.max(f.w, f.d) <= 2 && f.x + f.w / 2 >= 0 && f.z + f.d / 2 >= 0 && f.x + f.w / 2 < 16 && f.z + f.d / 2 < 16; }).length;
      const diff = quads(w, { ...L, lampShape: 'round' }) - quads(w, { ...L, lampShape: 'square' });
      assert.equal(diff, 5 * small, `chunk ${cx},${cz}: ${diff} extra quads for ${small} small lamps`);
      rooms++;
      if (L.lamps.some((l) => Math.max((l.full || l).w, (l.full || l).d) > 2)) withBig++;
    }
  }
  assert.ok(rooms > 100 && withBig >= 8, `${rooms} rooms, ${withBig} with a big lamp`);
});

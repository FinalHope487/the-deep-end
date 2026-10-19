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

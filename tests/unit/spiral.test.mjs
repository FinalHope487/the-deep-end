// Inner layer, batch 5 M6: under a spiral's treads higher than 2.2 m you can walk; lower treads and the middle column still block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { SPIRAL_CLEAR } from '../../js/levels.js';
import { Player } from '../../js/player.js';
import { SPIRAL } from '../../js/tiles.js';
import { loadMesher, quadsOf } from './mesh-helper.mjs';

function spirals(seeds = [1, 2, 3]) {
  const out = [];
  for (const seed of seeds) {
    const w = new World(seed);
    for (let cz = -14; cz <= 0; cz++) for (let cx = -14; cx <= 14; cx++) {
      const L = w.layout(cx, cz);
      for (const s of L.spirals) if (s.own && !out.some((o) => o.w === w && o.s.x === s.x && o.s.z === s.z)) out.push({ w, L, s });
    }
  }
  return out;
}
const tread = (s, a, r) => s.h0 + (s.h1 - s.h0) * (a / s.sweep);

test('M6 under a tread higher than 2.2 m the floor can be stood on; under a lower tread and at the column it cannot', () => {
  const found = spirals();
  assert.ok(found.length >= 4, `${found.length} spirals`);
  let high = 0, low = 0, column = 0;
  for (const { w, s } of found) {
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * s.sweep, ang = s.a0 + s.sense * a;
      const x = s.x + Math.cos(ang) * 1.2, z = s.z + Math.sin(ang) * 1.2, h = tread(s, a);
      if (w.typeAt(Math.floor(x), Math.floor(z)) !== SPIRAL) continue;   // the odd tread under a barred room is not a walkway
      const ground = w.surfaceAt(x, z, s.h0);
      if (h - s.h0 >= SPIRAL_CLEAR + 0.02) { high++; assert.ok(ground && Math.abs(ground.h - s.h0) < 1e-6, `floor under the tread at ${(h).toFixed(2)} m`); }
      else if (h - s.h0 <= SPIRAL_CLEAR - 0.02) { low++; if (h - s.h0 > 0.46) assert.equal(ground, null, `a tread at ${h.toFixed(2)} m blocks a body on the floor`); }
    }
    const cx = s.x + Math.cos(s.a0 + s.sense * s.sweep / 2) * 0.15, cz = s.z + Math.sin(s.a0 + s.sense * s.sweep / 2) * 0.15;   // inside the column, on the tread side
    assert.equal(w.surfaceAt(cx, cz, s.h0), null, 'the column blocks at ground level');
    assert.equal(w.surfaceAt(cx, cz, s.h1), null, 'and at the top');
    column++;
  }
  assert.ok(high > 100 && low > 100 && column >= 4);
});

test('M6 the treads still carry the walker up: on a high tread the surface at the body\'s height is the tread', () => {
  for (const { w, s } of spirals().slice(0, 6)) {
    const a = s.sweep * 0.8, ang = s.a0 + s.sense * a, x = s.x + Math.cos(ang) * 1.2, z = s.z + Math.sin(ang) * 1.2, h = tread(s, a);
    const up = w.surfaceAt(x, z, h);
    assert.ok(up && Math.abs(up.h - h) < 0.05 && up.up === true, `tread at ${h.toFixed(2)} m`);
    const p = new Player();
    assert.ok(p.canStand(w, x, z, h), 'a body on the tread stands');
    assert.ok(p.canStand(w, x, z, s.h0), 'a body on the floor beneath stands');
  }
});

test('M6 the floor under the high treads is drawn', async () => {
  const { buildChunkGeometry } = await loadMesher();
  const { w, L, s } = spirals()[0];
  const g = buildChunkGeometry(w, L, { ceil: 7.7, T: 0, guide: null });
  const a = s.sweep * 0.85, ang = s.a0 + s.sense * a, x = s.x + Math.cos(ang) * 1.2, z = s.z + Math.sin(ang) * 1.2;
  const floor = quadsOf(g.static).some((q) => q.every((v) => Math.abs(v[1] - s.h0) < 1e-4) && x >= Math.min(...q.map((v) => v[0])) && x <= Math.max(...q.map((v) => v[0])) && z >= Math.min(...q.map((v) => v[2])) && z <= Math.max(...q.map((v) => v[2])));
  assert.ok(floor, 'floor quad under the tread');
});

// Inner layer, batch 4 L7: water levels — lowered deep pools, the abyss 2.5 m under its walkway.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { DEEP, SHALLOW, RAMP, VOID, FORM_LOW, DEEP_WATER, LOW_DROP, ABYSS_WATER, groundWater } from '../../js/tiles.js';

const chunks = function* (w, R) { for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) yield w.layout(cx, cz); };

test('L7 neighbouring water tiles always share one surface', () => {
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (const L of chunks(w, 16)) {
      for (let z = 0; z < 16; z++) for (let x = 0; x < 15; x++) for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const x2 = x + dx, z2 = z + dz;
        if (x2 > 15 || z2 > 15) continue;
        const a = groundWater(L, z * 16 + x), b = groundWater(L, z2 * 16 + x2);
        if (a === a && b === b) assert.ok(Math.abs(a - b) < 1e-4, `chunk ${L.cx},${L.cz} ${x},${z}: ${a} vs ${b}`);
      }
    }
  }
});

test('L7 the water of a mega abyss pool is 2.5 m under its walkway', () => {
  let n = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const w = new World(seed);
    for (const m of w.megasNear(0, 0, 14)) {
      if (m.type !== 'abyss' || !m.water) continue;
      const L = w.layout(m.cx0 + 1, m.cz0 + 1);
      const i = [...L.tiles].findIndex((t, k) => t === VOID && L.wet[k]);
      assert.ok(i >= 0);
      assert.equal(groundWater(L, i), ABYSS_WATER);
      assert.equal(ABYSS_WATER, -2.5);
      n++;
    }
  }
  assert.ok(n >= 3, `${n} wet abysses`);
});

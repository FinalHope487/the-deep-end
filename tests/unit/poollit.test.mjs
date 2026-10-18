// Inner layer, batch 4 L9: rooms lit only by their pool lamps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { DEEP, FLOOR, WALL, DIRS } from '../../js/tiles.js';
import { loadMesher, quadsOf } from './mesh-helper.mjs';

const rooms = function* (w, R) {
  for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
    const L = w.layout(cx, cz);
    if (L.kind === 'zone' || L.kind === 'mega' || L.kind === 'start' || L.kind === 'exit' || L.tiles.filter((t) => t === DEEP).length < 4) continue;
    // a pool qualifies only with a floor or wall tile against it, where a lamp can be set in
    let spot = false;
    for (let i = 0; i < 256 && !spot; i++) if (L.tiles[i] === DEEP) for (const [dx, dz] of DIRS) {
      const a = (i % 16) + dx, b = ((i / 16) | 0) + dz;
      if (a >= 0 && b >= 0 && a < 16 && b < 16 && (L.tiles[b * 16 + a] === FLOOR || L.tiles[b * 16 + a] === WALL)) spot = true;
    }
    if (spot) yield L;
  }
};

test('L9 about 15% of the rooms with a deep pool have no ceiling lamps and no skylight', () => {
  let n = 0, lit = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const w = new World(seed);
    for (const L of rooms(w, 24)) {
      n++;
      if (L.poolLit) { lit++; assert.equal(L.lamps.length + L.upLamps.length, 0); assert.ok(!L.suns.some((s) => s.sky)); }
      else assert.ok(L.lamps.length > 0, `chunk ${L.cx},${L.cz} has lamps`);
    }
  }
  assert.ok(n > 60, `${n} rooms with a pool`);
  assert.ok(lit / n > 0.08 && lit / n < 0.25, `${lit}/${n} pool-lit`);
});

test('L9 a pool-lit room is lit by its pool lamps (small pools too), has a dark ceiling and whitish water', async () => {
  const { buildChunkGeometry } = await loadMesher();
  let checked = 0;
  const w = new World(3);
  let plain = null;
  for (const L of rooms(w, 24)) if (!L.poolLit && !plain && L.kind === 'pool') plain = L;
  const ceilBrightness = (g, ceil) => {
    const pos = g.static.attributes.position.array, col = g.static.attributes.color.array;
    let s = 0, n = 0;
    for (let q = 0; q < pos.length / 12; q++) {   // quads lying flat at the ceiling height
      if (![0, 1, 2, 3].every((k) => Math.abs(pos[q * 12 + k * 3 + 1] - ceil) < 1e-4) || Math.abs(pos[q * 12 + 6] - pos[q * 12]) < 3.9 || Math.abs(pos[q * 12 + 8] - pos[q * 12 + 2]) < 3.9) continue;   // the 4 × 4 m ceiling cells
      for (let k = 0; k < 4; k++) { const i = q * 4 + k; s += col[i * 3] + col[i * 3 + 1] + col[i * 3 + 2]; n++; }
    }
    return s / n;
  };
  const base = ceilBrightness(buildChunkGeometry(w, plain, { ceil: 4.5, T: 0, guide: null }), 4.5);
  for (const seed of [1, 2, 3, 4, 5]) {
    const ww = new World(seed);
    for (const L of rooms(ww, 24)) {
      if (!L.poolLit || L.up) continue;
      const g = buildChunkGeometry(ww, L, { ceil: 4.5, T: 0, guide: null });
      assert.ok(g.poolLamps.length >= 1 && g.poolLamps.length <= 6, `chunk ${L.cx},${L.cz}: ${g.poolLamps.length} pool lamps`);
      if (ceilBrightness(g, 4.5) === ceilBrightness(g, 4.5)) assert.ok(ceilBrightness(g, 4.5) < base * 0.5, `the ceiling is dark: ${ceilBrightness(g, 4.5)} vs ${base} chunk ${L.cx},${L.cz} ${L.kind}`);
      const wc = g.water.attributes.color.array;
      let white = 0, cells = 0;
      for (let i = 0; i < wc.length; i += 4) if (wc[i + 3] >= 0.85) { cells++; if (wc[i] > 0.6) white++; }
      assert.ok(cells === 0 || white / cells > 0.5, 'the water is whitish');
      assert.equal(quadsOf(g.lamps).filter((q) => q.every((v) => Math.abs(v[1] - 4.48) < 0.01)).length, 0, 'no ceiling panels');
      checked++;
    }
  }
  assert.ok(checked >= 6, `${checked} pool-lit rooms checked`);
});

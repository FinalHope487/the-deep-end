// Inner layer, batch 4 L11: sparse signs and graffiti whose density follows the tension, with the new content and no wrong-way signs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { SIGN, SIGN_SHARE0, signGate, cellRect, isGraphic, ATLAS_W, ATLAS_H } from '../../js/levels.js';
import { loadMesher } from './mesh-helper.mjs';

const ORDINARY = new Set(['hall', 'corridor', 'pool', 'colonnade', 'stairs', 'rise', 'flood', 'sunk', 'pipes', 'reservoir']);
function* rooms(seeds = [1, 2, 3, 4], R = 24) {
  for (const seed of seeds) {
    const w = new World(seed);
    for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) { const L = w.layout(cx, cz); if (ORDINARY.has(L.kind) && L.lv >= 0 && !L.stair) yield L; }
  }
}
const NEW_CELLS = [SIGN.F_B7, SIGN.F_13, SIGN.F_FRAC, SIGN.R_ANSWER, SIGN.R_NAME, SIGN.R_EMPTY, SIGN.R_GUARD, SIGN.R_CLOSED,
  SIGN.CHALK_REPEAT, SIGN.CHALK_CROSS, SIGN.CHALK_COUNT, SIGN.CHALK_UNDER, SIGN.G_KIDHANDS, SIGN.G_FIGURE, SIGN.G_CROWD, SIGN.G_POOLSCRAWL];

test('L11 a room has one sign at most; about one room in 3-4 shows one at tension 0, nearly every room at tension 1', () => {
  const all = [...rooms()];
  for (const L of all) assert.ok(L.signs.length <= 1, `${L.signs.length} signs`);
  const at = (T) => all.filter((L) => L.signs.some((s) => s.minT <= T)).length / all.length;
  const d0 = at(0), d5 = at(0.5), d1 = at(1);
  assert.ok(d0 > 0.25 && d0 < 0.34, `T=0: ${d0}`);
  assert.ok(d1 > 0.7 && d1 <= 1, `T=1: ${d1}`);   // the rooms with no wall to hang one on stay bare
  assert.ok(d0 < d5 && d5 < d1, `${d0} ${d5} ${d1}`);
  assert.equal(signGate(0), 0); assert.equal(signGate(SIGN_SHARE0), 0); assert.ok(Math.abs(signGate(1) - 1) < 1e-9);
});

test('L11 the new content shows up, each kind from its own tension on, and none of it points anywhere', () => {
  const seen = new Map();
  for (const L of rooms([1, 2, 3, 4, 5, 6], 30)) for (const s of L.signs) {
    seen.set(s.cell, Math.min(seen.get(s.cell) ?? 1, s.minT));
    assert.ok(![SIGN.TO_HALL, SIGN.TO_TERRACE, SIGN.TO_PIPES, SIGN.TO_DEEP, SIGN.TO_EXIT, SIGN.ARROW].includes(s.cell), 'no direction signs in rooms');
  }
  for (const cell of NEW_CELLS) assert.ok(seen.has(cell), `cell ${cell} never placed`);
  // the odd ones wait for tension, the plain floor plaques and the kids' prints do not wait long
  assert.ok(seen.get(SIGN.R_ANSWER) >= 0.45 && seen.get(SIGN.G_CROWD) >= 0.7 && seen.get(SIGN.CHALK_CROSS) >= 0.55);
  assert.ok(seen.get(SIGN.G_KIDHANDS) <= 0.5 && seen.get(SIGN.F_B7) <= 0.6);
});

test('L11 the sign atlas holds every cell once, inside its 512 x 1024 bounds, plates 2:1 and pictures square', async () => {
  const { cellUV } = await loadMesher();
  const cells = [...Array(24).keys(), ...Array.from({ length: 12 }, (_, k) => 24 + k), 40, 41, 42, 43];
  const rects = cells.map((c) => ({ c, r: cellRect(c) }));
  for (const { c, r: [x, y, w, h] } of rects) {
    assert.ok(x >= 0 && y >= 0 && x + w <= ATLAS_W && y + h <= ATLAS_H, `cell ${c} inside`);
    assert.equal(isGraphic(c), w === h, `cell ${c} graphic iff square`);
    const [u0, v0, u1, v1] = cellUV(c);
    assert.ok(u0 >= 0 && u1 <= 1 && v0 >= 0 && v1 <= 1 && u1 > u0 && v1 > v0);
  }
  for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
    const [x0, y0, w0, h0] = rects[a].r, [x1, y1, w1, h1] = rects[b].r;
    assert.ok(x0 + w0 <= x1 || x1 + w1 <= x0 || y0 + h0 <= y1 || y1 + h1 <= y0, `cells ${rects[a].c} and ${rects[b].c} overlap`);
  }
});

// Inner layer, batch 4 L3: round shapes — columns, arched doorways, arched windows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { FORM_CYL, WALL, FLOOR } from '../../js/tiles.js';
import { doorwayAxis, archSpring, ARCH_R } from '../../js/shapes.js';
import { loadMesher, quadsOf } from './mesh-helper.mjs';

const chunks = function* (w, R = 12) { for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) yield w.layout(cx, cz); };

test('L3 colonnade pillars are 12-sided columns that still fill their whole tile for collision', async () => {
  const { buildChunkGeometry } = await loadMesher();
  let seen = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (const L of chunks(w)) {
      if (L.kind !== 'colonnade') continue;
      const cols = [];
      for (let i = 0; i < 256; i++) if (L.form[i] & FORM_CYL) { assert.equal(L.tiles[i], WALL); cols.push(i); }
      assert.ok(cols.length >= 8 && cols.length <= 16, `${cols.length} columns`);
      const g = buildChunkGeometry(w, L, { ceil: 6, T: 0, guide: null });
      const [i] = cols, cx = L.ox + (i % 16) + 0.5, cz = L.oz + ((i / 16) | 0) + 0.5;
      const near = quadsOf(g.static).filter((q) => q.every((v) => Math.hypot(v[0] - cx, v[2] - cz) < 0.55));
      const vertical = near.filter((q) => q.some((v) => Math.abs(v[1] - q[0][1]) > 0.5));
      assert.equal(vertical.length, 12, 'a column is twelve faces');
      assert.ok(vertical.some((q) => Math.abs(q[0][0] - q[1][0]) > 0.05 && Math.abs(q[0][2] - q[1][2]) > 0.05), 'some faces are slanted');
      seen++;
    }
  }
  assert.ok(seen >= 3, `${seen} colonnades`);
});

test('L3 a small doorway needs walls on both sides, open ends, is never at a chunk edge or between columns', () => {
  let found = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (const L of chunks(w)) {
      const cellAt = (x, z) => (x >= 0 && z >= 0 && x < 16 && z < 16 ? [L, z * 16 + x] : w.cellOf(L.ox + x, L.oz + z));
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const a = doorwayAxis(L, cellAt, x, z);
        if (a < 0) continue;
        found++;
        assert.ok(x >= 1 && x <= 14 && z >= 1 && z <= 14, 'chunk-edge doors stay square');
        const wall = (dx, dz) => { const [M, j] = cellAt(x + dx, z + dz); return M.tiles[j] === WALL; };
        if (a === 0) assert.ok(wall(0, -1) && wall(0, 1) && !wall(-1, 0) && !wall(1, 0));
        else assert.ok(wall(-1, 0) && wall(1, 0) && !wall(0, -1) && !wall(0, 1));
        assert.equal(L.tiles[z * 16 + x] === FLOOR || L.tiles[z * 16 + x] === 2, true);
        if (L.kind === 'colonnade') assert.fail('the gaps between columns are not doorways');
      }
    }
  }
  assert.ok(found > 200, `${found} doorways`);
});

test('L3 a doorway is closed by a half-round arch: facets rise from the spring line to 0.5 m above it', async () => {
  const { buildChunkGeometry } = await loadMesher();
  assert.equal(archSpring(4.5), 2);
  assert.ok(Math.abs(archSpring(2.3) - 1.8) < 1e-9);
  assert.equal(archSpring(2.0), -1);
  let checked = 0;
  const w = new World(1);
  for (const L of chunks(w, 8)) {
    if (L.up || L.kind === 'narrow') continue;
    const cellAt = (x, z) => (x >= 0 && z >= 0 && x < 16 && z < 16 ? [L, z * 16 + x] : w.cellOf(L.ox + x, L.oz + z));
    let door = null;
    for (let z = 1; z < 15 && !door; z++) for (let x = 1; x < 15 && !door; x++) if (!L.low[z * 16 + x] && doorwayAxis(L, cellAt, x, z) >= 0) door = { x, z, h: L.h[z * 16 + x] };
    if (!door) continue;
    const g = buildChunkGeometry(w, L, { ceil: L.ceilFixed || 4.5, T: 0, guide: null });
    const cx = L.ox + door.x + 0.5, cz = L.oz + door.z + 0.5, apex = door.h + 2 + ARCH_R;
    const pts = quadsOf(g.static).flat().filter((v) => Math.abs(v[0] - cx) < 0.51 && Math.abs(v[2] - cz) < 0.51);
    assert.ok(pts.some((v) => Math.abs(v[1] - apex) < 1e-3 && Math.abs(v[0] - cx) < 1e-3 || Math.abs(v[1] - apex) < 1e-3 && Math.abs(v[2] - cz) < 1e-3), `chunk ${L.cx},${L.cz}: no apex at ${apex}`);
    checked++;
  }
  assert.ok(checked >= 5, `${checked} chunks checked`);
});

// ---------- rounded deep-pool corners ----------

import { DEEP, SHALLOW } from '../../js/tiles.js';
import { inFillet, cornerDir, roundPoolCorners } from '../../js/shapes.js';
import { walkTop } from '../../js/levels.js';

test('L3 about 40% of rooms with a deep pool round all its corners; shallow pools are never rounded', () => {
  let withDeep = 0, rounded = 0;
  for (const seed of [1, 2, 3, 4]) {
    const w = new World(seed);
    for (const L of chunks(w, 20)) {
      if (L.kind === 'zone' || L.kind === 'mega' || L.kind === 'stairwell') continue;
      let deep = 0, corners = 0;
      for (let i = 0; i < 256; i++) {
        if (L.tiles[i] === DEEP) deep++;
        if (L.corner[i]) { corners++; assert.equal(L.tiles[i], DEEP, 'only deep tiles carry a corner'); }
      }
      if (deep >= 4 && L.kind === 'pool') { withDeep++; if (corners) rounded++; }
    }
  }
  assert.ok(withDeep > 40, `${withDeep} pool rooms`);
  const share = rounded / withDeep;
  assert.ok(share > 0.25 && share < 0.55, `${(share * 100).toFixed(0)}% rounded`);
});

test('L3 the cut-off corner of a deep pool is floor to walk on, the quarter disc stays water, the rest of the tile is unchanged', () => {
  let n = 0;
  for (const seed of [1, 2, 3, 4]) {
    const w = new World(seed);
    for (const L of chunks(w, 20)) {
      for (let i = 0; i < 256; i++) {
        const c = L.corner[i];
        if (!c) continue;
        n++;
        const x = i % 16, z = (i / 16) | 0, [sx, sz] = cornerDir(c);
        const at = (fx, fz) => walkTop(L, i, L.ox + x + fx, L.oz + z + fz);
        const outer = [sx > 0 ? 0.95 : 0.05, sz > 0 ? 0.95 : 0.05], inner = [sx > 0 ? 0.05 : 0.95, sz > 0 ? 0.05 : 0.95];
        assert.ok(inFillet(c, ...outer) && !inFillet(c, ...inner));
        assert.equal(at(...outer), L.rim[i], 'the corner is floor at the rim height');
        assert.equal(at(...inner), null, 'the pool side is not walkable');
        assert.equal(at(0.5, 0.5), null, 'the middle of the tile is still water');
        const [dx, dz] = [sx > 0 ? 1 : -1, sz > 0 ? 1 : -1];
        const nb = (a, b) => L.tiles[(z + b) * 16 + x + a];
        if (x + dx >= 0 && x + dx < 16 && z + dz >= 0 && z + dz < 16) assert.ok(nb(dx, 0) !== DEEP && nb(0, dz) !== DEEP && nb(dx, dz) !== DEEP, 'a convex corner');
      }
    }
  }
  assert.ok(n > 40, `${n} corners`);
  // a 4×4 pool in a plain grid: four corners, none on a 1-wide pool
  const g = { n: 8, tiles: new Uint8Array(64), h: new Float32Array(64), corner: new Uint8Array(64), rim: new Float32Array(64), form: new Uint8Array(64) };
  for (let z = 2; z < 6; z++) for (let x = 2; x < 6; x++) { g.tiles[z * 8 + x] = DEEP; g.h[z * 8 + x] = -2.4; }
  assert.equal(roundPoolCorners(g), 4);
  g.corner.fill(0);
  g.tiles.fill(0); for (let x = 1; x < 7; x++) { g.tiles[3 * 8 + x] = DEEP; }
  assert.equal(roundPoolCorners(g), 0, 'a channel one tile wide has no corners to round');
});

test('L3 a rounded corner is drawn: an arc wall of radius 1 round the tile\'s inner corner', async () => {
  const { buildChunkGeometry } = await loadMesher();
  let checked = 0;
  for (const seed of [1, 2]) {
    const w = new World(seed);
    for (const L of chunks(w, 14)) {
      const i = [...L.corner].findIndex((c) => c);
      if (i < 0 || L.up) continue;
      const c = L.corner[i], [sx, sz] = cornerDir(c), x = i % 16, z = (i / 16) | 0;
      const cx = L.ox + x + (sx > 0 ? 0 : 1), cz = L.oz + z + (sz > 0 ? 0 : 1);
      const g = buildChunkGeometry(w, L, { ceil: 4.5, T: 0, guide: null });
      const on = quadsOf(g.static).flat().filter((v) => Math.abs(Math.hypot(v[0] - cx, v[2] - cz) - 1) < 1e-3 && v[1] <= L.rim[i] + 1e-6 && v[1] >= L.h[i] - 1e-6);
      const angles = new Set(on.map((v) => Math.round(Math.atan2(v[2] - cz, v[0] - cx) * 100)));
      assert.ok(angles.size >= 7, `chunk ${L.cx},${L.cz}: ${angles.size} points on the arc`);
      checked++;
    }
  }
  assert.ok(checked >= 4, `${checked} chunks`);
});

// ---------- ripples on walls and columns stop 0.5 m above the water ----------

import { readFileSync } from 'node:fs';
import { DEEP_WATER } from '../../js/tiles.js';

test('wet depth runs on up a tall face as a signed height above the water, so ripples die 0.5 m over the surface', async () => {
  const { buildChunkGeometry } = await loadMesher();
  const w = new World(1);
  let faces = 0;
  for (const L of chunks(w, 14)) {
    if (L.kind !== 'colonnade' || !L.tiles.some((t) => t === SHALLOW) || L.baseY !== 0) continue;
    const g = buildChunkGeometry(w, L, { ceil: 6, T: 0, guide: null });
    const pos = g.static.attributes.position.array, dep = g.static.attributes.wetDepth.array;
    for (let q = 0; q < dep.length; q += 4) {
      if (dep[q] <= -90) continue;                      // a dry surface
      const lvl = dep[q] + pos[q * 3 + 1];             // the water level of this face
      assert.ok(lvl > -3 && lvl < 0.5, `water level ${lvl}`);
      for (let k = q; k < q + 4; k++) {
        assert.ok(Math.abs(dep[k] + pos[k * 3 + 1] - lvl) < 1e-3, 'one level for the whole face: depth = level - height');
        if (pos[k * 3 + 1] > lvl + 0.5) { faces++; assert.ok(dep[k] < -0.5, 'over 0.5 m above the water the depth is below -0.5, where the shader paints nothing'); }
      }
    }
  }
  assert.ok(faces > 50, `${faces} high vertices`);
  const src = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
  assert.ok(src.includes('0.5 * (1.0 - smoothstep(0.0, 0.5, -vWetD))'), 'above the water the strength is half and gone by 0.5 m');
  assert.ok(src.includes('mix(0.5, 1.0, smoothstep(0.0, 0.2, vWetD))'), 'under the water it starts at half and builds up');
});

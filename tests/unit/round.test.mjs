// Inner layer, batch 4 L3: round shapes — columns, arched doorways, arched windows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { FORM_CYL, WALL, FLOOR } from '../../js/tiles.js';
import { doorwayAxis, archSpring, ARCH_R } from '../../js/shapes.js';
import { loadMesher, quadsOf } from './mesh-helper.mjs';
import { inFillet, cornerDir, roundPoolCorners } from '../../js/shapes.js';
import { walkTop } from '../../js/levels.js';
import { DEEP, SHALLOW } from '../../js/tiles.js';

const chunks = function* (w, R = 12) { for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) yield w.layout(cx, cz); };
// the chunks of the landmark zones, the only rooms with deep pools whose corners get rounded since region floor (batch 6)
const zoneChunks = function* (w) { for (const z of w.zones) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) yield w.layout(z.cx0 + dx, z.cz0 + dz); };

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
      }
    }
  }
  assert.ok(found > 200, `${found} doorways`);
});

test('L3 the cut-off corner of a deep pool is floor to walk on, the quarter disc stays water, the rest of the tile is unchanged', () => {
  let n = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const w = new World(seed);
    for (const L of zoneChunks(w)) {
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

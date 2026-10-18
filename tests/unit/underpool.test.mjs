// Inner layer, batch 5 M2: from the floor below, no 2F pool (water, pool floor) can be seen through its ceiling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { SHALLOW, FLOOR } from '../../js/tiles.js';
import { loadMesher, quadsOf } from './mesh-helper.mjs';

// does the segment a→b cross any quad (two triangles, either side)?
function crosses(quads, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const tri = (p, q, r) => {
    const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(det) < 1e-9) return false;
    const s = [a[0] - p[0], a[1] - p[1], a[2] - p[2]], u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det;
    if (u < 0 || u > 1) return false;
    const qv = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
    if (v < 0 || u + v > 1) return false;
    const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
    return t > 1e-6 && t < 1 - 1e-6;
  };
  return quads.some(([p, q, r, s]) => tri(p, q, r) || tri(p, r, s));
}

test('M2 looking up from 1F at the edge of a 2F pool, the slab closes the way: nothing of the pool is reachable by sight', async () => {
  const { buildChunkGeometry } = await loadMesher();
  const w = new World(42);
  let pools = 0, edges = 0;
  for (let cz = -14; cz <= 0; cz++) for (let cx = -14; cx <= 14; cx++) {
    const L = w.layout(cx, cz);
    if (!L.up || !L.up.tiles.some((t) => t === SHALLOW)) continue;
    const g = buildChunkGeometry(w, L, { ceil: 7.7, T: 0, guide: null });
    const quads = quadsOf(g.static);
    pools++;
    for (let i = 0; i < 256; i++) {
      if (L.up.tiles[i] !== SHALLOW) continue;
      const x = L.ox + (i % 16), z = L.oz + (i >> 4), by = L.up.h[i] - 0.1;
      // across each side shared with a dry 2F tile (whose slab hangs higher), aim at the slab's thickness just inside the pool tile
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = (i % 16) + dx, nz = (i >> 4) + dz;
        if (nx < 0 || nz < 0 || nx > 15 || nz > 15 || L.up.tiles[nz * 16 + nx] !== FLOOR) continue;
        const ex = x + 0.5 + dx * 0.5, ez = z + 0.5 + dz * 0.5;
        for (const along of [-0.3, 0, 0.3]) {
          const target = [ex - dx * 0.03 + (dz ? along : 0), by + 0.05, ez - dz * 0.03 + (dx ? along : 0)];
          const eye = [ex + dx * 2.5 + (dz ? along : 0), 1.6, ez + dz * 2.5 + (dx ? along : 0)];
          const ei = Math.floor(eye[2] - L.oz) * 16 + Math.floor(eye[0] - L.ox);
          if (eye[0] < L.ox || eye[2] < L.oz || eye[0] >= L.ox + 16 || eye[2] >= L.oz + 16 || L.tiles[ei] !== FLOOR) continue;
          edges++;
          assert.ok(crosses(quads, eye, target), `chunk ${cx},${cz} tile ${i % 16},${i >> 4} side ${dx},${dz}: the pool slab is open to the side`);
        }
      }
    }
    if (pools >= 4) break;
  }
  assert.ok(pools >= 3 && edges > 200, `${pools} pool chunks, ${edges} sight lines`);
});

// Inner layer, batch 6 scan: wall continuity. Every wall face that a walker can stand in front of is drawn whole, edge to
// edge and from the floor up, also where the wall and the floor in front of it lie in different chunks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { WALL, FLOOR, SHALLOW, FORM_CYL, DIRS } from '../../js/tiles.js';
import { loadMesher, quadsOf } from './mesh-helper.mjs';

// vertical quads of a mesh, grouped by the plane they lie in ('x:12' or 'z:-3') and the way they face
function wallIndex(quads) {
  const out = new Map();
  for (const q of quads) {
    for (const axis of [0, 2]) {
      if (!q.every((v) => Math.abs(v[axis] - q[0][axis]) < 1e-5)) continue;
      const u = axis === 0 ? 2 : 0;
      const ax = q[1][u] - q[0][u], ay = q[1][1] - q[0][1], bx = q[2][u] - q[0][u], by = q[2][1] - q[0][1];
      const n = (ax * by - ay * bx) * (axis === 0 ? -1 : 1);   // the face's normal along the axis, by the corner order
      if (!n) break;
      const key = `${axis}:${Math.round(q[0][axis] * 1000)}:${Math.sign(n)}`;
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(q.map((v) => [v[u], v[1]]));
      break;
    }
  }
  return out;
}

// is the point (u, y) inside the quad (a convex polygon in the plane, corners in order)?
const inside = (poly, u, y) => {
  let sign = 0;
  for (let k = 0; k < 4; k++) {
    const [a, b] = poly[k], [c, d] = poly[(k + 1) % 4], cr = (c - a) * (y - b) - (d - b) * (u - a);
    if (Math.abs(cr) < 1e-9) continue;
    if (sign && Math.sign(cr) !== sign) return false;
    sign = Math.sign(cr);
  }
  return true;
};

test('W1 every wall face in front of walkable floor is drawn whole: edge to edge and from the floor to 2 m, across chunk seams too', async () => {
  const { buildChunkGeometry } = await loadMesher();
  let faces = 0;
  const gaps = [];
  for (const seed of [1, 2]) {
    const w = new World(seed);
    for (let cz = -5; cz <= 5; cz++) for (let cx = -5; cx <= 5; cx++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.layout(cx + dx, cz + dz);
    for (let cz = -4; cz <= 4; cz++) for (let cx = -4; cx <= 4; cx++) {
      const L = w.layout(cx, cz);
      if (L.kind !== 'region') continue;
      const idx = wallIndex(quadsOf(buildChunkGeometry(w, L, { ceil: 4.5, T: 0, guide: null }).static));
      for (let i = 0; i < 256; i++) {
        if (L.tiles[i] !== WALL || (L.form[i] & FORM_CYL)) continue;
        const x = L.ox + (i % 16), z = L.oz + (i >> 4);
        DIRS.forEach(([dx, dz]) => {
          const [M, j] = w.cellOf(x + dx, z + dz);
          if (M.tiles[j] !== FLOOR && M.tiles[j] !== SHALLOW) return;
          faces++;
          const axis = dx ? 0 : 2, at = dx ? x + (dx > 0 ? 1 : 0) : z + (dz > 0 ? 1 : 0), u0 = dx ? z : x;
          const list = idx.get(`${axis}:${Math.round(at * 1000)}:${dx || dz}`) || [];
          const floor = Math.max(0, M.h[j]);
          for (const fu of [0.03, 0.5, 0.97]) for (const y of [floor + 0.05, floor + 1, floor + 2]) {
            if (!list.some((p) => inside(p, u0 + fu, y))) { gaps.push(`seed ${seed} wall ${x},${z} facing ${dx},${dz} at ${fu} m along, y ${y.toFixed(2)}`); return; }
          }
        });
      }
    }
  }
  assert.ok(faces > 2000, `${faces} wall faces checked`);
  assert.deepEqual(gaps.slice(0, 5), [], `${gaps.length} faces with a gap`);
});

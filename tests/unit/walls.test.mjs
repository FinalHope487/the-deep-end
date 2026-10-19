// Inner layer, batch 6 scan: wall continuity. Every wall a walker can stand in front of is drawn whole, edge to edge and
// from the floor up, also where the wall and the floor in front of it lie in different chunks and where its corner is
// rounded off: a look from the floor straight at the wall always meets a face turned towards it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { WALL, FLOOR, SHALLOW, FORM_CYL, DIRS } from '../../js/tiles.js';
import { loadMesher, quadsOf } from './mesh-helper.mjs';

// the triangles of a mesh, bucketed by the 1 m cells their footprint covers
function triangles(quads) {
  const cells = new Map();
  for (const q of quads) for (const t of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
    const xs = t.map((v) => v[0]), zs = t.map((v) => v[2]);
    for (let z = Math.floor(Math.min(...zs) - 1e-6); z <= Math.floor(Math.max(...zs) + 1e-6); z++) for (let x = Math.floor(Math.min(...xs) - 1e-6); x <= Math.floor(Math.max(...xs) + 1e-6); x++) {
      const k = x * 100003 + z;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(t);
    }
  }
  return cells;
}

// the nearest face a ray from o along unit d meets within `far`: its distance and whether it faces the ray
function cast(cells, o, d, far) {
  let best = null;
  const seen = new Set();
  for (let s = 0; s <= far + 0.5; s += 0.25) for (const t of cells.get(Math.floor(o[0] + d[0] * s) * 100003 + Math.floor(o[2] + d[2] * s)) || []) {
    if (seen.has(t)) continue;
    seen.add(t);
    const [a, b, c] = t, e1 = b.map((v, k) => v - a[k]), e2 = c.map((v, k) => v - a[k]);
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const tv = o.map((v, k) => v - a[k]), u = (tv[0] * p[0] + tv[1] * p[1] + tv[2] * p[2]) / det;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const q = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < -1e-6 || u + v > 1 + 1e-6) continue;
    const dist = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (dist < 0 || dist > far || (best && dist >= best.dist)) continue;
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    best = { dist, front: n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0 };
  }
  return best;
}

test('W1 every wall in front of walkable floor is drawn whole: edge to edge and from the floor to 2 m, across chunk seams and round its rounded corners', async () => {
  const { buildChunkGeometry } = await loadMesher();
  let faces = 0;
  const gaps = [];
  for (const seed of [1, 2]) {
    const w = new World(seed);
    for (let cz = -5; cz <= 5; cz++) for (let cx = -5; cx <= 5; cx++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.layout(cx + dx, cz + dz);
    for (let cz = -4; cz <= 4; cz++) for (let cx = -4; cx <= 4; cx++) {
      const L = w.layout(cx, cz);
      if (L.kind !== 'region') continue;
      const cells = triangles(quadsOf(buildChunkGeometry(w, L, { ceil: 4.5, T: 0, guide: null }).static));
      for (let i = 0; i < 256; i++) {
        if (L.tiles[i] !== WALL || (L.form[i] & FORM_CYL)) continue;
        const x = L.ox + (i % 16), z = L.oz + (i >> 4);
        DIRS.forEach(([dx, dz]) => {
          const [M, j] = w.cellOf(x + dx, z + dz);
          if (M.tiles[j] !== FLOOR && M.tiles[j] !== SHALLOW) return;
          faces++;
          const floor = Math.max(0, M.h[j]);
          // from 0.3 m out in front of the wall, straight at it: within the wall's own tile there must be a face turned this way
          for (const fu of [0.03, 0.5, 0.97]) for (const y of [floor + 0.05, floor + 1, floor + 2]) {
            const ex = dx ? x + 0.5 + dx * 0.8 : x + fu, ez = dz ? z + 0.5 + dz * 0.8 : z + fu;
            const hit = cast(cells, [ex, y, ez], [-dx, 0, -dz], 1.3);
            if (!hit || !hit.front) { gaps.push(`seed ${seed} wall ${x},${z} facing ${dx},${dz} at ${fu} m along, y ${y.toFixed(2)}: ${hit ? 'back face' : 'nothing'}`); return; }
          }
        });
      }
    }
  }
  assert.ok(faces > 2000, `${faces} wall faces checked`);
  assert.deepEqual(gaps.slice(0, 5), [], `${gaps.length} faces with a gap`);
});

test('W2 on region floor the outside corners of walls are rounded: looking at a wall 3 cm from such a corner, the wall is set back by the curve', async () => {
  const { buildChunkGeometry } = await loadMesher();
  let corners = 0;
  const sharp = [];
  for (const seed of [1, 2]) {
    const w = new World(seed);
    for (let cz = -4; cz <= 4; cz++) for (let cx = -4; cx <= 4; cx++) {
      const L = w.layout(cx, cz);
      if (L.kind !== 'region') continue;
      const cells = triangles(quadsOf(buildChunkGeometry(w, L, { ceil: 4.5, T: 0, guide: null }).static));
      for (let i = 0; i < 256; i++) {
        if (L.tiles[i] !== WALL || (L.form[i] & FORM_CYL)) continue;
        const x = L.ox + (i % 16), z = L.oz + (i >> 4);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const at = (a, b) => { const [M, j] = w.cellOf(a, b); return M.tiles[j] === FLOOR ? M.h[j] : NaN; };
          const h = at(x + sx, z), hz = at(x, z + sz), hd = at(x + sx, z + sz);
          if (!(Math.abs(h - hz) < 1e-3 && Math.abs(h - hd) < 1e-3)) continue;   // an outside corner with dry floor all round it
          corners++;
          // on the face turned towards x + sx, 3 cm from the corner's end
          const hit = cast(cells, [x + 0.5 + sx * 0.8, h + 1, z + (sz > 0 ? 0.97 : 0.03)], [-sx, 0, 0], 1.3);
          if (!hit || hit.dist < 0.45) sharp.push(`seed ${seed} wall ${x},${z} corner ${sx},${sz}: ${hit ? hit.dist.toFixed(2) : 'no'} m`);
        }
      }
    }
  }
  assert.ok(corners > 300, `${corners} outside corners`);
  assert.deepEqual(sharp.slice(0, 5), [], `${sharp.length} sharp corners`);
});

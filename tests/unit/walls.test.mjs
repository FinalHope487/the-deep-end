// Inner layer, batch 6 scan: wall continuity. Every wall a walker can stand in front of is drawn whole, edge to edge and
// from the floor up, also where the wall and the floor in front of it lie in different chunks and where its corner is
// rounded off: a look from the floor straight at the wall always meets a face turned towards it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { WALL, FLOOR, SHALLOW, FORM_CYL, DIRS } from '../../js/tiles.js';
import { doorwayAxis } from '../../js/shapes.js';
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
            if (M.slides.concat(L.slides).some((s) => s.pts.some((p) => Math.hypot(p[0] - ex, p[2] - ez) < 0.8 && Math.abs(p[1] - y) < 0.6))) continue;   // inside a slide's tube passing the wall
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

// the static mesh of every region chunk of a box, as triangles bucketed by cell (built with each chunk's own ceiling)
async function regionMeshes(seed, R) {
  const { buildChunkGeometry } = await loadMesher();
  const w = new World(seed), out = [];
  for (let cz = -R - 1; cz <= R + 1; cz++) for (let cx = -R - 1; cx <= R + 1; cx++) w.layout(cx, cz);
  for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
    if (!w.isRegion(cx, cz)) continue;
    const L = w.layout(cx, cz);
    out.push({ L, cells: triangles(quadsOf(buildChunkGeometry(w, L, { ceil: L.ceilFixed || 4.5, T: 0, guide: null }).static)) });
  }
  return { w, out };
}

test('W3 every tile of region floor has its own ceiling over it: looking straight up from it (not through a doorway arch), the first face is at its region ceiling height', async () => {
  let n = 0;
  const wrong = [];
  for (const seed of [1, 2]) {
    const { w, out } = await regionMeshes(seed, 4);
    for (const { L, cells } of out) for (let i = 0; i < 256; i++) {
      if ((L.tiles[i] !== FLOOR && L.tiles[i] !== SHALLOW) || L.block[i] || !L.ceilT) continue;
      const cellAt = (a, b) => (a >= 0 && b >= 0 && a < 16 && b < 16 ? [L, b * 16 + a] : w.cellOf(L.ox + a, L.oz + b));
      if (doorwayAxis(L, cellAt, i % 16, i >> 4) >= 0) continue;
      const tube = [-16, 0, 16].some((dz) => [-16, 0, 16].some((dx) => w.cellOf(L.ox + dx, L.oz + dz)[0].slides.some((s) => s.pts.some((p) => Math.hypot(p[0] - L.ox - (i % 16) - 0.5, p[2] - L.oz - (i >> 4) - 0.5) < 1.6))));
      if (tube) continue;   // under a tube coiling down from the ceiling, or a tower's slide
      if (L.ladders.some((l) => l.cage && Math.floor(l.x + l.nx * 0.5) === L.ox + (i % 16) && Math.floor(l.z + l.nz * 0.5) === L.oz + (i >> 4))) continue;   // under a ladder's cage
      const x = L.ox + (i % 16) + 0.5, z = L.oz + (i >> 4) + 0.5, want = L.baseY + L.ceilT[i];
      const hit = cast(cells, [x, L.h[i] + 1, z], [0, 1, 0], 12);
      n++;
      if (!hit || !hit.front || Math.abs(L.h[i] + 1 + hit.dist - want) > 0.05) wrong.push(`seed ${seed} ${x},${z}: ceiling ${want.toFixed(2)}, ${hit ? `${hit.front ? '' : 'back face '}at ${(L.h[i] + 1 + hit.dist).toFixed(2)}` : 'nothing'}`);
    }
  }
  assert.ok(n > 10000, `${n} tiles`);
  assert.deepEqual(wrong.slice(0, 5), [], `${wrong.length} tiles under the wrong ceiling`);
});

test('W4 where two ceilings meet the step between them is closed, and a wall reaches the ceiling of the floor in front of it (but under a doorway arch), across chunk seams too', async () => {
  let steps = 0, faces = 0;
  const gaps = [];
  for (const seed of [1, 2]) {
    const { w, out } = await regionMeshes(seed, 4);
    const ceilAt = (x, z) => { const [M, j] = w.cellOf(x, z); return M.ceilT ? M.baseY + M.ceilT[j] : NaN; };
    for (const { L, cells } of out) for (let i = 0; i < 256; i++) {
      const x = L.ox + (i % 16), z = L.oz + (i >> 4), t = L.tiles[i];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [M, j] = w.cellOf(x + dx, z + dz);
        if (M.tiles[j] !== FLOOR && M.tiles[j] !== SHALLOW) continue;
        if (doorwayAxis(M, (a, b) => w.cellOf(M.ox + a, M.oz + b), x + dx - M.ox, z + dz - M.oz) >= 0) continue;   // over a doorway's arch is stone
        const cj = ceilAt(x + dx, z + dz);
        if (!(cj === cj)) continue;
        // from the higher side, 0.3 m from the edge, at the middle of the step (a wall: just under the ceiling)
        let y;
        if (t === WALL) { y = cj - 0.1; faces++; }
        else if (t === FLOOR || t === SHALLOW) { const ci = ceilAt(x, z); if (!(cj > ci + 0.05)) continue; y = (ci + cj) / 2; steps++; }
        else continue;
        const ex = dx ? x + 0.5 + dx * 0.8 : x + 0.5, ez = dz ? z + 0.5 + dz * 0.8 : z + 0.5;
        const hit = cast(cells, [ex, y, ez], [-dx, 0, -dz], 1.3);
        if (!hit || !hit.front) gaps.push(`seed ${seed} ${t === WALL ? 'wall' : 'step'} ${x},${z} seen from ${dx},${dz} at y ${y.toFixed(2)}: ${hit ? 'back face' : 'nothing'}`);
      }
    }
  }
  assert.ok(steps > 200 && faces > 2000, `${steps} ceiling steps, ${faces} wall tops`);
  assert.deepEqual(gaps.slice(0, 5), [], `${gaps.length} gaps`);
});

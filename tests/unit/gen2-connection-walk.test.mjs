import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { World2, CELL2, primaryHall } from '../../js/gen2.js';
import { CORPUS } from '../../js/gen2-measure.js';
import { Player } from '../../js/player.js';
// lattice reach with the real body: (x, z, floor height) states 0.5 m apart, a move allowed when the Player could stand there
function reachSet(w, x0, z0, x1, z1, start) {
  const p = new Player(), seen = new Map(), q = [start];
  const key = (x, z, h) => `${x},${z},${Math.round(h * 4)}`;
  seen.set(key(...start), start);
  while (q.length) {
    const [x, z, h] = q.pop();
    for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < x0 || nz < z0 || nx > x1 || nz > z1) continue;
      p.x = x; p.z = z;
      if (!p.canStand(w, nx, nz, h)) continue;
      const nh = w.surfaceAt(nx, nz, h).h, k = key(nx, nz, nh);
      if (seen.has(k)) continue;
      const st = [nx, nz, nh];
      seen.set(k, st);
      q.push(st);
    }
    // a ladder joins the floor at its foot to the floor over its top (where Player.updateClimb puts a body off it)
    for (const l of w.planAt(x, z).ladders) {
      const foot = [l.x + l.nx * 0.75, l.z + l.nz * 0.75, l.h0], top = [l.x - l.nx * 0.45, l.z - l.nz * 0.45, l.h1];
      for (const [a, b] of [[foot, top], [top, foot]]) {
        if (Math.abs(h - a[2]) >= 0.3 || Math.hypot(x - a[0], z - a[1]) >= 0.75) continue;
        // land on the walk's own 0.5 m lattice, at the nearest point a body can stand on
        const snap = (v, o, f) => o + f((v - o) / 0.5) * 0.5;
        const land = [Math.floor, Math.ceil].flatMap((fx) => [Math.floor, Math.ceil].map((fz) => [snap(b[0], start[0], fx), snap(b[1], start[1], fz), b[2]]))
          .filter(([bx, bz, bh]) => p.canStand(w, bx, bz, bh)).sort((u, v) => Math.hypot(u[0] - b[0], u[1] - b[1]) - Math.hypot(v[0] - b[0], v[1] - b[1]))[0];
        if (!land || seen.has(key(...land))) continue;
        seen.set(key(...land), land);
        q.push(land);
      }
    }
  }
  return [...seen.values()];
}

// Both directions use the same quarter-metre-offset, half-metre lattice.
// Scan the facing wall in distance order, without assuming a corridor route.
function wallStart(w, hall, axis, side, middle) {
  const X = axis === 'x', p = new Player();
  const fixed = X ? (side > 0 ? hall.x1 - 1.25 : hall.x0 + 1.25)
    : (side > 0 ? hall.z1 - 1.25 : hall.z0 + 1.25);
  const snap = (v) => Math.round((v - 0.25) / 0.5) * 0.5 + 0.25;
  const lo = X ? hall.z0 : hall.x0, hi = X ? hall.z1 : hall.x1;
  const candidates = [];
  for (let v = Math.ceil((lo - 0.25) / 0.5) * 0.5 + 0.25; v < hi; v += 0.5) {
    if (v > lo) candidates.push(v);
  }
  candidates.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b);
  for (const v of candidates) {
    const [x, z] = X ? [snap(fixed), v] : [v, snap(fixed)];
    if (!(x > hall.x0 && x < hall.x1 && z > hall.z0 && z < hall.z1)) continue;
    p.reset(x, z, 0, 0);
    const surface = w.surfaceAt(x, z, 0);
    if (surface?.h === 0 && p.canStand(w, x, z, 0)) return [x, z, 0];
  }
  return null;
}

const reachesHall = (states, hall) => states.some(([x, z, h]) =>
  h === 0 && x > hall.x0 && x < hall.x1 && z > hall.z0 && z < hall.z1);

test('every active corpus connection is walkable hall to hall in both directions', (t) => {
  const started = performance.now();
  const cells = new Set(CORPUS.cells.map(([i, j]) => `${i},${j}`));
  const counts = { corridor: 0, 'connector-room': 0, seam: 0, closed: 0 };
  const links = [], failures = [];
  // The measured full-box corpus run exceeded 150 s. Set this to 0 to remeasure it.
  const capped = process.env.GEN2_CONNECTION_WALK_BAND !== '0';
  for (const seed of CORPUS.seeds) {
    const w = new World2(seed);
    for (const [i, j] of CORPUS.cells) for (const axis of ['x', 'z']) {
      const [ni, nj] = axis === 'x' ? [i + 1, j] : [i, j + 1];
      // As in the corpus measurement, only edges with both cells in the sample.
      if (!cells.has(`${ni},${nj}`)) continue;
      const connection = w.connectionOf(i, j, axis);
      assert.ok(Object.hasOwn(counts, connection.mode), `unknown mode: ${connection.mode}`);
      counts[connection.mode]++;
      if (connection.mode === 'seam' || connection.mode === 'closed') continue;
      links.push({ seed, w, i, j, ni, nj, axis, connection });
    }
  }
  t.diagnostic(`population: ${links.length} active links; modes=${JSON.stringify(counts)}; closed skipped=${counts.closed}`);
  assert.ok(links.length >= 100, `only ${links.length} active links`);
  assert.ok(counts['connector-room'] >= 50, `only ${counts['connector-room']} connector-room links`);

  let walked = 0;
  try {
    for (const { seed, w, i, j, ni, nj, axis, connection } of links) {
      const A = w.hallOf(i, j), B = w.hallOf(ni, nj), X = axis === 'x';
      const parts = connection.parts?.length ? connection.parts : [A, B];
      const middle = X ? (Math.min(...parts.map((p) => p.z0)) + Math.max(...parts.map((p) => p.z1))) / 2
        : (Math.min(...parts.map((p) => p.x0)) + Math.max(...parts.map((p) => p.x1))) / 2;
      const a = wallStart(w, primaryHall(w.plan(i, j)), axis, 1, middle);
      const b = wallStart(w, primaryHall(w.plan(ni, nj)), axis, -1, middle);
      const full = [i * CELL2 + 0.25, j * CELL2 + 0.25,
        (ni + 1) * CELL2 - 0.25, (nj + 1) * CELL2 - 0.25], box = [...full];
      if (capped) {
        // From 2 m inside each facing wall, with 8 m of sideways detour.
        // This includes the 1.25 m wall starts without flooding entire halls.
        const alongLow = X ? 0 : 1, alongHigh = X ? 2 : 3;
        box[alongLow] = Math.max(box[alongLow], (X ? A.x1 : A.z1) - 2);
        box[alongHigh] = Math.min(box[alongHigh], (X ? B.x0 : B.z0) + 2);
        const low = X ? 1 : 0, high = X ? 3 : 2;
        box[low] = Math.max(box[low], Math.min(X ? A.z0 : A.x0, X ? B.z0 : B.x0) - 8);
        box[high] = Math.min(box[high], Math.max(X ? A.z1 : A.x1, X ? B.z1 : B.x1) + 8);
      }
      for (const [direction, start, target] of [['A->B', a, B], ['B->A', b, A]]) {
        const label = `seed=${seed} i=${i} j=${j} axis=${axis} id=${connection.id} mode=${connection.mode} direction=${direction}`;
        if (!start) { failures.push(`${label}: no standable 1F wall start`); continue; }
        try {
          // a way round a pool or a split hall's ladders can leave the band: only then walk the whole two-cell box
          if (!reachesHall(reachSet(w, ...box, start), target) && (!capped || !reachesHall(reachSet(w, ...full, start), target))) failures.push(`${label}: target hall unreachable at h=0`);
        } catch (error) {
          failures.push(`${label}: ${error.stack ?? error}`);
        }
      }
      walked++;
      if (walked % 100 === 0) t.diagnostic(`walked=${walked}/${links.length}; elapsed=${((performance.now() - started) / 1000).toFixed(3)}s`);
    }
  } finally {
    t.diagnostic(`walked=${walked}; modes=${JSON.stringify(counts)}; closed skipped=${counts.closed}; failures=${failures.length}; elapsed=${((performance.now() - started) / 1000).toFixed(3)}s; box cap=${capped ? '8m band' : 'not used (full two-cell box)'}`);
  }
  assert.equal(failures.length, 0, `connection walk failures (${failures.length}):\n${failures.join('\n')}`);
});


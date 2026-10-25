// lattice reach with the real body, shared by the v2 walk tests: (x, z, floor height) states 0.5 m apart from the start,
// a move allowed when the Player could stand there, inside the box [x0, x1] × [z0, z1] (and where keep(x, z), when given)
import { Player } from '../../js/player.js';

export function reachSet(w, x0, z0, x1, z1, start, keep = null) {
  const p = new Player(), seen = new Map(), q = [start];
  const key = (x, z, h) => `${x},${z},${Math.round(h * 4)}`;
  seen.set(key(...start), start);
  while (q.length) {
    const [x, z, h] = q.pop();
    for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < x0 || nz < z0 || nx > x1 || nz > z1 || (keep && !keep(nx, nz))) continue;
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

// the shortest walk (Dijkstra) on the reach's own states, from start [x, z, h] to the nearest state where done(x, z, h)
// holds, inside the box: its length in metres (0.5 per step of the lattice, the 3D distance of a ladder), or Infinity.
// An indexed binary min-heap with decrease-key holds each discovered state once, ordered by [distance, x, z, h * 4]
export function walkLength(w, x0, z0, x1, z1, start, done) {
  const p = new Player(), states = new Map(), heap = [];
  const key = (x, z, h) => `${x},${z},${Math.round(h * 4)}`;
  const less = (a, b) => (a.d !== b.d ? a.d < b.d : a.x !== b.x ? a.x < b.x : a.z !== b.z ? a.z < b.z : a.q < b.q);
  const swap = (i, j) => { [heap[i], heap[j]] = [heap[j], heap[i]]; heap[i].pos = i; heap[j].pos = j; };
  const up = (i) => { while (i > 0 && less(heap[i], heap[(i - 1) >> 1])) { swap(i, (i - 1) >> 1); i = (i - 1) >> 1; } };
  const down = (i) => {
    for (;;) {
      let m = i;
      for (const c of [2 * i + 1, 2 * i + 2]) if (c < heap.length && less(heap[c], heap[m])) m = c;
      if (m === i) return;
      swap(i, m); i = m;
    }
  };
  const relax = (x, z, h, d) => {
    const k = key(x, z, h), e = states.get(k);
    if (!e) {
      const n = { x, z, h, q: Math.round(h * 4), d, pos: heap.length, settled: false };
      states.set(k, n); heap.push(n); up(n.pos);
    } else if (!e.settled && d < e.d) { e.d = d; up(e.pos); }
  };
  relax(start[0], start[1], start[2], 0);
  while (heap.length) {
    const u = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; last.pos = 0; down(0); }
    u.settled = true;
    const { x, z, h, d } = u;
    if (done(x, z, h)) return d;
    for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < x0 || nz < z0 || nx > x1 || nz > z1) continue;
      p.x = x; p.z = z;
      if (!p.canStand(w, nx, nz, h)) continue;
      relax(nx, nz, w.surfaceAt(nx, nz, h).h, d + 0.5);
    }
    // a ladder joins the floor at its foot to the floor over its top (where Player.updateClimb puts a body off it)
    for (const l of w.planAt(x, z).ladders) {
      const foot = [l.x + l.nx * 0.75, l.z + l.nz * 0.75, l.h0], top = [l.x - l.nx * 0.45, l.z - l.nz * 0.45, l.h1];
      for (const [a, b] of [[foot, top], [top, foot]]) {
        if (Math.abs(h - a[2]) >= 0.3 || Math.hypot(x - a[0], z - a[1]) >= 0.75) continue;
        const snap = (v, o, f) => o + f((v - o) / 0.5) * 0.5;
        p.x = x; p.z = z;
        const land = [Math.floor, Math.ceil].flatMap((fx) => [Math.floor, Math.ceil].map((fz) => [snap(b[0], start[0], fx), snap(b[1], start[1], fz), b[2]]))
          .filter(([bx, bz, bh]) => bx >= x0 && bx <= x1 && bz >= z0 && bz <= z1 && p.canStand(w, bx, bz, bh))
          .sort((s, t) => Math.hypot(s[0] - b[0], s[1] - b[1]) - Math.hypot(t[0] - b[0], t[1] - b[1]))[0];
        if (land) relax(land[0], land[1], land[2], d + Math.hypot(land[0] - x, land[1] - z, land[2] - h));
      }
    }
  }
  return Infinity;
}

// the states of a reach on the 1F floor strictly inside a rectangle
export const reaches = (states, r) => states.some(([x, z, h]) => h === 0 && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);

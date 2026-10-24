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

// the states of a reach on the 1F floor strictly inside a rectangle
export const reaches = (states, r) => states.some(([x, z, h]) => h === 0 && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);

// Round shapes shared by the generator, the mesher and the tests. Pure data, no three.js.
import { FLOOR, SHALLOW, WALL, DEEP, FORM_CYL, FORM_RIMWET } from './tiles.js';

export const ARCH_R = 0.5;        // a one-tile doorway is topped by a half circle this wide
export const ARCH_SPRING = 2.0;   // height above the floor where the half circle starts
export const ARCH_SEGS = 6;       // facets in the half circle

// The axis a small doorway runs along, or -1 when tile (x, z) of layout L is not one: 0 = its passage is along x
// (walls north and south of it), 1 = along z. A doorway is an ordinary floor tile inside the chunk (the ring of
// tiles at the chunk edge is where chunks meet: those doors stay square) with a wall on both sides, open ahead and
// behind, and not a gap between two columns. cellAt(x, z) → [layout, index] reaches over the chunk edge.
export function doorwayAxis(L, cellAt, x, z) {
  if (x < 1 || z < 1 || x > 14 || z > 14) return -1;
  const i = z * 16 + x, t = L.tiles[i];
  if (t !== FLOOR && t !== SHALLOW) return -1;
  const wall = (dx, dz) => { const [M, j] = cellAt(x + dx, z + dz); return M.tiles[j] === WALL && !(M.form[j] & FORM_CYL); };
  const open = (dx, dz) => { const [M, j] = cellAt(x + dx, z + dz); return M.tiles[j] !== WALL; };
  const alongX = wall(0, -1) && wall(0, 1) && open(-1, 0) && open(1, 0);
  const alongZ = wall(-1, 0) && wall(1, 0) && open(0, -1) && open(0, 1);
  return alongX === alongZ ? -1 : alongX ? 0 : 1;
}

// height of the spring line above the floor for a doorway under a ceiling `room` metres above the floor: the arch must
// fit under it; below 1.7 m of straight jamb there is no arch
export function archSpring(room) {
  const s = Math.min(ARCH_SPRING, room - ARCH_R);
  return s >= 1.7 ? s : -1;
}

// the half circle as [offset across the opening, height above the spring line] points, west/south to east/north
export function archPoints() {
  const pts = [];
  for (let k = 0; k <= ARCH_SEGS; k++) { const a = (k / ARCH_SEGS) * Math.PI; pts.push([-Math.cos(a) * ARCH_R, Math.sin(a) * ARCH_R]); }
  return pts;
}

// ---------- rounded deep-pool corners ----------
// A deep tile at a convex corner of its pool can have the corner cut off by a quarter circle of radius CORNER_R whose centre
// is the tile's inner corner. grid.corner[i] says which corner (1 + 1 if the cut corner is on the +x side + 2 if on the
// +z side), grid.rim[i] the floor height of the cut-off part, FORM_RIMWET that it is shallow water rather than dry.
export const CORNER_R = 1;
export const cornerCode = (sx, sz) => 1 + (sx > 0 ? 1 : 0) + (sz > 0 ? 2 : 0);
export const cornerDir = (c) => [(c - 1) & 1 ? 1 : -1, (c - 1) & 2 ? 1 : -1];

// is the point (fx, fz) of the tile (fractions 0..1) in the cut-off part of corner c
export function inFillet(c, fx, fz) {
  const [sx, sz] = cornerDir(c);
  return Math.hypot(fx - (sx > 0 ? 0 : 1), fz - (sz > 0 ? 0 : 1)) > CORNER_R;
}

// round every convex corner of every deep pool in the grid; returns how many corners it cut
export function roundPoolCorners(g) {
  const n = g.n;
  const T = (x, z) => (x < 0 || z < 0 || x >= n || z >= n ? WALL : g.tiles[z * n + x]);
  const flat = (t) => t === FLOOR || t === SHALLOW;
  let count = 0;
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const i = z * n + x;
    if (g.tiles[i] !== DEEP || g.corner[i]) continue;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (g.corner[i] || !flat(T(x + sx, z)) || !flat(T(x, z + sz)) || !flat(T(x + sx, z + sz))) continue;
      if (T(x - sx, z) !== DEEP || T(x, z - sz) !== DEEP) continue;
      const hd = g.h[(z + sz) * n + x + sx];
      if (Math.abs(hd - g.h[z * n + x + sx]) > 0.01 || Math.abs(hd - g.h[(z + sz) * n + x]) > 0.01) continue;   // a level rim all round
      g.corner[i] = cornerCode(sx, sz); g.rim[i] = hd;
      if (T(x + sx, z + sz) === SHALLOW) g.form[i] |= FORM_RIMWET;
      count++;
    }
  }
  return count;
}

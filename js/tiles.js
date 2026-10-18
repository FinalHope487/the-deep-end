// Tile types, heights and grid helpers shared by world generation, collision and meshing (no three.js).
export const CHUNK = 16;
export const FLOOR = 0, WALL = 1, SHALLOW = 2, DEEP = 3, RAMP = 4, SPIRAL = 5, BARS = 6, COLS = 7, VOID = 8;
export const SHALLOW_FLOOR = -0.4;   // shallow pool floor next to h=0 walkway
export const SHALLOW_DEPTH = 0.38;   // water surface sits this far above a shallow tile's floor
export const DEEP_FLOOR = -2.4;
export const DEEP_WATER = SHALLOW_FLOOR + SHALLOW_DEPTH;   // connected shallow and deep water share one surface
export const STEP_UP = 0.45;
export const STEP_DOWN = 0.7;
export const UP_H = 3;          // upper floor walking height
export const LEVEL_H = 3;       // distance between B1, 1F and 2F
export const SLAB = 0.3;        // upper floor thickness: the ground-level ceiling under it is UP_H - SLAB
export const HEADROOM = 2.3;    // dark corridors get a low ceiling this far above their floor
export const RAIL_H = 1.0;
export const TAU = Math.PI * 2;
// ramp rise directions 0..3
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const walkable = (t) => t === FLOOR || t === SHALLOW || t === RAMP || t === SPIRAL;
// tiles that carry a floor surface for meshing (walkable or not)
export const floorish = (t) => t !== WALL && t !== VOID;

export function newGrid(n) {
  const N = n * n;
  return {
    n, tiles: new Uint8Array(N), h: new Float32Array(N), rdir: new Int8Array(N).fill(-1), rise: new Float32Array(N),
    dark: new Uint8Array(N), low: new Uint8Array(N), wet: new Uint8Array(N), block: new Uint8Array(N), up: null,
    lamps: [], upLamps: [], spirals: [], rails: [], noRail: [], signs: [], slides: [], suns: [], floaters: [], sealed: [],
  };
}

export function addUpper(g) {
  g.up = { tiles: new Uint8Array(g.n * g.n).fill(VOID), h: new Float32Array(g.n * g.n).fill(UP_H) };
  return g.up;
}

function rect(g, x0, z0, x1, z1, fn) {
  for (let z = Math.max(0, z0); z <= Math.min(g.n - 1, z1); z++) {
    for (let x = Math.max(0, x0); x <= Math.min(g.n - 1, x1); x++) fn(z * g.n + x, x, z);
  }
}

export function fill(g, x0, z0, x1, z1, type, h) {
  rect(g, x0, z0, x1, z1, (i) => { g.tiles[i] = type; g.h[i] = h; g.rdir[i] = -1; g.rise[i] = 0; g.wet[i] = 0; });
}

export function fillUp(g, x0, z0, x1, z1, type, h = UP_H) {
  rect(g, x0, z0, x1, z1, (i) => { g.up.tiles[i] = type; g.up.h[i] = h; });
}

export function mark(g, key, x0, z0, x1, z1, v = 1) {
  rect(g, x0, z0, x1, z1, (i) => { g[key][i] = v; });
}

// stair flight: every tile rises `rise` across itself along `dir`; tile k (counted from the low end) starts at h0 + k·rise
export function ramp(g, x0, z0, x1, z1, dir, h0, rise) {
  rect(g, x0, z0, x1, z1, (i, x, z) => {
    const k = dir === 0 ? x - x0 : dir === 1 ? x1 - x : dir === 2 ? z - z0 : z1 - z;
    g.tiles[i] = RAMP; g.h[i] = h0 + k * rise; g.rdir[i] = dir; g.rise[i] = rise; g.wet[i] = 0;
  });
}

export const rampFrac = (dir, fx, fz) => (dir === 0 ? fx : dir === 1 ? 1 - fx : dir === 2 ? fz : 1 - fz);

// spiral: { x, z centre, rIn, rOut, h0, h1, a0 start angle, sense ±1, sweep } → height at a point, null off the treads
export function spiralH(s, x, z) {
  const dx = x - s.x, dz = z - s.z, r = Math.hypot(dx, dz);
  if (r < s.rIn || r > s.rOut) return null;
  let a = ((Math.atan2(dz, dx) - s.a0) * s.sense) % TAU;
  if (a < 0) a += TAU;
  if (a > s.sweep) a = a > s.sweep + (TAU - s.sweep) / 2 ? 0 : s.sweep;
  return s.h0 + (s.h1 - s.h0) * (a / s.sweep);
}

// water surface over a ground tile (NaN = dry)
export function groundWater(g, i) {
  const t = g.tiles[i], dw = DEEP_WATER + (g.baseY || 0);   // pools on B1 / 2F share their floor's surface height
  if (t === SHALLOW) {   // float32 heights: snap ground-level pools onto the shared surface so meshes merge
    const w = g.h[i] + SHALLOW_DEPTH;
    return Math.abs(w - dw) < 1e-4 ? dw : w;
  }
  if (t === DEEP) return dw;
  if (g.wet[i]) return dw;
  return NaN;
}

// ---------- D4 transforms: templates are drawn once and mirrored / rotated per chunk ----------

export function xfPoint(k, n, x, z) {
  let a = x, b = z;
  if (k & 1) a = n - a;
  if (k & 2) b = n - b;
  return k & 4 ? [b, a] : [a, b];
}

export function xfVec(k, dx, dz) {
  let a = dx, b = dz;
  if (k & 1) a = -a;
  if (k & 2) b = -b;
  return k & 4 ? [b, a] : [a, b];
}

const dirIndex = (dx, dz) => DIRS.findIndex(([a, b]) => a === Math.round(dx) && b === Math.round(dz));

export function transformGrid(g, k) {
  if (!k) return g;
  const n = g.n, out = newGrid(n);
  const cell = (x, z) => { const [a, b] = xfPoint(k, n, x + 0.5, z + 0.5); return Math.floor(b) * n + Math.floor(a); };
  if (g.up) addUpper(out);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const i = z * n + x, j = cell(x, z);
    for (const key of ['tiles', 'h', 'rise', 'dark', 'low', 'wet', 'block']) out[key][j] = g[key][i];
    if (g.rdir[i] >= 0) { const [a, b] = xfVec(k, ...DIRS[g.rdir[i]]); out.rdir[j] = dirIndex(a, b); }
    if (g.up) { out.up.tiles[j] = g.up.tiles[i]; out.up.h[j] = g.up.h[i]; }
  }
  const P = (x, z) => xfPoint(k, n, x, z);
  const V = (x, z) => xfVec(k, x, z);
  const rectXf = (r) => {
    const [a, b] = P(r.x, r.z), [c, d] = P(r.x + r.w, r.z + r.d);
    return { ...r, x: Math.min(a, c), z: Math.min(b, d), w: Math.abs(c - a), d: Math.abs(d - b) };
  };
  const det = ((k & 1) ? -1 : 1) * ((k & 2) ? -1 : 1) * ((k & 4) ? -1 : 1);
  out.lamps = g.lamps.map(rectXf);
  out.upLamps = g.upLamps.map(rectXf);
  out.spirals = g.spirals.map((s) => {
    const [x, z] = P(s.x, s.z), [vx, vz] = V(Math.cos(s.a0), Math.sin(s.a0));
    return { ...s, x, z, a0: Math.atan2(vz, vx), sense: s.sense * det };
  });
  const seg = (s) => { const [x0, z0] = P(s.x0, s.z0), [x1, z1] = P(s.x1, s.z1); return { ...s, x0, z0, x1, z1 }; };
  out.rails = g.rails.map(seg);
  out.noRail = g.noRail.map(seg);
  out.signs = g.signs.map((s) => { const [x, z] = P(s.x, s.z), [nx, nz] = V(s.nx, s.nz); return { ...s, x, z, nx, nz }; });
  out.slides = g.slides.map((s) => ({
    ...s,
    pts: s.pts.map(([x, y, z]) => { const [a, b] = P(x, z); return [a, y, b]; }),
    entry: s.entry && (() => { const [x, z] = P(s.entry.x, s.entry.z), [nx, nz] = V(s.entry.nx, s.entry.nz); return { ...s.entry, x, z, nx, nz }; })(),
    land: s.land && (() => { const [x, z] = P(s.land.x, s.land.z); return { x, z }; })(),
  }));
  out.suns = g.suns.map((s) => {
    const [x, z] = P(s.x, s.z), [wx, wz] = P(s.wx, s.wz);
    const [nx, nz] = s.sky ? [s.nx, s.nz] : V(s.nx, s.nz);   // a wall window faces into the room: it turns with the wall
    return { ...s, x, z, wx, wz, nx, nz };
  });
  out.floaters = g.floaters.map((f) => { const [x, z] = P(f.x, f.z); return { ...f, x, z }; });
  out.sealed = g.sealed.map(rectXf);
  return out;
}

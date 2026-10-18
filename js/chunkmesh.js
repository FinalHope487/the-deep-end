// Turns a chunk layout into merged geometries: static tiles (+ rails, bars, stairs, tubes), lamps (+ signs,
// windows), water and sunbeams. Lighting is baked into vertex colours; materials are unlit (MeshBasicMaterial).
import * as THREE from 'three';
import { lightAt } from './lighting.js';
import {
  FLOOR, WALL, SHALLOW, DEEP, RAMP, SPIRAL, BARS, COLS, VOID, SHALLOW_DEPTH, UP_H, SLAB, HEADROOM, RAIL_H,
  DIRS, groundWater,
} from './tiles.js';
import { floorTop, SIGN, SLIDE_COLORS, TUBE_R } from './levels.js';

const CEIL_MAX = 9;
const DARK = 0.24;          // light left in a dark corridor
const COL = {
  floor: [1, 0.985, 0.955], pool: [0.55, 0.82, 0.97], deep: [0.18, 0.4, 0.62],
  wall: [0.93, 0.935, 0.93], wallLow: [0.66, 0.69, 0.71], poolWall: [0.5, 0.76, 0.92],
  ceil: [0.74, 0.77, 0.79], band: [0.55, 0.58, 0.6], slab: [0.6, 0.63, 0.65],
  paint: [0.9, 0.9, 0.88], rust: [0.5, 0.31, 0.2], iron: [0.36, 0.38, 0.4], brown: [0.46, 0.34, 0.22],
};
const ZONE_TINT = [[1.06, 1.05, 1.0], [1.04, 1.0, 0.92], [0.7, 0.88, 0.85], [0.3, 0.34, 0.45]];
const LAMP_COL = [[1, 1, 1], [1.15, 1.12, 1.02], [0.32, 0.5, 0.52]];
const SUN_COL = [1, 0.82, 0.5];
const TILE_UV = 0.06;                     // a spot inside one tile of the tile texture: flat colour for props
const ATLAS_WHITE = [1 - 4 / 512, 4 / 512];   // white corner of the sign atlas, used by lamps and windows
const DEST_CELL = [SIGN.TO_HALL, SIGN.TO_TERRACE, SIGN.TO_PIPES, SIGN.TO_DEEP];
const BEAM_SIDES = [1, -1, 1, 1, 1, 1, -1, 1, -1, 1, -1, -1, -1, -1, 1, -1];
const BEAM_P = new Array(12), BEAM_UV = [TILE_UV, TILE_UV], BEAM_C = [0, 0, 0], FACE_UV = new Array(8);

class GeoBuf {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  // 4 corners in CCW order seen from the front side; per-vertex colours ca..cd
  quad(p, uv, ca, cb = ca, cc = cb, cd = ca) {
    const pos = this.pos, u = this.uv, c = this.col;
    for (let i = 0; i < 12; i++) pos.push(p[i]);
    for (let i = 0; i < 8; i++) u.push(uv[i]);
    c.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2], cd[0], cd[1], cd[2]);
    const n = this.n;
    this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    this.n += 4;
  }
  // flat-coloured quad (constant uv) turned to face `hint`
  face(p, hint, uv, ca, cb = ca, cc = cb, cd = ca) {
    const ax = p[3] - p[0], ay = p[4] - p[1], az = p[5] - p[2], bx = p[6] - p[0], by = p[7] - p[1], bz = p[8] - p[2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const u = FACE_UV;
    u[0] = u[2] = u[4] = u[6] = uv[0]; u[1] = u[3] = u[5] = u[7] = uv[1];
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] >= 0) this.quad(p, u, ca, cb, cc, cd);
    else this.quad([p[9], p[10], p[11], p[6], p[7], p[8], p[3], p[4], p[5], p[0], p[1], p[2]], u, cd, cc, cb, ca);
  }
  geometry() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  // horizontal rect facing up (+y) or down
  flat(x0, z0, x1, z1, y, c, up = true, uvScale = 1) {
    const u0 = x0 * uvScale, u1 = x1 * uvScale, v0 = z0 * uvScale, v1 = z1 * uvScale;
    if (up) this.quad([x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0], [u0, v0, u0, v1, u1, v1, u1, v0], c);
    else this.quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], [u0, v0, u1, v0, u1, v1, u0, v1], c);
  }
  // flat rect cut into 1 m cells whose corners are coloured by col(x, z)
  flatCells(x0, z0, x1, z1, y, col, up = true, uvScale = 1) {
    for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
      const a = col(x, z), b = col(x, z + 1), c = col(x + 1, z + 1), d = col(x + 1, z);
      const uv = [x * uvScale, z * uvScale, x * uvScale, (z + 1) * uvScale, (x + 1) * uvScale, (z + 1) * uvScale, (x + 1) * uvScale, z * uvScale];
      if (up) this.quad([x, y, z, x, y, z + 1, x + 1, y, z + 1, x + 1, y, z], uv, a, b, c, d);
      else this.quad([x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1], [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]], a, d, c, b);
    }
  }
  // vertical rect on plane x = const, facing +x (sign 1) or -x; cb = bottom colour, ct = top colour.
  // y0/y1 may be [a, b] pairs: heights at the z0 / z1 ends (sloped edges)
  wallX(x, z0, z1, y0, y1, sign, cb, ct) {
    const [b0, b1] = Array.isArray(y0) ? y0 : [y0, y0], [t0, t1] = Array.isArray(y1) ? y1 : [y1, y1];
    if (sign > 0) this.quad([x, b1, z1, x, b0, z0, x, t0, z0, x, t1, z1], [z1, b1, z0, b0, z0, t0, z1, t1], cb, cb, ct, ct);
    else this.quad([x, b0, z0, x, b1, z1, x, t1, z1, x, t0, z0], [z0, b0, z1, b1, z1, t1, z0, t0], cb, cb, ct, ct);
  }
  // vertical rect on plane z = const, facing +z (sign 1) or -z
  wallZ(z, x0, x1, y0, y1, sign, cb, ct) {
    const [b0, b1] = Array.isArray(y0) ? y0 : [y0, y0], [t0, t1] = Array.isArray(y1) ? y1 : [y1, y1];
    if (sign > 0) this.quad([x0, b0, z, x1, b1, z, x1, t1, z, x0, t0, z], [x0, b0, x1, b1, x1, t1, x0, t0], cb, cb, ct, ct);
    else this.quad([x1, b1, z, x0, b0, z, x0, t0, z, x1, t1, z], [x1, b1, x0, b0, x0, t0, x1, t1], cb, cb, ct, ct);
  }
  // thin vertical bar seen from either side of the line it stands in: two quads facing ±(nx, nz)
  bar(x, z, y0, y1, nx, nz, t, c) {
    const rx = nz * t * 0.5, rz = -nx * t * 0.5;
    const p = BEAM_P;
    p[0] = x - rx; p[1] = y0; p[2] = z - rz; p[3] = x + rx; p[4] = y0; p[5] = z + rz;
    p[6] = x + rx; p[7] = y1; p[8] = z + rz; p[9] = x - rx; p[10] = y1; p[11] = z - rz;
    this.face(p, [nx, 0, nz], BEAM_UV, c);
    this.face(p, [-nx, 0, -nz], BEAM_UV, mul(c, 0.85));
  }
  // square-section beam between two points (rails, bars, posts)
  beam(a, b, t, c) {
    const ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2];
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const l = Math.hypot(dx, dy, dz) || 1;
    const d0 = dx / l, d1 = dy / l, d2 = dz / l;
    // u ⟂ d (from d × up), v = d × u; both scaled to half the thickness
    let u0, u1, u2;
    if (Math.abs(d1) < 0.9) { u0 = -d2; u1 = 0; u2 = d0; } else { u0 = 0; u1 = d2; u2 = -d1; }
    const ul = Math.hypot(u0, u1, u2), h = t * 0.5;
    u0 = (u0 / ul) * h; u1 = (u1 / ul) * h; u2 = (u2 / ul) * h;
    const v0 = d1 * u2 - d2 * u1, v1 = d2 * u0 - d0 * u2, v2 = d0 * u1 - d1 * u0;
    const p = BEAM_P, uv = BEAM_UV;
    for (let k = 0; k < 4; k++) {
      const i0 = BEAM_SIDES[k * 4], j0 = BEAM_SIDES[k * 4 + 1], i1 = BEAM_SIDES[k * 4 + 2], j1 = BEAM_SIDES[k * 4 + 3];
      const o0 = u0 * i0 + v0 * j0, o1 = u1 * i0 + v1 * j0, o2 = u2 * i0 + v2 * j0;
      const q0 = u0 * i1 + v0 * j1, q1 = u1 * i1 + v1 * j1, q2 = u2 * i1 + v2 * j1;
      p[0] = ax + o0; p[1] = ay + o1; p[2] = az + o2;
      p[3] = bx + o0; p[4] = by + o1; p[5] = bz + o2;
      p[6] = bx + q0; p[7] = by + q1; p[8] = bz + q2;
      p[9] = ax + q0; p[10] = ay + q1; p[11] = az + q2;
      const s = 0.8 + 0.2 * Math.sign(o1 + q1);
      const col = BEAM_C;
      col[0] = c[0] * s; col[1] = c[1] * s; col[2] = c[2] * s;
      this.face(p, [o0 + q0, o1 + q1, o2 + q2], uv, col);
    }
  }
}

const tint = (c, m) => [c[0] * m[0], c[1] * m[1], c[2] * m[2]];
const mul = (c, s) => [c[0] * s, c[1] * s, c[2] * s];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hash01 = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

// greedy rectangle merge over a 16×16 key grid (-1 = skip)
function greedyRects(keys, emit) {
  const used = new Uint8Array(256);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = z * 16 + x, k = keys[i];
    if (k < 0 || used[i]) continue;
    let w = 1;
    while (x + w < 16 && keys[i + w] === k && !used[i + w]) w++;
    let d = 1;
    grow: while (z + d < 16) {
      for (let j = 0; j < w; j++) {
        const ii = (z + d) * 16 + x + j;
        if (keys[ii] !== k || used[ii]) break grow;
      }
      d++;
    }
    for (let a = 0; a < d; a++) for (let j = 0; j < w; j++) used[(z + a) * 16 + x + j] = 1;
    emit(x, z, w, d, k);
  }
}

function cellUV(cell) {
  if (cell < 16) {
    const px = (cell % 4) * 128, py = (cell >> 2) * 64;
    return [px / 512, 1 - (py + 64) / 512, (px + 128) / 512, 1 - py / 512];
  }
  const g = cell - 16, px = (g % 4) * 128, py = 256 + (g >> 2) * 128;
  return [px / 512, 1 - (py + 128) / 512, (px + 128) / 512, 1 - py / 512];
}

// opts: { ceil, T, guide: { x, z, zone, color:[r,g,b] } | null }
export function buildChunkGeometry(world, L, opts) {
  const ox = L.ox, oz = L.oz;
  const T = opts.T || 0;
  const zm = L.zone >= 0 ? ZONE_TINT[L.zone] : [1, 1, 1];
  const ceil = opts.ceil;
  const st = new GeoBuf(), lamps = new GeoBuf(), water = new GeoBuf(), sun = new GeoBuf();
  const up = L.up;
  const inside = (x, z) => x >= 0 && z >= 0 && x < 16 && z < 16;
  // neighbour cell anywhere: [layout, index]
  const cellAt = (x, z) => (inside(x, z) ? [L, z * 16 + x] : world.cellOf(ox + x, oz + z));
  const bottomY = (M, i) => (M.up.tiles[i] === SHALLOW ? M.up.h[i] - 0.1 : UP_H - SLAB);
  const covered = (M, i) => M.up && M.up.tiles[i] !== VOID && M.up.tiles[i] !== WALL;
  // where a wall tile's ground face stops and its upper-floor face starts, on the side facing tile j of grid M:
  // one height for both, so stacked walls are not drawn twice in the same plane (z-fighting white/grey flicker)
  const wallSplit = (i, M, j) => {
    const by = bottomY(L, i), nt = M.up ? M.up.tiles[j] : VOID;
    return nt === FLOOR || nt === SHALLOW ? Math.min(by, M.up.h[j]) : by;
  };

  // ---------- guide sign + tinted door lamp (decided before lighting so the lamp lights the floor) ----------
  const extraLamps = [];
  const guideSigns = [];
  if (opts.guide) placeGuide(world, L, opts.guide, extraLamps, guideSigns);
  const allLamps = extraLamps.length ? L.lamps.concat(extraLamps) : L.lamps;

  // ---------- light ----------
  const darkF = (lx, lz) => {   // weighted bilinear over tile centres, walls do not count
    const fx = lx - 0.5, fz = lz - 0.5, x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
    let s = 0, w = 0;
    for (const [a, b, wt] of [[x0, z0, (1 - tx) * (1 - tz)], [x0 + 1, z0, tx * (1 - tz)], [x0, z0 + 1, (1 - tx) * tz], [x0 + 1, z0 + 1, tx * tz]]) {
      const aa = Math.min(15, Math.max(0, a)), bb = Math.min(15, Math.max(0, b));
      const i = bb * 16 + aa;
      if (L.tiles[i] === WALL || wt <= 0) continue;
      s += (L.dark[i] ? DARK : 1) * wt; w += wt;
    }
    return w > 0 ? s / w : 1;
  };
  const sunAmt = 0.5 * (1 - 0.85 * T);
  const sunAt = (x, z) => {
    let s = 0;
    for (const b of L.suns) {
      const dx = Math.max(0, Math.abs(x - b.x) - b.w / 2), dz = Math.max(0, Math.abs(z - b.z) - b.d / 2);
      s += Math.max(0, 1 - Math.hypot(dx, dz) / 1.2);
    }
    return Math.min(1, s) * sunAmt;
  };
  // light at the 17×17 tile corners is computed once; other points (treads, signs) on demand
  // light at the 17×17 tile corners, filled on first use; other points (treads, signs) computed on demand
  const LG = new Float32Array(289).fill(-1), SG = new Float32Array(289), UG = new Float32Array(289).fill(-1);
  const hasSun = L.suns.length > 0;
  const corner = (x, z) => { const lx = x - ox, lz = z - oz; return lx >= 0 && lz >= 0 && lx <= 16 && lz <= 16 && lx === (lx | 0) && lz === (lz | 0) ? lz * 17 + lx : -1; };
  const groundLight = (k) => {
    if (LG[k] < 0) { const x = k % 17, z = (k / 17) | 0; LG[k] = lightAt(allLamps, x, z) * darkF(x, z); SG[k] = hasSun ? sunAt(ox + x, oz + z) : 0; }
    return LG[k];
  };
  const upLight = (k) => { if (UG[k] < 0) UG[k] = lightAt(L.upLamps, k % 17, (k / 17) | 0); return UG[k]; };
  const shade = (c, x, z) => {
    const k = corner(x, z);
    let m, s;
    if (k >= 0) { m = groundLight(k); s = SG[k]; } else { m = lightAt(allLamps, x - ox, z - oz) * darkF(x - ox, z - oz); s = hasSun ? sunAt(x, z) : 0; }
    return [c[0] * m + SUN_COL[0] * s, c[1] * m + SUN_COL[1] * s, c[2] * m + SUN_COL[2] * s];
  };
  const shadeUp = (c, x, z) => { const k = corner(x, z); return mul(c, k >= 0 ? upLight(k) : lightAt(L.upLamps, x - ox, z - oz)); };
  const wallShade = (c, x, z) => mul(c, darkF(x - ox, z - oz));
  const tileDark = (x, z) => (inside(x, z) && L.dark[z * 16 + x] ? DARK : 1);

  // ---------- ground floors ----------
  // deep pools fade from the shallow colour at their rim to deep blue 2.5 m in (no hard seam under the water)
  const deepDist = new Float32Array(256);
  for (let i = 0; i < 256; i++) deepDist[i] = L.tiles[i] === DEEP ? 9 : 0;
  for (let pass = 0; pass < 3; pass++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = z * 16 + x;
    if (L.tiles[i] !== DEEP) continue;
    for (const [dx, dz] of DIRS) {
      const [M, j] = cellAt(x + dx, z + dz);
      const d = M.tiles[j] === DEEP ? (inside(x + dx, z + dz) ? deepDist[j] : 9) : 0;
      deepDist[i] = Math.min(deepDist[i], d + 1);
    }
  }
  const deepCol = (x, z) => {   // world corner → blended pool colour
    const lx = x - ox, lz = z - oz;
    let s = 0, c = 0;
    for (const [a, b] of [[lx - 1, lz - 1], [lx, lz - 1], [lx - 1, lz], [lx, lz]]) {
      if (!inside(a, b)) continue;
      s += L.tiles[b * 16 + a] === DEEP ? deepDist[b * 16 + a] : 0; c++;
    }
    return mix(COL.pool, COL.deep, Math.min(1, (c ? s / c : 0) / 2.5));
  };
  const keyList = [];
  const keys = new Int16Array(256).fill(-1);
  for (let i = 0; i < 256; i++) {
    const t = L.tiles[i];
    if (t === WALL || t === RAMP) continue;
    const kind = t === SHALLOW ? 'p' : t === DEEP ? 'd' : 'f';
    const name = kind + ':' + L.h[i].toFixed(2);
    let k = keyList.indexOf(name);
    if (k < 0) { k = keyList.length; keyList.push(name); }
    keys[i] = k;
  }
  greedyRects(keys, (x, z, w, d, k) => {
    const [kind, h] = keyList[k].split(':');
    const base = tint(kind === 'f' ? COL.floor : COL.pool, zm);
    st.flatCells(ox + x, oz + z, ox + x + w, oz + z + d, +h, kind === 'd' ? (px, pz) => shade(tint(deepCol(px, pz), zm), px, pz) : (px, pz) => shade(base, px, pz));
  });

  // ramps: three treads per tile on the continuous slope line
  for (let i = 0; i < 256; i++) {
    if (L.tiles[i] !== RAMP) continue;
    const x = ox + (i % 16), z = oz + (i >> 4), h = L.h[i], rise = L.rise[i], dir = L.rdir[i];
    const base = tint(L.wet[i] ? COL.pool : COL.floor, zm);
    const P = (f, s, y) => {   // f: 0..1 along the rise, s: 0..1 across
      if (dir === 0) return [x + f, y, z + s];
      if (dir === 1) return [x + 1 - f, y, z + s];
      if (dir === 2) return [x + s, y, z + f];
      return [x + s, y, z + 1 - f];
    };
    const [rdx, rdz] = DIRS[dir];
    for (let k = 0; k < 3; k++) {
      const f0 = k / 3, f1 = (k + 1) / 3, yPrev = h + rise * f0, y = h + rise * f1;
      const a = P(f0, 0, y), b = P(f0, 1, y), c = P(f1, 1, y), e = P(f1, 0, y);
      st.face([...a, ...b, ...c, ...e], [0, 1, 0], [TILE_UV, TILE_UV], shade(base, a[0], a[2]), shade(base, b[0], b[2]), shade(base, c[0], c[2]), shade(base, e[0], e[2]));
      const ra = P(f0, 0, yPrev), rb = P(f0, 1, yPrev);
      st.face([...ra, ...rb, ...b, ...a], [-rdx, 0, -rdz], [TILE_UV, TILE_UV], mul(shade(base, ra[0], ra[2]), 0.82));
    }
  }

  // water surfaces
  const wkeys = new Int16Array(256).fill(-1);
  const levels = [];
  for (let i = 0; i < 256; i++) {
    const lv = groundWater(L, i);
    if (lv !== lv) continue;
    let k = levels.indexOf(lv);
    if (k < 0) { k = levels.length; levels.push(lv); }
    wkeys[i] = k;
  }
  const litW = (x, z) => { const m = groundLight(corner(x, z)); return [m, m, m]; };
  greedyRects(wkeys, (x, z, w, d, k) => water.flatCells(ox + x, oz + z, ox + x + w, oz + z + d, levels[k], litW, true, 0.25));

  // ---------- walls, ledges and stair sides (each face drawn once: by the wall, or by the higher tile) ----------
  const wallC = tint(COL.wall, zm), wallLow = tint(COL.wallLow, zm), poolC = tint(COL.poolWall, zm);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = z * 16 + x, t = L.tiles[i];
    for (let d = 0; d < 4; d++) {
      const dx = DIRS[d][0], dz = DIRS[d][1], nx = x + dx, nz = z + dz;
      let M = L, j = nz * 16 + nx;
      if (!inside(nx, nz)) [M, j] = world.cellOf(ox + nx, oz + nz);
      const nt = M.tiles[j];
      if (nt === WALL) continue;
      // shared edge end points (world) and points nudged into each side
      const ex0 = ox + x + (dx > 0 ? 1 : 0), ez0 = oz + z + (dz > 0 ? 1 : 0);
      const ex1 = dx ? ex0 : ex0 + 1, ez1 = dx ? ez0 + 1 : ez0;
      const b0 = floorTop(M, j, ex0 + dx * 0.01, ez0 + dz * 0.01), b1 = floorTop(M, j, ex1 + dx * 0.01, ez1 + dz * 0.01);
      if (b0 === null) continue;
      let lo, hi, cb, ct;
      if (t === WALL) {
        lo = [b0, b1];
        const top = up && up.tiles[i] !== VOID ? wallSplit(i, M, j) : ceil;
        hi = [top, top];
        cb = b0 < -0.05 ? poolC : wallLow; ct = wallC;
      } else {
        const a0 = floorTop(L, i, ex0 - dx * 0.01, ez0 - dz * 0.01), a1 = floorTop(L, i, ex1 - dx * 0.01, ez1 - dz * 0.01);
        if (!(b0 < a0 - 0.001 || b1 < a1 - 0.001)) continue;
        lo = [Math.min(a0, b0), Math.min(a1, b1)]; hi = [a0, a1];
        const pool = nt === SHALLOW || nt === DEEP || t === SHALLOW;
        cb = pool ? poolC : wallLow; ct = pool ? poolC : wallC;
        if (t === SHALLOW && nt === DEEP) {   // slope down into the deep end instead of a sharp step
          const f = 0.9;
          const q = dx ? [ex0, a0, ez0, ex1, a1, ez1, ex1 + dx * f, b1, ez1, ex0 + dx * f, b0, ez0]
            : [ex0, a0, ez0, ex1, a1, ez1, ex1, b1, ez1 + dz * f, ex0, b0, ez0 + dz * f];
          st.face(q, [0, 1, 0], [TILE_UV, TILE_UV], shade(tint(COL.pool, zm), ex0, ez0), shade(tint(COL.pool, zm), ex1, ez1),
            shade(tint(deepCol(ex1 + dx, ez1 + dz), zm), ex1, ez1), shade(tint(deepCol(ex0 + dx, ez0 + dz), zm), ex0, ez0));
          continue;
        }
      }
      const f = tileDark(nx, nz);
      if (f !== 1) { cb = mul(cb, f); ct = mul(ct, f); }
      if (dx) st.wallX(ex0, ez0, ez1, lo, hi, dx, cb, ct);
      else st.wallZ(ez0, ex0, ex1, lo, hi, dz, cb, ct);
    }
  }

  // ---------- ceiling, low ceilings over dark corridors, outward bands ----------
  const ceilC = tint(COL.ceil, zm), bandC = tint(COL.band, zm);
  st.flat(ox, oz, ox + 16, oz + 16, ceil, ceilC, false);
  st.wallX(ox, oz, oz + 16, ceil, CEIL_MAX, -1, bandC, bandC);
  st.wallX(ox + 16, oz, oz + 16, ceil, CEIL_MAX, 1, bandC, bandC);
  st.wallZ(oz, ox, ox + 16, ceil, CEIL_MAX, -1, bandC, bandC);
  st.wallZ(oz + 16, ox, ox + 16, ceil, CEIL_MAX, 1, bandC, bandC);
  const tileTopMax = (M, j) => (M.tiles[j] === RAMP ? M.h[j] + M.rise[j] : M.h[j]);
  const ceilOf = (M, j, mCeil) => {
    let c = mCeil;
    if (covered(M, j)) c = Math.min(c, bottomY(M, j));
    if (M.low[j] && M.tiles[j] !== WALL) c = Math.min(c, Math.max(tileTopMax(M, j), M.tiles[j] === SHALLOW ? M.h[j] + SHALLOW_DEPTH : 0) + HEADROOM);
    return c;
  };
  const lowC = mul(ceilC, 0.8);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = z * 16 + x;
    if (!L.low[i] || L.tiles[i] === WALL) continue;
    const y = ceilOf(L, i, ceil);
    if (y >= ceil - 0.01 || (covered(L, i) && y >= bottomY(L, i) - 0.01)) continue;
    st.flat(ox + x, oz + z, ox + x + 1, oz + z + 1, y, wallShade(lowC, ox + x + 0.5, oz + z + 0.5), false);
    for (let d = 0; d < 4; d++) {   // soffit where the neighbour's ceiling is higher
      const [dx, dz] = DIRS[d];
      const [M, j] = cellAt(x + dx, z + dz);
      if (M.tiles[j] === WALL) continue;
      const yn = ceilOf(M, j, ceil);
      if (yn <= y + 0.01) continue;
      const ex = ox + x + (dx > 0 ? 1 : 0), ez = oz + z + (dz > 0 ? 1 : 0);
      if (dx) st.wallX(ex, ez, ez + 1, y, yn, dx, lowC, lowC);
      else st.wallZ(ez, ex, ex + 1, y, yn, dz, lowC, lowC);
    }
  }

  // ---------- upper floor ----------
  if (up) {
    const ukeys = new Int16Array(256).fill(-1), uList = [];
    for (let i = 0; i < 256; i++) {
      const t = up.tiles[i];
      if (t !== FLOOR && t !== SHALLOW) continue;
      const name = t + ':' + up.h[i].toFixed(2);
      let k = uList.indexOf(name);
      if (k < 0) { k = uList.length; uList.push(name); }
      ukeys[i] = k;
    }
    greedyRects(ukeys, (x, z, w, d, k) => {
      const [t, h] = uList[k].split(':');
      st.flatCells(ox + x, oz + z, ox + x + w, oz + z + d, +h, (px, pz) => shadeUp(tint(+t === SHALLOW ? COL.pool : COL.floor, zm), px, pz));
      if (+t === SHALLOW) water.flatCells(ox + x, oz + z, ox + x + w, oz + z + d, +h + SHALLOW_DEPTH, (px, pz) => { const m = upLight((pz - oz) * 17 + px - ox); return [m, m, m]; }, true, 0.25);
    });
    // underside = ground-level ceiling
    const slabC = tint(COL.slab, zm);
    for (let i = 0; i < 256; i++) {
      if (up.tiles[i] === VOID) continue;
      const x = ox + (i % 16), z = oz + (i >> 4);
      st.flat(x, z, x + 1, z + 1, bottomY(L, i), wallShade(slabC, x + 0.5, z + 0.5), false);
    }
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const i = z * 16 + x, t = up.tiles[i];
      if (t === VOID) continue;
      for (let d = 0; d < 4; d++) {
        const [dx, dz] = DIRS[d];
        const [M, j] = cellAt(x + dx, z + dz);
        const nt = M.up ? M.up.tiles[j] : VOID;
        const ex = ox + x + (dx > 0 ? 1 : 0), ez = oz + z + (dz > 0 ? 1 : 0);
        let y0, y1, c = wallLow, c2 = wallC;
        const by = bottomY(L, i);
        if (nt === VOID) { y0 = by; y1 = t === WALL ? ceil : t === SHALLOW ? UP_H : up.h[i]; c = slabC; c2 = t === WALL ? wallC : slabC; }
        else if (nt === WALL) { if (t === WALL) continue; const nb = bottomY(M, j); if (nb <= by + 0.01) continue; y0 = by; y1 = nb; c = c2 = slabC; }
        else if (t === WALL) { y0 = wallSplit(i, M, j); y1 = ceil; }
        else if (t === FLOOR && nt === SHALLOW) { y0 = M.up.h[j]; y1 = up.h[i]; c = c2 = poolC; }
        else continue;
        if (y1 <= y0 + 0.001) continue;
        if (dx) st.wallX(ex, ez, ez + 1, y0, y1, dx, c, c2);
        else st.wallZ(ez, ex, ex + 1, y0, y1, dz, c, c2);
      }
    }
  }

  // ---------- spirals ----------
  const railC = mix(COL.paint, COL.rust, Math.min(1, T * 0.95));
  for (const s of L.spirals) if (s.own) buildSpiral(st, s, ceil, tint(COL.floor, zm), wallC, railC, shade);

  // ---------- rails, bars, pillars ----------
  for (const rl of L.rails) {
    const rust = mix(railC, COL.rust, hash01(rl.x0, rl.z0, 3) * T * 0.6);
    // one post per segment (the neighbouring segment brings the other), a top rail, thin balusters
    const top0 = [rl.x0, rl.y0 + RAIL_H, rl.z0], top1 = [rl.x1, rl.y1 + RAIL_H, rl.z1];
    st.beam([rl.x0, rl.y0, rl.z0], top0, 0.05, rust);
    st.beam(top0, top1, 0.05, rust);
    const nx = rl.z1 - rl.z0, nz = rl.x0 - rl.x1;   // normal of the rail's plane
    for (const f of [0.25, 0.5, 0.75]) {
      const bx = rl.x0 + (rl.x1 - rl.x0) * f, bz = rl.z0 + (rl.z1 - rl.z0) * f, by = rl.y0 + (rl.y1 - rl.y0) * f;
      st.bar(bx, bz, by, by + RAIL_H, nx, nz, 0.03, rust);
    }
  }
  const ironC = mix(COL.iron, COL.rust, Math.min(1, T * 0.9));
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = z * 16 + x, t = L.tiles[i];
    if (t !== BARS && t !== COLS) continue;
    const cx = ox + x + 0.5, cz = oz + z + 0.5, h = L.h[i];
    const top = covered(L, i) ? bottomY(L, i) : ceil;
    const arms = [];
    for (const [dx, dz] of DIRS) {
      const [M, j] = cellAt(x + dx, z + dz);
      const nt = M.tiles[j];
      if (nt === BARS || nt === COLS || nt === WALL) arms.push([dx, dz]);
    }
    if (!arms.length) arms.push([1, 0], [-1, 0]);
    arms.forEach(([dx, dz], a) => {
      if (t === BARS) {
        for (let s = a ? 0.13 : 0; s < 0.5; s += 0.13) st.bar(cx + dx * s, cz + dz * s, h, top, dz, -dx, 0.04, ironC);
        st.beam([cx, Math.min(top - 0.06, h + 2.4), cz], [cx + dx * 0.5, Math.min(top - 0.06, h + 2.4), cz + dz * 0.5], 0.05, ironC);
      } else if (dx > 0 || dz > 0) pillar(st, cx + dx * 0.5, cz + dz * 0.5, h, top, wallLow, wallC);   // edge pillar, drawn once
    });
    if (t === COLS) pillar(st, cx, cz, h, top, wallLow, wallC);
  }

  // ---------- slide tubes ----------
  for (const s of L.slides) buildTube(st, s, T);

  // ---------- lamps (ceiling panels), windows, signs: all in the atlas-textured lamp mesh ----------
  const W = ATLAS_WHITE;
  const lampY = (l) => {
    if (l.y !== undefined) return l.y;
    const cx = Math.min(15, Math.floor(l.x + l.w / 2)), cz = Math.min(15, Math.floor(l.z + l.d / 2)), i = cz * 16 + cx;
    return ceilOf(L, i, ceil) - 0.02;
  };
  const lampQuad = (l, y, col) => {
    const x0 = ox + l.x, z0 = oz + l.z, x1 = x0 + l.w, z1 = z0 + l.d;
    lamps.quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], [W[0], W[1], W[0], W[1], W[0], W[1], W[0], W[1]], col);
  };
  for (const l of L.lamps) lampQuad(l, lampY(l), mul(LAMP_COL[l.k], L.dark[Math.min(15, l.z) * 16 + Math.min(15, l.x)] ? 0.55 : 1));
  for (const l of extraLamps) lampQuad(l, lampY(l), l.color);
  for (const l of L.upLamps) lampQuad(l, ceil - 0.02, LAMP_COL[l.k]);
  for (const b of L.suns) {
    if (b.sky) {
      const y = ceil - 0.03, hw = b.w / 2, hd = b.d / 2;
      lamps.quad([b.wx - hw, y, b.wz - hd, b.wx + hw, y, b.wz - hd, b.wx + hw, y, b.wz + hd, b.wx - hw, y, b.wz + hd], [W[0], W[1], W[0], W[1], W[0], W[1], W[0], W[1]], [1.2, 1.15, 1.0]);
    } else {
      const R = [b.nz, 0, -b.nx], hw = 0.6, y0 = b.wy - 0.45, y1 = b.wy + 0.45, c = [b.wx + b.nx * 0.01, 0, b.wz + b.nz * 0.01];
      const p = [c[0] - R[0] * hw, y0, c[2] - R[2] * hw, c[0] + R[0] * hw, y0, c[2] + R[2] * hw, c[0] + R[0] * hw, y1, c[2] + R[2] * hw, c[0] - R[0] * hw, y1, c[2] - R[2] * hw];
      lamps.quad(p, [W[0], W[1], W[0], W[1], W[0], W[1], W[0], W[1]], [1.25, 1.2, 1.05]);
    }
    buildBeam(sun, b, ceil, (x, z) => world.floorAt(x, z) ?? 0);
  }
  const signQuad = (s, cell, mirror = false) => {
    const [u0, v0, u1, v1] = cellUV(cell);
    const R = [s.nz, 0, -s.nx], hw = s.w / 2, hh = s.h / 2;
    const c = [s.x + s.nx * 0.012, s.y, s.z + s.nz * 0.012];
    const m = lightAt(allLamps, s.x - ox, s.z - oz) * darkF(s.x - ox + s.nx * 0.5, s.z - oz + s.nz * 0.5) * 0.9 + 0.1;
    const col = [m, m, m];
    const p = [c[0] - R[0] * hw, c[1] - hh, c[2] - R[2] * hw, c[0] + R[0] * hw, c[1] - hh, c[2] + R[2] * hw,
      c[0] + R[0] * hw, c[1] + hh, c[2] + R[2] * hw, c[0] - R[0] * hw, c[1] + hh, c[2] - R[2] * hw];
    const uv = mirror ? [u1, v0, u0, v0, u0, v1, u1, v1] : [u0, v0, u1, v0, u1, v1, u0, v1];
    lamps.quad(p, uv, col);
  };
  for (const s of L.signs) {
    if (T < s.minT) continue;
    const odd = s.weird >= 0 && T > 0.45 && hash01(s.x, s.z, 7) < (T - 0.35) * 1.4;
    signQuad(s, odd ? s.weird : s.cell);
  }
  for (const g of guideSigns) signQuad(g, g.cell, g.mirror);

  return {
    static: st.geometry(), lamps: lamps.geometry(), water: water.geometry(), sun: sun.geometry(),
    floaters: L.floaters, guide: guideSigns.length > 0,
  };
}

function pillar(st, px, pz, h, top, cb, ct) {
  const r = 0.1;   // 0.2 m pillars every 0.5 m: 0.3 m gaps to look through
  st.wallX(px + r, pz - r, pz + r, h, top, 1, cb, ct);
  st.wallX(px - r, pz - r, pz + r, h, top, -1, cb, ct);
  st.wallZ(pz + r, px - r, px + r, h, top, 1, cb, ct);
  st.wallZ(pz - r, px - r, px + r, h, top, -1, cb, ct);
}

// round stair: wedge treads round a column, a helical handrail on the outside
function buildSpiral(st, s, ceil, floorC, wallC, railC, shade) {
  const N = 15, U = [0.06, 0.06];
  const at = (th, r, y) => { const a = s.a0 + s.sense * th; return [s.x + Math.cos(a) * r, y, s.z + Math.sin(a) * r]; };
  for (let k = 0; k < N; k++) {
    const t0 = (s.sweep * k) / N, t1 = (s.sweep * (k + 1)) / N;
    const y = s.h0 + ((s.h1 - s.h0) * (k + 1)) / N, yb = y - 0.18;
    const i0 = at(t0, s.rIn, y), o0 = at(t0, s.rOut, y), o1 = at(t1, s.rOut, y), i1 = at(t1, s.rIn, y);
    const c = shade(floorC, (i0[0] + o1[0]) / 2, (i0[2] + o1[2]) / 2);
    st.face([...i0, ...o0, ...o1, ...i1], [0, 1, 0], U, c);
    const b = (p) => [p[0], yb, p[2]];
    st.face([...b(i0), ...b(o0), ...b(o1), ...b(i1)], [0, -1, 0], U, mul(c, 0.7));
    const tm = (t0 + t1) / 2, back = at(tm - 0.5, 1, 0), fwd = at(tm + 0.5, 1, 0);
    st.face([...b(i0), ...b(o0), ...o0, ...i0], [back[0] - fwd[0], 0, back[2] - fwd[2]], U, mul(c, 0.85));
    st.face([...b(i1), ...b(o1), ...o1, ...i1], [fwd[0] - back[0], 0, fwd[2] - back[2]], U, mul(c, 0.75));
    const om = at(tm, 3, 0);
    st.face([...b(o0), ...b(o1), ...o1, ...o0], [om[0] - s.x, 0, om[2] - s.z], U, mul(c, 0.8));
    // baluster + rail
    const post = at(tm, s.rOut - 0.06, y);
    st.beam(post, [post[0], y + 0.95, post[2]], 0.035, railC);
    if (k < N - 1) {
      const nxt = at((t0 + t1) / 2 + s.sweep / N, s.rOut - 0.06, y + (s.h1 - s.h0) / N);
      st.beam([post[0], y + 0.95, post[2]], [nxt[0], nxt[1] + 0.95, nxt[2]], 0.05, railC);
    }
  }
  // column
  const R = s.rIn - 0.02, segs = 10;
  for (let k = 0; k < segs; k++) {
    const a0 = (k / segs) * Math.PI * 2, a1 = ((k + 1) / segs) * Math.PI * 2;
    const p0 = [s.x + Math.cos(a0) * R, s.z + Math.sin(a0) * R], p1 = [s.x + Math.cos(a1) * R, s.z + Math.sin(a1) * R];
    st.face([p0[0], s.h0, p0[1], p1[0], s.h0, p1[1], p1[0], ceil, p1[1], p0[0], ceil, p0[1]], [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)], U, wallC);
  }
}

// closed round tube along the slide's centreline: outside and inside faces, coloured rings
function buildTube(st, s, T) {
  const base = mix(SLIDE_COLORS[s.color], COL.brown, Math.min(0.85, T * 0.8));
  const pts = s.pts, segs = 10, U = [0.06, 0.06];
  const rings = [];
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // side vector (horizontal, perpendicular) and up vector
    let sx = -tz, sz = tx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
    const ux = ty * sz, uy = tz * sx - tx * sz, uz = -ty * sx;   // t × side
    const ring = [];
    for (let j = 0; j < segs; j++) {
      const a2 = (j / segs) * Math.PI * 2, c = Math.cos(a2), sn = Math.sin(a2);
      const nx = sx * c + ux * sn, ny = uy * sn, nz = sz * c + uz * sn;
      ring.push([pts[k][0] + nx * TUBE_R, pts[k][1] + ny * TUBE_R, pts[k][2] + nz * TUBE_R, nx, ny, nz]);
    }
    rings.push(ring);
  }
  for (let k = 0; k < rings.length - 1; k++) {
    const band = k % 4 < 2 ? 1 : 0.86;
    for (let j = 0; j < segs; j++) {
      const a = rings[k][j], b = rings[k][(j + 1) % segs], c = rings[k + 1][(j + 1) % segs], d = rings[k + 1][j];
      const n = [(a[3] + b[3]) / 2, (a[4] + b[4]) / 2, (a[5] + b[5]) / 2];
      const sh = band * (0.72 + 0.28 * Math.max(0, n[1]));
      const p = [a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]];
      st.face(p, n, U, mul(base, sh));
      st.face(p, [-n[0], -n[1], -n[2]], U, mul(base, band * 0.62));
    }
  }
  // a couple of posts holding up a rideable tube
  if (s.entry) {
    for (let k = 6; k < pts.length - 3; k += 9) {
      const p = pts[k];
      if (p[1] - TUBE_R > 0.6) st.beam([p[0], p[1] - TUBE_R, p[2]], [p[0], -0.02, p[2]], 0.09, mul(base, 0.8));
    }
  }
}

// additive light shaft from a window (wall or skylight) down to a patch on the floor
function buildBeam(buf, b, ceil, floorAt) {
  const top = [], bot = [];
  const hw = b.w / 2, hd = b.d / 2;
  if (b.sky) {
    const sx = 0.7, sz = 0.45;   // slanted, like late-afternoon sun through a roof light
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      top.push([b.wx + a * hw, ceil - 0.04, b.wz + c * hd]);
      const fx = b.x + sx + a * hw, fz = b.z + sz + c * hd;
      bot.push([fx, floorAt(b.x + sx, b.z + sz) + 0.02, fz]);
    }
  } else {
    const R = [b.nz, 0, -b.nx];
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) top.push([b.wx + R[0] * a * 0.6, b.wy + c * 0.45, b.wz + R[2] * a * 0.6]);
    const fy = floorAt(b.x, b.z) + 0.02;
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bot.push([b.x + a * hw, fy, b.z + c * hd]);
  }
  const ct = [0.2, 0.17, 0.12], cbm = [0.03, 0.025, 0.018];
  for (let k = 0; k < 4; k++) {
    const a = top[k], c = top[(k + 1) % 4], d = bot[(k + 1) % 4], e = bot[k];
    buf.quad([...a, ...c, ...d, ...e], [0, 0, 0, 0, 0, 0, 0, 0], ct, ct, cbm, cbm);
  }
}

// the door of this chunk that faces the next target: a direction sign on the wall beside it and a lamp tinted
// with the target's colour just inside it
function placeGuide(world, L, guide, extraLamps, out) {
  const ox = L.ox, oz = L.oz;
  const dx = guide.x - (ox + 8), dz = guide.z - (oz + 8);
  const edges = [
    { n: [-1, 0], tile: (k) => [0, k], inner: (k) => [1, k] },
    { n: [0, -1], tile: (k) => [k, 0], inner: (k) => [k, 1] },
    { n: [1, 0], tile: (k) => [16, k], inner: (k) => [15, k] },
    { n: [0, 1], tile: (k) => [k, 16], inner: (k) => [k, 15] },
  ].sort((a, b) => (b.n[0] * dx + b.n[1] * dz) - (a.n[0] * dx + a.n[1] * dz));
  const e = edges[0];
  const type = ([x, z]) => world.typeAt(ox + x, oz + z);
  const open = [];
  for (let k = 1; k < 16; k++) if (type(e.tile(k)) !== WALL && type(e.inner(k)) !== WALL) open.push(k);
  if (!open.length) return;
  const mid = open[open.length >> 1];
  // nearest wall beside the opening run whose inside tile is open floor
  let wk = -1, toward = 0;
  for (let s = 1; s < 8 && wk < 0; s++) {
    for (const k of [mid - s, mid + s]) {
      if (k < 1 || k > 15 || open.includes(k)) continue;
      const it = type(e.inner(k));
      if (type(e.tile(k)) === WALL && (it === FLOOR || it === SHALLOW)) { wk = k; toward = Math.sign(mid - k); break; }
    }
  }
  const [ix, iz] = e.inner(mid);
  extraLamps.push({ x: Math.min(15, ix), z: Math.min(15, iz), w: 1, d: 1, k: 0, color: guide.color.map((c) => c * 1.15) });
  if (wk < 0) return;
  const [wx, wz] = e.tile(wk);
  const nx = -e.n[0], nz = -e.n[1];                  // the sign looks back into the chunk
  const fx = ox + wx + 0.5 + nx * 0.5, fz = oz + wz + 0.5 + nz * 0.5;
  const px = e.n[0] ? (e.n[0] < 0 ? ox + 1 : ox + 16) : fx, pz = e.n[1] ? (e.n[1] < 0 ? oz + 1 : oz + 16) : fz;
  const [inx, inz] = e.inner(wk);
  const y = (world.floorAt(ox + inx + 0.5, oz + inz + 0.5) ?? 0) + 1.6;
  // along-wall direction to the opening, and the viewer's right on this wall
  const ax = e.n[0] ? 0 : toward, az = e.n[0] ? toward : 0;
  const rx = nz, rz = -nx;
  const side = Math.sign(ax * rx + az * rz) || 1;    // +1: the opening is to the viewer's right
  const along = (d) => [px + rx * d, pz + rz * d];
  const [arx, arz] = along(side * 0.42), [tx, tz] = along(-side * 0.14);
  out.push({ x: arx, z: arz, y, nx, nz, w: 0.34, h: 0.34, cell: SIGN.ARROW, mirror: side < 0 });
  out.push({ x: tx, z: tz, y, nx, nz, w: 0.62, h: 0.31, cell: guide.zone >= 0 ? DEST_CELL[guide.zone] : SIGN.TO_EXIT });
}

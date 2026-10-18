// Turns a chunk layout into merged geometries: static tiles (+ rails, bars, stairs, tubes), lamps (+ signs,
// windows), water and sunbeams. Lighting is baked into vertex colours; materials are unlit (MeshBasicMaterial).
import * as THREE from 'three';
import { lightAt, lampFloods, lampGlow } from './lighting.js';
import {
  FLOOR, WALL, SHALLOW, DEEP, RAMP, SPIRAL, BARS, COLS, VOID, SHALLOW_DEPTH, UP_H, SLAB, HEADROOM, RAIL_H,
  DIRS, groundWater, DEEP_WATER, FORM_CYL, FORM_RIMWET, FORM_LOW, LOW_DROP, FORM_ARCH, FORM_ARCH_Z, FORM_CROWN, VAULT_R, VAULT_SPRING, VAULT_CROWN,
} from './tiles.js';
import { floorTop, SIGN, SLIDE_COLORS, TUBE_R, ATLAS_W, ATLAS_H, cellRect } from './levels.js';
import { doorwayAxis, archSpring, archPoints, ARCH_R, cornerDir } from './shapes.js';

const DARK = 0.24;          // light left at the mouth of a dark corridor
const CORR_DIM = 0.3;      // light left in a lamp-lit corridor (dark = 2) far from every lamp
const DARK_MIN = 0.1, DARK_STEP = 0.03;   // ... and the least, deep inside (each tile further in)
const COLD = [0.8, 0.97, 1.07];   // dark places lean teal instead of going flat grey
const COLD_B1 = [0.62, 0.92, 1.12];   // the basement is darker and bluer still
const B1_DIM = 0.6;
const COL = {
  floor: [1, 0.985, 0.955], pool: [0.55, 0.82, 0.97], deep: [0.18, 0.4, 0.62],
  wall: [0.93, 0.935, 0.93], wallLow: [0.66, 0.69, 0.71], poolWall: [0.5, 0.76, 0.92],
  ceil: [0.74, 0.77, 0.79], band: [0.55, 0.58, 0.6], slab: [0.6, 0.63, 0.65],
  paint: [0.9, 0.9, 0.88], rust: [0.5, 0.31, 0.2], iron: [0.36, 0.38, 0.4], brown: [0.46, 0.34, 0.22],
};
const ZONE_TINT = [[1.06, 1.05, 1.0], [1.04, 1.0, 0.92], [0.7, 0.88, 0.85], [0.3, 0.34, 0.45]];
const LAMP_COL = [[1, 1, 1], [1.15, 1.12, 1.02], [0.32, 0.5, 0.52]];
const SUN_COL = [1, 0.82, 0.5];
const WATER_SHALLOW = [0.5, 0.88, 0.93], WATER_DEEP = [0.05, 0.3, 0.56];   // teal-blue, richer the deeper it is
const WET_SHEEN = [0.9, 0.96, 1];
const ABYSS_BLACK = [0, 0.004, 0.012];   // what the water of an abyss pool fades to
const ABYSS_WATER_COL = [0.008, 0.02, 0.045];   // the water of an abyss pool: ink blue, nearly black
const PIT_DEPTH = 8, PIT_LIT = 2.5, PIT_FADE = 1;   // an abyss pit: its floor is this far below the walkway; its walls stay lit down to the water line (PIT_LIT) and are black one PIT_FADE m under it
const POOL_LAMP_MIN_TILES = 36;   // a deep pool at least 6 × 6 gets underwater lamps; small and shallow ones do not
const FRAME_COL = [0.2, 0.22, 0.24], FRAME_W = 0.12;   // dark frame round skylights and windows
const TILE_UV = 0.06;                     // a spot inside one tile of the tile texture: flat colour for props
const ATLAS_WHITE = [1 - 4 / ATLAS_W, 1 - (ATLAS_W - 4) / ATLAS_H];   // white corner of the sign atlas, used by lamps and windows
const DEST_CELL = [SIGN.TO_HALL, SIGN.TO_TERRACE, SIGN.TO_PIPES, SIGN.TO_DEEP];
const BEAM_SIDES = [1, -1, 1, 1, 1, 1, -1, 1, -1, 1, -1, -1, -1, -1, 1, -1];
const BEAM_P = new Array(12), BEAM_UV = [TILE_UV, TILE_UV], BEAM_C = [0, 0, 0], FACE_UV = new Array(8);

// opts.alpha: colours carry a 4th (alpha) value; opts.wet: every vertex also stores how far it sits under the water
// level `lvl`: metres below it, negative above it (DRY for a surface with no water by it); the value runs linearly up a
// tall face, so the shader sees the water line wherever it crosses and ripples fade 0.5 m above it
export const DRY = -99;
class GeoBuf {
  constructor(opts = {}) {
    this.pos = []; this.uv = []; this.col = []; this.idx = []; this.n = 0;
    this.alpha = !!opts.alpha;
    this.depth = opts.wet ? [] : null;
    this.lvl = NaN;
  }
  // 4 corners in CCW order seen from the front side; per-vertex colours ca..cd
  quad(p, uv, ca, cb = ca, cc = cb, cd = ca) {
    const pos = this.pos, u = this.uv, c = this.col;
    for (let i = 0; i < 12; i++) pos.push(p[i]);
    for (let i = 0; i < 8; i++) u.push(uv[i]);
    if (this.alpha) c.push(ca[0], ca[1], ca[2], ca[3] ?? 1, cb[0], cb[1], cb[2], cb[3] ?? 1, cc[0], cc[1], cc[2], cc[3] ?? 1, cd[0], cd[1], cd[2], cd[3] ?? 1);
    else c.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2], cd[0], cd[1], cd[2]);
    if (this.depth) for (let k = 1; k < 12; k += 3) this.depth.push(this.lvl === this.lvl ? this.lvl - p[k] : DRY);
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
  // textured quad turned to face `hint` (uv in the order of the corners)
  facing(p, hint, uv, ca, cb = ca, cc = cb, cd = ca) {
    const ax = p[3] - p[0], ay = p[4] - p[1], az = p[5] - p[2], bx = p[6] - p[0], by = p[7] - p[1], bz = p[8] - p[2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] >= 0) this.quad(p, uv, ca, cb, cc, cd);
    else this.quad([p[9], p[10], p[11], p[6], p[7], p[8], p[3], p[4], p[5], p[0], p[1], p[2]], [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]], cd, cc, cb, ca);
  }
  geometry() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, this.alpha ? 4 : 3));
    if (this.depth) g.setAttribute('wetDepth', new THREE.Float32BufferAttribute(this.depth, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  // horizontal disc facing down, a 12-gon built from 6 quads (centre + three rim points each)
  disc(cx, cz, r, y, uv, c) {
    const rim = [];
    for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI * 2; rim.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    for (let k = 0; k < 12; k += 2) {
      const a = rim[k], b = rim[k + 1], d = rim[k + 2];
      this.quad([cx, y, cz, a[0], y, a[1], b[0], y, b[1], d[0], y, d[1]], uv, c);
    }
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
  // y0/y1 may be [a, b] pairs: heights at the z0 / z1 ends (sloped edges). adj(x, z) scales the light at each end of
  // the face (soft light edges along a wall); glow(x, y, z) adds light to each corner (pool lamps)
  wallX(x, z0, z1, y0, y1, sign, cb, ct, adj, glow) {
    const [b0, b1] = Array.isArray(y0) ? y0 : [y0, y0], [t0, t1] = Array.isArray(y1) ? y1 : [y1, y1];
    const f0 = adj ? adj(x, z0) : 1, f1 = adj ? adj(x, z1) : 1;
    const g = (c, f, y, z) => (glow ? addc(mul(c, f), glow(x, y, z)) : f === 1 ? c : mul(c, f));
    if (sign > 0) this.quad([x, b1, z1, x, b0, z0, x, t0, z0, x, t1, z1], [z1, b1, z0, b0, z0, t0, z1, t1], g(cb, f1, b1, z1), g(cb, f0, b0, z0), g(ct, f0, t0, z0), g(ct, f1, t1, z1));
    else this.quad([x, b0, z0, x, b1, z1, x, t1, z1, x, t0, z0], [z0, b0, z1, b1, z1, t1, z0, t0], g(cb, f0, b0, z0), g(cb, f1, b1, z1), g(ct, f1, t1, z1), g(ct, f0, t0, z0));
  }
  // vertical rect on plane z = const, facing +z (sign 1) or -z
  wallZ(z, x0, x1, y0, y1, sign, cb, ct, adj, glow) {
    const [b0, b1] = Array.isArray(y0) ? y0 : [y0, y0], [t0, t1] = Array.isArray(y1) ? y1 : [y1, y1];
    const f0 = adj ? adj(x0, z) : 1, f1 = adj ? adj(x1, z) : 1;
    const g = (c, f, y, x) => (glow ? addc(mul(c, f), glow(x, y, z)) : f === 1 ? c : mul(c, f));
    if (sign > 0) this.quad([x0, b0, z, x1, b1, z, x1, t1, z, x0, t0, z], [x0, b0, x1, b1, x1, t1, x0, t0], g(cb, f0, b0, x0), g(cb, f1, b1, x1), g(ct, f1, t1, x1), g(ct, f0, t0, x0));
    else this.quad([x1, b1, z, x0, b0, z, x0, t0, z, x1, t1, z], [x1, b1, x0, b0, x0, t0, x1, t1], g(cb, f1, b1, x1), g(cb, f0, b0, x0), g(ct, f0, t0, x0), g(ct, f1, t1, x1));
  }
  // disc standing on the plane with horizontal normal (nx, nz), a 12-gon of 6 quads facing along the normal
  discV(cx, cy, cz, nx, nz, r, uv, c, edge = c) {
    const rx = nz * r, rz = -nx * r, rim = [];
    for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI * 2, co = Math.cos(a), si = Math.sin(a); rim.push([cx + rx * co, cy + r * si, cz + rz * co]); }
    for (let k = 0; k < 12; k += 2) {
      const a = rim[k], b = rim[k + 1], d = rim[k + 2];
      this.quad([cx, cy, cz, a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2]], uv, c, edge, edge, edge);
    }
  }
  // soft-edged blotch lying flat, facing up: opaque-ish at the centre (alpha a0), clear at the rim, wobbly outline
  blob(cx, cz, rx, rz, y, rot, uv, rgb, a0) {
    const rim = [];
    for (let k = 0; k <= 8; k++) {
      const a = rot - (k / 8) * Math.PI * 2, f = 0.82 + 0.18 * Math.sin((k % 8) * 2.7 + rot * 5);
      rim.push([cx + Math.cos(a) * rx * f, cz + Math.sin(a) * rz * f]);
    }
    const mid = [rgb[0], rgb[1], rgb[2], a0], edge = [rgb[0], rgb[1], rgb[2], 0];
    for (let k = 0; k < 8; k += 2) {
      const a = rim[k], b = rim[k + 1], d = rim[k + 2];
      this.quad([cx, y, cz, a[0], y, a[1], b[0], y, b[1], d[0], y, d[1]], uv, mid, edge, edge, edge);
    }
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
const addc = (c, d) => [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
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

export function cellUV(cell) {
  const [px, py, w, h] = cellRect(cell);
  return [px / ATLAS_W, 1 - (py + h) / ATLAS_H, (px + w) / ATLAS_W, 1 - py / ATLAS_H];
}

// opts: { ceil, T, guide: { x, z, zone, color:[r,g,b] } | null }
export function buildChunkGeometry(world, L, opts) {
  const steps = buildChunkSteps(world, L, opts);
  let r;
  do r = steps.next(); while (!r.done);
  return r.value;
}

// the same build as a generator: it yields between its sections so a caller can spread one chunk over several frames
export function* buildChunkSteps(world, L, opts) {
  const ox = L.ox, oz = L.oz;
  const T = opts.T || 0;
  const zm = L.zone >= 0 ? ZONE_TINT[L.zone] : [1, 1, 1];
  const WB = L.baseY || 0;   // B1 / 2F chunks stand on a floor lifted by this much
  const ceil = opts.ceil + WB;
  const st = new GeoBuf({ wet: true }), lamps = new GeoBuf(), water = new GeoBuf({ alpha: true }), sun = new GeoBuf(), ab = new GeoBuf();
  const up = L.up;
  const lit = !!L.poolLit;   // a room lit only by its pool lamps: no ceiling lamps, a dark ceiling, bright white water
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
  const floods = lampFloods(allLamps, (tx, tz) => { const [M, j] = cellAt(tx, tz); return M.tiles[j] !== WALL; });   // light stays in the connected space

  yield;
  // ---------- light ----------
  // Darkness is a smooth field: every tile has a level (1 lit, DARK in a dark corridor, darker the deeper in), and a
  // tent filter over ±2 m round each tile corner turns the steps between tiles into a gradient about 2 m wide
  const dim = new Float32Array(256).fill(1);
  let anyDark = false;
  {
    const steps = new Int16Array(256).fill(-1), queue = [];
    for (let i = 0; i < 256; i++) { if (L.dark[i]) anyDark = true; else { steps[i] = 0; queue.push(i); } }
    for (let h = 0; h < queue.length && anyDark; h++) {
      const i = queue[h], x = i & 15, z = i >> 4;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx > 15 || nz > 15) continue;
        const j = nz * 16 + nx;
        if (steps[j] >= 0 || L.tiles[j] === WALL) continue;
        steps[j] = steps[i] + 1; queue.push(j);
      }
    }
    if (anyDark) for (let i = 0; i < 256; i++) {
      if (L.dark[i] === 2) dim[i] = CORR_DIM + (1 - CORR_DIM) * lampGlow(allLamps, (i & 15) + 0.5, (i >> 4) + 0.5);   // a corridor: bright by its lamps, dim between
      else if (L.dark[i]) dim[i] = steps[i] < 0 ? DARK : Math.max(DARK_MIN, DARK - DARK_STEP * (steps[i] - 1));
    }
  }
  const TAP = [[-1.5, 0.25], [-0.5, 0.75], [0.5, 0.75], [1.5, 0.25]];
  const DG = new Float32Array(289).fill(-1), AG = new Float32Array(289).fill(-1);
  const darkCorner = (cx, cz) => {
    let sum = 0, wsum = 0;
    for (const [oz2, wz] of TAP) for (const [ox2, wx] of TAP) {
      const a = cx + Math.floor(ox2), b = cz + Math.floor(oz2);   // the tile whose centre is that far from the corner
      const [M, j] = cellAt(a, b);
      if (M.tiles[j] === WALL) continue;
      sum += (inside(a, b) ? dim[b * 16 + a] : M.dark[j] === 2 ? CORR_DIM : M.dark[j] ? DARK : 1) * wx * wz; wsum += wx * wz;
    }
    return wsum > 0 ? sum / wsum : 1;
  };
  // ambient occlusion at a tile corner: walls around it and a floor overhead shade it
  const aoCorner = (cx, cz) => {
    let walls = 0, roof = 0;
    for (const [a, b] of [[cx - 1, cz - 1], [cx, cz - 1], [cx - 1, cz], [cx, cz]]) {
      const [M, j] = cellAt(a, b);
      if (M.tiles[j] === WALL) walls++; else if (covered(M, j)) roof++;
    }
    return 1 - 0.13 * walls - 0.04 * roof;
  };
  const bilin = (grid, fn, lx, lz) => {
    const fx = Math.min(16, Math.max(0, lx)), fz = Math.min(16, Math.max(0, lz));
    const x0 = Math.min(15, Math.floor(fx)), z0 = Math.min(15, Math.floor(fz)), tx = fx - x0, tz = fz - z0;
    const at = (x, z) => { const k = z * 17 + x; if (grid[k] < 0) grid[k] = fn(x, z); return grid[k]; };
    return (at(x0, z0) * (1 - tx) + at(x0 + 1, z0) * tx) * (1 - tz) + (at(x0, z0 + 1) * (1 - tx) + at(x0 + 1, z0 + 1) * tx) * tz;
  };
  const darkF = (lx, lz) => (!anyDark && lx >= 2 && lx <= 14 && lz >= 2 && lz <= 14 ? 1 : bilin(DG, darkCorner, lx, lz));
  const aoF = (lx, lz) => bilin(AG, aoCorner, lx, lz);
  const sunAmt = 0.5 * (1 - 0.85 * T);
  const sunAt = (x, z) => {
    let s = 0;
    for (const b of L.suns) {   // the lit patch fades out over 1.6 m with a smooth shoulder, no hard rim
      const dx = Math.max(0, Math.abs(x - b.x) - b.w / 2), dz = Math.max(0, Math.abs(z - b.z) - b.d / 2);
      const t = Math.max(0, 1 - Math.hypot(dx, dz) / 1.6);
      s += t * t * (3 - 2 * t);
    }
    return Math.min(1, s) * sunAmt;
  };
  // light at the 17×17 tile corners is computed once; other points (treads, signs) on demand
  // light at the 17×17 tile corners, filled on first use; other points (treads, signs) computed on demand
  const LG = new Float32Array(289).fill(-1), SG = new Float32Array(289), UG = new Float32Array(289).fill(-1);
  const hasSun = L.suns.length > 0;
  const corner = (x, z) => { const lx = x - ox, lz = z - oz; return lx >= 0 && lz >= 0 && lx <= 16 && lz <= 16 && lx === (lx | 0) && lz === (lz | 0) ? lz * 17 + lx : -1; };
  const groundLight = (k) => {
    if (LG[k] < 0) { const x = k % 17, z = (k / 17) | 0; LG[k] = lightAt(allLamps, x, z, floods) * darkF(x, z); SG[k] = hasSun ? sunAt(ox + x, oz + z) : 0; }
    return LG[k];
  };
  const upLight = (k) => { if (UG[k] < 0) UG[k] = lightAt(L.upLamps, k % 17, (k / 17) | 0); return UG[k]; };
  const shade = (c, x, z) => {
    const k = corner(x, z);
    let m, s;
    if (k >= 0) { m = groundLight(k); s = SG[k]; } else { m = lightAt(allLamps, x - ox, z - oz, floods) * darkF(x - ox, z - oz); s = hasSun ? sunAt(x, z) : 0; }
    m *= aoF(x - ox, z - oz) * (L.cold ? B1_DIM : 1);
    const q = Math.min(1, m), cv = L.cold ? COLD_B1 : COLD;   // the less light, the colder
    return [c[0] * m * (cv[0] + (1 - cv[0]) * q) + SUN_COL[0] * s, c[1] * m * (cv[1] + (1 - cv[1]) * q) + SUN_COL[1] * s, c[2] * m * (cv[2] + (1 - cv[2]) * q) + SUN_COL[2] * s];
  };
  const shadeUp = (c, x, z) => { const k = corner(x, z); return mul(c, k >= 0 ? upLight(k) : lightAt(L.upLamps, x - ox, z - oz)); };
  const wallShade = (c, x, z) => mul(c, darkF(x - ox, z - oz) * (L.cold ? B1_DIM : 1));

  yield;
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
  const deepT = (x, z) => {   // world corner → how deep the pool is there, 0 (rim) .. 1 (2.5 m in)
    const lx = x - ox, lz = z - oz;
    let s = 0, c = 0;
    for (const [a, b] of [[lx - 1, lz - 1], [lx, lz - 1], [lx - 1, lz], [lx, lz]]) {
      if (!inside(a, b)) continue;
      s += L.tiles[b * 16 + a] === DEEP ? deepDist[b * 16 + a] : 0; c++;
    }
    return Math.min(1, (c ? s / c : 0) / 2.5);
  };
  const deepCol = (x, z) => mix(COL.pool, COL.deep, deepT(x, z));

  yield;
  // ---------- underwater lamps: only in big deep pools, 2-4 round cold-cyan lights set in the pool wall ----------
  const poolLamps = [];
  const pit = () => false;   // an abyss pool has no lamps: only the skylight touches its water
  let deepTiles = 0;
  for (let i = 0; i < 256; i++) if (L.tiles[i] === DEEP || pit(i)) deepTiles++;
  if (deepTiles >= (lit ? 4 : POOL_LAMP_MIN_TILES)) {
    const cand = [];
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const i0 = z * 16 + x;
      if (L.tiles[i0] !== DEEP && !pit(i0)) continue;
      for (let d = 0; d < 4; d++) {
        const [M, j] = cellAt(x + DIRS[d][0], z + DIRS[d][1]), nt = M.tiles[j];
        // round an abyss only the walkway at its level has a wall to set a lamp in (boards stand clear above the water)
        if ((nt === FLOOR && (L.tiles[i0] === DEEP || M.h[j] - WB < 0.05)) || nt === WALL) cand.push({ x, z, d, h: hash01(ox + x, oz + z, 40 + d) });
      }
    }
    cand.sort((a, b) => a.h - b.h);
    for (const c of cand) {
      if (poolLamps.length >= (lit ? 6 : 4)) break;
      const [dx, dz] = DIRS[c.d];
      const px = ox + c.x + 0.5 + dx * 0.5, pz = oz + c.z + 0.5 + dz * 0.5;
      if (poolLamps.some((l) => Math.hypot(l.wx - px, l.wz - pz) < (lit ? 3.5 : 4.5))) continue;
      poolLamps.push({ wx: px, wz: pz, x: px - dx * 0.015, z: pz - dz * 0.015, y: groundWater(L, c.z * 16 + c.x) - 0.7, nx: -dx, nz: -dz });
    }
  }
  // light the lamps throw on the tiles round them (baked into the vertices of pool walls and floors)
  const poolGlow = poolLamps.length ? (x, y, z) => {
    let r = 0;
    for (const l of poolLamps) { const t = Math.max(0, 1 - Math.hypot(x - l.x, (y - l.y) * 0.8, z - l.z) / (lit ? 5.5 : 2.8)); r += t * t; }
    if (lit) { r = Math.min(2, r); return [0.4 * r, 0.8 * r, 0.9 * r]; }   // light from below climbs the walls, nothing fades at the water line
    r = Math.min(1.3, r) * Math.min(1, Math.max(0.1, ((DEEP_WATER + WB) + 0.1 - y) / 0.6));   // fades above the water line
    return [0.1 * r, 0.62 * r, 0.7 * r];
  } : null;
  const glowed = (c, x, y, z) => (poolGlow ? addc(c, poolGlow(x, y, z)) : c);
  yield;
  const keyList = [];
  const keys = new Int16Array(256).fill(-1);
  for (let i = 0; i < 256; i++) {
    const t = L.tiles[i];
    if (t === WALL || t === RAMP || t === VOID) continue;
    const kind = t === SHALLOW ? 'p' : t === DEEP ? (L.form[i] & FORM_LOW ? 'e' : 'd') : 'f';   // e: a deep pool lowered by LOW_DROP
    const name = kind + ':' + L.h[i].toFixed(2);
    let k = keyList.indexOf(name);
    if (k < 0) { k = keyList.length; keyList.push(name); }
    keys[i] = k;
  }
  greedyRects(keys, (x, z, w, d, k) => {
    const [kind, h] = keyList[k].split(':');
    const base = tint(kind === 'f' ? COL.floor : COL.pool, zm);
    st.lvl = kind === 'f' ? NaN : (DEEP_WATER + WB) - (kind === 'e' ? LOW_DROP : 0);
    st.flatCells(ox + x, oz + z, ox + x + w, oz + z + d, +h, kind === 'd' || kind === 'e' ? (px, pz) => glowed(shade(tint(deepCol(px, pz), zm), px, pz), px, +h, pz)
      : kind === 'p' || lit ? (px, pz) => glowed(shade(base, px, pz), px, +h, pz) : (px, pz) => shade(base, px, pz));
    st.lvl = NaN;
  });

  yield;
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
    st.lvl = L.wet[i] ? (DEEP_WATER + WB) : NaN;
    for (let k = 0; k < 3; k++) {
      const f0 = k / 3, f1 = (k + 1) / 3, yPrev = h + rise * f0, y = h + rise * f1;
      const a = P(f0, 0, y), b = P(f0, 1, y), c = P(f1, 1, y), e = P(f1, 0, y);
      st.face([...a, ...b, ...c, ...e], [0, 1, 0], [TILE_UV, TILE_UV], shade(base, a[0], a[2]), shade(base, b[0], b[2]), shade(base, c[0], c[2]), shade(base, e[0], e[2]));
      const ra = P(f0, 0, yPrev), rb = P(f0, 1, yPrev);
      st.face([...ra, ...rb, ...b, ...a], [-rdx, 0, -rdz], [TILE_UV, TILE_UV], mul(shade(base, ra[0], ra[2]), 0.82));
    }
    st.lvl = NaN;
  }

  yield;
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
  // teal-blue, richer and more opaque the deeper the pool; lit like the floor under it
  const poolDist = (x, z) => {   // metres inside an abyss pool at a world point (negative: outside it)
    const P = L.mega;
    if (!P || P.type !== 'abyss') return -9;
    if (P.round) return P.poolR - Math.hypot(x - P.cx, z - P.cz);
    return Math.min(x - P.rect[0], P.rect[2] - x, z - P.rect[1], P.rect[3] - z);
  };
  const litW = (x, z) => {
    const m = groundLight(corner(x, z)), pd = poolDist(x, z);
    // an abyss pool: ink-blue water with only the skylight's faint glint on it
    if (pd > -1) return [...addc(mul(ABYSS_WATER_COL, 0.55 + 0.45 * m), mul([0.3, 0.38, 0.42], sunAt(x, z))), 0.97];
    const t = deepT(x, z), c = mul(mix(WATER_SHALLOW, WATER_DEEP, t), 0.55 + 0.45 * m);
    return lit ? [...mix(c, [0.9, 1, 1], 0.7), Math.max(0.88, 0.5 + 0.38 * t)] : [...c, 0.5 + 0.38 * t]; };   // a lit room's water is whitish
  greedyRects(wkeys, (x, z, w, d, k) => water.flatCells(ox + x, oz + z, ox + x + w, oz + z + d, levels[k], litW, true, 0.25));

  // underwater lamps: a soft halo and a bright core, drawn in the water mesh so the surface cannot wash them out
  for (const l of poolLamps) {
    const uv0 = [0, 0, 0, 0, 0, 0, 0, 0];
    water.discV(l.x + l.nx * 0.025, l.y, l.z + l.nz * 0.025, l.nx, l.nz, lit ? 2.2 : 1.3, uv0, lit ? [0.8, 1.6, 1.8, 0.55] : [0.35, 1.2, 1.4, 0.4], [0.35, 1.2, 1.4, 0]);
    water.discV(l.x + l.nx * 0.035, l.y, l.z + l.nz * 0.035, l.nx, l.nz, 0.3, uv0, [0.8, 1.9, 2.1, 0.95]);
  }

  yield;
  // ---------- wet patches: faint bluish-white sheen on walkways, pool rims and stair treads ----------
  {
    const spots = [];   // [weight, tile index]
    let total = 0;
    for (let i = 0; i < 256; i++) {
      const t = L.tiles[i];
      if ((t !== FLOOR && t !== RAMP) || L.block[i] || L.wet[i]) continue;   // no sheen on floor already under water
      let wgt = t === RAMP ? 1.5 : 1;
      if (t === FLOOR) for (const [dx, dz] of DIRS) {
        const [M, j] = cellAt((i & 15) + dx, (i >> 4) + dz);
        if (M.tiles[j] === SHALLOW || M.tiles[j] === DEEP) wgt = 4;
      }
      spots.push([wgt, i]); total += wgt;
    }
    const count = spots.length ? 3 + Math.floor(hash01(ox, oz, 9) * 4) : 0;
    for (let n = 0; n < count; n++) {
      let pick = hash01(ox, oz, 100 + n) * total, at = spots[0][1];
      for (const [wgt, i] of spots) { pick -= wgt; at = i; if (pick <= 0) break; }
      const x = at & 15, z = at >> 4, t = L.tiles[at];
      let cx = ox + x + 0.5, cz = oz + z + 0.5, y, r;
      if (t === RAMP) {   // the middle tread
        const dir = L.rdir[at], f = dir === 0 ? 0.5 : dir === 1 ? -0.5 : 0, g2 = dir === 2 ? 0.5 : dir === 3 ? -0.5 : 0;
        cx += f; cz += g2; y = L.h[at] + L.rise[at] * (2 / 3) + 0.015; r = 0.25;
      } else {
        y = L.h[at] + 0.015;
        let open = true;   // a bigger puddle only where the 3 × 3 tiles round it are one flat floor
        for (let dz = -1; dz <= 1 && open; dz++) for (let dx = -1; dx <= 1 && open; dx++) {
          const [M, j] = cellAt(x + dx, z + dz);
          open = M.tiles[j] === FLOOR && Math.abs(M.h[j] - L.h[at]) < 1e-4;
        }
        r = open ? 0.55 + hash01(ox, oz, 200 + n) * 0.45 : 0.38;
        if (open) { cx += (hash01(ox, oz, 300 + n) - 0.5) * 0.3; cz += (hash01(ox, oz, 400 + n) - 0.5) * 0.3; }
      }
      const rot = hash01(ox, oz, 500 + n) * 6.28, c = shade(WET_SHEEN, cx, cz), uv = [cx * 0.25, cz * 0.25];
      water.blob(cx, cz, r * (1 + 0.3 * hash01(ox, oz, 600 + n)), r, y, rot, [uv[0], uv[1], uv[0], uv[1], uv[0], uv[1], uv[0], uv[1]], c, 0.32);
    }
  }

  yield;
  // ---------- walls, ledges and stair sides (each face drawn once: by the wall, or by the higher tile) ----------
  const wallC = tint(COL.wall, zm), wallLow = tint(COL.wallLow, zm), poolC = tint(COL.poolWall, zm), BLACK = [0, 0, 0];
  // light at a wall face's ends is read half a metre out on the open side, so the wall fades with the floor
  const ADJ = DIRS.map(([ddx, ddz]) => (px, pz) => darkF(px - ox + ddx * 0.45, pz - oz + ddz * 0.45));
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = z * 16 + x, t = L.tiles[i];
    if (t === VOID) continue;
    for (let d = 0; d < 4; d++) {
      const dx = DIRS[d][0], dz = DIRS[d][1], nx = x + dx, nz = z + dz;
      let M = L, j = nz * 16 + nx;
      if (!inside(nx, nz)) [M, j] = world.cellOf(ox + nx, oz + nz);
      const nt = M.tiles[j];
      if (nt === WALL) continue;
      if (t === WALL && (L.form[i] & FORM_CYL)) continue;   // a column: drawn whole below
      // shared edge end points (world) and points nudged into each side
      const ex0 = ox + x + (dx > 0 ? 1 : 0), ez0 = oz + z + (dz > 0 ? 1 : 0);
      const ex1 = dx ? ex0 : ex0 + 1, ez1 = dx ? ez0 + 1 : ez0;
      if (nt === VOID) {   // the edge of an abyss: a curtain dropping into the dark off the walkway, a thin fascia under a board
        if (t === WALL) continue;
        const a0 = floorTop(L, i, ex0 - dx * 0.01, ez0 - dz * 0.01), a1 = floorTop(L, i, ex1 - dx * 0.01, ez1 - dz * 0.01);
        if (a0 === null) continue;
        const mx = (ex0 + ex1) / 2, mz = (ez0 + ez1) / 2, c = shade(poolC, mx, mz);
        if (Math.max(a0, a1) - WB < 0.05) {
          const wl = [a0 - PIT_LIT, a1 - PIT_LIT], mid = [a0 - PIT_LIT - PIT_FADE, a1 - PIT_LIT - PIT_FADE], bot = WB - PIT_DEPTH, glow = M.wet[j] === 1 ? poolGlow : null;
          if (dx) { ab.wallX(ex0, ez0, ez1, wl, [a0, a1], dx, c, c, ADJ[d], glow); ab.wallX(ex0, ez0, ez1, mid, wl, dx, BLACK, c, ADJ[d], glow); ab.wallX(ex0, ez0, ez1, bot, mid, dx, BLACK, BLACK); }
          else { ab.wallZ(ez0, ex0, ex1, wl, [a0, a1], dz, c, c, ADJ[d], glow); ab.wallZ(ez0, ex0, ex1, mid, wl, dz, BLACK, c, ADJ[d], glow); ab.wallZ(ez0, ex0, ex1, bot, mid, dz, BLACK, BLACK); }
        } else if (dx) st.wallX(ex0, ez0, ez1, [a0 - 0.3, a1 - 0.3], [a0, a1], dx, mul(c, 0.7), c);
        else st.wallZ(ez0, ex0, ex1, [a0 - 0.3, a1 - 0.3], [a0, a1], dz, mul(c, 0.7), c);
        continue;
      }
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
          st.lvl = (DEEP_WATER + WB);
          st.face(q, [0, 1, 0], [TILE_UV, TILE_UV], shade(tint(COL.pool, zm), ex0, ez0), shade(tint(COL.pool, zm), ex1, ez1),
            shade(tint(deepCol(ex1 + dx, ez1 + dz), zm), ex1, ez1), shade(tint(deepCol(ex0 + dx, ez0 + dz), zm), ex0, ez0));
          st.lvl = NaN;
          continue;
        }
      }
      const wi = groundWater(L, i), wj = groundWater(M, j);
      st.lvl = wi === wi ? wi : wj;   // the part of the face under the pool's water gets caustics
      const wet = st.lvl === st.lvl;
      if (dx) st.wallX(ex0, ez0, ez1, lo, hi, dx, cb, ct, ADJ[d], wet || lit ? poolGlow : null);
      else st.wallZ(ez0, ex0, ex1, lo, hi, dz, cb, ct, ADJ[d], wet || lit ? poolGlow : null);
      st.lvl = NaN;
    }
  }

  // rounded pool corners: the cut-off part of the corner tile is filled back in up to the rim, with a curved pool wall
  for (let i = 0; i < 256; i++) {
    if (L.tiles[i] !== DEEP || !L.corner[i]) continue;
    const [sx, sz] = cornerDir(L.corner[i]), X = ox + (i % 16), Z = oz + ((i / 16) | 0);
    const cxw = X + (sx > 0 ? 0 : 1), czw = Z + (sz > 0 ? 0 : 1), Ox = X + (sx > 0 ? 1 : 0), Oz = Z + (sz > 0 ? 1 : 0);
    const rim = L.rim[i], bottom = L.h[i], wetRim = (L.form[i] & FORM_RIMWET) !== 0, N = 6;
    const rimBase = tint(wetRim ? COL.pool : COL.floor, zm);
    const arc = [];
    for (let k = 0; k <= N; k++) { const a = (k / N) * Math.PI / 2; arc.push([cxw + sx * Math.cos(a), czw + sz * Math.sin(a)]); }
    st.lvl = wetRim ? (DEEP_WATER + WB) : NaN;
    for (let k = 0; k < N; k++) {
      const p = arc[k], q = arc[k + 1];
      st.facing([Ox, rim, Oz, p[0], rim, p[1], q[0], rim, q[1], q[0], rim, q[1]], [0, 1, 0], [Ox, Oz, p[0], p[1], q[0], q[1], q[0], q[1]],
        shade(rimBase, Ox, Oz), shade(rimBase, p[0], p[1]), shade(rimBase, q[0], q[1]), shade(rimBase, q[0], q[1]));
    }
    st.lvl = groundWater(L, i);
    for (let k = 0; k < N; k++) {
      const p = arc[k], q = arc[k + 1], c0 = shade(poolC, p[0], p[1]), c1 = shade(poolC, q[0], q[1]);
      st.facing([p[0], bottom, p[1], q[0], bottom, q[1], q[0], rim, q[1], p[0], rim, p[1]], [cxw - (p[0] + q[0]) / 2, 0, czw - (p[1] + q[1]) / 2],
        [k * 0.52, bottom, (k + 1) * 0.52, bottom, (k + 1) * 0.52, rim, k * 0.52, rim], mul(c0, 0.8), mul(c1, 0.8), c1, c0);
    }
    st.lvl = NaN;
  }

  // columns: a 12-sided shaft standing on the lowest floor round it (a tile's width, so the walk-around collision is the tile)
  for (let i = 0; i < 256; i++) {
    if (L.tiles[i] !== WALL || !(L.form[i] & FORM_CYL)) continue;
    const x = i % 16, z = (i / 16) | 0;
    let base = Infinity, wet = NaN;
    for (let d = 0; d < 4; d++) {
      const [M, j] = cellAt(x + DIRS[d][0], z + DIRS[d][1]);
      const f = M.tiles[j] === WALL ? null : floorTop(M, j, ox + x + 0.5, oz + z + 0.5);
      if (f !== null && f < base) base = f;
      const w = groundWater(M, j);
      if (w === w && wet !== wet) wet = w;
    }
    if (base === Infinity) continue;
    st.lvl = wet;
    shaft(st, ox + x + 0.5, oz + z + 0.5, 0.5, base, ceil, wallLow, wallC, (px, pz) => darkF(px - ox, pz - oz));
    st.lvl = NaN;
  }

  yield;
  // the bottom of an abyss: black, whatever the fog
  {
    const pk = new Int16Array(256).fill(-1);
    for (let i = 0; i < 256; i++) if (L.tiles[i] === VOID) pk[i] = 0;
    greedyRects(pk, (x, z, w, d) => ab.flat(ox + x, oz + z, ox + x + w, oz + z + d, WB - PIT_DEPTH, BLACK));
  }

  yield;
  // ---------- ceiling, low ceilings over dark corridors, outward bands ----------
  const ceilC = mul(L.cold ? mul(tint(COL.ceil, zm), B1_DIM) : tint(COL.ceil, zm), lit ? 0.35 : 1), bandC = tint(COL.band, zm);
  {   // the main ceiling, 4 × 4 cells: its vertices darken where walls crowd in, so corners are not a flat grey
    const cc = (x, z) => {
      let walls = 0;
      for (let b = -2; b < 2; b++) for (let a = -2; a < 2; a++) { const [M, j] = cellAt(x + a, z + b); if (M.tiles[j] === WALL) walls++; }
      const k = 1 - 0.3 * (walls / 16);
      return [ceilC[0] * k * (COLD[0] + (1 - COLD[0]) * k), ceilC[1] * k * (COLD[1] + (1 - COLD[1]) * k), ceilC[2] * k * (COLD[2] + (1 - COLD[2]) * k)];
    };
    for (let cz = 0; cz < 16; cz += 4) for (let cx = 0; cx < 16; cx += 4) {
      const x0 = ox + cx, z0 = oz + cz, x1 = x0 + 4, z1 = z0 + 4;
      st.quad([x0, ceil, z0, x1, ceil, z0, x1, ceil, z1, x0, ceil, z1], [x0, z0, x1, z0, x1, z1, x0, z1], cc(cx, cz), cc(cx + 4, cz), cc(cx + 4, cz + 4), cc(cx, cz + 4));
    }
  }
  // beside a mega room the band reaches its ceiling, so its tall wall has no gap above this chunk's walls
  const bandTop = (ddx, ddz) => {
    const Nb = L.kind === 'mega' ? L : world.layout(L.cx + ddx, L.cz + ddz);
    return Nb.kind === 'mega' && Nb !== L ? Math.max(ceil + 4.5, Nb.ceilFixed + (Nb.baseY || 0) + 0.3) : ceil + 4.5;
  };
  st.wallX(ox, oz, oz + 16, ceil, bandTop(-1, 0), -1, bandC, bandC);
  st.wallX(ox + 16, oz, oz + 16, ceil, bandTop(1, 0), 1, bandC, bandC);
  st.wallZ(oz, ox, ox + 16, ceil, bandTop(0, -1), -1, bandC, bandC);
  st.wallZ(oz + 16, ox, ox + 16, ceil, bandTop(0, 1), 1, bandC, bandC);
  const tileTopMax = (M, j) => (M.tiles[j] === RAMP ? M.h[j] + M.rise[j] : M.h[j]);
  const ceilOf = (M, j, mCeil) => {
    let c = mCeil;
    if (covered(M, j)) c = Math.min(c, bottomY(M, j));
    if (M.low[j] && M.tiles[j] !== WALL) {
      if (M.form[j] & (FORM_ARCH | FORM_CROWN)) c = Math.min(c, vaultBase(M, j) + (M.form[j] & FORM_ARCH ? VAULT_SPRING : VAULT_CROWN));
      else c = Math.min(c, Math.max(tileTopMax(M, j), M.tiles[j] === SHALLOW ? M.h[j] + SHALLOW_DEPTH : 0) + HEADROOM);
    }
    return c;
  };
  // the level a vault springs from: the dry floor, or the water over a shallow lane, whichever is higher, never under the chunk's own floor
  const vaultBase = (M, j) => Math.max(tileTopMax(M, j), M.baseY || 0, M.tiles[j] === SHALLOW ? M.h[j] + SHALLOW_DEPTH : -Infinity);
  yield;
  const lowC = mul(ceilC, 0.8);
  // a corridor tile under a barrel vault: half of the vault's cross-section (the other half is the paired tile), swept along the
  // corridor, plus the wall that closes the gap above the arch where the next tile's ceiling is higher
  const QUARTER = archPoints().slice(0, 4).map(([u, v]) => [u / ARCH_R * VAULT_R, v / ARCH_R * VAULT_R]);   // wall → crown
  const vaultTile = (x, z, i) => {
    const zRun = (L.form[i] & FORM_ARCH_Z) !== 0;
    const [PM, pj] = cellAt(zRun ? x + 1 : x, zRun ? z : z + 1);
    const first = PM.tiles[pj] !== WALL && (PM.form[pj] & FORM_ARCH) !== 0 && ((PM.form[pj] & FORM_ARCH_Z) !== 0) === zRun;   // the pair lies on the + side: this is the - half
    const pts = first ? QUARTER : QUARTER.map(([u, v]) => [-u, v]).reverse();
    const sy = vaultBase(L, i) + VAULT_SPRING, cc = (zRun ? ox + x : oz + z) + (first ? 1 : 0);
    const a0 = (zRun ? oz + z : ox + x), a1 = a0 + 1;
    const light = (px, pz) => darkF(px - ox, pz - oz) * (L.cold ? B1_DIM : 1);
    const P = (along, u, v) => (zRun ? [cc + u, sy + v, along] : [along, sy + v, cc + u]);
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], mu = (a[0] + b[0]) / 2, mv = (a[1] + b[1]) / 2;
      const q = [...P(a0, a[0], a[1]), ...P(a0, b[0], b[1]), ...P(a1, b[0], b[1]), ...P(a1, a[0], a[1])];
      const col = (px, pz, v) => mul(lowC, light(px, pz) * (0.8 + 0.2 * v));
      st.facing(q, zRun ? [-mu, -mv, 0] : [0, -mv, -mu], [a0, k * 0.5, a0, (k + 1) * 0.5, a1, (k + 1) * 0.5, a1, k * 0.5],
        col(q[0], q[2], a[1]), col(q[3], q[5], b[1]), col(q[6], q[8], b[1]), col(q[9], q[11], a[1]));
    }
    for (const sgn of [-1, 1]) {   // the ends: the arch against a higher ceiling
      const nx = x + (zRun ? 0 : sgn), nz = z + (zRun ? sgn : 0);
      const [M, j] = cellAt(nx, nz);
      if (M.tiles[j] === WALL || ((M.form[j] & FORM_ARCH) && ((M.form[j] & FORM_ARCH_Z) !== 0) === zRun)) continue;
      const yn = ceilOf(M, j, ceil);
      if (yn <= sy + 0.01) continue;
      const plane = (zRun ? oz + z : ox + x) + (sgn > 0 ? 1 : 0);
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1], lo = [sy + a[1], sy + b[1]], hi = [Math.max(yn, lo[0]), Math.max(yn, lo[1])];
        if (zRun) st.wallZ(plane, cc + a[0], cc + b[0], lo, hi, sgn, lowC, lowC, light);
        else st.wallX(plane, cc + a[0], cc + b[0], lo, hi, sgn, lowC, lowC, light);
      }
    }
  };
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = z * 16 + x;
    if (!L.low[i] || L.tiles[i] === WALL) continue;
    if (L.form[i] & FORM_ARCH) { vaultTile(x, z, i); continue; }
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

  yield;
  // ---------- small doorways under a half-round arch (the doors where chunks meet stay square) ----------
  {
    const pts = archPoints(), lightAt2 = (px, pz) => darkF(px - ox, pz - oz) * (L.cold ? B1_DIM : 1);
    const arcLen = [0];
    for (let k = 1; k < pts.length; k++) arcLen.push(arcLen[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    for (let z = 1; z < 15; z++) for (let x = 1; x < 15; x++) {
      const i = z * 16 + x, axis = doorwayAxis(L, cellAt, x, z);
      if (axis < 0 || L.low[i] || up) continue;   // two-floor rooms keep square doors: the upper walls stand in the same planes
      const f = L.h[i], top = ceilOf(L, i, ceil), spring = archSpring(top - f);
      if (spring < 0) continue;
      const cx = ox + x + 0.5, cz = oz + z + 0.5, sy = f + spring;
      // the soffit: the half circle swept along the passage, facing the middle of the opening
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (axis === 1) {
          const z0 = oz + z, z1 = oz + z + 1, c0 = mul(wallC, lightAt2(cx + a[0], z0)), c1 = mul(wallC, lightAt2(cx + b[0], z0)), c2 = mul(wallC, lightAt2(cx + b[0], z1)), c3 = mul(wallC, lightAt2(cx + a[0], z1));
          st.facing([cx + a[0], sy + a[1], z0, cx + b[0], sy + b[1], z0, cx + b[0], sy + b[1], z1, cx + a[0], sy + a[1], z1], [-mx, -my, 0],
            [z0, arcLen[k], z0, arcLen[k + 1], z1, arcLen[k + 1], z1, arcLen[k]], c0, c1, c2, c3);
        } else {
          const x0 = ox + x, x1 = ox + x + 1, c0 = mul(wallC, lightAt2(x0, cz + a[0])), c1 = mul(wallC, lightAt2(x0, cz + b[0])), c2 = mul(wallC, lightAt2(x1, cz + b[0])), c3 = mul(wallC, lightAt2(x1, cz + a[0]));
          st.facing([x0, sy + a[1], cz + a[0], x0, sy + b[1], cz + b[0], x1, sy + b[1], cz + b[0], x1, sy + a[1], cz + a[0]], [0, -my, -mx],
            [cz + a[0], arcLen[k], cz + b[0], arcLen[k + 1], cz + b[0], arcLen[k + 1], cz + a[0], arcLen[k]], c0, c1, c2, c3);
        }
      }
      // the wall over the opening, on each end of a run of doorways (between two of them it would be inside the stone)
      for (const sgn of [-1, 1]) {
        const nx = x + (axis === 0 ? sgn : 0), nz = z + (axis === 1 ? sgn : 0);
        if (doorwayAxis(L, cellAt, nx, nz) === axis && !L.low[nz * 16 + nx]) continue;
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k], b = pts[k + 1], lo = [sy + a[1], sy + b[1]], hi = [top, top];
          if (axis === 1) st.wallZ(sgn < 0 ? oz + z : oz + z + 1, cx + a[0], cx + b[0], lo, hi, sgn, wallC, wallC, lightAt2);
          else st.wallX(sgn < 0 ? ox + x : ox + x + 1, cz + a[0], cz + b[0], lo, hi, sgn, wallC, wallC, lightAt2);
        }
      }
    }
  }

  yield;
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
      st.lvl = +t === SHALLOW ? +h + SHALLOW_DEPTH : NaN;
      st.flatCells(ox + x, oz + z, ox + x + w, oz + z + d, +h, (px, pz) => shadeUp(tint(+t === SHALLOW ? COL.pool : COL.floor, zm), px, pz));
      st.lvl = NaN;
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
        st.lvl = t === FLOOR && nt === SHALLOW ? M.up.h[j] + SHALLOW_DEPTH : NaN;
        if (dx) st.wallX(ex, ez, ez + 1, y0, y1, dx, c, c2);
        else st.wallZ(ez, ex, ex + 1, y0, y1, dz, c, c2);
        st.lvl = NaN;
      }
    }
  }

  yield;
  // ---------- spirals ----------
  const railC = mix(COL.paint, COL.rust, Math.min(1, T * 0.95));
  for (const s of L.spirals) if (s.own) buildSpiral(st, s, ceil, tint(COL.floor, zm), wallC, railC, shade);

  yield;
  // ---------- rails, bars, pillars ----------
  for (const rl of L.rails) {
    const rust = mix(railC, COL.rust, hash01(rl.x0, rl.z0, 3) * T * 0.6);
    // one post per segment (the neighbouring segment brings the other), a top rail, thin balusters
    const RH = rl.h ?? RAIL_H;   // a half-sunk fence in a deep pool is taller than a rail
    const top0 = [rl.x0, rl.y0 + RH, rl.z0], top1 = [rl.x1, rl.y1 + RH, rl.z1];
    st.beam([rl.x0, rl.y0, rl.z0], top0, 0.05, rust);
    st.beam(top0, top1, 0.05, rust);
    const nx = rl.z1 - rl.z0, nz = rl.x0 - rl.x1;   // normal of the rail's plane
    for (const f of [0.25, 0.5, 0.75]) {
      const bx = rl.x0 + (rl.x1 - rl.x0) * f, bz = rl.z0 + (rl.z1 - rl.z0) * f, by = rl.y0 + (rl.y1 - rl.y0) * f;
      st.bar(bx, bz, by, by + RH, nx, nz, 0.03, rust);
    }
  }
  yield;
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

  yield;
  // ---------- slide tubes ----------
  for (const s of L.slides) buildTube(st, s, T);

  yield;
  // ---------- lamps (ceiling panels), windows, signs: all in the atlas-textured lamp mesh ----------
  const W = ATLAS_WHITE;
  const lampY = (l) => {
    if (l.y !== undefined) return l.y;
    const cx = Math.min(15, Math.floor(l.x + l.w / 2)), cz = Math.min(15, Math.floor(l.z + l.d / 2)), i = cz * 16 + cx;
    if (L.form[i] & FORM_ARCH) return vaultBase(L, i) + VAULT_SPRING + Math.sqrt(VAULT_R * VAULT_R - 0.25) - 0.01;   // a lamp 1 m wide hangs where the vault is 0.5 m off its crown line
    return ceilOf(L, i, ceil) - 0.02;
  };
  const WHITE_UV = [W[0], W[1], W[0], W[1], W[0], W[1], W[0], W[1]];
  const round = L.lampShape === 'round';
  const lampQuad = (l, y, col) => {
    if (round) {   // a disc is drawn whole by the chunk its centre is in, even when the lamp crosses a chunk edge
      const f = l.full || l, cx = f.x + f.w / 2, cz = f.z + f.d / 2;
      if (cx >= 0 && cz >= 0 && cx < 16 && cz < 16) lamps.disc(ox + cx, oz + cz, Math.min(f.w, f.d) / 2, y, WHITE_UV, col);
      return;
    }
    const x0 = ox + l.x, z0 = oz + l.z, x1 = x0 + l.w, z1 = z0 + l.d;
    lamps.quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], WHITE_UV, col);
  };
  for (const l of L.lamps) lampQuad(l, lampY(l), mul(LAMP_COL[l.k], L.dark[Math.min(15, l.z) * 16 + Math.min(15, l.x)] === 1 ? 0.55 : 1));
  for (const l of extraLamps) lampQuad(l, lampY(l), l.color);
  for (const l of L.upLamps) lampQuad(l, ceil - 0.02, LAMP_COL[l.k]);
  for (const b of L.suns) {
    if (b.own === false) continue;   // a patch shared by several chunks of a mega room lights each, one chunk draws it
    const bright = [1.25, 1.2, 1.05];
    if (b.sky) {
      // a skylight: bright opening in the ceiling with a dark frame round it
      const y = ceil - 0.03, hw = b.w / 2, hd = b.d / 2, f = FRAME_W;
      lamps.quad([b.wx - hw, y, b.wz - hd, b.wx + hw, y, b.wz - hd, b.wx + hw, y, b.wz + hd, b.wx - hw, y, b.wz + hd], WHITE_UV, [1.2, 1.15, 1.0]);
      for (const [x0, z0, x1, z1] of [[-hw - f, -hd - f, hw + f, -hd], [-hw - f, hd, hw + f, hd + f], [-hw - f, -hd, -hw, hd], [hw, -hd, hw + f, hd]]) {
        lamps.quad([b.wx + x0, y, b.wz + z0, b.wx + x1, y, b.wz + z0, b.wx + x1, y, b.wz + z1, b.wx + x0, y, b.wz + z1], WHITE_UV, FRAME_COL);
      }
    } else {
      // a window in a solid wall: bright pane inside a dark frame, the beam leaves from the pane
      const R = [b.nz, 0, -b.nx], hw = 0.6, hh = 0.45, f = FRAME_W, off = 0.015;
      const cx = b.wx + b.nx * off, cz = b.wz + b.nz * off;
      const wq = (u0, v0, u1, v1, col) => lamps.quad([cx + R[0] * u0, b.wy + v0, cz + R[2] * u0, cx + R[0] * u1, b.wy + v0, cz + R[2] * u1,
        cx + R[0] * u1, b.wy + v1, cz + R[2] * u1, cx + R[0] * u0, b.wy + v1, cz + R[2] * u0], WHITE_UV, col);
      // an arched window: a rectangle topped by a half circle, framed all round
      const pq = (u0, v0, u1, v1, u2, v2, u3, v3, col) => lamps.quad([cx + R[0] * u0, b.wy + v0, cz + R[2] * u0, cx + R[0] * u1, b.wy + v1, cz + R[2] * u1,
        cx + R[0] * u2, b.wy + v2, cz + R[2] * u2, cx + R[0] * u3, b.wy + v3, cz + R[2] * u3], WHITE_UV, col);
      wq(-hw, -hh, hw, hh, bright);
      wq(-hw - f, -hh - f, hw + f, -hh, FRAME_COL);
      wq(-hw - f, -hh, -hw, hh, FRAME_COL); wq(hw, -hh, hw + f, hh, FRAME_COL);
      const arc = archPoints().map(([u, v]) => [u * (hw / ARCH_R), v * (hw / ARCH_R)]);   // half circle of radius hw
      for (let k = 0; k < arc.length - 1; k++) {
        const p = arc[k], q = arc[k + 1], po = [p[0] * (1 + f / hw), p[1] * (1 + f / hw)], qo = [q[0] * (1 + f / hw), q[1] * (1 + f / hw)];
        pq(0, hh, q[0], hh + q[1], p[0], hh + p[1], 0, hh, bright);
        pq(q[0], hh + q[1], qo[0], hh + qo[1], po[0], hh + po[1], p[0], hh + p[1], FRAME_COL);
      }
    }
    buildBeam(sun, b, ceil, (x, z) => world.floorAt(x, z) ?? 0);
  }
  yield;
  const signQuad = (s, cell, mirror = false) => {
    const [u0, v0, u1, v1] = cellUV(cell);
    const R = [s.nz, 0, -s.nx], hw = s.w / 2, hh = s.h / 2;
    const c = [s.x + s.nx * 0.015, s.y, s.z + s.nz * 0.015];
    const m = lightAt(allLamps, s.x - ox, s.z - oz, floods) * darkF(s.x - ox + s.nx * 0.5, s.z - oz + s.nz * 0.5) * 0.9 + 0.1;
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
    static: st.geometry(), lamps: lamps.geometry(), water: water.geometry(), sun: sun.geometry(), abyss: ab.geometry(),
    floaters: L.floaters, guide: guideSigns.length > 0, poolLamps,
  };
}

// a 12-sided column of radius r (corner to centre) from y0 to y1; light(x, z) scales both ends of every face
function shaft(st, cx, cz, r, y0, y1, cb, ct, light) {
  const SIDES = 12;
  for (let k = 0; k < SIDES; k++) {
    const a0 = (k / SIDES) * Math.PI * 2, a1 = ((k + 1) / SIDES) * Math.PI * 2;
    const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r, x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
    const f0 = light(x0, z0), f1 = light(x1, z1), u0 = k * 0.5176 * r * 2, u1 = (k + 1) * 0.5176 * r * 2;
    // outward-facing: from the later corner back to the earlier one
    st.quad([x1, y0, z1, x0, y0, z0, x0, y1, z0, x1, y1, z1], [u1, y0, u0, y0, u0, y1, u1, y1],
      mul(cb, f1), mul(cb, f0), mul(ct, f0), mul(ct, f1));
  }
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

// closed round tube along the slide's centreline: outside and inside faces, coloured bands every 0.7 m. Colours are
// shaded per vertex from the surface normal, so the 14-sided section reads as a smooth round pipe
const TUBE_SEGS = 14;
function buildTube(st, s, T) {
  const base = mix(SLIDE_COLORS[s.color], COL.brown, Math.min(0.85, T * 0.8));
  const pts = s.pts, segs = TUBE_SEGS, U = [0.06, 0.06];
  const rings = [];
  let along = 0;
  for (let k = 0; k < pts.length; k++) {
    if (k) along += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]);
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // side vector (horizontal, perpendicular) and up vector
    let sx = -tz, sz = tx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
    const ux = ty * sz, uy = tz * sx - tx * sz, uz = -ty * sx;   // t × side
    const band = Math.floor(along / 0.7) % 2 ? 0.86 : 1;
    const ring = [];
    for (let j = 0; j < segs; j++) {
      const a2 = (j / segs) * Math.PI * 2, c = Math.cos(a2), sn = Math.sin(a2);
      const nx = sx * c + ux * sn, ny = uy * sn, nz = sz * c + uz * sn;
      ring.push({
        p: [pts[k][0] + nx * TUBE_R, pts[k][1] + ny * TUBE_R, pts[k][2] + nz * TUBE_R], n: [nx, ny, nz],
        out: mul(base, band * (0.72 + 0.28 * Math.max(0, ny))), inn: mul(base, band * 0.62),
      });
    }
    rings.push(ring);
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < segs; j++) {
      const a = rings[k][j], b = rings[k][(j + 1) % segs], c = rings[k + 1][(j + 1) % segs], d = rings[k + 1][j];
      const n = [(a.n[0] + b.n[0]) / 2, (a.n[1] + b.n[1]) / 2, (a.n[2] + b.n[2]) / 2];
      const p = [...a.p, ...b.p, ...c.p, ...d.p];
      st.face(p, n, U, a.out, b.out, c.out, d.out);
      st.face(p, [-n[0], -n[1], -n[2]], U, a.inn, b.inn, c.inn, d.inn);
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
  const hw = (b.beamW ?? b.w) / 2, hd = (b.beamD ?? b.d) / 2;   // a mega room's big skylight sends down only a small shaft
  if (b.sky) {
    // straight down from the opening onto the lit patch under it
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      top.push([b.wx + a * hw, ceil - 0.04, b.wz + c * hd]);
      bot.push([b.x + a * hw, floorAt(b.x, b.z) + 0.02, b.z + c * hd]);
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
    buf.quad([...a, ...c, ...d, ...e], [0, 1, 1, 1, 1, 0, 0, 0], ct, ct, cbm, cbm);   // u runs across the face: bright middle, soft edges (beam texture)
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

// Turns a chunk layout into 3 merged geometries: static tiles, ceiling lamps, water.
// Lighting is baked into vertex colours; materials are unlit (MeshBasicMaterial).
import * as THREE from 'three';
import { CHUNK, FLOOR, WALL, SHALLOW, DEEP, SHALLOW_DEPTH, DEEP_WATER } from './world.js';

const CEIL_MAX = 9;
const COL = {
  floor: [1, 0.985, 0.955], pool: [0.55, 0.82, 0.97], deep: [0.18, 0.4, 0.62],
  wall: [0.93, 0.935, 0.93], wallLow: [0.66, 0.69, 0.71], poolWall: [0.5, 0.76, 0.92],
  ceil: [0.74, 0.77, 0.79], band: [0.55, 0.58, 0.6],
};
const ZONE_TINT = [[1.06, 1.05, 1.0], [1.04, 1.0, 0.92], [0.7, 0.88, 0.85], [0.3, 0.34, 0.45]];
const LAMP_COL = [[1, 1, 1], [1.15, 1.12, 1.02], [0.32, 0.5, 0.52]];

class GeoBuf {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  // 4 corners in CCW order seen from the front side; per-vertex colours ca..cd
  quad(p, uv, ca, cb = ca, cc = cb, cd = ca) {
    for (let i = 0; i < 4; i++) this.pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    this.uv.push(...uv);
    this.col.push(...ca, ...cb, ...cc, ...cd);
    const n = this.n;
    this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    this.n += 4;
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
  // vertical rect on plane x = const, facing +x (sign 1) or -x; cb = bottom colour, ct = top colour
  wallX(x, z0, z1, y0, y1, sign, cb, ct) {
    if (sign > 0) this.quad([x, y0, z1, x, y0, z0, x, y1, z0, x, y1, z1], [z1, y0, z0, y0, z0, y1, z1, y1], cb, cb, ct, ct);
    else this.quad([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0], [z0, y0, z1, y0, z1, y1, z0, y1], cb, cb, ct, ct);
  }
  // vertical rect on plane z = const, facing +z (sign 1) or -z
  wallZ(z, x0, x1, y0, y1, sign, cb, ct) {
    if (sign > 0) this.quad([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], [x0, y0, x1, y0, x1, y1, x0, y1], cb, cb, ct, ct);
    else this.quad([x1, y0, z, x0, y0, z, x0, y1, z, x1, y1, z], [x1, y0, x0, y0, x0, y1, x1, y1], cb, cb, ct, ct);
  }
}

const tint = (c, m) => [c[0] * m[0], c[1] * m[1], c[2] * m[2]];

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

// opts: { ceil: number, stripe: { dx, dz, color:[r,g,b] } | null }
export function buildChunkGeometry(world, L, opts) {
  const ox = L.cx * CHUNK, oz = L.cz * CHUNK;
  const zm = L.zone >= 0 ? ZONE_TINT[L.zone] : [1, 1, 1];
  const ceil = opts.ceil;
  const st = new GeoBuf(), lamps = new GeoBuf(), water = new GeoBuf();
  const tAt = (x, z) => (x >= 0 && z >= 0 && x < 16 && z < 16 ? L.tiles[z * 16 + x] : world.typeAt(ox + x, oz + z));
  const hAt = (x, z) => (x >= 0 && z >= 0 && x < 16 && z < 16 ? L.h[z * 16 + x] : world.hAt(ox + x, oz + z));

  // floors (greedy by height + surface kind)
  const keyList = [];
  const keys = new Int16Array(256).fill(-1);
  for (let i = 0; i < 256; i++) {
    const t = L.tiles[i];
    if (t === WALL) continue;
    const name = t + ':' + L.h[i].toFixed(2);
    let k = keyList.indexOf(name);
    if (k < 0) { k = keyList.length; keyList.push(name); }
    keys[i] = k;
  }
  greedyRects(keys, (x, z, w, d, k) => {
    const [t, h] = keyList[k].split(':');
    const c = tint(+t === FLOOR ? COL.floor : +t === SHALLOW ? COL.pool : COL.deep, zm);
    st.flat(ox + x, oz + z, ox + x + w, oz + z + d, +h, c, true);
  });

  // water surfaces
  const wkeys = new Int16Array(256).fill(-1);
  const levels = [];
  for (let i = 0; i < 256; i++) {
    const t = L.tiles[i];
    if (t !== SHALLOW && t !== DEEP) continue;
    const lv = t === SHALLOW ? L.h[i] + SHALLOW_DEPTH : DEEP_WATER;
    let k = levels.indexOf(lv);
    if (k < 0) { k = levels.length; levels.push(lv); }
    wkeys[i] = k;
  }
  greedyRects(wkeys, (x, z, w, d, k) => water.flat(ox + x, oz + z, ox + x + w, oz + z + d, levels[k], [1, 1, 1], true, 0.25));

  // walls and ledges
  const wallC = tint(COL.wall, zm), wallLow = tint(COL.wallLow, zm), poolC = tint(COL.poolWall, zm);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const t = L.tiles[z * 16 + x], h = L.h[z * 16 + x];
    for (const [dx, dz] of DIRS) {
      const nt = tAt(x + dx, z + dz);
      if (nt === WALL) continue;
      const nh = hAt(x + dx, z + dz);
      let y0, y1, cb, ct;
      if (t === WALL) { y0 = nh; y1 = ceil; cb = nh < -0.05 ? poolC : wallLow; ct = wallC; }
      else if (nh < h - 0.001) {
        y0 = nh; y1 = h;
        const pool = nt === SHALLOW || nt === DEEP || t === SHALLOW;
        cb = pool ? poolC : wallLow; ct = pool ? poolC : wallC;
      } else continue;
      // face sits on the shared border, facing the neighbour
      if (dx) { const fx = ox + x + (dx > 0 ? 1 : 0); st.wallX(fx, oz + z, oz + z + 1, y0, y1, dx, cb, ct); }
      else { const fz = oz + z + (dz > 0 ? 1 : 0); st.wallZ(fz, ox + x, ox + x + 1, y0, y1, dz, cb, ct); }
    }
  }

  // ceiling + outward bands that hide ceiling steps between neighbouring chunks
  const ceilC = tint(COL.ceil, zm), bandC = tint(COL.band, zm);
  st.flat(ox, oz, ox + 16, oz + 16, ceil, ceilC, false);
  st.wallX(ox, oz, oz + 16, ceil, CEIL_MAX, -1, bandC, bandC);
  st.wallX(ox + 16, oz, oz + 16, ceil, CEIL_MAX, 1, bandC, bandC);
  st.wallZ(oz, ox, ox + 16, ceil, CEIL_MAX, -1, bandC, bandC);
  st.wallZ(oz + 16, ox, ox + 16, ceil, CEIL_MAX, 1, bandC, bandC);

  for (const l of L.lamps) lamps.flat(ox + l.x, oz + l.z, ox + l.x + l.w, oz + l.z + l.d, ceil - 0.02, LAMP_COL[l.k], false);

  // guide stripe: dashed coloured tiles along the spine arm that points at the target
  if (opts.stripe) {
    const { dx, dz, color } = opts.stripe;
    const along = Math.abs(dx) > Math.abs(dz);
    const sgn = along ? Math.sign(dx) : Math.sign(dz);
    for (let s = 0; s < 8; s += 2) {
      const a = sgn > 0 ? 8 + s : 7 - s;
      const x = along ? a : 7, z = along ? 7 : a;
      for (const [px, pz] of along ? [[x, z], [x, z + 1]] : [[x, z], [x + 1, z]]) {
        const t = L.tiles[pz * 16 + px];
        if (t === WALL || t === DEEP) continue;
        const y = L.h[pz * 16 + px] + 0.006;
        st.flat(ox + px + 0.2, oz + pz + 0.2, ox + px + 0.8, oz + pz + 0.8, y, color, true);
      }
    }
  }

  return { static: st.geometry(), lamps: lamps.geometry(), water: water.geometry() };
}

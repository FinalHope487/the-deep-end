// Deterministic world layout: chunks of 16×16 one-metre tiles, 4 landmark zones, one exit.
// Pure data, no three.js, so it runs in node for unit tests.
import { hash2, mulberry32, rngFor } from './rng.js';

export const CHUNK = 16;
export const FLOOR = 0, WALL = 1, SHALLOW = 2, DEEP = 3;
export const SHALLOW_FLOOR = -0.4;   // shallow pool floor next to h=0 walkway
export const SHALLOW_DEPTH = 0.38;   // water surface sits this far above a shallow tile's floor
export const DEEP_FLOOR = -2.4;
export const DEEP_WATER = -0.1;
export const STEP_UP = 0.45;
export const STEP_DOWN = 0.7;
export const SPAWN = { x: 8, z: 8 };

export const ZONE_NAMES = ['淺水大廳', '階梯高低池', '狹窄管道走廊', '深水黑池'];
export const ZONE_COLORS = [0xfff1d2, 0xffd76a, 0x5fe0c4, 0x4a6cff];
export const EXIT_COLOR = 0xffffff;
const ZONE_CEIL = [6, 6.5, 2.8, 7];

const ITEM_DEFS = [
  { name: '小黃鴨', kind: 'duck' }, { name: '條紋毛巾', kind: 'towel' }, { name: '泳鏡', kind: 'goggles' },
  { name: '置物櫃鑰匙', kind: 'key' }, { name: '夾腳拖', kind: 'flipflop' }, { name: '浮板', kind: 'kickboard' },
  { name: '褪色的小黃鴨', kind: 'duck' }, { name: '濕透的毛巾', kind: 'towel' }, { name: '裂開的泳鏡', kind: 'goggles' },
  { name: '生鏽的鑰匙', kind: 'key' }, { name: '單隻拖鞋', kind: 'flipflop' }, { name: '沉重的浮板', kind: 'kickboard' },
];

// Quadrants of a chunk interior; the cross x∈[6,9] / z∈[6,9] between them is the "spine".
const QUADS = [[1, 5, 1, 5], [10, 15, 1, 5], [1, 5, 10, 15], [10, 15, 10, 15]];

export const walkable = (t) => t === FLOOR || t === SHALLOW;

function newGrid(n) {
  return { n, tiles: new Uint8Array(n * n), h: new Float32Array(n * n), lamps: [] };
}

function fill(g, x0, z0, x1, z1, type, h) {
  for (let z = Math.max(0, z0); z <= Math.min(g.n - 1, z1); z++) {
    for (let x = Math.max(0, x0); x <= Math.min(g.n - 1, x1); x++) {
      g.tiles[z * g.n + x] = type;
      g.h[z * g.n + x] = h;
    }
  }
}

// ---------- normal rooms ----------

function roomHall(L, r, start) {
  for (const [x0, x1, z0, z1] of QUADS) {
    if (start ? false : r() < 0.45) {
      fill(L, x0 + ((r() * 2) | 0), z0 + ((r() * 2) | 0), x1 - ((r() * 2) | 0), z1 - ((r() * 2) | 0), SHALLOW, SHALLOW_FLOOR);
    }
  }
  if (!start && r() < 0.3) fill(L, 4, 4, 11, 11, SHALLOW, SHALLOW_FLOOR);
  for (const x of [2, 7, 12]) for (const z of [2, 7, 12]) L.lamps.push({ x, z, w: 2, d: 1, k: 0 });
}

function roomStart(L) {
  fill(L, 11, 2, 14, 4, SHALLOW, SHALLOW_FLOOR);
  fill(L, 2, 11, 4, 14, SHALLOW, SHALLOW_FLOOR);
  L.lamps.push({ x: 6, z: 6, w: 4, d: 4, k: 1 });
  for (const [x, z] of [[2, 2], [12, 12], [2, 12], [12, 2]]) L.lamps.push({ x, z, w: 2, d: 1, k: 0 });
}

function roomCorridor(L, r) {
  for (const [x0, x1, z0, z1] of QUADS) {
    const v = r();
    if (v < 0.65) fill(L, x0, z0, x1, z1, WALL, 0);
    else if (v < 0.85) fill(L, x0 + 1, z0 + 1, x1 - 1, z1 - 1, SHALLOW, SHALLOW_FLOOR);
  }
  L.lamps.push({ x: 7, z: 2, w: 2, d: 1, k: 0 }, { x: 7, z: 12, w: 2, d: 1, k: 0 },
    { x: 2, z: 7, w: 1, d: 2, k: 0 }, { x: 12, z: 7, w: 1, d: 2, k: 0 }, { x: 7, z: 7, w: 2, d: 2, k: 0 });
}

function roomPool(L, r) {
  const a = 3 + ((r() * 2) | 0), b = 12 - ((r() * 2) | 0), c = 3 + ((r() * 2) | 0), d = 12 - ((r() * 2) | 0);
  if (r() < 0.5) fill(L, a - 1, c - 1, b + 1, d + 1, SHALLOW, SHALLOW_FLOOR);
  fill(L, a, c, b, d, DEEP, DEEP_FLOOR);
  L.lamps.push({ x: a + 1, z: c + 1, w: b - a - 1, d: d - c - 1, k: 1 });
}

function roomColonnade(L, r, start) {
  if (!start && r() < 0.5) fill(L, 3, 3, 12, 12, SHALLOW, SHALLOW_FLOOR);
  for (const x of [2, 4, 11, 13]) for (const z of [2, 4, 11, 13]) fill(L, x, z, x, z, WALL, 0);
  L.lamps.push({ x: 6, z: 6, w: 4, d: 4, k: 1 });
  for (const [x, z] of [[2, 7], [12, 7], [7, 2], [7, 12]]) L.lamps.push({ x, z, w: 2, d: 2, k: 0 });
}

function roomStairs(L, r) {
  for (const [x0, x1, z0, z1] of QUADS) {
    if (r() >= 0.75) continue;
    fill(L, x0, z0, x1, z1, FLOOR, 0.3);
    // inner platform shrinks on the sides that face the spine, leaving a 0.3 m step there
    const ix0 = x0 === 1 ? 1 : x0 + 1, ix1 = x1 === 15 ? 15 : x1 - 1;
    const iz0 = z0 === 1 ? 1 : z0 + 1, iz1 = z1 === 15 ? 15 : z1 - 1;
    fill(L, ix0, iz0, ix1, iz1, FLOOR, 0.6);
    if (r() < 0.35) fill(L, ix0 + 1, iz0 + 1, ix1 - 1, iz1 - 1, SHALLOW, 0.2);
  }
  for (const x of [2, 7, 12]) for (const z of [2, 7, 12]) L.lamps.push({ x, z, w: 2, d: 1, k: 0 });
}

function roomExit(L) {
  L.lamps.push({ x: 5, z: 5, w: 6, d: 6, k: 1 });
}

// ---------- landmark zones (2×2 chunks = 32×32 tiles) ----------

function zoneShallowHall(r) {
  const g = newGrid(32);
  fill(g, 3, 3, 28, 28, SHALLOW, SHALLOW_FLOOR);
  for (let i = 0; i < 5; i++) {
    const x = 5 + ((r() * 20) | 0), z = 5 + ((r() * 20) | 0);
    fill(g, x, z, x + 2 + ((r() * 2) | 0), z + 2 + ((r() * 2) | 0), FLOOR, 0);
  }
  for (const [x, z] of [[9, 9], [9, 22], [22, 9], [22, 22]]) fill(g, x, z, x, z, WALL, 0);
  for (const [x, z] of [[5, 5], [21, 5], [5, 21], [21, 21], [13, 13]]) g.lamps.push({ x, z, w: 5, d: 5, k: 1 });
  return g;
}

function zoneTerraces(r) {
  const g = newGrid(32);
  fill(g, 3, 3, 28, 28, FLOOR, 0.3);
  fill(g, 6, 6, 25, 25, FLOOR, 0.6);
  fill(g, 10, 10, 21, 21, SHALLOW, 0.2);
  const ix = 13 + ((r() * 3) | 0), iz = 13 + ((r() * 3) | 0);
  fill(g, ix, iz, ix + 2, iz + 2, FLOOR, 0.6);
  for (const [x, z] of [[3, 3], [28, 3], [3, 28], [28, 28]]) fill(g, x, z, x, z, WALL, 0);
  // sunken corner pools on the ground ring
  if (r() < 0.6) fill(g, 4, 29, 9, 30, SHALLOW, SHALLOW_FLOOR);
  if (r() < 0.6) fill(g, 29, 4, 30, 9, SHALLOW, SHALLOW_FLOOR);
  for (const [x, z] of [[7, 7], [21, 7], [7, 21], [21, 21]]) g.lamps.push({ x, z, w: 4, d: 4, k: 1 });
  return g;
}

function zonePipes(r) {
  const g = newGrid(32);
  fill(g, 3, 3, 28, 28, WALL, 0);
  const N = 8;
  const cell = (i, j) => fill(g, 4 + 3 * i, 4 + 3 * j, 5 + 3 * i, 5 + 3 * j, FLOOR, 0);
  const link = (i, j, di, dj) => {
    if (di) fill(g, 6 + 3 * i, 4 + 3 * j, 6 + 3 * i, 5 + 3 * j, FLOOR, 0);
    else fill(g, 4 + 3 * i, 6 + 3 * j, 5 + 3 * i, 6 + 3 * j, FLOOR, 0);
  };
  const seen = new Uint8Array(N * N);
  const stack = [[0, 0]];
  seen[0] = 1;
  cell(0, 0);
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => {
      const a = i + di, b = j + dj;
      return a >= 0 && b >= 0 && a < N && b < N && !seen[b * N + a];
    });
    if (!opts.length) { stack.pop(); continue; }
    const [di, dj] = opts[(r() * opts.length) | 0];
    const a = i + di, b = j + dj;
    seen[b * N + a] = 1;
    cell(a, b);
    link(Math.min(i, a), Math.min(j, b), di !== 0, dj !== 0);
    stack.push([a, b]);
  }
  for (let k = 0; k < 10; k++) {   // extra loops so it is not a pure tree
    const i = (r() * (N - 1)) | 0, j = (r() * (N - 1)) | 0;
    if (r() < 0.5) link(i, j, true, false); else link(i, j, false, true);
  }
  for (let k = 0; k < 3; k++) {    // openings to the ring corridor on every side
    const i = (r() * N) | 0;
    fill(g, 4 + 3 * i, 3, 5 + 3 * i, 3, FLOOR, 0);
    fill(g, 4 + 3 * i, 27, 5 + 3 * i, 28, FLOOR, 0);
    const j = (r() * N) | 0;
    fill(g, 3, 4 + 3 * j, 3, 5 + 3 * j, FLOOR, 0);
    fill(g, 27, 4 + 3 * j, 28, 5 + 3 * j, FLOOR, 0);
  }
  for (let k = 0; k < 8; k++) {    // puddles
    const i = (r() * N) | 0, j = (r() * N) | 0;
    fill(g, 4 + 3 * i, 4 + 3 * j, 5 + 3 * i, 5 + 3 * j, SHALLOW, SHALLOW_FLOOR);
  }
  for (let k = 0; k < 14; k++) {
    const i = (r() * N) | 0, j = (r() * N) | 0;
    g.lamps.push({ x: 4 + 3 * i, z: 4 + 3 * j, w: 2, d: 1, k: 2 });
  }
  for (const x of [5, 15, 25]) { g.lamps.push({ x, z: 1, w: 1, d: 2, k: 2 }); g.lamps.push({ x: 1, z: x, w: 2, d: 1, k: 2 }); }
  return g;
}

function zoneDeepPool(r) {
  const g = newGrid(32);
  fill(g, 3, 3, 28, 28, DEEP, DEEP_FLOOR);
  const cz = 14 + ((r() * 3) | 0);
  fill(g, 3, cz, 28, cz + 1, FLOOR, 0);           // causeway across the black water
  for (const [x, z] of [[8, 8], [23, 8], [8, 23], [23, 23]]) fill(g, x, z, x, z, WALL, 0);
  g.lamps.push({ x: 15, z: cz, w: 2, d: 2, k: 2 });
  return g;
}

const ZONE_GEN = [zoneShallowHall, zoneTerraces, zonePipes, zoneDeepPool];

// ---------- placement ----------

function rectsOverlap(a, b, margin) {
  return a.cx0 - margin <= b.cx0 + 1 && b.cx0 - margin <= a.cx0 + 1 && a.cz0 - margin <= b.cz0 + 1 && b.cz0 - margin <= a.cz0 + 1;
}

const START_RECT = { cx0: -1, cz0: -1 };   // chunks -1..0 overlap test region (expanded by margin below)
const inStart = (cx, cz) => Math.abs(cx) <= 1 && Math.abs(cz) <= 1;

function placeZones(seed) {
  const r = mulberry32(hash2(seed, 0, 0, 1001));
  const zones = [];
  let px = SPAWN.x, pz = SPAWN.z, ang = r() * Math.PI * 2;
  for (let k = 0; k < 4; k++) {
    if (k > 0) ang += (r() - 0.5) * (Math.PI * 2 / 3);
    const [lo, hi] = k === 0 ? [60, 90] : [120, 160];
    let zone = null;
    // the distance is checked after snapping to the chunk grid; the last pass drops the range so placement never fails
    for (let t = 0; t < 64 && !zone; t++) {
      const a = ang + Math.ceil(t / 2) * 0.15 * (t % 2 ? 1 : -1);
      const dist = lo + r() * (hi - lo);
      const cand = { index: k, cx0: Math.round((px + Math.cos(a) * dist) / CHUNK) - 1, cz0: Math.round((pz + Math.sin(a) * dist) / CHUNK) - 1 };
      const d = Math.hypot((cand.cx0 + 1) * CHUNK - px, (cand.cz0 + 1) * CHUNK - pz);
      if (t < 63 && (d < lo || d > hi)) continue;
      const bad = zones.some((z) => rectsOverlap(z, cand, 2)) || rectsOverlap(START_RECT, cand, 2);
      if (!bad) { zone = cand; ang = a; }
    }
    zone.x = (zone.cx0 + 1) * CHUNK;
    zone.z = (zone.cz0 + 1) * CHUNK;
    zones.push(zone);
    px = zone.x; pz = zone.z;
  }
  // exit: about 60 m past the last zone, roughly in the same heading
  let exit = null;
  for (let t = 0; t < 64 && !exit; t++) {
    const a = ang + (r() - 0.5) * 0.5 + Math.ceil(t / 2) * 0.2 * (t % 2 ? 1 : -1);
    const cx = Math.floor((px + Math.cos(a) * 60) / CHUNK), cz = Math.floor((pz + Math.sin(a) * 60) / CHUNK);
    const d = Math.hypot(cx * CHUNK + 8 - px, cz * CHUNK + 8 - pz);
    if (t < 63 && (d < 50 || d > 70)) continue;
    const bad = zones.some((z) => rectsOverlap(z, { cx0: cx, cz0: cz }, 1)) || inStart(cx, cz);
    if (!bad) exit = { cx, cz, x: cx * CHUNK + 8, z: cz * CHUNK + 8, yaw: Math.atan2(Math.cos(a), Math.sin(a)) };
  }
  return { zones, exit };
}

// ---------- edges ----------

// Edge between chunk (cx-1,cz) and (cx,cz) is chunk (cx,cz)'s column 0 (dir 0);
// edge between (cx,cz-1) and (cx,cz) is its row 0 (dir 1). 0 open, 1 wide door, 2 narrow door.
function edgeKind(seed, cx, cz, dir) {
  const v = hash2(seed, cx, cz, 11 + dir) / 4294967296;
  return v < 0.25 ? 0 : v < 0.7 ? 1 : 2;
}

function isOpening(kind, i) {
  if (i === 0) return false;
  if (kind === 0) return true;
  if (kind === 1) return i >= 6 && i <= 9;
  return i >= 7 && i <= 8;
}

// ---------- world ----------

export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.cache = new Map();
    this.grids = [];
    const { zones, exit } = placeZones(this.seed);
    this.zones = zones;
    this.exit = exit;
    this.items = [];
    for (const z of zones) this.items.push(...this.zoneItems(z));
  }

  zoneGrid(k) {
    if (!this.grids[k]) this.grids[k] = ZONE_GEN[k](rngFor(this.seed, k, 0, 2001));
    return this.grids[k];
  }

  zoneItems(zone) {
    const g = this.zoneGrid(zone.index);
    const r = rngFor(this.seed, zone.index, 1, 3001);
    const cand = [];
    for (let z = 1; z < 32; z++) for (let x = 1; x < 32; x++) {
      if (g.tiles[z * 32 + x] === FLOOR) cand.push([x, z]);
    }
    for (let i = cand.length - 1; i > 0; i--) {
      const j = (r() * (i + 1)) | 0;
      [cand[i], cand[j]] = [cand[j], cand[i]];
    }
    const picked = [];
    for (const minD of [8, 5, 2, 0]) {
      for (const c of cand) {
        if (picked.length === 3) break;
        if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) >= minD) && !picked.includes(c)) picked.push(c);
      }
    }
    return picked.map(([x, z], i) => {
      const id = zone.index * 3 + i;
      return {
        id, zone: zone.index, ...ITEM_DEFS[id],
        x: zone.cx0 * CHUNK + x + 0.5, z: zone.cz0 * CHUNK + z + 0.5, h: g.h[z * 32 + x],
      };
    });
  }

  zoneAtChunk(cx, cz) {
    for (const z of this.zones) {
      if (cx >= z.cx0 && cx <= z.cx0 + 1 && cz >= z.cz0 && cz <= z.cz0 + 1) return z;
    }
    return null;
  }

  layout(cx, cz) {
    const key = (cx + 32768) * 65536 + (cz + 32768);
    let L = this.cache.get(key);
    if (!L) {
      L = this.generate(cx, cz);
      if (this.cache.size > 800) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, L);
    }
    return L;
  }

  generate(cx, cz) {
    const L = { cx, cz, n: CHUNK, kind: '', zone: -1, tiles: new Uint8Array(256), h: new Float32Array(256), lamps: [], ceilVar: 0, ceilFixed: 0 };
    const zone = this.zoneAtChunk(cx, cz);
    const r = rngFor(this.seed, cx, cz, 17);
    let qx = 0, qz = 0;
    if (zone) {
      qx = cx - zone.cx0; qz = cz - zone.cz0;
      const g = this.zoneGrid(zone.index);
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const gi = (qz * 16 + z) * 32 + qx * 16 + x;
        L.tiles[z * 16 + x] = g.tiles[gi];
        L.h[z * 16 + x] = g.h[gi];
      }
      for (const l of g.lamps) {
        const x0 = Math.max(l.x - qx * 16, 0), z0 = Math.max(l.z - qz * 16, 0);
        const x1 = Math.min(l.x + l.w - qx * 16, 16), z1 = Math.min(l.z + l.d - qz * 16, 16);
        if (x1 > x0 && z1 > z0) L.lamps.push({ x: x0, z: z0, w: x1 - x0, d: z1 - z0, k: l.k });
      }
      L.kind = 'zone';
      L.zone = zone.index;
      L.ceilFixed = ZONE_CEIL[zone.index];
    } else {
      const isExit = this.exit && cx === this.exit.cx && cz === this.exit.cz;
      if (isExit) { L.kind = 'exit'; roomExit(L); }
      else if (cx === 0 && cz === 0) { L.kind = 'start'; roomStart(L); }
      else if (inStart(cx, cz)) {
        if (r() < 0.5) { L.kind = 'hall'; roomHall(L, r, true); } else { L.kind = 'colonnade'; roomColonnade(L, r, true); }
      } else {
        const v = r();
        if (v < 0.25) { L.kind = 'hall'; roomHall(L, r, false); }
        else if (v < 0.45) { L.kind = 'corridor'; roomCorridor(L, r); }
        else if (v < 0.65) { L.kind = 'pool'; roomPool(L, r); }
        else if (v < 0.85) { L.kind = 'colonnade'; roomColonnade(L, r, false); }
        else { L.kind = 'stairs'; roomStairs(L, r); }
      }
      L.ceilVar = r() * 0.5;
    }
    // edges this chunk owns: west column and north row (internal zone edges stay open)
    if (!(zone && qx === 1)) {
      const k = edgeKind(this.seed, cx, cz, 0);
      for (let z = 0; z < 16; z++) {
        const i = z * 16;
        if (isOpening(k, z)) { if (L.tiles[i] === WALL || L.tiles[i] === DEEP) { L.tiles[i] = FLOOR; L.h[i] = 0; } }
        else { L.tiles[i] = WALL; L.h[i] = 0; }
      }
    }
    if (!(zone && qz === 1)) {
      const k = edgeKind(this.seed, cx, cz, 1);
      for (let x = 0; x < 16; x++) {
        if (isOpening(k, x)) { if (L.tiles[x] === WALL || L.tiles[x] === DEEP) { L.tiles[x] = FLOOR; L.h[x] = 0; } }
        else { L.tiles[x] = WALL; L.h[x] = 0; }
      }
    }
    if (!(zone && qx === 1 && qz === 1)) { L.tiles[0] = WALL; L.h[0] = 0; }
    return L;
  }

  // tile queries in integer world tile coordinates
  typeAt(tx, tz) {
    const cx = Math.floor(tx / CHUNK), cz = Math.floor(tz / CHUNK);
    return this.layout(cx, cz).tiles[(tz - cz * CHUNK) * CHUNK + (tx - cx * CHUNK)];
  }

  hAt(tx, tz) {
    const cx = Math.floor(tx / CHUNK), cz = Math.floor(tz / CHUNK);
    return this.layout(cx, cz).h[(tz - cz * CHUNK) * CHUNK + (tx - cx * CHUNK)];
  }

  // nearest tile centre of a given type, scanning outward in rings
  findTile(type, x, z, maxR = 40) {
    const tx0 = Math.floor(x), tz0 = Math.floor(z);
    for (let rr = 0; rr <= maxR; rr++) {
      for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== rr) continue;
        if (this.typeAt(tx0 + dx, tz0 + dz) === type) return { x: tx0 + dx + 0.5, z: tz0 + dz + 0.5 };
      }
    }
    return null;
  }
}

export function canStep(fromH, toH) {
  return toH - fromH <= STEP_UP && fromH - toH <= STEP_DOWN;
}

export function layoutHash(L) {
  let h = 2166136261;
  const mix = (v) => { h ^= v & 0xff; h = Math.imul(h, 16777619); };
  for (let i = 0; i < 256; i++) { mix(L.tiles[i]); mix(Math.round(L.h[i] * 100)); }
  for (const l of L.lamps) { mix(l.x); mix(l.z); mix(l.w); mix(l.d); mix(l.k); }
  return (h >>> 0).toString(16);
}

// Deterministic world layout: chunks of 16×16 one-metre tiles, 4 landmark zones, one exit.
// Pure data, no three.js, so it runs in node for unit tests.
import { hash2, mulberry32, rngFor } from './rng.js';
import {
  CHUNK, FLOOR, WALL, SHALLOW, DEEP, RAMP, BARS, COLS, VOID, SHALLOW_FLOOR, DEEP_FLOOR, UP_H, STEP_UP, STEP_DOWN, DIRS,
  walkable, newGrid, fill, mark, ramp, groundWater,
} from './tiles.js';
import {
  SIGN, railBlocks, walkTop, upTop, upWater, floorTop, reach, edgeKey, edgeOf, gridReach, autoRails, deepRails, signOn, autoSigns,
  sealedRoom, scatterFloaters, decoSlide, stairRoom, zoneTerraces, ringPassages,
} from './levels.js';

export const SPAWN = { x: 8, z: 8 };

export const ZONE_NAMES = ['淺水大廳', '階梯高低池', '狹窄管道走廊', '深水黑池'];
export const ZONE_COLORS = [0xfff1d2, 0xffd76a, 0x5fe0c4, 0x4a6cff];
export const EXIT_COLOR = 0xffffff;
const ZONE_CEIL = [6, 6.5, 2.8, 7];
const STAIR_CEIL = UP_H + 3.2;

const ITEM_DEFS = [
  { name: '小黃鴨', kind: 'duck' }, { name: '條紋毛巾', kind: 'towel' }, { name: '泳鏡', kind: 'goggles' },
  { name: '置物櫃鑰匙', kind: 'key' }, { name: '夾腳拖', kind: 'flipflop' }, { name: '浮板', kind: 'kickboard' },
  { name: '褪色的小黃鴨', kind: 'duck' }, { name: '濕透的毛巾', kind: 'towel' }, { name: '裂開的泳鏡', kind: 'goggles' },
  { name: '生鏽的鑰匙', kind: 'key' }, { name: '單隻拖鞋', kind: 'flipflop' }, { name: '沉重的浮板', kind: 'kickboard' },
];

// Quadrants of a chunk interior; the cross x∈[6,9] / z∈[6,9] between them is the "spine".
const QUADS = [[1, 5, 1, 5], [10, 15, 1, 5], [1, 5, 10, 15], [10, 15, 10, 15]];

function localGrid() {
  const g = newGrid(CHUNK);
  g.ox = 0; g.oz = 0;
  return g;
}

const darkCell = (g, x, z) => { mark(g, 'dark', x, z, x, z); mark(g, 'low', x, z, x, z); };

// two-cell flight between an outer cell and the inner cell next to it
function rampPair(g, ox, oz, ix, iz, hOuter, hInner) {
  const dx = Math.sign(ix - ox), dz = Math.sign(iz - oz);
  const x0 = Math.min(ox, ix), x1 = Math.max(ox, ix), z0 = Math.min(oz, iz), z1 = Math.max(oz, iz);
  const cells = Math.max(x1 - x0, z1 - z0) + 1;
  const up = hInner > hOuter;
  const dir = DIRS.findIndex(([a, b]) => a === (up ? dx : -dx) && b === (up ? dz : -dz));
  ramp(g, x0, z0, x1, z1, dir, Math.min(hOuter, hInner), Math.abs(hInner - hOuter) / cells);
}

// axis-aligned walk from a to b (x first), every cell carved at height h
function carveLine(g, ax, az, bx, bz, h, cells) {
  let x = ax, z = az;
  const put = () => { if (g.tiles[z * CHUNK + x] === WALL) fill(g, x, z, x, z, FLOOR, h); darkCell(g, x, z); cells.push([x, z]); };
  put();
  while (x !== bx) { x += Math.sign(bx - x); put(); }
  while (z !== bz) { z += Math.sign(bz - z); put(); }
}

// ---------- normal rooms ----------

function roomStart(g) {
  fill(g, 11, 2, 14, 4, SHALLOW, SHALLOW_FLOOR);
  fill(g, 2, 11, 4, 14, SHALLOW, SHALLOW_FLOOR);
  g.lamps.push({ x: 6, z: 6, w: 4, d: 4, k: 1 });
  for (const [x, z] of [[2, 2], [12, 12], [2, 12], [12, 2]]) g.lamps.push({ x, z, w: 2, d: 1, k: 0 });
}

// a quadrant turned into solid wall with a dark 1 m passage that steps down to a dead-end niche
function darkNiche(g, r, [x0, x1, z0, z1]) {
  fill(g, x0, z0, x1, z1, WALL, 0);
  const inX = x0 === 1 ? -1 : 1, inZ = z0 === 1 ? -1 : 1;
  const ex = x0 === 1 ? x1 : x0, mz = z0 + 2;
  const cells = [];
  carveLine(g, ex, mz, ex + inX, mz, 0, cells);
  rampPair(g, ex + inX, mz, ex + 2 * inX, mz, 0, -0.45);
  darkCell(g, ex + 2 * inX, mz);
  const nx = ex + 3 * inX;
  carveLine(g, nx, mz, nx, mz + 2 * inZ, -0.45, cells);
  fill(g, Math.min(nx, nx + inX), Math.min(mz + inZ, mz + 2 * inZ), Math.max(nx, nx + inX), Math.max(mz + inZ, mz + 2 * inZ), FLOOR, -0.45);
  mark(g, 'dark', Math.min(nx, nx + inX), Math.min(mz + inZ, mz + 2 * inZ), Math.max(nx, nx + inX), Math.max(mz + inZ, mz + 2 * inZ));
  mark(g, 'low', Math.min(nx, nx + inX), Math.min(mz + inZ, mz + 2 * inZ), Math.max(nx, nx + inX), Math.max(mz + inZ, mz + 2 * inZ));
  // chalk on the niche's end wall, at child height
  const wz = mz + 3 * inZ;
  if (wz >= 1 && wz <= 15) signOn(g, nx, wz, 0, -inZ, [SIGN.G_SMILE, SIGN.G_DUCK, SIGN.G_HANDS, SIGN.CHALK_TEXT][(r() * 4) | 0], { y: 0.7, minT: 0 });
}

// a wall across a quadrant with a one-tile gap
function partition(g, r, [x0, x1, z0, z1]) {
  if (r() < 0.5) {
    const x = x0 + 2, gap = z0 + ((r() * (z1 - z0 + 1)) | 0);
    for (let z = z0; z <= z1; z++) if (z !== gap) fill(g, x, z, x, z, WALL, 0);
  } else {
    const z = z0 + 2, gap = x0 + ((r() * (x1 - x0 + 1)) | 0);
    for (let x = x0; x <= x1; x++) if (x !== gap) fill(g, x, z, x, z, WALL, 0);
  }
}

function roomHall(g, r, start) {
  const used = [false, false, false, false];
  if (!start && r() < 0.5) { const q = (r() * 4) | 0; darkNiche(g, r, QUADS[q]); used[q] = true; }
  QUADS.forEach(([x0, x1, z0, z1], q) => {
    if (start || used[q]) return;
    const v = r();
    if (v < 0.35) fill(g, x0 + ((r() * 2) | 0), z0 + ((r() * 2) | 0), x1 - ((r() * 2) | 0), z1 - ((r() * 2) | 0), SHALLOW, SHALLOW_FLOOR);
    else if (v < 0.7) { partition(g, r, QUADS[q]); used[q] = true; }
  });
  for (const x of [2, 7, 12]) for (const z of [2, 7, 12]) g.lamps.push({ x, z, w: 2, d: 1, k: 0 });
  return [0, 1, 2, 3].filter((q) => used[q]);   // quadrants already taken
}

// narrow dark corridors: four winding 1 m arms from the door midpoints to a junction on its own level,
// with a bright pocket room somewhere along them
function roomNarrow(g, r) {
  fill(g, 1, 1, 15, 15, WALL, 0);
  const jx = 6 + ((r() * 4) | 0), jz = 6 + ((r() * 4) | 0);
  const H = [0, 0.5, 1, -0.5, -1, 0.5][(r() * 6) | 0];
  const cells = [];
  for (const [sx, sz, ix, iz] of [[1, 8, 1, 0], [8, 1, 0, 1], [15, 8, -1, 0], [8, 15, 0, -1]]) {
    fill(g, sx, sz, sx, sz, FLOOR, 0);
    darkCell(g, sx, sz);
    if (H) rampPair(g, sx + ix, sz + iz, sx + 2 * ix, sz + 2 * iz, 0, H);
    else fill(g, Math.min(sx + ix, sx + 2 * ix), Math.min(sz + iz, sz + 2 * iz), Math.max(sx + ix, sx + 2 * ix), Math.max(sz + iz, sz + 2 * iz), FLOOR, 0);
    darkCell(g, sx + ix, sz + iz); darkCell(g, sx + 2 * ix, sz + 2 * iz);
    const px = sx + 3 * ix, pz = sz + 3 * iz;
    const jog = Math.min(11, Math.max(4, 8 + ((r() * 5) | 0) - 2));
    if (ix) {
      const mx = Math.round((px + jx) / 2);
      carveLine(g, px, pz, mx, jog, H, cells);
      carveLine(g, mx, jog, jx, jz, H, cells);
    } else {
      const mz = Math.round((pz + jz) / 2);
      carveLine(g, px, pz, px, mz, H, cells);   // vertical first: swap order by walking z then x
      carveLine(g, px, mz, jog, mz, H, cells);
      carveLine(g, jog, mz, jog, jz, H, cells);
      carveLine(g, jog, jz, jx, jz, H, cells);
    }
  }
  g.lamps.push({ x: jx, z: jz, w: 1, d: 1, k: 0 });
  // bright pocket: a 3×3 room off one corridor cell, lit and not dark
  for (let t = 0; t < 12; t++) {
    const [cx, cz] = cells[(r() * cells.length) | 0];
    const [dx, dz] = DIRS[(r() * 4) | 0];
    const bx = cx + dx * 2, bz = cz + dz * 2;
    if (bx - 1 < 2 || bz - 1 < 2 || bx + 1 > 13 || bz + 1 > 13) continue;
    let ok = true;
    for (let z = bz - 1; z <= bz + 1 && ok; z++) for (let x = bx - 1; x <= bx + 1 && ok; x++) ok = g.tiles[z * CHUNK + x] === WALL;
    if (!ok) continue;
    const h = g.h[cz * CHUNK + cx];
    fill(g, bx - 1, bz - 1, bx + 1, bz + 1, FLOOR, h);
    fill(g, cx + dx, cz + dz, cx + dx, cz + dz, FLOOR, h);
    g.lamps.push({ x: bx - 1, z: bz - 1, w: 3, d: 3, k: 0 });
    break;
  }
}

function roomPool(g, r) {
  const a = 3 + ((r() * 2) | 0), b = 12 - ((r() * 2) | 0), c = 3 + ((r() * 2) | 0), d = 12 - ((r() * 2) | 0);
  if (r() < 0.5) fill(g, a - 1, c - 1, b + 1, d + 1, SHALLOW, SHALLOW_FLOOR);
  fill(g, a, c, b, d, DEEP, DEEP_FLOOR);
  g.lamps.push({ x: a + 1, z: c + 1, w: b - a - 1, d: d - c - 1, k: 1 });
  if (r() < 0.4) deepRails(g, 1, 1, 15, r() < 0.5 ? 7 : 15);
}

function roomColonnade(g, r, start) {
  if (!start && r() < 0.5) fill(g, 3, 3, 12, 12, SHALLOW, SHALLOW_FLOOR);
  for (const x of [2, 4, 11, 13]) for (const z of [2, 4, 11, 13]) fill(g, x, z, x, z, WALL, 0);
  g.lamps.push({ x: 6, z: 6, w: 4, d: 4, k: 1 });
  for (const [x, z] of [[2, 7], [12, 7], [7, 2], [7, 12]]) g.lamps.push({ x, z, w: 2, d: 2, k: 0 });
}

// raised platform / sunken pit / low stage filling a quadrant, reached by a short flight from the spine side
function terrace(g, [x0, x1, z0, z1], H, cells, water) {
  fill(g, x0, z0, x1, z1, water ? SHALLOW : FLOOR, H);
  const outerX = x0 === 1 ? x1 : x0, inX = x0 === 1 ? -1 : 1;
  for (const z of [z0 + 1, z0 + 2]) {
    if (cells === 2) rampPair(g, outerX, z, outerX + inX, z, 0, H);
    else ramp(g, outerX, z, outerX, z, (H > 0) === (inX > 0) ? 0 : 1, Math.min(0, H), Math.abs(H));
  }
}

// elevation room: every quadrant on its own level
function roomRise(g, r) {
  const used = [];
  QUADS.forEach((Q, q) => {
    const v = r();
    if (v < 0.3) terrace(g, Q, 0.9, 2, false);
    else if (v < 0.55) terrace(g, Q, -0.9, 2, r() < 0.4);
    else if (v < 0.8) terrace(g, Q, 0.55, 1, false);
    else { partition(g, r, Q); used.push(q); }
  });
  for (const x of [2, 7, 12]) for (const z of [2, 7, 12]) g.lamps.push({ x, z, w: 2, d: 1, k: 0 });
  return used;
}

function roomExit(g) {
  g.lamps.push({ x: 5, z: 5, w: 6, d: 6, k: 1 });
}

// ---------- landmark zones (2×2 chunks = 32×32 tiles) ----------

function zoneGrid32() {
  const g = newGrid(32);
  g.ox = 0; g.oz = 0;
  return g;
}

function zoneShallowHall(r) {
  const g = zoneGrid32();
  fill(g, 1, 1, 30, 30, WALL, 0);
  fill(g, 4, 4, 27, 27, FLOOR, 0);
  fill(g, 5, 5, 26, 26, SHALLOW, SHALLOW_FLOOR);
  for (let i = 0; i < 5; i++) {
    const x = 6 + ((r() * 17) | 0), z = 6 + ((r() * 17) | 0);
    fill(g, x, z, x + 2 + ((r() * 2) | 0), z + 2 + ((r() * 2) | 0), FLOOR, 0);
  }
  for (const [x, z] of [[9, 9], [9, 22], [22, 9], [22, 22]]) fill(g, x, z, x, z, WALL, 0);
  ringPassages(g, 3, 28);
  for (const [x, z] of [[5, 5], [21, 5], [5, 21], [21, 21], [13, 13]]) g.lamps.push({ x, z, w: 5, d: 5, k: 1 });
  autoRails(g);
  autoSigns(g, r, 4, { margin: 1 });
  scatterFloaters(g, r, 0.5);
  return g;
}

function zonePipes(r) {
  const g = zoneGrid32();
  fill(g, 3, 3, 28, 28, WALL, 0);
  const N = 8;
  const excluded = (i, j) => i >= 5 && i <= 6 && j >= 5 && j <= 6;   // block kept for the sealed room
  const cell = (i, j) => fill(g, 4 + 3 * i, 4 + 3 * j, 5 + 3 * i, 5 + 3 * j, FLOOR, 0);
  const link = (i, j, di, dj) => {
    if (excluded(i, j) || excluded(i + (di ? 1 : 0), j + (dj ? 1 : 0))) return;
    if (di) fill(g, 6 + 3 * i, 4 + 3 * j, 6 + 3 * i, 5 + 3 * j, FLOOR, 0);
    else fill(g, 4 + 3 * i, 6 + 3 * j, 5 + 3 * i, 6 + 3 * j, FLOOR, 0);
  };
  const seen = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (excluded(i, j)) seen[j * N + i] = 1;
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
    if (!excluded(i, j)) fill(g, 4 + 3 * i, 4 + 3 * j, 5 + 3 * i, 5 + 3 * j, SHALLOW, SHALLOW_FLOOR);
  }
  // iron bars: some maze walls between two corridors become bars you can see through
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (excluded(i, j)) continue;
    if (i < N - 1 && !excluded(i + 1, j) && g.tiles[(4 + 3 * j) * 32 + 6 + 3 * i] === WALL && r() < 0.2) fill(g, 6 + 3 * i, 4 + 3 * j, 6 + 3 * i, 5 + 3 * j, BARS, 0);
    if (j < N - 1 && !excluded(i, j + 1) && g.tiles[(6 + 3 * j) * 32 + 4 + 3 * i] === WALL && r() < 0.2) fill(g, 4 + 3 * i, 6 + 3 * j, 5 + 3 * i, 6 + 3 * j, BARS, 0);
  }
  // sealed room in the kept block: bars all round, an empty lit pool inside
  fill(g, 18, 18, 24, 24, BARS, 0);
  fill(g, 19, 19, 23, 23, FLOOR, 0);
  fill(g, 20, 20, 22, 22, FLOOR, -1.2);
  g.lamps.push({ x: 19, z: 19, w: 5, d: 5, k: 1 });
  g.sealed.push({ x: 18, z: 18, w: 7, d: 7 });
  for (let k = 0; k < 14; k++) {
    const i = (r() * N) | 0, j = (r() * N) | 0;
    if (!excluded(i, j)) g.lamps.push({ x: 4 + 3 * i, z: 4 + 3 * j, w: 2, d: 1, k: 2 });
  }
  for (const x of [5, 15, 25]) { g.lamps.push({ x, z: 1, w: 1, d: 2, k: 2 }); g.lamps.push({ x: 1, z: x, w: 2, d: 1, k: 2 }); }
  autoRails(g);
  autoSigns(g, r, 5, { margin: 1 });
  return g;
}

function zoneDeepPool(r) {
  const g = zoneGrid32();
  fill(g, 1, 1, 30, 30, WALL, 0);
  fill(g, 3, 3, 28, 28, FLOOR, 0);
  fill(g, 4, 4, 27, 27, DEEP, DEEP_FLOOR);
  const cz = 14 + ((r() * 3) | 0);
  fill(g, 3, cz, 28, cz + 1, FLOOR, 0);           // causeway across the black water
  for (const [x, z] of [[8, 8], [23, 8], [8, 23], [23, 23]]) fill(g, x, z, x, z, WALL, 0);
  ringPassages(g, 2, 29);
  mark(g, 'dark', 3, 3, 28, 3); mark(g, 'dark', 3, 28, 28, 28); mark(g, 'dark', 3, 3, 3, 28); mark(g, 'dark', 28, 3, 28, 28);
  g.lamps.push({ x: 15, z: cz, w: 2, d: 2, k: 2 });
  if (r() < 0.5) deepRails(g, 3, 3, 28, 12); else deepRails(g, 3, 19, 28, 28);
  autoRails(g);
  autoSigns(g, r, 3, { margin: 1 });
  scatterFloaters(g, r, 0.6);
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
export function edgeKind(seed, cx, cz, dir) {
  const v = hash2(seed, cx, cz, 11 + dir) / 4294967296;
  return v < 0.25 ? 0 : v < 0.7 ? 1 : 2;
}

export function isOpening(kind, i) {
  if (i === 0) return false;
  if (kind === 0) return true;
  if (kind === 1) return i >= 6 && i <= 9;
  return i >= 7 && i <= 8;
}

// ---------- world ----------

const GRID_KEYS = ['tiles', 'h', 'rdir', 'rise', 'dark', 'low', 'wet', 'block'];
const PUSHED = [0, 0];

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
    this._surf = { h: 0, wl: NaN, up: false };
  }

  zoneGrid(k) {
    if (!this.grids[k]) this.grids[k] = ZONE_GEN[k](rngFor(this.seed, k, 0, 2001));
    return this.grids[k];
  }

  // 3 reachable spots per zone (dry ground or the upper floor); zone 2 always puts one upstairs
  zoneItems(zone) {
    const g = this.zoneGrid(zone.index);
    const starts = [];
    for (let i = 0; i < 32; i++) for (const [x, z] of [[i, 0], [0, i], [i, 31], [31, i]]) {
      if (walkTop(g, z * 32 + x, x + 0.5, z + 0.5) !== null) starts.push([x, z, 0]);
    }
    const ok = gridReach(g, starts);
    const r = rngFor(this.seed, zone.index, 1, 3001);
    const ground = [], upper = [];
    for (let z = 2; z < 30; z++) for (let x = 2; x < 30; x++) {
      const i = z * 32 + x;
      if (g.tiles[i] === FLOOR && !g.block[i] && ok(x, z, 0)) ground.push([x, z, false]);
      if (upTop(g, i) !== null && g.up.tiles[i] === FLOOR && ok(x, z, 1)) upper.push([x, z, true]);
    }
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
    shuffle(ground); shuffle(upper);
    const picked = [];
    if (upper.length) picked.push(upper[0]);
    const cand = shuffle(ground.concat(upper.slice(1)));
    for (const minD of [8, 5, 2, 0]) {
      for (const c of cand) {
        if (picked.length === 3) break;
        if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) >= minD) && !picked.includes(c)) picked.push(c);
      }
    }
    return picked.map(([x, z, up], k) => {
      const id = zone.index * 3 + k;
      return {
        id, zone: zone.index, ...ITEM_DEFS[id], up,
        x: zone.cx0 * CHUNK + x + 0.5, z: zone.cz0 * CHUNK + z + 0.5, h: up ? g.up.h[z * 32 + x] : g.h[z * 32 + x],
      };
    });
  }

  zoneAtChunk(cx, cz) {
    for (const z of this.zones) {
      if (cx >= z.cx0 && cx <= z.cx0 + 1 && cz >= z.cz0 && cz <= z.cz0 + 1) return z;
    }
    return null;
  }

  hasLayout(cx, cz) { return this.cache.has((cx + 32768) * 65536 + (cz + 32768)); }

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

  // a normal (non-zone) chunk's own grid
  roomGrid(cx, cz, r) {
    const isExit = this.exit && cx === this.exit.cx && cz === this.exit.cz;
    let g = localGrid(), kind, used = [];
    if (isExit) { kind = 'exit'; roomExit(g); }
    else if (cx === 0 && cz === 0) { kind = 'start'; roomStart(g); }
    else if (inStart(cx, cz)) {
      if (r() < 0.5) { kind = 'hall'; roomHall(g, r, true); } else { kind = 'colonnade'; roomColonnade(g, r, true); }
    } else {
      const v = r();
      if (v < 0.15) { kind = 'hall'; used = roomHall(g, r, false); }
      else if (v < 0.4) { kind = 'corridor'; roomNarrow(g, r); }
      else if (v < 0.58) { kind = 'pool'; roomPool(g, r); }
      else if (v < 0.72) { kind = 'colonnade'; roomColonnade(g, r, false); }
      else if (v < 0.87) { kind = 'stairs'; g = stairRoom(r); }
      else { kind = 'rise'; used = roomRise(g, r); }
      // overlays: a sealed room behind bars, a tube coming out of the ceiling
      if ((kind === 'hall' || kind === 'colonnade') ? r() < 0.25 : kind === 'rise' ? r() < 0.15 : false) {
        const free = [0, 1, 2, 3].filter((q) => !used.includes(q) || kind === 'rise');
        if (free.length) {
          const q = free[(r() * free.length) | 0];
          const [x0, x1, z0, z1] = QUADS[q];
          sealedRoom(g, x0, z0, x1, z1, r);
          used.push(q);
        }
      } else if ((kind === 'hall' || kind === 'pool') && r() < 0.08) {
        const free = [0, 1, 2, 3].filter((q) => !used.includes(q));
        if (free.length && kind === 'hall') {
          const [x0, x1, z0, z1] = QUADS[free[(r() * free.length) | 0]];
          decoSlide(g, (x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2, r);
        }
      }
    }
    if (kind !== 'start' && kind !== 'exit') {
      autoRails(g);
      autoSigns(g, r, kind === 'corridor' ? 2 : 1 + ((r() * 2) | 0));
      scatterFloaters(g, r, 0.08);
    }
    g.kind = kind;
    return g;
  }

  generate(cx, cz) {
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const L = {
      cx, cz, n: CHUNK, ox, oz, kind: '', zone: -1, variant: '', up: null,
      lamps: [], upLamps: [], spirals: [], rails: [], signs: [], slides: [], suns: [], floaters: [], sealed: [],
      railTiles: new Map(), ceilVar: 0, ceilFixed: 0, minCeil: 0,
    };
    const zone = this.zoneAtChunk(cx, cz);
    const r = rngFor(this.seed, cx, cz, 17);
    // one lamp shape per chunk (per landmark zone, whose lamps cross chunk edges): 80% round, 20% square
    L.lampShape = hash2(this.seed, zone ? zone.index : cx, zone ? 0 : cz, zone ? 5151 : 5150) / 4294967296 < 0.8 ? 'round' : 'square';
    let qx = 0, qz = 0, src, sx = 0, sz = 0, gox = ox, goz = oz;
    if (zone) {
      qx = cx - zone.cx0; qz = cz - zone.cz0;
      src = this.zoneGrid(zone.index);
      sx = qx * 16; sz = qz * 16;
      gox = zone.cx0 * CHUNK; goz = zone.cz0 * CHUNK;
      L.kind = 'zone';
      L.zone = zone.index;
      L.ceilFixed = ZONE_CEIL[zone.index];
    } else {
      src = this.roomGrid(cx, cz, r);
      L.kind = src.kind;
      L.variant = src.variant || '';
      if (src.up) L.ceilFixed = STAIR_CEIL;
      L.ceilVar = r() * 0.5;
    }
    // per-tile data
    for (const k of GRID_KEYS) L[k] = new src[k].constructor(256);
    if (src.up) L.up = { tiles: new Uint8Array(256), h: new Float32Array(256) };
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const gi = (sz + z) * src.n + sx + x, li = z * 16 + x;
      for (const k of GRID_KEYS) L[k][li] = src[k][gi];
      if (src.up) { L.up.tiles[li] = src.up.tiles[gi]; L.up.h[li] = src.up.h[gi]; }
    }
    // lamps: clipped to the chunk, chunk-local coordinates
    const clip = (list, out) => {
      for (const l of list) {
        const x0 = Math.max(l.x - sx, 0), z0 = Math.max(l.z - sz, 0);
        const x1 = Math.min(l.x + l.w - sx, 16), z1 = Math.min(l.z + l.d - sz, 16);
        if (x1 > x0 && z1 > z0) out.push({ x: x0, z: z0, w: x1 - x0, d: z1 - z0, k: l.k, y: l.y, full: { x: l.x - sx, z: l.z - sz, w: l.w, d: l.d } });
      }
    };
    clip(src.lamps, L.lamps);
    clip(src.upLamps, L.upLamps);
    // objects: grid-local → world; each kept by the chunk its anchor falls in
    const mine = (x, z) => x >= ox && x < ox + 16 && z >= oz && z < oz + 16;
    for (const s of src.spirals) {
      const w = { ...s, x: s.x + gox, z: s.z + goz };
      if (w.x + 2 > ox && w.x - 2 < ox + 16 && w.z + 2 > oz && w.z - 2 < oz + 16) { w.own = mine(w.x - 0.01, w.z - 0.01); L.spirals.push(w); }
    }
    for (const rl of src.rails) {
      const w = { ...rl, x0: rl.x0 + gox, z0: rl.z0 + goz, x1: rl.x1 + gox, z1: rl.z1 + goz, ax: rl.ax + gox, az: rl.az + goz };
      if (!mine(w.ax + 0.5, w.az + 0.5)) continue;
      L.rails.push(w);
      const i = (w.az - oz) * 16 + (w.ax - ox);
      if (!L.railTiles.has(i)) L.railTiles.set(i, []);
      L.railTiles.get(i).push(w);
    }
    for (const s of src.signs) {
      const w = { ...s, x: s.x + gox, z: s.z + goz };
      if (mine(w.x - w.nx * 0.25, w.z - w.nz * 0.25)) L.signs.push(w);
    }
    for (const s of src.slides) {
      const pts = s.pts.map(([x, y, z]) => [x + gox, y, z + goz]);
      const a = s.entry ? [s.entry.x + gox - s.entry.nx * 0.25, s.entry.z + goz - s.entry.nz * 0.25] : [pts[0][0], pts[0][2]];
      if (!mine(a[0], a[1])) continue;
      L.slides.push({
        ...s, pts,
        entry: s.entry && { ...s.entry, x: s.entry.x + gox, z: s.entry.z + goz },
        land: s.land && { x: s.land.x + gox, z: s.land.z + goz },
      });
    }
    for (const s of src.suns) {
      const w = { ...s, x: s.x + gox, z: s.z + goz, wx: s.wx + gox, wz: s.wz + goz };
      if (mine(w.x, w.z)) L.suns.push(w);
    }
    for (const f of src.floaters) { const w = { ...f, x: f.x + gox, z: f.z + goz }; if (mine(w.x, w.z)) L.floaters.push(w); }
    for (const s of src.sealed) { const w = { ...s, x: s.x + gox, z: s.z + goz }; if (mine(w.x + w.w / 2, w.z + w.d / 2)) L.sealed.push(w); }

    // edges this chunk owns: west column and north row (internal zone edges stay open)
    const edge = (i, open) => {
      if (open) { if (L.tiles[i] === WALL || L.tiles[i] === DEEP || L.tiles[i] === BARS || L.tiles[i] === COLS) { L.tiles[i] = FLOOR; L.h[i] = 0; } }
      else { L.tiles[i] = WALL; L.h[i] = 0; }
      L.rdir[i] = -1; L.rise[i] = 0; L.wet[i] = 0; L.block[i] = 0;
    };
    if (!(zone && qx === 1)) { const k = edgeKind(this.seed, cx, cz, 0); for (let z = 0; z < 16; z++) edge(z * 16, isOpening(k, z)); }
    if (!(zone && qz === 1)) { const k = edgeKind(this.seed, cx, cz, 1); for (let x = 0; x < 16; x++) edge(x, isOpening(k, x)); }
    if (!(zone && qx === 1 && qz === 1)) { L.tiles[0] = WALL; L.h[0] = 0; }
    // a ceiling that always clears the highest floor
    let top = 0;
    for (let i = 0; i < 256; i++) if (walkable(L.tiles[i])) top = Math.max(top, L.h[i] + (L.tiles[i] === RAMP ? L.rise[i] : 0));
    L.minCeil = top + 2.4;
    return L;
  }

  cellOf(tx, tz) {
    const cx = Math.floor(tx / CHUNK), cz = Math.floor(tz / CHUNK);
    return [this.layout(cx, cz), (tz - cz * CHUNK) * CHUNK + (tx - cx * CHUNK)];
  }

  // tile queries in integer world tile coordinates (ground level)
  typeAt(tx, tz) { const [L, i] = this.cellOf(tx, tz); return L.tiles[i]; }
  hAt(tx, tz) { const [L, i] = this.cellOf(tx, tz); return L.h[i]; }
  upTypeAt(tx, tz) { const [L, i] = this.cellOf(tx, tz); return L.up ? L.up.tiles[i] : VOID; }
  upHAt(tx, tz) { const [L, i] = this.cellOf(tx, tz); return L.up ? L.up.h[i] : UP_H; }
  floorAt(x, z) { const [L, i] = this.cellOf(Math.floor(x), Math.floor(z)); return floorTop(L, i, x, z); }
  waterAt(tx, tz) { const [L, i] = this.cellOf(tx, tz); return groundWater(L, i); }

  // the surface a body at height curH ends up on at (x, z): ground or upper floor, whichever it can step to
  // (closest wins). Returns a shared object: copy what you need before the next call.
  surfaceAt(x, z, curH) {
    const [L, i] = this.cellOf(Math.floor(x), Math.floor(z));
    const g = walkTop(L, i, x, z), u = upTop(L, i);
    const okG = g !== null && canStep(curH, g), okU = u !== null && canStep(curH, u);
    if (!okG && !okU) return null;
    const useU = okU && (!okG || Math.abs(u - curH) < Math.abs(g - curH));
    const s = this._surf;
    s.h = useU ? u : g; s.up = useU; s.wl = useU ? upWater(L, i) : groundWater(L, i);
    return s;
  }

  // nearest surface regardless of step limits (teleports, loading a save)
  surfaceNear(x, z, curH) {
    const [L, i] = this.cellOf(Math.floor(x), Math.floor(z));
    const g = walkTop(L, i, x, z), u = upTop(L, i);
    if (g === null && u === null) return null;
    const useU = u !== null && (g === null || Math.abs(u - curH) < Math.abs(g - curH));
    const s = this._surf;
    s.h = useU ? u : g; s.up = useU; s.wl = useU ? upWater(L, i) : groundWater(L, i);
    return s;
  }

  // body corners: blocked unless some surface sits within a metre of the body's level
  // (ledges you just stepped off stay passable; walls, deep water, slabs above and drops below do not)
  blockedAt(x, z, curH) {
    const [L, i] = this.cellOf(Math.floor(x), Math.floor(z));
    const g = walkTop(L, i, x, z);
    if (g !== null && Math.abs(g - curH) <= 1) return false;
    const u = upTop(L, i);
    return !(u !== null && Math.abs(u - curH) <= 1);
  }

  // rails stop a body of radius r moving to (x, z) when it would come closer than r to a rail at its level;
  // moving along a rail or away from it is always allowed (from = previous position, optional)
  railHit(x, z, r, curH, fromX = x, fromZ = z) {
    const tx0 = Math.floor(x), tz0 = Math.floor(z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const [L, i] = this.cellOf(tx0 + dx, tz0 + dz);
      const list = L.railTiles.get(i);
      if (!list) continue;
      for (const rl of list) {
        const y = (rl.y0 + rl.y1) / 2;
        if (Math.abs(curH - y) > 0.6) continue;
        const ex = rl.x1 - rl.x0, ez = rl.z1 - rl.z0;
        const dist = (px, pz) => {
          const t = Math.max(0, Math.min(1, ((px - rl.x0) * ex + (pz - rl.z0) * ez) / (ex * ex + ez * ez)));
          return Math.hypot(px - rl.x0 - ex * t, pz - rl.z0 - ez * t);
        };
        const d = dist(x, z);
        if (d < r && d < dist(fromX, fromZ) - 1e-9) return true;
      }
    }
    return false;
  }

  // slide along rails: a move to (x, z) that would come closer than r to a rail at curH is bent round it, so the body
  // ends no nearer than it already was (or r). Head-on to a rail end this walks round the end instead of stopping.
  // Returns the corrected point, or null when nothing needed correcting. Shared array: copy before the next call.
  railPush(x, z, r, curH, fromX, fromZ) {
    let px = x, pz = z, hit = false;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      const tx0 = Math.floor(px), tz0 = Math.floor(pz);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const [L, i] = this.cellOf(tx0 + dx, tz0 + dz);
        const list = L.railTiles.get(i);
        if (!list) continue;
        for (const rl of list) {
          if (Math.abs(curH - (rl.y0 + rl.y1) / 2) > 0.6) continue;
          const ex = rl.x1 - rl.x0, ez = rl.z1 - rl.z0, ll = ex * ex + ez * ez;
          const near = (qx, qz) => {
            const t = Math.max(0, Math.min(1, ((qx - rl.x0) * ex + (qz - rl.z0) * ez) / ll));
            return [rl.x0 + ex * t, rl.z0 + ez * t];
          };
          const [cx, cz] = near(px, pz), d = Math.hypot(px - cx, pz - cz);
          if (d >= r) continue;
          const [fx, fz] = near(fromX, fromZ), dFrom = Math.hypot(fromX - fx, fromZ - fz);
          if (d >= dFrom - 1e-9) continue;
          const keep = Math.min(r + 0.002, dFrom);   // a hair outside r: the body's square corners must not land on the tile line the rail stands on
          // direction away from the rail point; right on the line, away from where we came from
          const ux = d > 1e-6 ? (px - cx) / d : fromX - fx, uz = d > 1e-6 ? (pz - cz) / d : fromZ - fz;
          const ul = Math.hypot(ux, uz) || 1;
          px = cx + (ux / ul) * keep; pz = cz + (uz / ul) * keep;
          moved = hit = true;
        }
      }
      if (!moved) break;
    }
    if (!hit) return null;
    PUSHED[0] = px; PUSHED[1] = pz;
    return PUSHED;
  }

  // a rideable slide whose mouth the body at (x, z, h) is pushing into along (fx, fz)
  slideAt(x, z, h, fx, fz) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const s of this.layout(cx + dx, cz + dz).slides) {
        const e = s.entry;
        if (!e || Math.abs(h - e.h) > 0.3 || Math.hypot(x - e.x, z - e.z) > 0.75) continue;
        if (fx * e.nx + fz * e.nz > 0.4) return s;
      }
    }
    return null;
  }

  // (tile, level) reachability from start tiles inside a box of world tiles
  reachFrom(starts, x0, z0, x1, z1) {
    return reach({
      inside: (x, z) => x >= x0 && z >= z0 && x < x1 && z < z1,
      cell: (x, z) => this.cellOf(x, z),
      railOnEdge: (x, z, d, h) => {
        const [a, b, c, e] = edgeOf(x, z, d), k = edgeKey(a, b, c, e);
        for (const [tx, tz] of [[x, z], [x + DIRS[d][0], z + DIRS[d][1]]]) {
          const [L, i] = this.cellOf(tx, tz);
          const list = L.railTiles.get(i);
          if (list && list.some((rl) => edgeKey(rl.x0, rl.z0, rl.x1, rl.z1) === k && railBlocks(rl, h))) return true;
        }
        return false;
      },
    }, starts);
  }

  // nearest tile centre of a given ground type, scanning outward in rings
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
  for (let i = 0; i < 256; i++) {
    mix(L.tiles[i]); mix(Math.round(L.h[i] * 100)); mix(L.rdir[i]); mix(L.dark[i]); mix(L.block[i]);
    if (L.up) { mix(L.up.tiles[i]); mix(Math.round(L.up.h[i] * 100)); }
  }
  for (const l of L.lamps) { mix(l.x); mix(l.z); mix(l.w); mix(l.d); mix(l.k); }
  for (const list of [L.spirals, L.rails, L.signs, L.slides, L.floaters]) mix(list.length);
  for (const s of L.signs) mix(s.cell);
  return (h >>> 0).toString(16);
}

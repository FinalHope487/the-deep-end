// Deterministic world layout: chunks of 16×16 one-metre tiles, 4 landmark zones, one exit.
// Pure data, no three.js, so it runs in node for unit tests.
import { hash2, mulberry32, rngFor } from './rng.js';
import {
  CHUNK, FLOOR, WALL, SHALLOW, DEEP, RAMP, BARS, COLS, VOID, SHALLOW_FLOOR, DEEP_FLOOR, UP_H, LEVEL_H, STEP_UP, STEP_DOWN, DIRS,
  walkable, newGrid, fill, mark, ramp, groundWater, transformGrid, xfVec, FORM_ARCH, FORM_ARCH_Z,
} from './tiles.js';
import { LevelMap, PATCH, patchOf } from './levelmap.js';
import { megaRoom, MEGA_CEIL } from './mega.js';
import { Regions } from './regions.js';
import { roundPoolCorners } from './shapes.js';
import { addFacilities } from './facilities.js';
import {
  signGate, railBlocks, walkTop, upTop, upWater, floorTop, reach, edgeKey, edgeOf, gridReach, autoRails, deepRails, autoSigns,
  scatterFloaters, toyKind, decoSlide, stairRoom, zoneTerraces, ringPassages, ladderLinks,
} from './levels.js';

export const SPAWN = { x: 8, z: 8 };

export const ZONE_NAMES = ['淺水大廳', '階梯高低池', '狹窄管道走廊', '深水黑池'];
export const ZONE_COLORS = [0xfff1d2, 0xffd76a, 0x5fe0c4, 0x4a6cff];
export const EXIT_COLOR = 0xffffff;
const ZONE_CEIL = [6, UP_H + 3.3, 2.8, 7];
const STAIR_CEIL = UP_H + 3.2;
export const STAIR_ROOM_SHARE = 0.08;   // of plain 1F chunks: a stair room standing among the regions (with its slides)
export const DECO_SLIDE_SHARE = [0.1, 0.42];   // of region chunks, from tension 0 to 1, a tube is tried (about 4 in 10 find level dry floor for it, away from towers)
export const LAMP_CLEAR = 2;           // m between a ceiling lamp and the light patch of a skylight or window
export const ROUND_POOL_SHARE = 0.4;   // of rooms (and landmark zones but zone 3): deep pools with rounded corners
const C_MID = 16.5;   // middle of a 32×32 grid's interior

const ITEM_DEFS = [
  { name: '小黃鴨', kind: 'duck' }, { name: '條紋毛巾', kind: 'towel' }, { name: '泳鏡', kind: 'goggles' },
  { name: '置物櫃鑰匙', kind: 'key' }, { name: '夾腳拖', kind: 'flipflop' }, { name: '浮板', kind: 'kickboard' },
  { name: '褪色的小黃鴨', kind: 'duck' }, { name: '濕透的毛巾', kind: 'towel' }, { name: '裂開的泳鏡', kind: 'goggles' },
  { name: '生鏽的鑰匙', kind: 'key' }, { name: '單隻拖鞋', kind: 'flipflop' }, { name: '沉重的浮板', kind: 'kickboard' },
];

function localGrid() {
  const g = newGrid(CHUNK);
  g.ox = 0; g.oz = 0;
  return g;
}

// ---------- normal rooms ----------

function roomStart(g) {
  fill(g, 11, 2, 14, 4, SHALLOW, SHALLOW_FLOOR);
  fill(g, 2, 11, 4, 14, SHALLOW, SHALLOW_FLOOR);
  g.lamps.push({ x: 6, z: 6, w: 4, d: 4, k: 1 });
  for (const [x, z] of [[2, 2], [12, 12], [2, 12], [12, 2]]) g.lamps.push({ x, z, w: 2, d: 1, k: 0 });
}

function roomExit(g) {
  g.lamps.push({ x: 5, z: 5, w: 6, d: 6, k: 1 });
}

// a straight flight between 1F and another floor: a 1F plaza on the low half (doors on three sides), then a 2-tile lane
// up or down, ending in a landing at the high side (hHigh above or below 1F) which faces direction dir
function roomStairwell(dir, hHigh) {
  let g = localGrid();
  fill(g, 0, 0, 15, 15, WALL, 0);
  fill(g, 0, 1, 8, 15, FLOOR, 0);   // to tile 8: the doors on the plaza's two long sides are 2 tiles (7-8) wide
  fill(g, 1, 0, 8, 0, FLOOR, 0);
  fill(g, 14, 7, 15, 8, FLOOR, hHigh);
  // six tiles from the plaza's edge: 0.75 m a tile for 4.5 m, about 37 degrees
  if (hHigh > 0) ramp(g, 8, 7, 13, 8, 0, 0, hHigh / 6);
  else ramp(g, 8, 7, 13, 8, 1, hHigh, -hHigh / 6);
  g.lamps.push({ x: 2, z: 3, w: 3, d: 2, k: 0 }, { x: 2, z: 10, w: 3, d: 2, k: 0 }, { x: 10, z: 7, w: 2, d: 2, k: 0 });
  // east → dir: the transform that turns +x into DIRS[dir]
  let k = 0;
  for (; k < 8; k++) { const [a, b] = xfVec(k, 1, 0); if (a === DIRS[dir][0] && b === DIRS[dir][1]) break; }
  g = transformGrid(g, k);
  g.kind = 'stairwell';
  return g;
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

const ZONE_LEVEL = [0, 0, 1, -1];   // zones 1–2 on 1F, zone 3 on 2F, zone 4 on B1; the exit is on 2F

// Zones and the exit sit on whole 3×3-chunk patches (see levelmap.js): a zone fills the patch's north-west 2×2 chunks,
// the exit is the patch's middle chunk. Distances are checked on the snapped positions; if no patch fits the range the
// nearest one is taken so placement never fails.
function placeZones(seed) {
  const r = mulberry32(hash2(seed, 0, 0, 1001));
  const zones = [];
  const keep1F = [[-1, -1], [0, -1], [-1, 0], [0, 0]];   // patches that stay 1F: the start area, then the 1F zones
  const nearKept = (i, j) => keep1F.some(([a, b]) => Math.abs(a - i) <= 1 && Math.abs(b - j) <= 1);
  const even = (i, j) => ((i + j) & 1) === 0;
  const pick = (cands, lo, hi) => {
    const fit = cands.filter((c) => c.d >= lo && c.d <= hi);
    if (fit.length) return fit[(r() * fit.length) | 0];
    return cands.reduce((a, b) => (Math.abs(b.d - (lo + hi) / 2) < Math.abs(a.d - (lo + hi) / 2) ? b : a));
  };
  let px = SPAWN.x, pz = SPAWN.z;
  for (let k = 0; k < 4; k++) {
    const [lo, hi] = k === 0 ? [60, 90] : [120, 160];
    const level = ZONE_LEVEL[k], span = Math.ceil(hi / (PATCH * CHUNK)) + 2;
    const cands = [];
    for (let pj = patchOf(Math.floor(pz / CHUNK)) - span; pj <= patchOf(Math.floor(pz / CHUNK)) + span; pj++) for (let pi = patchOf(Math.floor(px / CHUNK)) - span; pi <= patchOf(Math.floor(px / CHUNK)) + span; pi++) {
      if (level !== 0 && (!even(pi, pj) || nearKept(pi, pj))) continue;
      if (zones.some((z) => Math.max(Math.abs(z.pi - pi), Math.abs(z.pj - pj)) < 2)) continue;
      if (rectsOverlap(START_RECT, { cx0: pi * PATCH, cz0: pj * PATCH }, 2)) continue;
      cands.push({ pi, pj, d: Math.hypot((pi * PATCH + 1) * CHUNK - px, (pj * PATCH + 1) * CHUNK - pz) });
    }
    const c = pick(cands, lo, hi);
    const zone = { index: k, level, pi: c.pi, pj: c.pj, cx0: c.pi * PATCH, cz0: c.pj * PATCH };
    zone.x = (zone.cx0 + 1) * CHUNK;
    zone.z = (zone.cz0 + 1) * CHUNK;
    zones.push(zone);
    if (level === 0) keep1F.push([c.pi, c.pj]);
    px = zone.x; pz = zone.z;
  }
  // exit: the middle chunk of a 2F patch about 60 m from the last zone
  const cands = [];
  for (let pj = patchOf(Math.floor(pz / CHUNK)) - 3; pj <= patchOf(Math.floor(pz / CHUNK)) + 3; pj++) for (let pi = patchOf(Math.floor(px / CHUNK)) - 3; pi <= patchOf(Math.floor(px / CHUNK)) + 3; pi++) {
    if (!even(pi, pj) || nearKept(pi, pj) || zones.some((z) => z.pi === pi && z.pj === pj)) continue;
    const cx = pi * PATCH + 1, cz = pj * PATCH + 1;
    cands.push({ pi, pj, cx, cz, d: Math.hypot(cx * CHUNK + 8 - px, cz * CHUNK + 8 - pz) });
  }
  const c = pick(cands, 50, 70);
  const ex = c.cx * CHUNK + 8, ez = c.cz * CHUNK + 8;
  const exit = { cx: c.cx, cz: c.cz, pi: c.pi, pj: c.pj, x: ex, z: ez, level: 1, yaw: Math.atan2(Math.cos(Math.atan2(ez - pz, ex - px)), Math.sin(Math.atan2(ez - pz, ex - px))) };
  return { zones, exit };
}

// ---------- edges ----------

// Edge between chunk (cx-1,cz) and (cx,cz) is chunk (cx,cz)'s column 0 (dir 0);
// edge between (cx,cz-1) and (cx,cz) is its row 0 (dir 1). 0 open, 1 wide door, 2 narrow door.
export function edgeKind(seed, cx, cz, dir) {
  const v = hash2(seed, cx, cz, 11 + dir) / 4294967296;
  return v < 0.25 ? 0 : v < 0.7 ? 1 : 2;
}

// can any tile of doorway lo..hi be walked through: floor on both sides a step from each other (grids drawn at ha / hb)
function doorThrough(A, B, dir, lo, hi, ha, hb) {
  for (let t = lo; t <= hi; t++) {
    const i = dir ? 240 + t : t * 16 + 15, j = dir ? 16 + t : t * 16 + 1, a = ha + A.h[i], b = hb + B.h[j];
    if (walkable(A.tiles[i]) && walkable(B.tiles[j]) && canStep(a, b) && canStep(b, a)) return true;
  }
  return false;
}

export function isOpening(kind, i) {
  if (i === 0) return false;
  if (kind === 0) return true;
  if (kind === 1) return i >= 6 && i <= 9;
  return i >= 7 && i <= 8;
}

// ---------- world ----------

const GRID_KEYS = ['tiles', 'h', 'rdir', 'rise', 'dark', 'low', 'wet', 'block', 'form', 'corner', 'rim'];
const PUSHED = [0, 0];

// lift a chunk generated on a floor at height 0 by b metres (B1 -3, 2F +3)
function shiftLevel(L, b) {
  for (let i = 0; i < 256; i++) { L.h[i] += b; if (L.corner[i]) L.rim[i] += b; }
  for (const rl of L.rails) { rl.y0 += b; rl.y1 += b; }
  for (const s of L.signs) s.y += b;
  for (const s of L.slides) { s.pts = s.pts.map(([x, y, z]) => [x, y + b, z]); if (s.entry) s.entry.h += b; }
  for (const f of L.floaters) f.y += b;
  for (const s of L.spirals) { s.h0 += b; s.h1 += b; }
  for (const l of L.ladders) { l.h0 += b; l.h1 += b; }
  for (const s of L.suns) if (s.wy !== undefined) s.wy += b;
  for (const l of L.lamps) if (l.y !== undefined) l.y += b;
}

export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.cache = new Map();
    this.rooms = new Map();      // chunk → its room grid before the edges are cut, and its ceiling variation
    this.doors = new Map();      // doorway → where it sits along the edge and the passage cut on each side (null: the middle)
    this.grids = [];
    this.megaGrids = new Map();
    this.tension = 0;            // the game sets it (0..1); a room generated later digs its shallow pools deeper more often
    const { zones, exit } = placeZones(this.seed);
    this.zones = zones;
    this.exit = exit;
    this.lm = new LevelMap(this.seed, zones, exit);
    this.regions = new Regions(this.seed, () => this.tension, (x, z) => this.keepClear(x, z));
    this.basement = new Regions((this.seed ^ 0x5b15b1) >>> 0, () => this.tension, (x, z) => this.keepClear(x, z), 'b1');
    this.regionChunks = new Map();
    this.items = [];
    for (const z of zones) this.items.push(...this.zoneItems(z));
    this._surf = { h: 0, wl: NaN, up: false };
  }

  zoneGrid(k) {
    if (!this.grids[k]) {
      const g = ZONE_GEN[k](rngFor(this.seed, k, 0, 2001));
      if (k !== 2 && hash2(this.seed, k, 0, 6001) / 4294967296 < ROUND_POOL_SHARE) roundPoolCorners(g);
      const tr = rngFor(this.seed, k, 0, 2002);   // its toys follow the tension it is first generated at, like any chunk
      for (const f of g.floaters) f.kind = toyKind(tr, this.tension);
      this.grids[k] = g;
    }
    return this.grids[k];
  }

  // the 32×32 grid of a mega room (see mega.js)
  megaGrid(m) {
    const key = m.i + ',' + m.j;
    let g = this.megaGrids.get(key);
    if (!g) { g = megaRoom(m, this.lm.megaPorts(m)); this.megaGrids.set(key, g); }
    return g;
  }

  // mega rooms within `patches` patches of (x, z), nearest first; x, z is the middle of the room
  megasNear(x, z, patches = 8) {
    const pi = patchOf(Math.floor(x / CHUNK)), pj = patchOf(Math.floor(z / CHUNK)), out = [];
    for (let j = pj - patches; j <= pj + patches; j++) for (let i = pi - patches; i <= pi + patches; i++) {
      const m = this.lm.megaPatch(i, j);
      if (m) out.push({ ...m, x: (m.cx0 + 1) * CHUNK, z: (m.cz0 + 1) * CHUNK });
    }
    return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
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
        x: zone.cx0 * CHUNK + x + 0.5, z: zone.cz0 * CHUNK + z + 0.5, h: (up ? g.up.h[z * 32 + x] : g.h[z * 32 + x]) + zone.level * LEVEL_H,
      };
    });
  }

  zoneAtChunk(cx, cz) {
    for (const z of this.zones) {
      if (cx >= z.cx0 && cx <= z.cx0 + 1 && cz >= z.cz0 && cz <= z.cz0 + 1) return z;
    }
    return null;
  }

  // an ordinary room chunk's grid as its template left it (both sides of a doorway plan their passage on these)
  room(cx, cz) {
    const key = (cx + 32768) * 65536 + (cz + 32768);
    let o = this.rooms.get(key);
    if (!o) {
      const r = rngFor(this.seed, cx, cz, 17);
      const g = this.roomGrid(cx, cz, r, this.lm.levelOf(cx, cz), this.lm.stairOf(cx, cz));
      o = { g, ceilVar: g.kind === 'region' ? 0 : r() * 0.5 };
      if (this.rooms.size > 800) this.rooms.delete(this.rooms.keys().next().value);
      this.rooms.set(key, o);
    }
    return o;
  }

  // a single-chunk room's grid (not a landmark zone or a mega room)
  single(cx, cz) { return this.isSingle(cx, cz) ? this.room(cx, cz).g : null; }
  isSingle(cx, cz) { return !this.zoneAtChunk(cx, cz) && !this.lm.megaChunk(cx, cz); }

  // the height a chunk's grid is drawn at (a stair chunk's grid spans its floors from 1F)
  baseOf(cx, cz) { return this.lm.stairOf(cx, cz) ? 0 : this.lm.levelOf(cx, cz) * LEVEL_H; }

  // the doorway on chunk (cx, cz)'s west (dir 0) or north (dir 1) edge between two single-chunk rooms: { closed } when no tile
  // of it can be walked through (it is walled up), else null
  door(cx, cz, dir) {
    const key = ((cx + 32768) * 65536 + (cz + 32768)) * 2 + dir;
    if (this.doors.has(key)) return this.doors.get(key);
    let d = null;
    const e = this.lm.edge(cx, cz, dir), k = e.narrow ? 2 : edgeKind(this.seed, cx, cz, dir);
    const A = e.open && this.single(dir ? cx : cx - 1, dir ? cz - 1 : cz), B = A && this.single(cx, cz);
    if (B) {
      const w = k === 1 ? 4 : 2, mid = k === 1 ? 6 : 7;
      const ha = this.baseOf(dir ? cx : cx - 1, dir ? cz - 1 : cz), hb = this.baseOf(cx, cz);
      if (!(k === 0 ? doorThrough(A, B, dir, 1, 15, ha, hb) : doorThrough(A, B, dir, mid, mid + w - 1, ha, hb))) d = { closed: true };
    }
    if (this.doors.size > 3200) this.doors.delete(this.doors.keys().next().value);
    this.doors.set(key, d);
    return d;
  }

  // the region generator of a floor: B1 has its own
  regionsOf(lv) { return lv < 0 ? this.basement : this.regions; }

  // a chunk of continuous region floor (batch 6): any floor, not the start room, a stair, zone, mega room, exit or stair room
  isRegion(cx, cz) {
    const key = (cx + 32768) * 65536 + (cz + 32768);
    let v = this.regionChunks.get(key);
    if (v === undefined) {
      v = !(cx === 0 && cz === 0) && !this.lm.stairOf(cx, cz) && !this.zoneAtChunk(cx, cz)
        && !this.lm.megaChunk(cx, cz) && !(this.exit && cx === this.exit.cx && cz === this.exit.cz) && !this.stairRoomAt(cx, cz);
      if (this.regionChunks.size > 20000) this.regionChunks.clear();
      this.regionChunks.set(key, v);
    }
    return v;
  }

  // one piece of the work chunk (cx, cz)'s layout will need, done ahead so no frame does it all: a region it touches, a
  // stage of a region floor grid, then the room grid of itself or of a neighbour whose doorway it reads. False when
  // nothing is left (its layout is cheap)
  prepare(cx, cz) {
    for (const [dx, dz] of [[0, 0], [-1, 0], [0, -1], [1, 0], [0, 1]]) {
      const x = cx + dx, z = cz + dz;
      if (this.rooms.has((x + 32768) * 65536 + (z + 32768)) || !this.isSingle(x, z)) continue;
      const R = this.regionsOf(this.lm.levelOf(x, z));
      if (this.isRegion(x, z) && (R.prepare(x, z) || R.step(x, z))) return true;
      this.room(x, z);
      return true;
    }
    return false;
  }

  // two region chunks on the same floor: no edge between them
  joinsRegion(ax, az, bx, bz) { return this.isRegion(ax, az) && this.isRegion(bx, bz) && this.lm.levelOf(ax, az) === this.lm.levelOf(bx, bz); }

  // the stair rooms that still stand among the regions as chunks of their own
  stairRoomAt(cx, cz) { return this.lm.isPlain(cx, cz) && hash2(this.seed, cx, cz, 6030) / 4294967296 < STAIR_ROOM_SHARE; }

  // world tiles a region must leave as plain dry floor: anything outside region chunks, anything within two tiles of
  // another kind of chunk (its doorways and walls), and the start area's spine north of spawn
  keepClear(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (!this.isRegion(cx, cz)) return true;
    const ex = lx < 2 ? -1 : lx > 13 ? 1 : 0, ez = lz < 2 ? -1 : lz > 13 ? 1 : 0;   // the neighbours within 2 tiles, corners too
    const go = (a, b) => this.joinsRegion(cx, cz, cx + a, cz + b);
    if ((ex && !go(ex, 0)) || (ez && !go(0, ez)) || (ex && ez && !go(ex, ez))) return true;
    return cx === 0 && cz === -1 && lx >= 6 && lx <= 9;
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
  roomGrid(cx, cz, r, lv, stair) {
    const isExit = this.exit && cx === this.exit.cx && cz === this.exit.cz;
    let g = localGrid(), kind;
    if (stair) { g = roomStairwell(stair.dir, stair.level * LEVEL_H); g.kind = 'stairwell'; return g; }
    if (this.isRegion(cx, cz)) {
      const R = this.regionsOf(lv);
      g = R.chunk(cx, cz);
      // towers with ladders, spiral stairs and slides: where the land asks for them, then scattered by the tension; then a rail
      // on every drop of 0.7 m and more
      addFacilities(g, r, this.tension, (x, z) => R.region(R.tileId(cx * CHUNK + x, cz * CHUNK + z)).arche, (x, z) => this.keepClear(cx * CHUNK + x, cz * CHUNK + z));
      autoRails(g, 0.7);
      autoSigns(g, r, 1, { gate: signGate(hash2(this.seed, cx, cz, 6012) / 4294967296) });
      scatterFloaters(g, r, 0.08, this.tension);
      // the odd tube coiling down from the ceiling, wherever there is room (commoner as tension rises)
      if (r() < DECO_SLIDE_SHARE[0] + (DECO_SLIDE_SHARE[1] - DECO_SLIDE_SHARE[0]) * this.tension) {
        for (let t = 0; t < 24; t++) {
          const x = 3 + ((r() * 10) | 0), z = 3 + ((r() * 10) | 0);
          let free = true;
          for (let dz = -2; dz <= 2 && free; dz++) for (let dx = -2; dx <= 2; dx++) {
            const i = (z + dz) * 16 + x + dx;
            if (g.tiles[i] !== FLOOR || Math.abs(g.h[i]) > 0.01 || g.wet[i]) { free = false; break; }   // level dry floor all round
          }
          for (const t of g.towers) if (x >= t.x0 - 4 && x <= t.x1 + 4 && z >= t.z0 - 4 && z <= t.z1 + 4) free = false;   // clear of a tower and its way up
          if (free) { decoSlide(g, x + 0.5, z + 0.5, r); break; }
        }
      }
      return g;
    }
    if (this.stairRoomAt(cx, cz)) { kind = 'stairs'; g = stairRoom(r); }
    else if (isExit) { kind = 'exit'; roomExit(g); }
    else { kind = 'start'; roomStart(g); }   // every other chunk is region floor
    if (kind !== 'start' && kind !== 'exit') {
      autoRails(g);
      // one sign at most, shown from the room's own tension on (a sign the room already carries, such as a niche's chalk, is that one)
      const gate = signGate(hash2(this.seed, cx, cz, 6012) / 4294967296);
      if (g.signs.length) { g.signs.length = 1; g.signs[0].minT = Math.max(g.signs[0].minT, gate); }
      else autoSigns(g, r, 1, { gate });
      scatterFloaters(g, r, 0.08, this.tension);
    }
    g.kind = kind;
    return g;
  }

  generate(cx, cz) {
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const L = {
      cx, cz, n: CHUNK, ox, oz, kind: '', zone: -1, variant: '', up: null,
      lamps: [], upLamps: [], spirals: [], rails: [], signs: [], slides: [], suns: [], floaters: [], sealed: [], ladders: [], towers: [],
      railTiles: new Map(), ceilVar: 0, ceilFixed: 0, minCeil: 0, lv: 0, baseY: 0, stair: null, cold: false, poolLit: false, mega: null,
    };
    const zone = this.zoneAtChunk(cx, cz);
    const mega = zone ? null : this.lm.megaChunk(cx, cz);
    const big = zone || mega;   // landmark zones and mega rooms are 2×2 chunks cut from one 32×32 grid
    const lv = this.lm.levelOf(cx, cz), stair = this.lm.stairOf(cx, cz);
    L.lv = lv;
    L.stair = stair;
    L.baseY = stair ? 0 : lv * LEVEL_H;
    L.cold = L.baseY < 0;
    // one lamp shape per chunk (per landmark zone, whose lamps cross chunk edges): 80% round, 20% square
    L.lampShape = (mega ? hash2(this.seed, mega.i, mega.j, 5152) : hash2(this.seed, zone ? zone.index : cx, zone ? 0 : cz, zone ? 5151 : 5150)) / 4294967296 < 0.8 ? 'round' : 'square';
    let qx = 0, qz = 0, src, sx = 0, sz = 0, gox = ox, goz = oz;
    if (big) {
      qx = cx - big.cx0; qz = cz - big.cz0;
      src = zone ? this.zoneGrid(zone.index) : this.megaGrid(mega);
      sx = qx * 16; sz = qz * 16;
      gox = big.cx0 * CHUNK; goz = big.cz0 * CHUNK;
      L.kind = zone ? 'zone' : 'mega';
      if (zone) { L.zone = zone.index; L.ceilFixed = ZONE_CEIL[zone.index]; }
      else {
        L.ceilFixed = MEGA_CEIL;
        L.mega = { ...src.mega, cx: gox + C_MID, cz: goz + C_MID, rect: [gox + 6, goz + 6, gox + 27, goz + 27], poolR: 10.5 };
      }
    } else {
      const room = this.room(cx, cz);
      src = room.g;
      L.kind = src.kind;
      L.variant = src.variant || '';
      if (src.up) L.ceilFixed = STAIR_CEIL;
      if (src.ceilT) {   // region floor: a ceiling per tile, the chunk's own is the highest of them
        L.ceilT = src.ceilT.slice();
        L.ceilFixed = L.ceilT.reduce((a, b) => Math.max(a, b), 0);
      }
      L.ceilVar = room.ceilVar;
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
        if (x1 > x0 && z1 > z0) out.push({ x: x0, z: z0, w: x1 - x0, d: z1 - z0, k: l.k, y: l.y, round: l.round, full: { x: l.x - sx, z: l.z - sz, w: l.w, d: l.d } });
      }
    };
    // no ceiling lamp within LAMP_CLEAR of a skylight's or a framed window's patch of light
    const gap = (l, s) => Math.hypot(Math.max(0, Math.abs(l.x + l.w / 2 - s.x) - (l.w + s.w) / 2), Math.max(0, Math.abs(l.z + l.d / 2 - s.z) - (l.d + s.d) / 2));
    clip(src.suns.length ? src.lamps.filter((l) => l.k !== 0 || src.suns.every((s) => gap(l, s) >= LAMP_CLEAR)) : src.lamps, L.lamps);
    clip(src.upLamps, L.upLamps);
    if (src.glow) L.glow = src.glow;   // region floor: every lamp near enough to light this chunk, whichever chunk holds it
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
        core: s.core && { ...s.core, x: s.core.x + gox, z: s.core.z + goz },
      });
    }
    for (const s of src.suns) {
      const w = { ...s, x: s.x + gox, z: s.z + goz, wx: s.wx + gox, wz: s.wz + goz };
      if (mega) {   // a sun patch reaches over several chunks: each lights its own floor, the one holding its middle draws it
        const hw = w.w / 2 + 1.6, hd = w.d / 2 + 1.6;
        if (w.x + hw > ox && w.x - hw < ox + 16 && w.z + hd > oz && w.z - hd < oz + 16) L.suns.push({ ...w, own: mine(w.x, w.z) });
      } else if (s.own !== undefined || mine(w.x, w.z)) L.suns.push(w);   // region floor shares its skylights out itself
    }
    for (const f of src.floaters) { const w = { ...f, x: f.x + gox, z: f.z + goz }; if (mine(w.x, w.z)) L.floaters.push(w); }
    for (const l of src.ladders) L.ladders.push({ ...l, x: l.x + gox, z: l.z + goz });   // region floor only: always inside its chunk
    for (const t of src.towers) L.towers.push({ ...t, x0: t.x0 + gox, z0: t.z0 + goz, x1: t.x1 + gox, z1: t.z1 + goz });
    for (const s of src.sealed) { const w = { ...s, x: s.x + gox, z: s.z + goz }; if (mine(w.x + w.w / 2, w.z + w.d / 2)) L.sealed.push(w); }

    // edges this chunk owns: west column and north row (internal zone edges stay open)
    const edge = (i, open) => {
      const vault = open && L.tiles[i] === FLOOR ? L.form[i] & (FORM_ARCH | FORM_ARCH_Z) : 0;   // a corridor's vault runs on through its open door
      if (open) { if (L.tiles[i] === WALL || L.tiles[i] === DEEP || L.tiles[i] === BARS || L.tiles[i] === COLS) { L.tiles[i] = FLOOR; L.h[i] = 0; } }
      else { L.tiles[i] = WALL; L.h[i] = 0; }
      L.rdir[i] = -1; L.rise[i] = 0; L.wet[i] = 0; L.block[i] = 0; L.form[i] = vault; L.corner[i] = 0;
    };
    // a doorway only opens where both sides have a floor at the same height (see levelmap.js); stair lanes are 2 tiles wide
    const region = src.kind === 'region';
    if (!(big && qx === 1) && !(region && this.joinsRegion(cx, cz, cx - 1, cz))) {
      const e = this.lm.edge(cx, cz, 0), k = e.narrow ? 2 : edgeKind(this.seed, cx, cz, 0), d = !big && this.door(cx, cz, 0);
      for (let z = 0; z < 16; z++) edge(z * 16, e.open && !(d && d.closed) && isOpening(k, z));
    }
    if (!(big && qz === 1) && !(region && this.joinsRegion(cx, cz, cx, cz - 1))) {
      const e = this.lm.edge(cx, cz, 1), k = e.narrow ? 2 : edgeKind(this.seed, cx, cz, 1), d = !big && this.door(cx, cz, 1);
      for (let x = 0; x < 16; x++) edge(x, e.open && !(d && d.closed) && isOpening(k, x));
    }
    if (!(big && qx === 1 && qz === 1) && !region) { L.tiles[0] = WALL; L.h[0] = 0; }
    // everything above was drawn on a floor at 0: lift it onto B1 / 2F
    const base = zone ? zone.level * LEVEL_H : L.baseY;
    L.baseY = base;
    L.cold = base < 0;
    if (base) shiftLevel(L, base);
    // a ceiling (measured from the chunk's own floor) that always clears the highest floor
    let top = base;
    for (let i = 0; i < 256; i++) if (walkable(L.tiles[i])) top = Math.max(top, L.h[i] + (L.tiles[i] === RAMP ? L.rise[i] : 0));
    L.minCeil = top - base + 2.4;
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
    const g = walkTop(L, i, x, z), u = upTop(L, i, x, z);
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
    const g = walkTop(L, i, x, z), u = upTop(L, i, x, z);
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
    const u = upTop(L, i, x, z);
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

  // the ladder a body at (x, z), height h, moving along (fx, fz) gets onto: from its foot towards it, or from the platform
  // over its top edge. { ladder, up } or null
  ladderAt(x, z, h, fx, fz) {
    const [L] = this.cellOf(Math.floor(x), Math.floor(z));
    for (const l of L.ladders) {
      const along = Math.abs((x - l.x) * l.nz - (z - l.z) * l.nx), off = (x - l.x) * l.nx + (z - l.z) * l.nz, out = fx * l.nx + fz * l.nz;
      if (along > 0.45) continue;
      if (Math.abs(h - l.h0) < 0.3 && off > 0 && off < 0.75 && out < -0.5) return { ladder: l, up: true };
      if (Math.abs(h - l.h1) < 0.3 && off < 0 && off > -0.75 && out > 0.5) return { ladder: l, up: false };
    }
    return null;
  }

  // (tile, level) reachability from start tiles inside a box of world tiles; ladders join their foot and top
  reachFrom(starts, x0, z0, x1, z1) {
    return reach({
      links: (x, z) => ladderLinks(this.cellOf(x, z)[0].ladders, x, z),
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

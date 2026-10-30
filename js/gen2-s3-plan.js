// S3 slice 1: the subdivision planner. Pure data: one hall in, a list of sub-rooms out. Nothing here reads a World2, the game, or the RNG streams of
// T3-T6; the streams are seeded from (seed, spaceId) under their own salts, so a plan does not depend on what was planned before it.
//
// A hall is cut by taking space away round its edges and in its middle, never by moving what is already there. Three things stay whole: the cells
// the caller lists in `protect` (stairs, pools, columns, corridor mouths: protectedRectsFor lists them for a real hall), a 3 m cross through the hall's
// middle, and a 1 m margin round both. Whatever is left must stay one connected floor, and every sub-room has one doorway whose approach is free.
// A candidate that breaks any of this is dropped and the hall keeps that space: the plan may cut less than its mode asks, never more.
//
// Where the rooms stand depends on how many there are. ONE room has no placement rule: it may touch any wall of the hall or none. TWO OR MORE rooms
// form one cluster that starts in a corner of the hall: the first room touches two walls of the hall, every later room shares a wall with a room
// already there, flush with one end of it and no longer than it, so no strip is left between them. The planner tries the cluster first and falls
// back to one free room only when no cluster of two fits; it never grows a free room into a cluster. Two rooms that do not share a wall keep SPACING apart.
//
// Sub-room: { subspaceId, parentSpaceId, nominalLevel, elevation?, ceil, shape, portals }.
//  - shape { type: 'rect-union', rects } is the OUTER footprint, wall included (the wall is PART_WALL thick, inside the footprint). One rectangle for now.
//  - elevation is the absolute height of the floor (parent.floorY + 0.4 or 0.8, never more than STEP2); left out, the room shares its parent's floor.
//    ceil is the height of the ceiling over the sub-room's OWN floor (parent.ceil - rise, at least 2.5).
//  - portals: one { type: 'door', side, rect, approach } (the 2 m gap in the wall strip and the free 2 m x 2 m floor in front of it).
import { hash2, mulberry32 } from './rng.js';

export const S3_SALT = 9900;           // own RNG stream, none of T3-T6 uses it; the cluster search draws from S3_SALT + 1 and the single room from S3_SALT + 2
export const Q = 0.5;                  // every rectangle edge sits on this grid (the same as Q2 in gen2.js)
export const PART_WALL = 0.5;          // thickness of a sub-room's wall
export const DOOR_W = 2;               // width of a doorway
export const APPROACH = 2;             // free floor in front of a doorway
export const SPACING = 2;              // free floor between two sub-rooms that do not share a wall
export const EDGE_CLEAR = 1.5;         // a sub-room touches its hall's wall or keeps at least this much floor from it
export const MIN_SIDE = 4;
export const MAX_SIDE = 14;
export const MIN_HALL = 14;            // a hall with a shorter side than this is not cut
export const CENTRE_BAND = 3;          // the cross through the hall's middle that stays open
export const PROTECT_MARGIN = 1;       // floor kept round every protected rectangle
export const STEP_SHARE = 0.3;         // share of rooms that stand a step up
export const RISES = [0.4, 0.8];       // the rise of such a step: at most STEP2 (0.8) so the body takes it
export const MIN_AIR = 2.5;            // air a split-level room keeps over its own floor
export const STEP_MIN_CEIL = 3.5;      // a hall with a lower ceiling than this gets no split level
export const TRIES = 60;
const ROOT_TRIES = 6;                  // corner rooms the cluster search starts from before it gives the hall one free room
export const BANDS = { none: [0, 0], partial: [0.1, 0.4], high: [0.6, 0.9] };
const MODE_AT = [0.2, 0.9];            // draw below 0.2: none, below 0.9: partial, else high  (20 / 70 / 10)
const S3_EPS = 1e-9;
const S3_SIDES = ['x0', 'x1', 'z0', 'z1'];

export const subdivisionMode = (draw) => (draw < MODE_AT[0] ? 'none' : draw < MODE_AT[1] ? 'partial' : 'high');

const isNum = (v) => typeof v === 'number';
const s3OnGrid = (v) => Math.abs(v / Q - Math.round(v / Q)) < S3_EPS;
const badInput = () => new TypeError('Invalid subdivision input');
const s3BadGeometry = () => new RangeError('Invalid subdivision geometry');
const s3StrHash = (s) => { let h = 0x811c9dc5; for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 0x01000193); return h >>> 0; };
const s3RectOf = (r) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });
const s3Hit = (a, b) => a.x0 < b.x1 - S3_EPS && b.x0 < a.x1 - S3_EPS && a.z0 < b.z1 - S3_EPS && b.z0 < a.z1 - S3_EPS;
const rectGap = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
const s3Area = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const s3DeepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) s3DeepFreeze(o[k]); } return o; };

function readRect(r, { grid }) {
  if (r === null || typeof r !== 'object' || !isNum(r.x0) || !isNum(r.x1) || !isNum(r.z0) || !isNum(r.z1)) throw badInput();
  if (![r.x0, r.x1, r.z0, r.z1].every(Number.isFinite) || !(r.x1 > r.x0) || !(r.z1 > r.z0)) throw s3BadGeometry();
  if (grid && ![r.x0, r.x1, r.z0, r.z1].every(s3OnGrid)) throw s3BadGeometry();
  return s3RectOf(r);
}

function readInput(o) {
  if (o === null || typeof o !== 'object') throw badInput();
  const { seed, spaceId, parent, protect = [], special = false, flatOnly = false } = o;
  if (!Number.isInteger(seed) || typeof spaceId !== 'string' || spaceId === '' || typeof special !== 'boolean' || typeof flatOnly !== 'boolean' || !Array.isArray(protect)) throw badInput();
  if (parent === null || typeof parent !== 'object' || !Number.isInteger(parent.lv) || !isNum(parent.ceil) || (parent.floorY !== undefined && !isNum(parent.floorY))) throw badInput();
  const P = readRect(parent, { grid: true });
  if (!Number.isFinite(parent.ceil) || parent.ceil <= 0 || !Number.isFinite(parent.floorY ?? 0)) throw s3BadGeometry();
  return { seed, spaceId, parent: { ...P, lv: parent.lv, ceil: parent.ceil, floorY: parent.floorY ?? 0 }, protect: protect.map((r) => readRect(r, { grid: false })), special, flatOnly };
}

// ---- the grid: one cell per Q x Q of the hall ----------------------------------------------------------------------------------------------------
function makeGrid(P) {
  const nx = Math.round((P.x1 - P.x0) / Q), nz = Math.round((P.z1 - P.z0) / Q);
  return { P, nx, nz, cx: (a) => P.x0 + (a + 0.5) * Q, cz: (b) => P.z0 + (b + 0.5) * Q };
}
const each = (g, rect, fn) => {   // every cell whose centre lies inside rect
  const a0 = Math.max(0, Math.ceil((rect.x0 - g.P.x0) / Q - 0.5 - S3_EPS)), a1 = Math.min(g.nx - 1, Math.floor((rect.x1 - g.P.x0) / Q - 0.5 + S3_EPS));
  const b0 = Math.max(0, Math.ceil((rect.z0 - g.P.z0) / Q - 0.5 - S3_EPS)), b1 = Math.min(g.nz - 1, Math.floor((rect.z1 - g.P.z0) / Q - 0.5 + S3_EPS));
  for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) fn(a + b * g.nx);
};
const stamp = (g, rects, arr, v = 1) => { for (const r of rects) each(g, r, (k) => { arr[k] = v; }); };

// one connected floor? every cell not under a sub-room must reach every other (4-neighbour flood fill)
function s3Connected(g, block) {
  const n = g.nx * g.nz, seen = new Uint8Array(n), queue = new Int32Array(n);
  let start = -1, free = 0;
  for (let k = 0; k < n; k++) if (!block[k]) { free++; if (start < 0) start = k; }
  if (free === 0) return true;
  let head = 0, tail = 0, reached = 0;
  seen[start] = 1; queue[tail++] = start;
  while (head < tail) {
    const k = queue[head++], a = k % g.nx, b = (k - a) / g.nx;
    reached++;
    if (a > 0 && !block[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; queue[tail++] = k - 1; }
    if (a < g.nx - 1 && !block[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; queue[tail++] = k + 1; }
    if (b > 0 && !block[k - g.nx] && !seen[k - g.nx]) { seen[k - g.nx] = 1; queue[tail++] = k - g.nx; }
    if (b < g.nz - 1 && !block[k + g.nx] && !seen[k + g.nx]) { seen[k + g.nx] = 1; queue[tail++] = k + g.nx; }
  }
  return reached === free;
}

const centreBand = (P) => { const mx = (P.x0 + P.x1) / 2, mz = (P.z0 + P.z1) / 2, h = CENTRE_BAND / 2; return [{ x0: P.x0, x1: P.x1, z0: mz - h, z1: mz + h }, { x0: mx - h, x1: mx + h, z0: P.z0, z1: P.z1 }]; };

// the doorway of a rectangle on `side`, its centre c along the wall: the 2 m gap in the wall strip and the 2 m x 2 m floor in front of it
export function doorOn(R, side, c) {
  const h = DOOR_W / 2;
  if (side === 'x0') return { type: 'door', side, rect: { x0: R.x0, x1: R.x0 + PART_WALL, z0: c - h, z1: c + h }, approach: { x0: R.x0 - APPROACH, x1: R.x0, z0: c - h, z1: c + h } };
  if (side === 'x1') return { type: 'door', side, rect: { x0: R.x1 - PART_WALL, x1: R.x1, z0: c - h, z1: c + h }, approach: { x0: R.x1, x1: R.x1 + APPROACH, z0: c - h, z1: c + h } };
  if (side === 'z0') return { type: 'door', side, rect: { x0: c - h, x1: c + h, z0: R.z0, z1: R.z0 + PART_WALL }, approach: { x0: c - h, x1: c + h, z0: R.z0 - APPROACH, z1: R.z0 } };
  return { type: 'door', side, rect: { x0: c - h, x1: c + h, z0: R.z1 - PART_WALL, z1: R.z1 }, approach: { x0: c - h, x1: c + h, z0: R.z1, z1: R.z1 + APPROACH } };
}
const s3Inside = (P, r) => r.x0 >= P.x0 - S3_EPS && r.x1 <= P.x1 + S3_EPS && r.z0 >= P.z0 - S3_EPS && r.z1 <= P.z1 + S3_EPS;

// How two rooms meet. 'wall': they share a wall of positive length, the shorter side lies inside the longer and is flush with one end of it.
// 'apart': a gap of gap > 0. 'bad': they overlap, touch at a corner point only, or share a wall from the middle or only in part.
export function s3Meet(a, b) {
  if (s3Hit(a, b)) return { kind: 'bad', gap: 0 };
  const gap = rectGap(a, b);
  if (gap > S3_EPS) return { kind: 'apart', gap };
  const sideBySide = Math.abs(a.x1 - b.x0) < S3_EPS || Math.abs(b.x1 - a.x0) < S3_EPS;
  const [a0, a1, b0, b1] = sideBySide ? [a.z0, a.z1, b.z0, b.z1] : [a.x0, a.x1, b.x0, b.x1];
  if (Math.min(a1, b1) - Math.max(a0, b0) <= S3_EPS) return { kind: 'bad', gap: 0 };
  const nested = (a0 >= b0 - S3_EPS && a1 <= b1 + S3_EPS) || (b0 >= a0 - S3_EPS && b1 <= a1 + S3_EPS);
  const flush = Math.abs(a0 - b0) < S3_EPS || Math.abs(a1 - b1) < S3_EPS;
  return nested && flush ? { kind: 'wall', gap: 0 } : { kind: 'bad', gap: 0 };
}
const s3PairOk = (a, b) => { const m = s3Meet(a, b); return m.kind === 'wall' || (m.kind === 'apart' && m.gap >= SPACING - S3_EPS); };
// does the rectangle touch two adjacent walls of the hall?
const s3InCorner = (P, r) => (Math.abs(r.x0 - P.x0) < S3_EPS || Math.abs(r.x1 - P.x1) < S3_EPS) && (Math.abs(r.z0 - P.z0) < S3_EPS || Math.abs(r.z1 - P.z1) < S3_EPS);

// ---- placing one rectangle: every rule a single room must keep ------------------------------------------------------------------------------------
const s3Rq = (r) => (a, b) => a + Q * Math.floor(r() * (Math.round((b - a) / Q) + 1));   // a Q-step value in [a, b]
const s3Fresh = (c) => ({ rooms: [], block: new Uint8Array(c.g.nx * c.g.nz), carved: 0 });

// Puts R into `st` when it is legal: inside the hall on the grid, a wall of the hall touched or 1.5 m clear, under the area cap, off the kept cells,
// every other room a shared wall or SPACING away with its doorway left free, a door with a free approach, the floor left in one piece. Returns the room or null
function s3Place(c, st, R, r) {
  const { P, g, keep } = c;
  if (!s3Inside(P, R) || ![R.x0, R.x1, R.z0, R.z1].every(s3OnGrid)) return null;
  const gaps = [R.x0 - P.x0, P.x1 - R.x1, R.z0 - P.z0, P.z1 - R.z1];
  if (gaps.some((v) => v > S3_EPS && v < EDGE_CLEAR - S3_EPS)) return null;
  const area = s3Area(R);
  if (area + st.carved > c.cap) return null;
  let clash = false;
  each(g, R, (k) => { if (keep[k]) clash = true; });
  if (clash) return null;
  for (const u of st.rooms) if (!s3PairOk(u.rect, R) || s3Hit(R, u.door.approach)) return null;
  const rq = s3Rq(r), first = Math.floor(r() * 4);
  let door = null;
  for (let q = 0; q < 4 && !door; q++) {
    const k = (first + q) % 4, side = S3_SIDES[k];
    if (gaps[k] < APPROACH - S3_EPS) continue;   // a door needs its 2 m approach inside the hall
    const alongX = side[0] === 'z', lo = (alongX ? R.x0 : R.z0) + DOOR_W, hi = (alongX ? R.x1 : R.z1) - DOOR_W;
    const d = doorOn(R, side, rq(lo, Math.max(lo, hi)));
    let free = s3Inside(P, d.approach);
    if (free) each(g, d.approach, (v) => { if (keep[v] || st.block[v]) free = false; });
    if (free) door = d;
  }
  if (!door) return null;
  let rise = 0;
  if (r() < STEP_SHARE && P.ceil >= STEP_MIN_CEIL - S3_EPS && P.ceil - RISES[0] >= MIN_AIR - S3_EPS) {
    const ok = RISES.filter((v) => P.ceil - v >= MIN_AIR - S3_EPS), v = ok[Math.floor(r() * ok.length)];
    if (!c.flatOnly) rise = v;   // the draw is made either way, so a flat-only plan and a full one place the same rooms
  }
  const trial = st.block.slice();
  stamp(g, [R], trial);
  if (!s3Connected(g, trial)) return null;
  st.block = trial; st.carved += area;
  const room = { rect: R, door, rise };
  st.rooms.push(room);
  return room;
}

// a cluster of two or more rooms, the first in a corner of the hall, each later one on a wall of a room already there; null when no cluster of two fits
function s3PlanCluster(c, r) {
  const { P } = c, W = P.x1 - P.x0, D = P.z1 - P.z0, rq = s3Rq(r), goal = c.target * c.parentArea;
  for (let attempt = 0; attempt < ROOT_TRIES; attempt++) {
    const st = s3Fresh(c), corner = Math.floor(r() * 4), w = rq(MIN_SIDE, Math.min(MAX_SIDE, W)), d = rq(MIN_SIDE, Math.min(MAX_SIDE, D));
    const x0 = corner & 1 ? P.x1 - w : P.x0, z0 = corner & 2 ? P.z1 - d : P.z0;
    if (!s3Place(c, st, { x0, x1: x0 + w, z0, z1: z0 + d }, r)) continue;
    for (let t = 0; t < TRIES && (st.rooms.length < 2 || st.carved < goal); t++) {
      const H = st.rooms[Math.floor(r() * st.rooms.length)].rect, side = S3_SIDES[Math.floor(r() * 4)], atMax = r() < 0.5;
      const alongX = side[0] === 'z', host = alongX ? H.x1 - H.x0 : H.z1 - H.z0;
      if (host < MIN_SIDE - S3_EPS) continue;
      const along = rq(MIN_SIDE, Math.min(MAX_SIDE, host)), depth = rq(MIN_SIDE, Math.min(MAX_SIDE, alongX ? D : W)), R = {};
      if (alongX) {
        R.x0 = atMax ? H.x1 - along : H.x0; R.x1 = R.x0 + along;
        if (side === 'z0') { R.z1 = H.z0; R.z0 = R.z1 - depth; } else { R.z0 = H.z1; R.z1 = R.z0 + depth; }
      } else {
        R.z0 = atMax ? H.z1 - along : H.z0; R.z1 = R.z0 + along;
        if (side === 'x0') { R.x1 = H.x0; R.x0 = R.x1 - depth; } else { R.x0 = H.x1; R.x1 = R.x0 + depth; }
      }
      s3Place(c, st, R, r);
    }
    if (st.rooms.length >= 2) return st;
  }
  return null;
}

// one room, anywhere it fits: flush to a wall of the hall (three tries in four) or standing free
function s3PlanSingle(c, r) {
  const { P } = c, W = P.x1 - P.x0, D = P.z1 - P.z0, rq = s3Rq(r);
  for (let t = 0; t < TRIES; t++) {
    const w = rq(MIN_SIDE, Math.min(MAX_SIDE, W)), d = rq(MIN_SIDE, Math.min(MAX_SIDE, D));
    let x0, z0;
    if (r() < 0.75) {
      const wall = Math.floor(r() * 4), alongFlush = r() < 0.4, lenA = wall < 2 ? D - d : W - w;   // room to slide along that wall
      const along = alongFlush || lenA < EDGE_CLEAR * 2 ? (r() < 0.5 ? 0 : lenA) : rq(EDGE_CLEAR, lenA - EDGE_CLEAR);
      if (wall === 0) { x0 = P.x0; z0 = P.z0 + along; } else if (wall === 1) { x0 = P.x1 - w; z0 = P.z0 + along; }
      else if (wall === 2) { z0 = P.z0; x0 = P.x0 + along; } else { z0 = P.z1 - d; x0 = P.x0 + along; }
    } else {
      if (W - w < 2 * EDGE_CLEAR || D - d < 2 * EDGE_CLEAR) continue;
      x0 = P.x0 + rq(EDGE_CLEAR, W - w - EDGE_CLEAR); z0 = P.z0 + rq(EDGE_CLEAR, D - d - EDGE_CLEAR);
    }
    const st = s3Fresh(c);
    if (s3Place(c, st, { x0, x1: x0 + w, z0, z1: z0 + d }, r)) return st;
  }
  return null;
}

export function planSubdivision(input) {
  const { seed, spaceId, parent: P, protect, special, flatOnly } = readInput(input);
  const r = mulberry32(hash2(seed | 0, s3StrHash(spaceId), 0, S3_SALT));
  const mode = subdivisionMode(r()), [lo, hi] = BANDS[mode], target = lo + r() * (hi - lo);
  const g = makeGrid(P), parentArea = (P.x1 - P.x0) * (P.z1 - P.z0);
  const out = { parentSpaceId: spaceId, mode, target: mode === 'none' ? 0 : target, share: 0, subrooms: [] };
  if (mode === 'none' || special || Math.min(P.x1 - P.x0, P.z1 - P.z0) < MIN_HALL) return s3DeepFreeze(out);

  const keep = new Uint8Array(g.nx * g.nz);   // no new footprint here
  for (const q of protect) each(g, { x0: q.x0 - PROTECT_MARGIN, x1: q.x1 + PROTECT_MARGIN, z0: q.z0 - PROTECT_MARGIN, z1: q.z1 + PROTECT_MARGIN }, (k) => { keep[k] = 1; });
  for (const b of centreBand(P)) each(g, { x0: b.x0 - PROTECT_MARGIN, x1: b.x1 + PROTECT_MARGIN, z0: b.z0 - PROTECT_MARGIN, z1: b.z1 + PROTECT_MARGIN }, (k) => { keep[k] = 1; });
  const c = { P, g, keep, flatOnly, target, parentArea, cap: hi * parentArea };
  const st = s3PlanCluster(c, mulberry32(hash2(seed | 0, s3StrHash(spaceId), 0, S3_SALT + 1))) ?? s3PlanSingle(c, mulberry32(hash2(seed | 0, s3StrHash(spaceId), 0, S3_SALT + 2)));
  if (!st) return s3DeepFreeze(out);
  for (const [k, u] of st.rooms.entries()) {
    const sub = { subspaceId: `${spaceId}:s3:${k}`, parentSpaceId: spaceId, nominalLevel: P.lv, ceil: P.ceil - u.rise, shape: { type: 'rect-union', rects: [u.rect] }, portals: [u.door] };
    if (u.rise) sub.elevation = P.floorY + u.rise;
    out.subrooms.push(sub);
  }
  out.share = st.carved / parentArea;
  return s3DeepFreeze(out);
}

// ---- the check: independent of the order things were placed in ------------------------------------------------------------------------------------
export function validateSubdivision(plan, { parent, protect = [] }) {
  const bad = [], P = { ...s3RectOf(parent), lv: parent.lv, ceil: parent.ceil, floorY: parent.floorY ?? 0 };
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.subrooms) || typeof plan.parentSpaceId !== 'string' || !BANDS[plan.mode]) return ['plan: bad structure'];
  if (plan.mode === 'none' && plan.subrooms.length) bad.push('none mode with sub-rooms');
  const ids = new Set(), g = makeGrid(P), block = new Uint8Array(g.nx * g.nz), shapes = [], fronts = [];
  let carved = 0;
  for (const s of plan.subrooms) {
    const tag = s && s.subspaceId;
    if (!s || typeof tag !== 'string' || !tag.startsWith(plan.parentSpaceId + ':s3:') || ids.has(tag)) { bad.push(`${tag}: id`); continue; }
    ids.add(tag);
    if (s.parentSpaceId !== plan.parentSpaceId || s.nominalLevel !== P.lv) bad.push(`${tag}: parent or level`);
    const sh = s.shape;
    if (!sh || sh.type !== 'rect-union') { bad.push(`${tag}: shape type`); continue; }
    if (!Array.isArray(sh.rects) || sh.rects.length !== 1 || sh.rects.some((q) => !q || ![q.x0, q.x1, q.z0, q.z1].every(Number.isFinite) || !(q.x1 > q.x0) || !(q.z1 > q.z0) || ![q.x0, q.x1, q.z0, q.z1].every(s3OnGrid))) { bad.push(`${tag}: rects`); continue; }
    const R = s3RectOf(sh.rects[0]);
    if (!s3Inside(P, R)) { bad.push(`${tag}: outside the hall`); continue; }
    const gaps = [R.x0 - P.x0, P.x1 - R.x1, R.z0 - P.z0, P.z1 - R.z1];
    if (gaps.some((v) => v > S3_EPS && v < EDGE_CLEAR - S3_EPS)) bad.push(`${tag}: wall clearance`);
    for (const q of protect) if (s3Hit(R, q)) bad.push(`${tag}: protected cells`);
    shapes.push({ id: tag, rect: R });
    carved += s3Area(R);
    stamp(g, [R], block);
    // elevation and ceiling
    if (s.elevation !== undefined) {
      const rise = s.elevation - P.floorY;
      if (!(rise > S3_EPS) || rise > RISES[1] + S3_EPS) bad.push(`${tag}: rise ${rise}`);
      if (!(s.ceil >= MIN_AIR - S3_EPS) || s.ceil > P.ceil - rise + S3_EPS) bad.push(`${tag}: ceiling`);
    } else if (s.ceil !== P.ceil) bad.push(`${tag}: ceiling`);
    // doorway
    if (!Array.isArray(s.portals) || s.portals.length !== 1) { bad.push(`${tag}: portals`); continue; }
    const p = s.portals[0], c = p.type === 'door' && p.rect ? (p.side[0] === 'z' ? (p.rect.x0 + p.rect.x1) / 2 : (p.rect.z0 + p.rect.z1) / 2) : NaN;
    const want = Number.isFinite(c) && S3_SIDES.includes(p.side) ? doorOn(R, p.side, c) : null;
    const span = (q) => (p.side[0] === 'z' ? [q.x0, q.x1] : [q.z0, q.z1]);
    if (!want || JSON.stringify(want.rect) !== JSON.stringify(s3RectOf(p.rect)) || JSON.stringify(want.approach) !== JSON.stringify(s3RectOf(p.approach))) bad.push(`${tag}: door shape`);
    else {
      const [a0, a1] = span(R);
      if (c - DOOR_W / 2 < a0 + 1 - S3_EPS || c + DOOR_W / 2 > a1 - 1 + S3_EPS) bad.push(`${tag}: door too near a corner`);
      if (!s3Inside(P, p.approach)) bad.push(`${tag}: approach outside`);
      else fronts.push({ tag, rect: s3RectOf(p.approach) });
    }
  }
  // the floor in front of every doorway: inside the hall, off protected cells, clear of every other sub-room (all of them, whatever the order)
  for (const f of fronts) {
    if (protect.some((q) => s3Hit(q, f.rect))) bad.push(`${f.tag}: approach on protected cells`);
    for (const o of shapes) if (o.id !== f.tag && s3Hit(o.rect, f.rect)) bad.push(`${f.tag}: approach blocked by ${o.id}`);
  }
  // one room: no rule on where it stands. Two or more: every pair shares a wall or keeps SPACING, the rooms form one cluster, and it reaches a corner of the hall
  if (shapes.length >= 2) {
    const next = shapes.map(() => []);
    for (let a = 0; a < shapes.length; a++) for (let b = a + 1; b < shapes.length; b++) {
      const m = s3Meet(shapes[a].rect, shapes[b].rect);
      if (m.kind === 'wall') { next[a].push(b); next[b].push(a); } else if (!(m.kind === 'apart' && m.gap >= SPACING - S3_EPS)) bad.push(`${shapes[a].id}: bad contact with ${shapes[b].id}`);
    }
    const seen = new Set([0]), queue = [0];
    while (queue.length) for (const k of next[queue.shift()]) if (!seen.has(k)) { seen.add(k); queue.push(k); }
    if (seen.size !== shapes.length) bad.push('the sub-rooms are not one cluster');
    if (!shapes.some((o) => s3InCorner(P, o.rect))) bad.push('no sub-room in a corner of the hall');
  }
  const share = carved / ((P.x1 - P.x0) * (P.z1 - P.z0));
  if (Math.abs(share - plan.share) > 1e-6) bad.push(`share ${plan.share} != ${share}`);
  if (share > BANDS[plan.mode][1] + 1e-9) bad.push(`share ${share} over the ${plan.mode} band`);
  if (!s3Connected(g, block)) bad.push('the floor left is not one piece');
  return bad;
}

// ---- feeding the planner from a real World2 cell plan --------------------------------------------------------------------------------------------
const clip = (h, r) => { const c = { x0: Math.max(r.x0, h.x0), x1: Math.min(r.x1, h.x1), z0: Math.max(r.z0, h.z0), z1: Math.min(r.z1, h.z1) }; return c.x1 > c.x0 && c.z1 > c.z0 ? c : null; };
const COLUMN_CLEAR = 1;      // gen2.js COL_CLEAR
const POOL_CLEAR = 2.5;      // gen2.js POOL_MARGIN
const MOUTH_DEPTH = 3;       // floor kept open in front of a corridor mouth

// Rectangles of a hall (cell plan `plan`, hall room `h`) that no sub-room may take: stairs and their hall entry, voids, ladders, columns with their
// clear floor, pools with their dry margin, window fronts, and the mouth of every corridor or room that opens into the hall (3 m deep)
export function protectedRectsFor(plan, h) {
  const out = [], add = (r) => { const c = r && clip(h, r); if (c) out.push(c); };
  for (const f of plan.flights || []) if (s3Hit(f, h)) { add(f); if (f.hallEntry) add(f.hallEntry); }
  for (const v of plan.voids || []) if (v.over === h.id || v.under === h.id || s3Hit(v, h)) add(v);
  for (const l of plan.ladders || []) add({ x0: l.x - 1, x1: l.x + 1, z0: l.z - 1, z1: l.z + 1 });
  for (const c of plan.columns || []) if (c.room === h.id) add({ x0: c.x - c.r - COLUMN_CLEAR, x1: c.x + c.r + COLUMN_CLEAR, z0: c.z - c.r - COLUMN_CLEAR, z1: c.z + c.r + COLUMN_CLEAR });
  for (const p of plan.pools || []) if (p.room === h.id) {
    const pts = poolPoints(p.shape);
    add({ x0: Math.min(...pts.map((q) => q[0])) - POOL_CLEAR, x1: Math.max(...pts.map((q) => q[0])) + POOL_CLEAR, z0: Math.min(...pts.map((q) => q[1])) - POOL_CLEAR, z1: Math.max(...pts.map((q) => q[1])) + POOL_CLEAR });
  }
  for (const w of plan.windows || []) if (w.hall === h.id && w.front) add(w.front);
  for (const o of plan.rooms || []) {
    if (o === h || o.lv !== h.lv || o.kind === 'hall' || !s3Hit(o, h)) continue;
    const m = { ...o };
    if (o.x0 < h.x0) m.x1 = Math.min(h.x1, Math.max(o.x1, h.x0) + MOUTH_DEPTH); else if (o.x1 > h.x1) m.x0 = Math.max(h.x0, Math.min(o.x0, h.x1) - MOUTH_DEPTH);
    if (o.z0 < h.z0) m.z1 = Math.min(h.z1, Math.max(o.z1, h.z0) + MOUTH_DEPTH); else if (o.z1 > h.z1) m.z0 = Math.max(h.z0, Math.min(o.z0, h.z1) - MOUTH_DEPTH);
    add(m);
  }
  return out;
}
function poolPoints(s) {
  if (s.type === 'rrect' || s.hw !== undefined) return [[s.cx - s.hw, s.cz - s.hd], [s.cx + s.hw, s.cz + s.hd]];
  return s.pts || s.poly || [[s.cx ?? 0, s.cz ?? 0]];
}

// A giant or an L-shaped hall (any fragment), a hall that crosses its cell's border, or one under the giant hall's seam is a special hall: never cut
export function isSpecialHall(plan, h) {
  if (h.span === 'L' || h.span === 'giant') return true;   // every fragment of a shared hall lies inside its own cell, so the border test below does not see it
  if (h.x0 < plan.ox - 1e-9 || h.x1 > plan.ox + 64 + 1e-9 || h.z0 < plan.oz - 1e-9 || h.z1 > plan.oz + 64 + 1e-9) return true;
  return !!(plan.mega && s3Hit(plan.mega, h));
}

// S3 slice 1: the subdivision planner. Pure data: one hall in, a list of sub-rooms out. Nothing here reads a World2, the game, or the RNG streams of
// T3-T6; the one stream is seeded from (seed, spaceId) under its own salt, so a plan does not depend on what was planned before it.
//
// A hall is cut by taking space away round its edges and in its middle, never by moving what is already there. Three things stay whole: the cells
// the caller lists in `protect` (stairs, pools, columns, corridor mouths: protectedRectsFor lists them for a real hall), a 3 m cross through the hall's
// middle, and a 1 m margin round both. Whatever is left must stay one connected floor, and every sub-room has one doorway whose approach is free.
// A candidate that breaks any of this is dropped and the hall keeps that space: the plan may cut less than its mode asks, never more.
//
// Sub-room: { subspaceId, parentSpaceId, nominalLevel, elevation?, ceil, shape, portals }.
//  - shape { type: 'rect-union', rects } is the OUTER footprint, wall included (the wall is PART_WALL thick, inside the footprint); shape
//    { type: 'disc', cx, cz, radius } is a round room, its wall on the circle.
//  - elevation is the absolute height of the floor (parent.floorY + 0.4 or 0.8, never more than STEP2); left out, the room shares its parent's floor.
//    ceil is the height of the ceiling over the sub-room's OWN floor (parent.ceil - rise, at least 2.5).
//  - portals: one { type: 'door', side, rect, approach } (the 2 m gap in the wall strip and the free 2 m x 2 m floor in front of it) or one
//    { type: 'arc', startAngle, endAngle } (radians, 0 = +x, towards +z, 0 <= start < end <= 2 pi) whose chord is wide enough for the body.
import { hash2, mulberry32 } from './rng.js';

export const S3_SALT = 9900;           // own RNG stream, none of T3-T6 uses it
export const Q = 0.5;                  // every rectangle edge sits on this grid (the same as Q2 in gen2.js)
export const PART_WALL = 0.5;          // thickness of a sub-room's wall
export const DOOR_W = 2;               // width of a doorway
export const APPROACH = 2;             // free floor in front of a doorway
export const SPACING = 2;              // free floor between two sub-rooms
export const EDGE_CLEAR = 1.5;         // a sub-room touches its hall's wall or keeps at least this much floor from it
export const MIN_SIDE = 4;
export const MAX_SIDE = 14;
export const MIN_HALL = 14;            // a hall with a shorter side than this is not cut
export const CENTRE_BAND = 3;          // the cross through the hall's middle that stays open
export const PROTECT_MARGIN = 1;       // floor kept round every protected rectangle
export const DISC_R = [3, 5];          // radius of a round room, in 0.5 m steps
export const DISC_SHARE = 0.2;         // share of tries that ask for a round room
export const STEP_SHARE = 0.3;         // share of rectangular rooms that stand a step up
export const RISES = [0.4, 0.8];       // the rise of such a step: at most STEP2 (0.8) so the body takes it
export const MIN_AIR = 2.5;            // air a split-level room keeps over its own floor
export const STEP_MIN_CEIL = 3.5;      // a hall with a lower ceiling than this gets no split level
export const BODY_W = 0.8;             // the body's width (2 * S3_BODY_R of gen2.js, pinned by a test), the arc doorway's chord is DOOR_W plus this
const S3_BODY_R = BODY_W / 2;
export const TRIES = 60;
export const BANDS = { none: [0, 0], partial: [0.1, 0.4], high: [0.6, 0.9] };
const MODE_AT = [0.2, 0.9];            // draw below 0.2: none, below 0.9: partial, else high  (20 / 70 / 10)
const TWO_PI = 2 * Math.PI;
const S3_EPS = 1e-9;

export const subdivisionMode = (draw) => (draw < MODE_AT[0] ? 'none' : draw < MODE_AT[1] ? 'partial' : 'high');

const isNum = (v) => typeof v === 'number';
const s3OnGrid = (v) => Math.abs(v / Q - Math.round(v / Q)) < S3_EPS;
const badInput = () => new TypeError('Invalid subdivision input');
const s3BadGeometry = () => new RangeError('Invalid subdivision geometry');
const s3StrHash = (s) => { let h = 0x811c9dc5; for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 0x01000193); return h >>> 0; };
const s3RectOf = (r) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });
const s3Hit = (a, b) => a.x0 < b.x1 - S3_EPS && b.x0 < a.x1 - S3_EPS && a.z0 < b.z1 - S3_EPS && b.z0 < a.z1 - S3_EPS;
const rectGap = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
const s3DeepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) s3DeepFreeze(o[k]); } return o; };

function readRect(r, { grid }) {
  if (r === null || typeof r !== 'object' || !isNum(r.x0) || !isNum(r.x1) || !isNum(r.z0) || !isNum(r.z1)) throw badInput();
  if (![r.x0, r.x1, r.z0, r.z1].every(Number.isFinite) || !(r.x1 > r.x0) || !(r.z1 > r.z0)) throw s3BadGeometry();
  if (grid && ![r.x0, r.x1, r.z0, r.z1].every(s3OnGrid)) throw s3BadGeometry();
  return s3RectOf(r);
}

function readInput(o) {
  if (o === null || typeof o !== 'object') throw badInput();
  const { seed, spaceId, parent, protect = [], special = false } = o;
  if (!Number.isInteger(seed) || typeof spaceId !== 'string' || spaceId === '' || typeof special !== 'boolean' || !Array.isArray(protect)) throw badInput();
  if (parent === null || typeof parent !== 'object' || !Number.isInteger(parent.lv) || !isNum(parent.ceil) || (parent.floorY !== undefined && !isNum(parent.floorY))) throw badInput();
  const P = readRect(parent, { grid: true });
  if (!Number.isFinite(parent.ceil) || parent.ceil <= 0 || !Number.isFinite(parent.floorY ?? 0)) throw s3BadGeometry();
  return { seed, spaceId, parent: { ...P, lv: parent.lv, ceil: parent.ceil, floorY: parent.floorY ?? 0 }, protect: protect.map((r) => readRect(r, { grid: false })), special };
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
const eachDisc = (g, d, reach, fn) => {
  const R = d.radius + reach, a0 = Math.max(0, Math.floor((d.cx - R - g.P.x0) / Q - 1)), a1 = Math.min(g.nx - 1, Math.ceil((d.cx + R - g.P.x0) / Q + 1));
  const b0 = Math.max(0, Math.floor((d.cz - R - g.P.z0) / Q - 1)), b1 = Math.min(g.nz - 1, Math.ceil((d.cz + R - g.P.z0) / Q + 1));
  for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) if (Math.hypot(g.cx(a) - d.cx, g.cz(b) - d.cz) < R - S3_EPS) fn(a + b * g.nx);
};
const stamp = (g, shape, arr, grow, v = 1) => {
  if (shape.type === 'disc') eachDisc(g, shape, grow, (k) => { arr[k] = v; });
  else for (const r of shape.rects) each(g, { x0: r.x0 - grow, x1: r.x1 + grow, z0: r.z0 - grow, z1: r.z1 + grow }, (k) => { arr[k] = v; });
};

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

const areaOf = (s) => (s.type === 'disc' ? Math.PI * s.radius * s.radius : s.rects.reduce((t, r) => t + (r.x1 - r.x0) * (r.z1 - r.z0), 0));
const centreBand = (P) => { const mx = (P.x0 + P.x1) / 2, mz = (P.z0 + P.z1) / 2, h = CENTRE_BAND / 2; return [{ x0: P.x0, x1: P.x1, z0: mz - h, z1: mz + h }, { x0: mx - h, x1: mx + h, z0: P.z0, z1: P.z1 }]; };

// the doorway of a rectangle on `side`, its centre c along the wall: the 2 m gap in the wall strip and the 2 m x 2 m floor in front of it
function doorOn(R, side, c) {
  const h = DOOR_W / 2;
  if (side === 'x0') return { type: 'door', side, rect: { x0: R.x0, x1: R.x0 + PART_WALL, z0: c - h, z1: c + h }, approach: { x0: R.x0 - APPROACH, x1: R.x0, z0: c - h, z1: c + h } };
  if (side === 'x1') return { type: 'door', side, rect: { x0: R.x1 - PART_WALL, x1: R.x1, z0: c - h, z1: c + h }, approach: { x0: R.x1, x1: R.x1 + APPROACH, z0: c - h, z1: c + h } };
  if (side === 'z0') return { type: 'door', side, rect: { x0: c - h, x1: c + h, z0: R.z0, z1: R.z0 + PART_WALL }, approach: { x0: c - h, x1: c + h, z0: R.z0 - APPROACH, z1: R.z0 } };
  return { type: 'door', side, rect: { x0: c - h, x1: c + h, z0: R.z1 - PART_WALL, z1: R.z1 }, approach: { x0: c - h, x1: c + h, z0: R.z1, z1: R.z1 + APPROACH } };
}
const s3Inside = (P, r) => r.x0 >= P.x0 - S3_EPS && r.x1 <= P.x1 + S3_EPS && r.z0 >= P.z0 - S3_EPS && r.z1 <= P.z1 + S3_EPS;

export function planSubdivision(input) {
  const { seed, spaceId, parent: P, protect, special } = readInput(input);
  const r = mulberry32(hash2(seed | 0, s3StrHash(spaceId), 0, S3_SALT));
  const mode = subdivisionMode(r()), [lo, hi] = BANDS[mode], target = lo + r() * (hi - lo);
  const g = makeGrid(P), n = g.nx * g.nz, parentArea = (P.x1 - P.x0) * (P.z1 - P.z0);
  const out = { parentSpaceId: spaceId, mode, target: mode === 'none' ? 0 : target, share: 0, subrooms: [] };
  if (mode === 'none' || special || Math.min(P.x1 - P.x0, P.z1 - P.z0) < MIN_HALL) return s3DeepFreeze(out);

  const keep = new Uint8Array(n), block = new Uint8Array(n);     // keep: no new footprint here; block: floor taken by a sub-room
  for (const q of protect) each(g, { x0: q.x0 - PROTECT_MARGIN, x1: q.x1 + PROTECT_MARGIN, z0: q.z0 - PROTECT_MARGIN, z1: q.z1 + PROTECT_MARGIN }, (k) => { keep[k] = 1; });
  const bands = centreBand(P);
  for (const b of bands) each(g, { x0: b.x0 - PROTECT_MARGIN, x1: b.x1 + PROTECT_MARGIN, z0: b.z0 - PROTECT_MARGIN, z1: b.z1 + PROTECT_MARGIN }, (k) => { keep[k] = 1; });
  const rq = (a, b) => a + Q * Math.floor(r() * (Math.round((b - a) / Q) + 1));   // a Q-step value in [a, b]
  let carved = 0;

  for (let t = 0; t < TRIES && carved < target * parentArea; t++) {
    const W = P.x1 - P.x0, D = P.z1 - P.z0;
    const round = r() < DISC_SHARE;
    let shape, portal, rise = 0;
    if (round) {
      const radius = rq(DISC_R[0], DISC_R[1]), lx = W - 2 * (radius + EDGE_CLEAR), lz = D - 2 * (radius + EDGE_CLEAR);
      if (lx < 0 || lz < 0) continue;
      const cx = P.x0 + radius + EDGE_CLEAR + Q * Math.floor(r() * (Math.round(lx / Q) + 1)), cz = P.z0 + radius + EDGE_CLEAR + Q * Math.floor(r() * (Math.round(lz / Q) + 1));
      const d = { type: 'disc', cx, cz, radius }, half = Math.ceil((Math.asin((DOOR_W + BODY_W) / 2 / radius) + 0.02) * 1e4) / 1e4;
      const theta = (TWO_PI / 16) * Math.floor(r() * 16);
      let s0 = theta - half, s1 = theta + half;
      if (s0 < 0) { s1 -= s0; s0 = 0; } else if (s1 > TWO_PI) { s0 -= s1 - TWO_PI; s1 = TWO_PI; }
      s0 = Math.max(0, s0); s1 = Math.min(TWO_PI, s1);
      if (areaOf(d) + carved > hi * parentArea) continue;
      let clash = false;
      eachDisc(g, d, EDGE_CLEAR, (k) => { if (keep[k]) clash = true; });
      if (clash) continue;
      portal = { type: 'arc', startAngle: s0, endAngle: s1 };
      if (!arcApproachClear(d, portal, P, [...protect, ...bands, ...out.subrooms.map((u) => u.shape.type === 'disc' ? u.shape : u.shape.rects[0])])) continue;   // the 2 m of floor in front of the doorway
      shape = d;
    } else {
      const w = rq(MIN_SIDE, Math.min(MAX_SIDE, W)), d = rq(MIN_SIDE, Math.min(MAX_SIDE, D));
      let x0, z0;
      if (r() < 0.75) {                                          // flush to one wall of the hall
        const wall = Math.floor(r() * 4), alongFlush = r() < 0.4;
        const lenA = wall < 2 ? D - d : W - w;                   // room to slide along that wall
        const along = alongFlush || lenA < EDGE_CLEAR * 2 ? (r() < 0.5 ? 0 : lenA) : rq(EDGE_CLEAR, lenA - EDGE_CLEAR);
        if (wall === 0) { x0 = P.x0; z0 = P.z0 + along; } else if (wall === 1) { x0 = P.x1 - w; z0 = P.z0 + along; }
        else if (wall === 2) { z0 = P.z0; x0 = P.x0 + along; } else { z0 = P.z1 - d; x0 = P.x0 + along; }
      } else {                                                   // standing free
        if (W - w < 2 * EDGE_CLEAR || D - d < 2 * EDGE_CLEAR) continue;
        x0 = P.x0 + rq(EDGE_CLEAR, W - w - EDGE_CLEAR); z0 = P.z0 + rq(EDGE_CLEAR, D - d - EDGE_CLEAR);
      }
      if (x0 === undefined || z0 === undefined) continue;
      const R = { x0, x1: x0 + w, z0, z1: z0 + d };
      if (!s3Inside(P, R) || !s3OnGrid(R.x0) || !s3OnGrid(R.z0)) continue;
      const gaps = [R.x0 - P.x0, P.x1 - R.x1, R.z0 - P.z0, P.z1 - R.z1];
      if (gaps.some((v) => v > S3_EPS && v < EDGE_CLEAR - S3_EPS)) continue;
      if (w * d + carved > hi * parentArea) continue;
      let clash = false;
      each(g, R, (k) => { if (keep[k]) clash = true; });
      if (clash) continue;
      const sides = ['x0', 'x1', 'z0', 'z1'].filter((s, k) => gaps[k] >= APPROACH - S3_EPS);   // a door needs its 2 m approach inside the hall
      if (!sides.length) continue;
      const side = sides[Math.floor(r() * sides.length)], alongX = side[0] === 'z', lo2 = (alongX ? R.x0 : R.z0) + DOOR_W, hi2 = (alongX ? R.x1 : R.z1) - DOOR_W;
      const c = rq(lo2, Math.max(lo2, hi2)), door = doorOn(R, side, c);
      let free = true;
      each(g, door.approach, (k) => { if (keep[k] || block[k]) free = false; });
      if (!free || !s3Inside(P, door.approach)) continue;
      if (r() < STEP_SHARE && P.ceil >= STEP_MIN_CEIL - S3_EPS && P.ceil - RISES[0] >= MIN_AIR - S3_EPS) { const ok = RISES.filter((v) => P.ceil - v >= MIN_AIR - S3_EPS); rise = ok[Math.floor(r() * ok.length)]; }
      shape = { type: 'rect-union', rects: [R] }; portal = door;
    }
    // a later room must not take the floor in front of an earlier round room's doorway
    const obstacle = shape.type === 'disc' ? shape : shape.rects[0];
    if (out.subrooms.some((u) => u.shape.type === 'disc' && !arcApproachClear(u.shape, u.portals[0], P, [obstacle]))) continue;
    // try it: the rest of the floor must stay one piece
    const trial = block.slice();
    stamp(g, shape, trial, 0, 1);
    if (!s3Connected(g, trial)) continue;
    block.set(trial);
    stamp(g, shape, keep, SPACING, 1);
    if (shape.type === 'disc') eachDisc(g, shape, SPACING, (k) => { keep[k] = 1; });
    carved += areaOf(shape);
    const k = out.subrooms.length, sub = { subspaceId: `${spaceId}:s3:${k}`, parentSpaceId: spaceId, nominalLevel: P.lv, ceil: P.ceil - rise, shape, portals: [portal] };
    if (rise) sub.elevation = P.floorY + rise;
    out.subrooms.push(sub);
  }
  out.share = carved / parentArea;
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
    if (!sh || (sh.type !== 'disc' && sh.type !== 'rect-union')) { bad.push(`${tag}: shape type`); continue; }
    let box;
    if (sh.type === 'disc') {
      if (![sh.cx, sh.cz, sh.radius].every(Number.isFinite) || !s3OnGrid(sh.cx) || !s3OnGrid(sh.cz) || sh.radius < DISC_R[0] - S3_EPS || sh.radius > DISC_R[1] + S3_EPS || !s3OnGrid(sh.radius)) { bad.push(`${tag}: disc`); continue; }
      box = { x0: sh.cx - sh.radius, x1: sh.cx + sh.radius, z0: sh.cz - sh.radius, z1: sh.cz + sh.radius };
    } else {
      if (!Array.isArray(sh.rects) || !sh.rects.length || sh.rects.some((q) => ![q.x0, q.x1, q.z0, q.z1].every(Number.isFinite) || !(q.x1 > q.x0) || !(q.z1 > q.z0) || ![q.x0, q.x1, q.z0, q.z1].every(s3OnGrid))) { bad.push(`${tag}: rects`); continue; }
      box = sh.rects.reduce((b, q) => ({ x0: Math.min(b.x0, q.x0), x1: Math.max(b.x1, q.x1), z0: Math.min(b.z0, q.z0), z1: Math.max(b.z1, q.z1) }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
    }
    if (!s3Inside(P, box)) { bad.push(`${tag}: outside the hall`); continue; }
    const gaps = [box.x0 - P.x0, P.x1 - box.x1, box.z0 - P.z0, P.z1 - box.z1];
    if (gaps.some((v) => v > S3_EPS && v < EDGE_CLEAR - S3_EPS) || (sh.type === 'disc' && gaps.some((v) => v < EDGE_CLEAR - S3_EPS))) bad.push(`${tag}: wall clearance`);
    for (const q of protect) if (sh.type === 'disc' ? rectGap(box, q) < 0 || circleHitsRect(sh, q) : sh.rects.some((a) => s3Hit(a, q))) bad.push(`${tag}: protected cells`);
    for (const o of shapes) if (gapBetween(o, sh) < SPACING - S3_EPS) bad.push(`${tag}: too close to ${o.id}`);
    shapes.push({ id: tag, ...sh });
    carved += areaOf(sh);
    stamp(g, sh, block, 0, 1);
    // elevation and ceiling
    if (s.elevation !== undefined) {
      const rise = s.elevation - P.floorY;
      if (sh.type === 'disc' || !(rise > S3_EPS) || rise > RISES[1] + S3_EPS) bad.push(`${tag}: rise ${rise}`);
      if (!(s.ceil >= MIN_AIR - S3_EPS) || s.ceil > P.ceil - rise + S3_EPS) bad.push(`${tag}: ceiling`);
    } else if (s.ceil !== P.ceil) bad.push(`${tag}: ceiling`);
    // doorway
    if (!Array.isArray(s.portals) || s.portals.length !== 1) { bad.push(`${tag}: portals`); continue; }
    const p = s.portals[0];
    if (sh.type === 'disc') {
      if (p.type !== 'arc' || !(p.startAngle >= 0) || !(p.endAngle <= TWO_PI + S3_EPS) || !(p.endAngle > p.startAngle) || 2 * sh.radius * Math.sin((p.endAngle - p.startAngle) / 2) < DOOR_W + BODY_W - S3_EPS) bad.push(`${tag}: arc doorway`);
      else fronts.push({ tag, disc: sh, arc: p });
    } else {
      const R = sh.rects[0], c = p.type === 'door' && p.rect ? (p.side[0] === 'z' ? (p.rect.x0 + p.rect.x1) / 2 : (p.rect.z0 + p.rect.z1) / 2) : NaN;
      const want = Number.isFinite(c) && sh.rects.length === 1 && ['x0', 'x1', 'z0', 'z1'].includes(p.side) ? doorOn(R, p.side, c) : null;
      const span = (q) => (p.side[0] === 'z' ? [q.x0, q.x1] : [q.z0, q.z1]);
      if (!want || JSON.stringify(want.rect) !== JSON.stringify(s3RectOf(p.rect)) || JSON.stringify(want.approach) !== JSON.stringify(s3RectOf(p.approach))) bad.push(`${tag}: door shape`);
      else {
        const [a0, a1] = span(R);
        if (c - DOOR_W / 2 < a0 + 1 - S3_EPS || c + DOOR_W / 2 > a1 - 1 + S3_EPS) bad.push(`${tag}: door too near a corner`);
        if (!s3Inside(P, p.approach)) bad.push(`${tag}: approach outside`);
        else fronts.push({ tag, rect: s3RectOf(p.approach) });
      }
    }
  }
  // the floor in front of every doorway: inside the hall, off protected cells, clear of every other sub-room (all of them, whatever the order)
  for (const f of fronts) {
    const others = shapes.filter((o) => o.id !== f.tag).map((o) => (o.type === 'disc' ? o : o.rects[0]));
    if (f.disc) { if (!arcApproachClear(f.disc, f.arc, P, [...protect, ...others])) bad.push(`${f.tag}: approach blocked or outside the hall`); continue; }
    if (protect.some((q) => s3Hit(q, f.rect))) bad.push(`${f.tag}: approach on protected cells`);
    for (const o of shapes) if (o.id !== f.tag && (o.type === 'disc' ? circleHitsRect(o, f.rect) : o.rects.some((q) => s3Hit(q, f.rect)))) bad.push(`${f.tag}: approach blocked by ${o.id}`);
  }
  const share = carved / ((P.x1 - P.x0) * (P.z1 - P.z0));
  if (Math.abs(share - plan.share) > 1e-6) bad.push(`share ${plan.share} != ${share}`);
  if (share > BANDS[plan.mode][1] + 1e-9) bad.push(`share ${share} over the ${plan.mode} band`);
  if (!s3Connected(g, block)) bad.push('the floor left is not one piece');
  return bad;
}

// The floor in front of a round room's doorway is the ring sector between the circle and 2 m outside it, across the arc. It is checked in closed form,
// with the body's footprint (S3_BODY_R) added to every obstacle and taken off the hall. The checks over-approximate: they may refuse a free sector, never accept a blocked one.
const wrapPi = (t) => { t = (t + Math.PI) % TWO_PI; return (t < 0 ? t + TWO_PI : t) - Math.PI; };
function sectorInsideHall(d, a, P) {      // the exact bounding box of the sector inside the hall shrunk by the body radius
  const R = d.radius + APPROACH, pts = [];
  for (const t of [a.startAngle, a.endAngle]) for (const rad of [d.radius, R]) pts.push([d.cx + rad * Math.cos(t), d.cz + rad * Math.sin(t)]);
  for (const t of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, TWO_PI]) if (t > a.startAngle && t < a.endAngle) pts.push([d.cx + R * Math.cos(t), d.cz + R * Math.sin(t)]);
  return pts.every(([x, z]) => x >= P.x0 + S3_BODY_R - S3_EPS && x <= P.x1 - S3_BODY_R + S3_EPS && z >= P.z0 + S3_BODY_R - S3_EPS && z <= P.z1 - S3_BODY_R + S3_EPS);
}
function sectorMeetsRect(d, a, q) {
  const m = S3_BODY_R, R = d.radius + APPROACH, b = { x0: q.x0 - m, x1: q.x1 + m, z0: q.z0 - m, z1: q.z1 + m };
  const nx = Math.min(Math.max(d.cx, b.x0), b.x1), nz = Math.min(Math.max(d.cz, b.z0), b.z1);
  if (nx === d.cx && nz === d.cz) return true;
  if (Math.hypot(nx - d.cx, nz - d.cz) >= R - S3_EPS) return false;
  const mid = (a.startAngle + a.endAngle) / 2, h = (a.endAngle - a.startAngle) / 2;
  const ds = [[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1]].map(([x, z]) => wrapPi(Math.atan2(z - d.cz, x - d.cx) - mid)).sort((u, v) => u - v);
  // seen from the centre the box covers the whole turn except its largest gap between corner directions; the door (-h .. h) misses the box only inside that gap
  let gA = ds[3], gB = ds[0] + TWO_PI;
  for (let k = 0; k < 3; k++) if (ds[k + 1] - ds[k] > gB - gA) { gA = ds[k]; gB = ds[k + 1]; }
  return ![-TWO_PI, 0, TWO_PI].some((t) => gA + t < -h - S3_EPS && gB + t > h + S3_EPS);
}
function sectorMeetsDisc(d, a, o) {
  const rho = o.radius + S3_BODY_R, R = d.radius + APPROACH, D = Math.hypot(o.cx - d.cx, o.cz - d.cz);
  if (D >= R + rho - S3_EPS) return false;
  if (D <= rho + S3_EPS) return true;
  const mid = (a.startAngle + a.endAngle) / 2, h = (a.endAngle - a.startAngle) / 2;
  return Math.abs(wrapPi(Math.atan2(o.cz - d.cz, o.cx - d.cx) - mid)) <= h + Math.asin(Math.min(1, rho / D)) + S3_EPS;
}
// true when the whole sector in front of the doorway is free: `obstacles` are rectangles {x0..z1} and rounds {type: 'disc', cx, cz, radius}
export function arcApproachClear(d, a, P, obstacles) {
  return sectorInsideHall(d, a, P) && !obstacles.some((o) => (o.type === 'disc' ? sectorMeetsDisc(d, a, o) : sectorMeetsRect(d, a, o)));
}

function circleHitsRect(d, q) {
  const dx = Math.max(q.x0 - d.cx, 0, d.cx - q.x1), dz = Math.max(q.z0 - d.cz, 0, d.cz - q.z1);
  return Math.hypot(dx, dz) < d.radius - S3_EPS;
}
function gapBetween(a, b) {
  if (a.type === 'disc' && b.type === 'disc') return Math.hypot(a.cx - b.cx, a.cz - b.cz) - a.radius - b.radius;
  if (a.type === 'disc') return Math.min(...b.rects.map((q) => rectGapToDisc(q, a)));
  if (b.type === 'disc') return Math.min(...a.rects.map((q) => rectGapToDisc(q, b)));
  let m = Infinity;
  for (const p of a.rects) for (const q of b.rects) m = Math.min(m, rectGap(p, q));
  return m;
}
const rectGapToDisc = (q, d) => Math.hypot(Math.max(q.x0 - d.cx, 0, d.cx - q.x1), Math.max(q.z0 - d.cz, 0, d.cz - q.z1)) - d.radius;

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

// Generator v2 prototype (?gen=v2): whole spaces first, then their elements. Pure data, no three.js.
// The world is cut into 64 m cells. Each cell holds a 1F hall (rectangle, 20–50 m) joined to its four neighbours by
// corridors, and sometimes a 2F room or a B1 hall stacked over or under it, reached by an enclosed straight flight with a
// landing half way. Pools are whole shapes (rectangle, rounded, ellipse, L) with a flat or one-way sloping bottom.
// Drawing (mesh2.js) and collision (World2 below) both read the same plan.
import { hash2, mulberry32 } from './rng.js';

export const CELL2 = 64;
export const Q2 = 0.5;                 // every rectangle edge sits on this grid
export const WADE_MAX = 1.25;          // deeper water than this cannot be walked
export const WATER_DROP = 0.05;        // a pool's water sits this far under its rim
export const FLIGHT_W = 3;             // walkable width of a flight
export const FLIGHT_WALL = 0.25;       // its enclosing side walls
export const FLIGHT_SLOPE = 0.6;       // rise per metre of run
export const LANDING = 2;              // flat landing half way up
export const POOL_MARGIN = 2.5;        // dry walkway between a pool and any wall
export const CURVE_SEG = 0.25;         // longest straight piece of a drawn curve
export const EXIT_DEPTH = 0.45 - WATER_DROP;   // deepest water a body can still step out of onto the rim (STEP_UP)

const snap2 = (v) => Math.round(v / Q2) * Q2;
const between2 = (r, a, b) => a + (b - a) * r();
const snapIn2 = (r, a, b) => snap2(between2(r, a, b));

// ---------- pool shapes ----------
// { type: 'rect' | 'rrect' | 'ellipse' | 'L', cx, cz, hw, hd, r (rrect corner), notch: { sx, sz, w, d } (L: the cut corner) }

export function shapeContains(s, x, z) {
  const dx = x - s.cx, dz = z - s.cz;
  if (Math.abs(dx) > s.hw || Math.abs(dz) > s.hd) return false;
  if (s.type === 'rect') return true;
  if (s.type === 'ellipse') return (dx / s.hw) ** 2 + (dz / s.hd) ** 2 <= 1;
  if (s.type === 'rrect') {
    const qx = Math.abs(dx) - (s.hw - s.r), qz = Math.abs(dz) - (s.hd - s.r);
    return qx <= 0 || qz <= 0 || qx * qx + qz * qz <= s.r * s.r;
  }
  // L: the bounding box minus one corner block
  const n = s.notch;
  return !(dx * n.sx > s.hw - n.w && dz * n.sz > s.hd - n.d);
}

// the drawn rim, one way round (angle decreasing in the x–z plane): no straight piece longer than CURVE_SEG along a curve
export function shapeOutline(s) {
  const pts = [];
  if (s.type === 'ellipse') {
    const n = Math.max(24, Math.ceil((Math.PI * 2 * Math.max(s.hw, s.hd)) / CURVE_SEG));   // even angles: the flattest stretch has the longest pieces
    for (let k = 0; k < n; k++) { const a = (-k / n) * Math.PI * 2; pts.push([s.cx + Math.cos(a) * s.hw, s.cz + Math.sin(a) * s.hd]); }
    return pts;
  }
  if (s.type === 'rrect') {
    const n = Math.max(2, Math.ceil((s.r * Math.PI / 2) / CURVE_SEG));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
      const ox = s.cx + sx * (s.hw - s.r), oz = s.cz + sz * (s.hd - s.r);
      const a0 = Math.atan2(sz, sx) + Math.PI / 4;
      for (let k = 0; k <= n; k++) { const a = a0 - (k / n) * (Math.PI / 2); pts.push([ox + Math.cos(a) * s.r, oz + Math.sin(a) * s.r]); }
    }
    return dedupe2(pts);
  }
  const x0 = s.cx - s.hw, x1 = s.cx + s.hw, z0 = s.cz - s.hd, z1 = s.cz + s.hd;
  if (s.type === 'rect') return [[x1, z1], [x1, z0], [x0, z0], [x0, z1]];
  // L: walk the box corners clockwise in x/z, replacing the notched corner by its three points
  const n = s.notch, out = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    const px = s.cx + sx * s.hw, pz = s.cz + sz * s.hd;
    if (sx !== n.sx || sz !== n.sz) { out.push([px, pz]); continue; }
    const ix = px - sx * n.w, iz = pz - sz * n.d;
    // arriving along the edge before this corner, leaving along the next one
    const alongX = sx === sz;   // in this walk, corners with sx === sz are reached moving along x
    if (alongX) out.push([ix, pz], [ix, iz], [px, iz]);
    else out.push([px, iz], [ix, iz], [ix, pz]);
  }
  return out;
}

function dedupe2(pts) {
  return pts.filter((p, k) => { const q = pts[(k + pts.length - 1) % pts.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6; });
}

// water depth over the pool floor at a point inside the shape: flat, or one-way along an axis
export function poolDepth(p, x, z) {
  if (p.d0 === p.d1) return p.d0;
  const s = p.shape, lo = p.axis === 'x' ? s.cx - s.hw : s.cz - s.hd, span = 2 * (p.axis === 'x' ? s.hw : s.hd);
  let t = ((p.axis === 'x' ? x : z) - lo) / span;
  t = Math.min(1, Math.max(0, t));
  if (p.flip) t = 1 - t;
  return p.d0 + (p.d1 - p.d0) * t;
}

// ---------- flights ----------
// { x0, z0, x1, z1 footprint, axis 'x' | 'z', up +1 (rises towards larger coordinate) | -1, lo, hi levels, y0, y1 }

const along2 = (f, x, z) => (f.axis === 'x' ? x : z);
const across2 = (f, x, z) => (f.axis === 'x' ? z : x);

// height of the treads at a point of the footprint (straight run, landing, straight run)
export function flightH(f, x, z) {
  const a0 = f.axis === 'x' ? f.x0 : f.z0, a1 = f.axis === 'x' ? f.x1 : f.z1;
  let d = f.up > 0 ? along2(f, x, z) - a0 : a1 - along2(f, x, z);
  const len = a1 - a0, run = (len - LANDING) / 2, rise = f.y1 - f.y0;
  d = Math.min(len, Math.max(0, d));
  const climbed = d <= run ? d : d <= run + LANDING ? run : d - LANDING;
  return f.y0 + rise * (climbed / (2 * run));
}

// inside a flight's side walls (solid at every height)
export function inFlightWall(f, x, z) {
  const c = across2(f, x, z), c0 = f.axis === 'x' ? f.z0 : f.x0, c1 = f.axis === 'x' ? f.z1 : f.x1;
  return c < c0 + FLIGHT_WALL || c > c1 - FLIGHT_WALL;
}

const inRect2 = (r, x, z) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
const overlap2 = (a, b, m = 0) => a.x0 - m < b.x1 && b.x0 - m < a.x1 && a.z0 - m < b.z1 && b.z0 - m < a.z1;
const rectOf2 = (s) => ({ x0: s.cx - s.hw, z0: s.cz - s.hd, x1: s.cx + s.hw, z1: s.cz + s.hd });

// ---------- planning ----------

// a pool shape filling (most of) a box, of a random kind
function makeShape2(r, box) {
  const w = box.x1 - box.x0, d = box.z1 - box.z0;
  const hw = snap2(w * between2(r, 0.32, 0.5)), hd = snap2(d * between2(r, 0.32, 0.5));
  const cx = snap2((box.x0 + box.x1) / 2 + between2(r, -1, 1) * (w / 2 - hw)), cz = snap2((box.z0 + box.z1) / 2 + between2(r, -1, 1) * (d / 2 - hd));
  const s = { cx, cz, hw: Math.max(2, hw), hd: Math.max(2, hd) };
  const k = r();
  if (k < 0.24) s.type = 'rect';
  else if (k < 0.58) { s.type = 'rrect'; s.r = k < 0.42 ? Math.min(s.hw, s.hd) : snap2(between2(r, 1, Math.min(s.hw, s.hd) * 0.7)); }   // stadium, or softly rounded
  else if (k < 0.84) {
    s.type = 'ellipse';
    if (Math.abs(s.hw - s.hd) < 3) s.hw = s.hd = Math.min(s.hw, s.hd);   // nearly round: a circle
  } else {
    s.type = 'L';
    s.notch = { sx: r() < 0.5 ? 1 : -1, sz: r() < 0.5 ? 1 : -1, w: snap2(s.hw * between2(r, 0.6, 1.1)), d: snap2(s.hd * between2(r, 0.6, 1.1)) };
  }
  return s;
}

function makePool2(r, box, roomY, deepOk = true) {
  const shape = makeShape2(r, box), k = r();
  const p = { shape, water: roomY - WATER_DROP, axis: shape.hw >= shape.hd ? 'x' : 'z', flip: r() < 0.5 };
  // wading water has a part shallow enough to climb out of (bottom within STEP_UP of the rim); deep flat pools are not entered
  const shallow = () => between2(r, 0.3, EXIT_DEPTH);
  if (k < 0.3 || !deepOk) p.d0 = p.d1 = shallow();
  else if (k < 0.55) p.d0 = p.d1 = between2(r, 1.6, 2.6);
  else { p.d0 = shallow(); p.d1 = between2(r, 1.6, 2.8); }
  p.d0 = Math.floor(p.d0 * 100) / 100; p.d1 = Math.floor(p.d1 * 100) / 100;
  return p;
}

// free stretches along a hall wall where a flight of length len (plus room at its two ends) fits, clear of corridor mouths
function flightSlot2(r, hall, len, avoid) {
  const depth = FLIGHT_W + 2 * FLIGHT_WALL, slots = [];
  for (const side of ['n', 's', 'w', 'e']) {
    const axis = side === 'n' || side === 's' ? 'x' : 'z';
    const a0 = (axis === 'x' ? hall.x0 : hall.z0) + 2, a1 = (axis === 'x' ? hall.x1 : hall.z1) - 2;
    for (let s = a0; s + len <= a1; s += Q2) {
      const f = axis === 'x'
        ? { x0: s, x1: s + len, z0: side === 'n' ? hall.z0 : hall.z1 - depth, z1: side === 'n' ? hall.z0 + depth : hall.z1 }
        : { z0: s, z1: s + len, x0: side === 'w' ? hall.x0 : hall.x1 - depth, x1: side === 'w' ? hall.x0 + depth : hall.x1 };
      if (avoid.some((o) => overlap2(f, o, 1.5))) continue;
      slots.push({ ...f, axis });
    }
  }
  return slots.length ? slots[(r() * slots.length) | 0] : null;
}

const clampRect2 = (b, ox, oz) => ({ x0: Math.max(b.x0, ox + 2), z0: Math.max(b.z0, oz + 2), x1: Math.min(b.x1, ox + CELL2 - 2), z1: Math.min(b.z1, oz + CELL2 - 2) });

// the room a flight opens into at its far end: abutting the end face, covering its width, inside the cell
function roomBeyond2(r, f, highEnd, ox, oz, size) {
  const [lw, cw] = size;   // length along the flight's axis, width across it
  const atMax = (f.up > 0) === highEnd;   // the far end is at the larger coordinate
  const c0 = f.axis === 'x' ? f.z0 : f.x0, c1 = f.axis === 'x' ? f.z1 : f.x1;
  const cMid = (c0 + c1) / 2 + snapIn2(r, -cw / 2 + 2.5, cw / 2 - 2.5), half = cw / 2;
  let b0 = snap2(Math.min(c0, cMid - half)), b1 = snap2(Math.max(c1, cMid + half));
  const e = atMax ? (f.axis === 'x' ? f.x1 : f.z1) : (f.axis === 'x' ? f.x0 : f.z0);
  const a0 = atMax ? e : e - lw, a1 = atMax ? e + lw : e;
  const rect = f.axis === 'x' ? { x0: a0, x1: a1, z0: b0, z1: b1 } : { z0: a0, z1: a1, x0: b0, x1: b1 };
  const c = clampRect2(rect, ox, oz);
  // still has to cover the whole end face and leave a real room
  const okFace = f.axis === 'x' ? c.z0 <= f.z0 && c.z1 >= f.z1 : c.x0 <= f.x0 && c.x1 >= f.x1;
  const okEnd = f.axis === 'x' ? (atMax ? c.x0 === e : c.x1 === e) : (atMax ? c.z0 === e : c.z1 === e);
  if (!okFace || !okEnd || c.x1 - c.x0 < 8 || c.z1 - c.z0 < 8) return null;
  return c;
}

const edgeSalt2 = { x: 7101, z: 7102 };
// the corridor through the cell edge on the +x side of cell (i, j) (axis 'x') or its +z side ('z'): offset from the
// cell's middle line and width, the same seen from both cells
function edgeCorridor2(seed, i, j, axis) {
  const r = mulberry32(hash2(seed, i, j, edgeSalt2[axis]));
  return { t: snapIn2(r, -4, 4), w: [3, 4, 4, 5, 6][(r() * 5) | 0], ceil: snapIn2(r, 3, 3.5) };
}

export class World2 {
  constructor(seed) {
    this.seed = seed >>> 0;
    const r = mulberry32(hash2(this.seed, 0, 0, 7001));
    this.Y = { '-1': -snapIn2(r, 6, 8), 0: 0, 1: snapIn2(r, 6.5, 9) };
    this.plans = new Map();
    this.zones = [];
    this.items = [];
    this.exit = null;
    this.tension = 0;
    this._surf = { h: 0, wl: NaN, up: false };
    this._c = [];
    this.spawn = this.restPoint(0, 0);
  }

  levelY(lv) { return this.Y[lv]; }
  // the floor whose height is nearest h
  levelAt(h) { return [-1, 0, 1].reduce((a, b) => (Math.abs(this.Y[b] - h) < Math.abs(this.Y[a] - h) ? b : a)); }

  plan(i, j) {
    const key = (i + 32768) * 65536 + (j + 32768);
    let p = this.plans.get(key);
    if (!p) {
      p = this.makePlan(i, j);
      if (this.plans.size > 400) this.plans.delete(this.plans.keys().next().value);
      this.plans.set(key, p);
    }
    return p;
  }

  planAt(x, z) { return this.plan(Math.floor(x / CELL2), Math.floor(z / CELL2)); }

  makePlan(i, j) {
    const r = mulberry32(hash2(this.seed, i, j, 7010)), ox = i * CELL2, oz = j * CELL2, mx = ox + CELL2 / 2, mz = oz + CELL2 / 2;
    const plan = { i, j, ox, oz, rooms: [], pools: [], flights: [] };
    let id = 0;
    const room = (lv, rect, ceil, kind) => { const o = { id: id++, lv, ...rect, ceil, kind, lamps: [] }; plan.rooms.push(o); return o; };
    // 1F hall: centred within ±3 m so every corridor (offset ±4, half width ≤ 3) runs straight into it
    const hw = snapIn2(r, 10, 25), hd = snapIn2(r, 10, 25), jx = snapIn2(r, -3, 3), jz = snapIn2(r, -3, 3);
    const hall = room(0, { x0: mx + jx - hw, x1: mx + jx + hw, z0: mz + jz - hd, z1: mz + jz + hd }, snapIn2(r, 4, Math.min(6, this.Y[1] - 1.5)), 'hall');
    // corridors to the four neighbours, each from 1 m inside the hall out to the cell edge
    const mouths = [];
    for (const [axis, ei, ej, side] of [['x', i, j, 1], ['x', i - 1, j, -1], ['z', i, j, 1], ['z', i, j - 1, -1]]) {
      const e = edgeCorridor2(this.seed, ei, ej, axis);
      const c0 = (axis === 'x' ? mz : mx) + e.t - e.w / 2, c1 = c0 + e.w;
      const a0 = side > 0 ? (axis === 'x' ? hall.x1 : hall.z1) - 1 : (axis === 'x' ? ox : oz);
      const a1 = side > 0 ? (axis === 'x' ? ox : oz) + CELL2 : (axis === 'x' ? hall.x0 : hall.z0) + 1;
      const rect = axis === 'x' ? { x0: a0, x1: a1, z0: c0, z1: c1 } : { z0: a0, z1: a1, x0: c0, x1: c1 };
      room(0, rect, e.ceil, 'corridor');
      // the mouth: the corridor's last metres inside the hall, kept clear of flights
      mouths.push(axis === 'x' ? { x0: side > 0 ? hall.x1 - 3 : hall.x0, x1: side > 0 ? hall.x1 : hall.x0 + 3, z0: c0, z1: c1 }
        : { z0: side > 0 ? hall.z1 - 3 : hall.z0, z1: side > 0 ? hall.z1 : hall.z0 + 3, x0: c0, x1: c1 });
    }
    // flights: up to a 2F room, down to a B1 hall
    const run = (dy) => snap2(Math.abs(dy) / FLIGHT_SLOPE / 2 + 0.25) * 2 + LANDING;
    for (const [lv, share] of [[1, 0.5], [-1, 0.4]]) {
      if (r() >= share) continue;
      const len = run(this.Y[lv]), slot = flightSlot2(r, hall, len, mouths.concat(plan.flights));
      if (!slot) continue;
      const f = { ...slot, up: r() < 0.5 ? 1 : -1, lo: Math.min(0, lv), hi: Math.max(0, lv) };
      f.y0 = this.Y[f.lo]; f.y1 = this.Y[f.hi];
      // the end that meets the hall floor needs open floor beyond it (the far end opens into the new room)
      const beyond = roomBeyond2(r, f, lv > 0, ox, oz, lv > 0 ? [snapIn2(r, 12, 30), snapIn2(r, 10, 26)] : [snapIn2(r, 12, 30), snapIn2(r, 8, 22)]);
      const entry = entryArea2(f, lv > 0);   // up: the low end stands in the hall; down: the high end
      if (!beyond || !(entry.x0 >= hall.x0 && entry.x1 <= hall.x1 && entry.z0 >= hall.z0 && entry.z1 <= hall.z1)) continue;
      const ceil = lv > 0 ? snapIn2(r, 3.5, 6) : snapIn2(r, 2.6, Math.min(3.5, -this.Y[-1] - 1.5));
      const o = room(lv, beyond, ceil, lv > 0 ? 'upper' : 'basement');
      if (lv < 0) o.dark = 1;
      f.room = o.id;
      f.hallEntry = entry;
      plan.flights.push(f);
    }
    // pools: none, one or two in the hall; one in an upper room now and then; B1 halls are mostly flooded
    const hallBox = { x0: hall.x0 + POOL_MARGIN, x1: hall.x1 - POOL_MARGIN, z0: hall.z0 + POOL_MARGIN, z1: hall.z1 - POOL_MARGIN };
    const blockers = plan.flights.flatMap((f) => [f, f.hallEntry]);
    const k = r();
    const boxes = k < 0.2 ? [] : k < 0.6 ? [hallBox] : splitBox2(hallBox, 3);
    for (const b of boxes) this.addPool(plan, r, hall, b, blockers);
    for (const o of plan.rooms) {
      if (o.kind === 'upper' && r() < 0.4) this.addPool(plan, r, o, inset2(o, POOL_MARGIN), []);
      if (o.kind === 'basement' && r() < 0.8) this.addPool(plan, r, o, inset2(o, 1.5), [], false);
    }
    // ceiling lamps on a regular grid over every room (sparser and dimmer in corridors and B1)
    for (const o of plan.rooms) {
      const step = o.kind === 'corridor' ? 6 : o.kind === 'basement' ? 7 : snapIn2(r, 5, 7);
      for (let z = o.z0 + step / 2; z < o.z1 - 0.6; z += step) for (let x = o.x0 + step / 2; x < o.x1 - 0.6; x += step) {
        if (plan.flights.some((f) => inRect2(f, x, z) || inRect2(f, x + 1.2, z + 1.2))) continue;
        o.lamps.push({ x: x - 0.6, z: z - 0.6, w: 1.2, d: 1.2, k: o.kind === 'basement' ? 2 : 0 });
      }
    }
    return plan;
  }

  addPool(plan, r, room, box, blockers, deepOk = true) {
    if (box.x1 - box.x0 < 4 || box.z1 - box.z0 < 4) return;
    for (let t = 0; t < 6; t++) {
      const p = makePool2(r, box, this.Y[room.lv], deepOk);
      const bb = rectOf2(p.shape);
      if (bb.x0 < box.x0 || bb.x1 > box.x1 || bb.z0 < box.z0 || bb.z1 > box.z1) continue;
      if (blockers.some((b) => overlap2(bb, b, 2)) || plan.pools.some((q) => overlap2(bb, rectOf2(q.shape), 3))) continue;
      p.room = room.id; p.lv = room.lv;
      plan.pools.push(p);
      return;
    }
  }

  // ---------- queries (the Player's view of the world) ----------

  // every height a body could stand on at (x, z), with the water over it; NaN-free. Shared array.
  candidates(x, z) {
    const out = this._c;
    out.length = 0;
    const p = this.planAt(x, z), seen = [];
    for (const f of p.flights) {
      if (!inRect2(f, x, z)) continue;
      if (inFlightWall(f, x, z)) out.push({ h: NaN, wl: NaN, wall: true });
      else out.push({ h: flightH(f, x, z), wl: NaN });
      for (let lv = f.lo; lv <= f.hi; lv++) seen.push(lv);   // the floors it runs between have no floor here
    }
    for (const o of p.rooms) {
      if (!inRect2(o, x, z) || seen.includes(o.lv)) continue;
      seen.push(o.lv);
      const y = this.Y[o.lv];
      const pool = p.pools.find((q) => q.lv === o.lv && shapeContains(q.shape, x, z));
      if (!pool) { out.push({ h: y, wl: NaN }); continue; }
      const d = poolDepth(pool, x, z);
      if (d <= WADE_MAX) out.push({ h: pool.water - d, wl: pool.water });
    }
    return out;
  }

  surfaceAt(x, z, curH) {
    let best = null;
    for (const c of this.candidates(x, z)) {
      if (c.wall || c.h - curH > 0.45 || curH - c.h > 0.7) continue;
      if (!best || Math.abs(c.h - curH) < Math.abs(best.h - curH)) best = c;
    }
    if (!best) return null;
    const s = this._surf;
    s.h = best.h; s.wl = best.wl; s.up = false;
    return s;
  }

  surfaceNear(x, z, curH) {
    let best = null;
    for (const c of this.candidates(x, z)) if (!c.wall && (!best || Math.abs(c.h - curH) < Math.abs(best.h - curH))) best = c;
    if (!best) return null;
    const s = this._surf;
    s.h = best.h; s.wl = best.wl; s.up = false;
    return s;
  }

  blockedAt(x, z, curH) {
    for (const c of this.candidates(x, z)) if (!c.wall && Math.abs(c.h - curH) <= 1) return false;
    return true;
  }

  railHit() { return false; }
  railPush() { return null; }
  slideAt() { return null; }
  ladderAt() { return null; }
  zoneAtChunk() { return null; }
  safePoint() { return null; }

  // dry floor beside a cell's hall's west wall (or another wall when a flight stands there): the start is cell 0, 0's
  restPoint(i, j) {
    const h = this.plan(i, j).rooms[0], cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2;
    for (const [x, z, yaw] of [[h.x0 + 1.25, cz, -Math.PI / 2], [h.x1 - 1.25, cz, Math.PI / 2], [cx, h.z0 + 1.25, 0], [cx, h.z1 - 1.25, Math.PI]]) {
      if (!this.blockedAt(x - 0.3, z - 0.3, 0) && !this.blockedAt(x + 0.3, z + 0.3, 0) && this.surfaceAt(x, z, 0)) return { x, z, yaw, h: 0 };
    }
    return { x: cx, z: cz, yaw: 0, h: 0 };
  }

  // ---------- drawing support ----------

  // is (x, z) inside some room of floor lv (any cell)
  roomAt(lv, x, z) {
    for (const o of this.planAt(x, z).rooms) if (o.lv === lv && inRect2(o, x, z)) return o;
    return null;
  }

  // the flight whose footprint holds (x, z), if any
  flightAt(x, z) {
    for (const f of this.planAt(x, z).flights) if (inRect2(f, x, z)) return f;
    return null;
  }
}

// the strip of hall floor right outside a flight's hall end (kept clear so the way in is never blocked)
function entryArea2(f, lowEnd) {
  const atMax = (f.up > 0) !== lowEnd;
  if (f.axis === 'x') return { x0: atMax ? f.x1 : f.x0 - 2, x1: atMax ? f.x1 + 2 : f.x0, z0: f.z0, z1: f.z1 };
  return { z0: atMax ? f.z1 : f.z0 - 2, z1: atMax ? f.z1 + 2 : f.z0, x0: f.x0, x1: f.x1 };
}

const inset2 = (o, m) => ({ x0: o.x0 + m, x1: o.x1 - m, z0: o.z0 + m, z1: o.z1 - m });

// two boxes side by side along the longer axis, gap metres apart
function splitBox2(b, gap) {
  const w = b.x1 - b.x0, d = b.z1 - b.z0;
  if (w >= d) { const m = snap2((b.x0 + b.x1) / 2); return [{ ...b, x1: m - gap / 2 }, { ...b, x0: m + gap / 2 }]; }
  const m = snap2((b.z0 + b.z1) / 2);
  return [{ ...b, z1: m - gap / 2 }, { ...b, z0: m + gap / 2 }];
}

// ---------- per-floor raster of a cell for meshing (Q2 grid) ----------
// inside: 1 room floor; flight: 1 under a flight that touches this floor; pool: 1 under a pool's bounding box;
// ceil: ceiling height over the floor (0 outside); room: the id of the room lighting the cell
export function cellRaster(world, i, j, lv) {
  const n = CELL2 / Q2, plan = world.plan(i, j), ox = i * CELL2, oz = j * CELL2;
  const R = { n, lv, ox, oz, inside: new Uint8Array(n * n), flight: new Uint8Array(n * n), pool: new Uint8Array(n * n), ceil: new Float32Array(n * n), room: new Int16Array(n * n).fill(-1) };
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    const x = ox + (a + 0.5) * Q2, z = oz + (b + 0.5) * Q2, k = b * n + a;
    for (const o of plan.rooms) {
      if (o.lv !== lv || !inRect2(o, x, z)) continue;
      R.inside[k] = 1;
      if (o.ceil > R.ceil[k]) { R.ceil[k] = o.ceil; R.room[k] = o.id; }
    }
    for (const f of plan.flights) if ((f.lo === lv || f.hi === lv) && inRect2(f, x, z)) R.flight[k] = 1;
    for (const p of plan.pools) if (p.lv === lv && inRect2(poolBox(p), x, z)) R.pool[k] = 1;
  }
  return R;
}

// a pool's bounding box widened onto the Q2 grid: its floor is drawn as one piece with the rim cut out
export function poolBox(p) {
  const b = rectOf2(p.shape);
  return { x0: Math.floor(b.x0 / Q2) * Q2 - Q2, z0: Math.floor(b.z0 / Q2) * Q2 - Q2, x1: Math.ceil(b.x1 / Q2) * Q2 + Q2, z1: Math.ceil(b.z1 / Q2) * Q2 + Q2 };
}

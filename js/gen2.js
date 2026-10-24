// Generator v2 prototype (?gen=v2): whole spaces first, then their elements. Pure data, no three.js.
// The world is cut into 64 m cells. Each cell holds a 1F hall (rectangle, 20–50 m) joined to its four neighbours by
// corridors, and sometimes a 2F room or a B1 hall stacked over or under it, reached by an enclosed straight flight with a
// landing half way. Pools are whole shapes (rectangle, rounded, ellipse, L) with a flat or one-way sloping bottom.
// Drawing (mesh2.js) and collision (World2 below) both read the same plan.
import { hash2, mulberry32 } from './rng.js';

export const CELL2 = 64;
export const Q2 = 0.5;                 // every rectangle edge sits on this grid
export const WADE_MAX = 1.5;           // deeper water than this cannot be walked
export const DEEP_MIN = 2;             // a pool that cannot be waded everywhere reaches at least this deep
export const WATER_DROP = 0.05;        // a wading pool's water sits this far under its rim
export const DEEP_DROP = 0.6;          // a pool with deep water sits this far under its rim
export const STEP2 = 0.8;              // highest step a body takes up or down in v2
export const BODY_R2 = 0.4;            // half the side of the body's square footprint in v2
export const FLIGHT_W = 3;             // walkable width of a flight
export const FLIGHT_WALL = 0.25;       // its enclosing side walls
export const FLIGHT_SLOPE = 0.6;       // rise per metre of run
export const LANDING = 2;              // flat landing half way up
export const POOL_MARGIN = 2.5;        // dry walkway between a pool and any wall
export const CURVE_SEG = 0.25;         // longest straight piece of a drawn curve
export const EXIT_DEPTH = STEP2 - WATER_DROP - 0.02;   // deepest wading water a body can still step out of onto the rim
export const SHELF = 1;                // a sloping pool stays at its shallow depth this far in from its shallow end
export const COL_CLEAR = 1;            // open floor round every column (to walls, pools, flights, each other): a body always passes
export const PARAPET = 0.2;            // thickness of the low wall round a void (an atrium or a pit)
export const PARAPET_H = 1;            // its height over the floor round it
export const WIN_WALL = 0.5;           // thickness of the wall between a hall and a showcase seen through its window
export const RAMP_SLOPE = 0.2;         // rise per metre of a corridor floor's gentle slope
export const STEP_RISE = 0.7;          // highest riser of a stepped pool floor: under STEP2, so every step can be climbed
export const FLIGHT_MID = 0.5;         // the wall between the two legs of a switchback
export const SWITCH_W = 2 * FLIGHT_W + 2 * FLIGHT_WALL + FLIGHT_MID;   // a switchback's width: two walkable legs, three walls
export const SWITCH_SHARE = 0.4;       // share of stairs that fold back on themselves (when the hall has room for the fold)
export const GIANT_SHARE = 0.15;        // share of cell pairs (2m, 2m + 1 in a row) that hold one giant hall across their shared edge
export const GIANT_ARM = [39, 50];      // how far a giant hall reaches into each of its two cells: at least 39 m so every corridor still opens into it, 78–100 m in all
export const GIANT_STRIP = 6;           // the stretch either side of a shared hall's seam kept clear of flights, voids and windows
export const L_SHARE = 0.2;             // share of 2 × 2 districts (no giant hall in either row) whose hall is one L over three of the cells
export const CONNECT_GAP = 12;          // a link between two halls can get a connector room only when both halls stand this far or more from the edge
export const CONNECT_SHARE = 0.4;       // share of those links whose middle is a connector room across the edge

const snap2 = (v) => Math.round(v / Q2) * Q2;
const between2 = (r, a, b) => a + (b - a) * r();
const snapIn2 = (r, a, b) => snap2(between2(r, a, b));

// ---------- pool shapes ----------
// { type: 'rect' | 'rrect' | 'ellipse' | 'L' | 'blob', cx, cz, hw, hd, r (rrect corner), notch: { sx, sz, w, d } (L: the cut corner),
//   h: [a2, p2, a3, p3], f: [ox, sx, oz, sz] (blob: a free smooth curve of radius 1 + a2 cos(2θ + p2) + a3 cos(3θ + p3), shifted by
//   ox, oz and stretched by sx, sz so that it touches all four sides of its box: its shallow end really reaches the box's end) }

const blobR2 = (s, a) => 1 + s.h[0] * Math.cos(2 * a + s.h[1]) + s.h[2] * Math.cos(3 * a + s.h[3]);

export function shapeContains(s, x, z) {
  const dx = x - s.cx, dz = z - s.cz;
  if (Math.abs(dx) > s.hw || Math.abs(dz) > s.hd) return false;
  if (s.type === 'rect') return true;
  if (s.type === 'ellipse') return (dx / s.hw) ** 2 + (dz / s.hd) ** 2 <= 1;
  if (s.type === 'blob') { const u = (dx - s.f[0]) / s.f[1], v = (dz - s.f[2]) / s.f[3]; return Math.hypot(u, v) <= blobR2(s, Math.atan2(v, u)); }
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
  if (s.type === 'blob') {
    // short enough pieces that even the tightest bend of the curve stays within a centimetre of each straight one
    const n = Math.max(48, Math.ceil((Math.PI * 2 * Math.max(s.hw, s.hd) * (1 + 3 * s.h[0] + 4 * s.h[2])) / (CURVE_SEG / 2)));
    for (let k = 0; k < n; k++) { const a = (-k / n) * Math.PI * 2, R = blobR2(s, a); pts.push([s.cx + s.f[0] + Math.cos(a) * R * s.f[1], s.cz + s.f[2] + Math.sin(a) * R * s.f[3]]); }
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

// water depth over the pool floor at a point inside the shape: flat, one-way along an axis (after a level SHELF at the shallow
// end, so a curved end still has room to climb out), or in p.steps level steps
export function poolDepth(p, x, z) {
  if (p.d0 === p.d1) return p.d0;
  const s = p.shape, lo = p.axis === 'x' ? s.cx - s.hw : s.cz - s.hd, span = 2 * (p.axis === 'x' ? s.hw : s.hd);
  let t = ((p.axis === 'x' ? x : z) - lo) / span;
  t = Math.min(1, Math.max(0, t));
  if (p.flip) t = 1 - t;
  if (p.steps) t = Math.min(p.steps - 1, Math.floor(t * p.steps)) / (p.steps - 1);
  else t = Math.max(0, (t * span - SHELF) / (span - SHELF));
  return p.d0 + (p.d1 - p.d0) * t;
}

// the pool floor cut along its axis where its depth bends or jumps: [{ a0, a1 (axis stretch), depth (NaN: sloping), polys }] in
// axis order. A flat pool is one band; a sloping one its level shelf and its slope; a stepped one a band per step
export function poolBands(p) {
  const rim = shapeOutline(p.shape), s = p.shape, k = p.axis === 'x' ? 0 : 1;
  const lo = p.axis === 'x' ? s.cx - s.hw : s.cz - s.hd, span = 2 * (p.axis === 'x' ? s.hw : s.hd);
  const cuts = p.d0 === p.d1 ? [] : p.steps ? Array.from({ length: p.steps - 1 }, (_, b) => lo + ((b + 1) * span) / p.steps) : [p.flip ? lo + span - SHELF : lo + SHELF];
  const ends = [-Infinity, ...cuts, Infinity];
  return ends.slice(0, -1).map((a0, b) => {
    const a1 = ends[b + 1], poly = clip2(clip2(rim, k, a0, 1), k, a1, -1);
    const mid = Math.max(lo, Math.min(lo + span, Number.isFinite(a0) ? (Number.isFinite(a1) ? (a0 + a1) / 2 : a0 + 1e-3) : a1 - 1e-3));
    const at = (v) => poolDepth(p, k === 0 ? v : s.cx, k === 0 ? s.cz : v);
    // level when the depth is the same a little way in from both ends of the stretch
    const level = p.steps || at(Math.max(lo, Number.isFinite(a0) ? a0 + 1e-3 : lo)) === at(Math.min(lo + span, Number.isFinite(a1) ? a1 - 1e-3 : lo + span));
    return { a0, a1, depth: level ? at(mid) : NaN, polys: poly.length >= 3 ? [poly] : [] };
  });
}

// where the line v[k] = c crosses a closed polygon: the other coordinate of each crossing, sorted, so pairs bound the inside.
// Half-open (an edge counts when exactly one end is below c): a corner lying on the line is counted once, never twice or not at all
export function lineCrossings(poly, k, c) {
  const xs = [];
  for (let a = 0; a < poly.length; a++) {
    const P = poly[a], Q = poly[(a + 1) % poly.length];
    if ((P[k] < c) !== (Q[k] < c)) xs.push(P[1 - k] + (Q[1 - k] - P[1 - k]) * (c - P[k]) / (Q[k] - P[k]));
  }
  return xs.sort((u, v) => u - v);
}

// the part of a polygon on one side of the line v[k] = c (side 1: v[k] >= c, -1: v[k] <= c)
function clip2(poly, k, c, side) {
  if (!Number.isFinite(c)) return poly;
  const out = [], inside = (v) => (v[k] - c) * side >= 0;
  for (let a = 0; a < poly.length; a++) {
    const p = poly[a], q = poly[(a + 1) % poly.length];
    if (inside(p)) out.push(p);
    if (inside(p) !== inside(q)) { const t = (c - p[k]) / (q[k] - p[k]); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}

// ---------- flights ----------
// { x0, z0, x1, z1 footprint, axis 'x' | 'z', up +1 (rises towards larger coordinate) | -1, lo, hi levels, y0, y1 }

const along2 = (f, x, z) => (f.axis === 'x' ? x : z);
const across2 = (f, x, z) => (f.axis === 'x' ? z : x);

// height of the treads at a point of the footprint (straight run, landing, straight run)
export function flightH(f, x, z) {
  if (f.turn) return switchH(f, x, z);
  const a0 = f.axis === 'x' ? f.x0 : f.z0, a1 = f.axis === 'x' ? f.x1 : f.z1;
  let d = f.up > 0 ? along2(f, x, z) - a0 : a1 - along2(f, x, z);
  const len = a1 - a0, run = (len - LANDING) / 2, rise = f.y1 - f.y0;
  d = Math.min(len, Math.max(0, d));
  const climbed = d <= run ? d : d <= run + LANDING ? run : d - LANDING;
  return f.y0 + rise * (climbed / (2 * run));
}

// inside a flight's side walls (solid at every height)
export function inFlightWall(f, x, z) {
  if (f.turn) return switchWall(f, x, z);
  const c = across2(f, x, z), c0 = f.axis === 'x' ? f.z0 : f.x0, c1 = f.axis === 'x' ? f.z1 : f.x1;
  return c < c0 + FLIGHT_WALL || c > c1 - FLIGHT_WALL;
}

// ---------- switchbacks ----------
// A stair that folds back: two parallel legs side by side (leg A on the smaller across side starts at the hall floor at the entry
// end, climbs half the height over f.Lg, a flat landing LANDING deep spans both legs at the far end, leg B climbs the other half
// back to the entry end, where it opens into the far room beside the way in). f.dir: +1 when the far end is at the larger
// coordinate. f.yE, f.yF: the floor at the entry end of leg A and at the end of leg B (the far floor).
const switchD = (f, x, z) => {
  const ax = f.axis === 'x', a0 = ax ? f.x0 : f.z0, a1 = ax ? f.x1 : f.z1, d = f.dir > 0 ? (ax ? x : z) - a0 : a1 - (ax ? x : z);
  return Math.min(a1 - a0, Math.max(0, d));
};
export const switchMid = (f) => (f.axis === 'x' ? f.z0 : f.x0) + FLIGHT_WALL + FLIGHT_W + FLIGHT_MID / 2;
export function switchH(f, x, z) {
  const d = switchD(f, x, z), half = (f.yF - f.yE) / 2;
  if (d >= f.Lg) return f.yE + half;
  if (across2(f, x, z) < switchMid(f)) return f.yE + (half * d) / f.Lg;
  return f.yE + half + (half * (f.Lg - d)) / f.Lg;
}
// solid at every height: the two outer walls, and the middle wall along the legs (open over the landing)
export function switchWall(f, x, z) {
  const c = across2(f, x, z), c0 = f.axis === 'x' ? f.z0 : f.x0, c1 = f.axis === 'x' ? f.z1 : f.x1;
  if (c < c0 + FLIGHT_WALL || c > c1 - FLIGHT_WALL) return true;
  return switchD(f, x, z) < f.Lg && Math.abs(c - switchMid(f)) < FLIGHT_MID / 2;
}
// the end face of leg B at the entry end: where the far room opens, as a one-flight-wide stand-in for roomBeyond2
export function switchLegB(f) {
  const m = switchMid(f) + FLIGHT_MID / 2, c1 = (f.axis === 'x' ? f.z1 : f.x1) - FLIGHT_WALL;
  return f.axis === 'x' ? { x0: f.x0, x1: f.x1, z0: m, z1: c1, axis: 'x' } : { z0: f.z0, z1: f.z1, x0: m, x1: c1, axis: 'z' };
}

const inRect2 = (r, x, z) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
const overlap2 = (a, b, m = 0) => a.x0 - m < b.x1 && b.x0 - m < a.x1 && a.z0 - m < b.z1 && b.z0 - m < a.z1;
const rectOf2 = (s) => ({ x0: s.cx - s.hw, z0: s.cz - s.hd, x1: s.cx + s.hw, z1: s.cz + s.hd });
// inside a column's body: { form 'round' | 'square', x, z, r (radius / half side) }
export const inColumn2 = (c, x, z) => (c.form === 'round' ? Math.hypot(x - c.x, z - c.z) < c.r : Math.abs(x - c.x) < c.r && Math.abs(z - c.z) < c.r);

// inside a void or its parapet (not the parapet's gap at a split's ladder)
export function inVoid2(v, x, z) {
  if (x < v.x0 - PARAPET || x >= v.x1 + PARAPET || z < v.z0 - PARAPET || z >= v.z1 + PARAPET) return false;
  if (x >= v.x0 && x < v.x1 && z >= v.z0 && z < v.z1) return true;
  return !(v.gap && (v.run === 'x' ? x : z) >= v.gap[0] && (v.run === 'x' ? x : z) < v.gap[1]);
}

// ---------- sloping corridor floors ----------
// { axis, a0, a1, b0, b1, d }: level until a0, a gentle ramp to d by a1, level to b0, back to level by b1. No vertical step
// anywhere; it starts 2 m out from the hall wall and ends 2 m short of the cell edge, so both ends meet level floors

export function floorRise2(o, x, z) {
  const sl = o.slope;
  if (!sl) return 0;
  const t = sl.axis === 'x' ? x : z;
  if (t <= sl.a0 || t >= sl.b1) return 0;
  if (t < sl.a1) return (sl.d * (t - sl.a0)) / (sl.a1 - sl.a0);
  if (t <= sl.b0) return sl.d;
  return (sl.d * (sl.b1 - t)) / (sl.b1 - sl.b0);
}

// half the corridors dip or rise 0.4–1.5 m in their middle, its own random stream (the cell's plan is unchanged)
function addSlope2(r, o, axis, hallEdge, cellEdge) {
  if (r() >= 0.5) return;
  const lo = Math.min(hallEdge, cellEdge) + 2, hi = Math.max(hallEdge, cellEdge) - 2, len = hi - lo;
  let d = Math.round(between2(r, 0.5, 1.5) * 10) / 10;
  d = Math.min(d, Math.floor(((len - 1) / 2) * RAMP_SLOPE * 10) / 10);
  if (d < 0.4) return;
  const run = Math.ceil(d / RAMP_SLOPE / Q2) * Q2, flat = snap2(between2(r, 1, len - 2 * run));
  const a0 = lo + snap2(r() * Math.max(0, len - 2 * run - flat));
  if (a0 + 2 * run + flat > hi + 1e-9) return;
  o.slope = { axis, a0, a1: a0 + run, b0: a0 + run + flat, b1: a0 + 2 * run + flat, d: r() < 0.5 ? -d : d };
}

// ---------- planning ----------

// a pool shape filling (most of) a box, of a random kind
function makeShape2(r, box) {
  const w = box.x1 - box.x0, d = box.z1 - box.z0;
  const hw = snap2(w * between2(r, 0.32, 0.5)), hd = snap2(d * between2(r, 0.32, 0.5));
  const cx = snap2((box.x0 + box.x1) / 2 + between2(r, -1, 1) * (w / 2 - hw)), cz = snap2((box.z0 + box.z1) / 2 + between2(r, -1, 1) * (d / 2 - hd));
  const s = { cx, cz, hw: Math.max(2, hw), hd: Math.max(2, hd) };
  const k = r();
  if (k < 0.2) s.type = 'rect';
  else if (k < 0.48) { s.type = 'rrect'; s.r = k < 0.34 ? Math.min(s.hw, s.hd) : snap2(between2(r, 1, Math.min(s.hw, s.hd) * 0.7)); }   // stadium, or softly rounded
  else if (k < 0.7) {
    s.type = 'ellipse';
    if (Math.abs(s.hw - s.hd) < 3) s.hw = s.hd = Math.min(s.hw, s.hd);   // nearly round: a circle
  } else if (k < 0.86) {
    s.type = 'blob';
    s.h = [between2(r, 0.1, 0.22), between2(r, 0, Math.PI * 2), between2(r, 0, 0.1), between2(r, 0, Math.PI * 2)];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 4096; k++) {
      const a = (k / 4096) * Math.PI * 2, R = blobR2(s, a);
      x0 = Math.min(x0, R * Math.cos(a)); x1 = Math.max(x1, R * Math.cos(a)); z0 = Math.min(z0, R * Math.sin(a)); z1 = Math.max(z1, R * Math.sin(a));
    }
    const sx = (2 * s.hw) / (x1 - x0), sz = (2 * s.hd) / (z1 - z0);
    s.f = [-(x0 + x1) / 2 * sx, sx, -(z0 + z1) / 2 * sz, sz];
  } else {
    s.type = 'L';
    s.notch = { sx: r() < 0.5 ? 1 : -1, sz: r() < 0.5 ? 1 : -1, w: snap2(s.hw * between2(r, 0.6, 1.1)), d: snap2(s.hd * between2(r, 0.6, 1.1)) };
  }
  return s;
}

// deepOk false: shallow only (B1 rooms); deepOnly: never the shallow flat kind (reservoirs)
function makePool2(r, box, roomY, deepOk = true, deepOnly = false) {
  const shape = makeShape2(r, box), k = deepOnly ? 0.3 + r() * 0.7 : r();
  const p = { shape, axis: shape.hw >= shape.hd ? 'x' : 'z', flip: r() < 0.5 };
  // wading water has a part shallow enough to climb out of (bottom within STEP2 of the rim); deep flat pools are not entered.
  // Deep water sits DEEP_DROP under the rim, so a sloping pool's shallow end is only ankle deep: rim to bottom stays one step
  const shallow = () => between2(r, 0.3, EXIT_DEPTH);
  if (k < 0.3 || !deepOk) p.d0 = p.d1 = shallow();
  else if (k < 0.55) p.d0 = p.d1 = between2(r, DEEP_MIN, 2.8);
  else if (deepOnly || r() < 0.65) { p.d0 = between2(r, 0.1, STEP2 - DEEP_DROP - 0.02); p.d1 = between2(r, DEEP_MIN, 3); }
  else {   // a few clear steps down, all of them wadeable
    p.steps = 3 + ((r() * 3) | 0); p.d0 = shallow();
    p.d1 = p.d0 + Math.min(between2(r, 0.3, STEP_RISE - 0.02), (WADE_MAX - p.d0) / (p.steps - 1)) * (p.steps - 1);
  }
  p.d0 = Math.floor(p.d0 * 100) / 100; p.d1 = Math.floor(p.d1 * 100) / 100;
  p.water = roomY - (Math.max(p.d0, p.d1) > WADE_MAX ? DEEP_DROP : WATER_DROP);
  return p;
}

// free stretches along a hall wall where a flight of length len (plus room at its two ends) fits, clear of corridor mouths
function flightSlot2(r, hall, len, avoid, depth = FLIGHT_W + 2 * FLIGHT_WALL) {
  const slots = [];
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
    this.bodyR = BODY_R2;
    this.spawn = this.restPoint(0, 0);
  }

  levelY(lv) { return this.Y[lv]; }
  // the floor whose height is nearest h
  levelAt(h) { return [-1, 0, 1].reduce((a, b) => (Math.abs(this.Y[b] - h) < Math.abs(this.Y[a] - h) ? b : a)); }

  plan(i, j) {
    const key = i + ',' + j;   // a number packed from i and j aliases far-apart cells
    let p = this.plans.get(key);
    if (!p) {
      p = this.makePlan(i, j);
      if (this.plans.size > 400) this.plans.delete(this.plans.keys().next().value);
      this.plans.set(key, p);
    }
    return p;
  }

  planAt(x, z) { return this.plan(Math.floor(x / CELL2), Math.floor(z / CELL2)); }

  // the giant hall across the edge between cells (2m, j) and (2m + 1, j), or null: from the seed and the pair alone, so it is the
  // same whichever of the two cells is planned first or dropped from the cache. The two halves abut at the seam, share their
  // z extent and ceiling, and reach far enough into each cell for every corridor to open into them
  // the hall that (i, j) shares with other cells, or null: a giant hall (two cells in a row) or an L hall (three cells of a
  // 2 × 2 district). From the seed and the cell alone, so every cell of it sees the same space, whichever is planned first.
  // { spaceId, owner, lv, kind, span ('giant' | 'L'), shape, parts: one rectangle per cell, each inside its cell, cells, ceil,
  //   lampGrid: { ox, oz, step } }. owner is the cell the space is named and planned from (an L's district anchor, which
  //   may be the one cell the L leaves out), not necessarily one of its cells.
  spaceOf(i, j) {
    const g = this.megaOf(i, j);
    if (g) {
      const w = 2 * Math.floor(i / 2), parts = [{ i: w, j, x0: g.x0, x1: g.seam, z0: g.z0, z1: g.z1 }, { i: w + 1, j, x0: g.seam, x1: g.x1, z0: g.z0, z1: g.z1 }];
      return { spaceId: `v2:space:${w},${j}:giant`, owner: { i: w, j }, lv: 0, kind: 'hall', span: 'giant', shape: 'rect', parts, cells: parts.map((q) => ({ i: q.i, j: q.j })), ceil: g.ceil, lampGrid: { ox: g.x0, oz: g.z0, step: g.step } };
    }
    const L = this.lOf(Math.floor(i / 2), Math.floor(j / 2));
    return L && L.cells.some((c) => c.i === i && c.j === j) ? L : null;
  }

  // the L hall of district (a, b) (cells 2a..2a+1, 2b..2b+1), or null. The corner cell's part reaches both inner cell edges;
  // arm A runs on from it along x into its neighbour, arm B along z into the other; the fourth cell keeps a hall of its own.
  // Each arm is as wide as a hall and reaches 39 m or more into its cell, and the corner part 39 m or more each way, so every
  // corridor of the three cells still runs straight into the hall
  lOf(a, b) {
    if (this.megaOf(2 * a, 2 * b) || this.megaOf(2 * a, 2 * b + 1)) return null;   // a giant hall already takes a row of it
    const r = mulberry32(hash2(this.seed, a, b, 7600));
    if (r() >= L_SHARE) return null;
    const q = (r() * 4) | 0, qx = q & 1, qz = q >> 1, dx = qx ? 1 : -1, dz = qz ? 1 : -1;   // the cell left out is (2a + qx, 2b + qz)
    const X = (2 * a + 1) * CELL2, Z = (2 * b + 1) * CELL2, ci = 2 * a + 1 - qx, cj = 2 * b + 1 - qz;
    const band = (mid) => { const o = snapIn2(r, -3, 3), h = snapIn2(r, 10, 18); return [mid + o - h, mid + o + h]; };
    const [az0, az1] = band(Z - dz * CELL2 / 2), [bx0, bx1] = band(X - dx * CELL2 / 2);
    const armA = snapIn2(r, GIANT_ARM[0], GIANT_ARM[1]), armB = snapIn2(r, GIANT_ARM[0], GIANT_ARM[1]);
    const reachX = Math.max(39, dx > 0 ? X - bx0 : bx1 - X) + snapIn2(r, 0, 6), reachZ = Math.max(39, dz > 0 ? Z - az0 : az1 - Z) + snapIn2(r, 0, 6);
    const span = (p, d, len) => (d > 0 ? [p, p + len] : [p - len, p]);
    const [cx0, cx1] = span(X, -dx, reachX), [cz0, cz1] = span(Z, -dz, reachZ), [ax0, ax1] = span(X, dx, armA), [bz0, bz1] = span(Z, dz, armB);
    const parts = [
      { i: ci, j: cj, x0: cx0, x1: cx1, z0: cz0, z1: cz1 },
      { i: 2 * a + qx, j: cj, x0: ax0, x1: ax1, z0: az0, z1: az1 },
      { i: ci, j: 2 * b + qz, x0: bx0, x1: bx1, z0: bz0, z1: bz1 },
    ];
    const ceil = snapIn2(r, 4, Math.min(6, this.Y[1] - 1.5)), step = snapIn2(r, 5, 7);
    return { spaceId: `v2:space:${2 * a},${2 * b}:L`, owner: { i: 2 * a, j: 2 * b }, lv: 0, kind: 'hall', span: 'L', shape: 'L', parts, cells: parts.map((p) => ({ i: p.i, j: p.j })),
      ceil, lampGrid: { ox: Math.min(cx0, ax0, bx0), oz: Math.min(cz0, az0, bz0), step } };
  }

  megaOf(i, j) {
    const m = Math.floor(i / 2), r = mulberry32(hash2(this.seed, m, j, 7400));
    if (r() >= GIANT_SHARE) return null;
    const seam = (2 * m + 1) * CELL2, mz = j * CELL2 + CELL2 / 2, hd = snapIn2(r, 12, 25), jz = snapIn2(r, -3, 3);
    const x0 = seam - snapIn2(r, GIANT_ARM[0], GIANT_ARM[1]), x1 = seam + snapIn2(r, GIANT_ARM[0], GIANT_ARM[1]);
    return { seam, x0, x1, z0: mz + jz - hd, z1: mz + jz + hd, ceil: snapIn2(r, 4, Math.min(6, this.Y[1] - 1.5)), step: snapIn2(r, 5, 7), west: i === 2 * m };
  }

  // the cell's own 1F hall, from the first draws of its plan's stream (r: makePlan goes on drawing from it). Centred within
  // ±3 m so every corridor (offset ±4, half width ≤ 3) runs straight into it
  ownHall(i, j) {
    const r = mulberry32(hash2(this.seed, i, j, 7010)), mx = i * CELL2 + CELL2 / 2, mz = j * CELL2 + CELL2 / 2;
    const hw = snapIn2(r, 10, 25), hd = snapIn2(r, 10, 25), jx = snapIn2(r, -3, 3), jz = snapIn2(r, -3, 3), ceil = snapIn2(r, 4, Math.min(6, this.Y[1] - 1.5));
    return { r, rect: { x0: mx + jx - hw, x1: mx + jx + hw, z0: mz + jz - hd, z1: mz + jz + hd }, ceil };
  }

  // the 1F hall of (i, j) as its plan builds it (its part of a shared hall, or its own) and its spaceId, without the plan
  hallOf(i, j) {
    const space = this.spaceOf(i, j), part = space?.parts.find((p) => p.i === i && p.j === j);
    return part ? { x0: part.x0, x1: part.x1, z0: part.z0, z1: part.z1, spaceId: space.spaceId } : { ...this.ownHall(i, j).rect, spaceId: `v2:space:${i},${j}:hall` };
  }

  // the connection through the edge on the +axis side of cell (i, j), from the seed and the edge alone (no plan is built), so
  // both cells see the same one. Inside one shared hall it is that hall's own opening ('seam'); otherwise a corridor through
  // the edge (from each hall out to it), and on CONNECT_SHARE of the links whose halls both stand CONNECT_GAP or more from
  // the edge, a connector room across the edge takes the middle: each corridor stops 1 m inside it, 4 m or more of corridor
  // left between it and each hall. { id, axis, fromSpaceId, toSpaceId, mode ('seam' | 'corridor' | 'connector-room'),
  // corridor, gaps (hall to edge, each side), eligible, connectorSpaceId, parts (one per cell), ceil, lampGrid }
  connectionOf(i, j, axis) {
    const X = axis === 'x', [ni, nj] = X ? [i + 1, j] : [i, j + 1], A = this.hallOf(i, j), B = this.hallOf(ni, nj);
    const c = { id: `v2:edge:${axis}:${i},${j}`, axis, fromSpaceId: A.spaceId, toSpaceId: B.spaceId };
    if (A.spaceId === B.spaceId) return { ...c, mode: 'seam' };
    const edge = (X ? ni : nj) * CELL2, gaps = [edge - (X ? A.x1 : A.z1), (X ? B.x0 : B.z0) - edge];
    Object.assign(c, { mode: 'corridor', corridor: edgeCorridor2(this.seed, i, j, axis), gaps, eligible: gaps.every((g) => g >= CONNECT_GAP) });
    if (!c.eligible) return c;
    const r = mulberry32(hash2(this.seed, i, j, X ? 7801 : 7802));
    if (r() >= CONNECT_SHARE) return c;
    // 12–16 m wide on the corridor's middle line, 8–10 m into each cell
    const half = snapIn2(r, 6, 8), dA = snapIn2(r, 8, Math.min(10, gaps[0] - 4)), dB = snapIn2(r, 8, Math.min(10, gaps[1] - 4)), ceil = snapIn2(r, 3.5, 4.5);
    const mid = (X ? j : i) * CELL2 + CELL2 / 2 + c.corridor.t, c0 = mid - half, c1 = mid + half;
    const rect = (a0, a1) => (X ? { x0: a0, x1: a1, z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: a0, z1: a1 });
    return { ...c, mode: 'connector-room', connectorSpaceId: `v2:space:${axis}:${i},${j}:connector`,
      parts: [{ i, j, ...rect(edge - dA, edge) }, { i: ni, j: nj, ...rect(edge, edge + dB) }], ceil,
      lampGrid: { ox: X ? edge - dA : c0, oz: X ? c0 : edge - dA, step: 6 } };
  }

  makePlan(i, j) {
    const { r, rect: own, ceil: hallCeil } = this.ownHall(i, j), ox = i * CELL2, oz = j * CELL2, mx = ox + CELL2 / 2, mz = oz + CELL2 / 2;
    const plan = { i, j, ox, oz, rooms: [], pools: [], flights: [] };
    let id = 0;
    const room = (lv, rect, ceil, kind) => { const o = { id: id++, lv, ...rect, ceil, kind, lamps: [] }; plan.rooms.push(o); return o; };
    // 1F hall: a shared hall's part takes the place of the cell's own (the random stream is drawn the same, so nothing else in
    // the plan moves)
    const mega = this.megaOf(i, j), space = this.spaceOf(i, j), part = space?.parts.find((p) => p.i === i && p.j === j);
    plan.mega = mega;
    const hall = part ? room(0, { x0: part.x0, x1: part.x1, z0: part.z0, z1: part.z1 }, space.ceil, 'hall') : room(0, own, hallCeil, 'hall');
    plan.primaryHallId = hall.id;
    hall.spaceId = space ? space.spaceId : `v2:space:${i},${j}:hall`;
    // the cell edges where the hall runs on into the next cell's part of it (its seams: { lo, hi }, the opening along that
    // edge; the rest of the edge is wall), and its lamp grid
    const seams = space ? { px: false, nx: false, pz: false, nz: false } : null;
    if (space) {
      for (const q of space.parts) {
        if (q.j === j && Math.abs(q.i - i) === 1) seams[q.i > i ? 'px' : 'nx'] = { lo: Math.max(q.z0, hall.z0), hi: Math.min(q.z1, hall.z1) };
        if (q.i === i && Math.abs(q.j - j) === 1) seams[q.j > j ? 'pz' : 'nz'] = { lo: Math.max(q.x0, hall.x0), hi: Math.min(q.x1, hall.x1) };
      }
      Object.assign(hall, { span: space.span, seams, grid: space.lampGrid });
    }
    // corridors to the four neighbours, each from 1 m inside the hall out to the cell edge
    const mouths = [];
    if (seams) {   // a seam is open floor, not a wall to put things against
      if (seams.px) mouths.push({ x0: hall.x1 - GIANT_STRIP, x1: hall.x1, z0: hall.z0, z1: hall.z1 });
      if (seams.nx) mouths.push({ x0: hall.x0, x1: hall.x0 + GIANT_STRIP, z0: hall.z0, z1: hall.z1 });
      if (seams.pz) mouths.push({ z0: hall.z1 - GIANT_STRIP, z1: hall.z1, x0: hall.x0, x1: hall.x1 });
      if (seams.nz) mouths.push({ z0: hall.z0, z1: hall.z0 + GIANT_STRIP, x0: hall.x0, x1: hall.x1 });
    }
    const links = [];
    for (const [axis, ei, ej, side] of [['x', i, j, 1], ['x', i - 1, j, -1], ['z', i, j, 1], ['z', i, j - 1, -1]]) {
      if (seams?.[(side > 0 ? 'p' : 'n') + axis]) continue;   // the next part of the hall is there instead of a corridor
      const con = this.connectionOf(ei, ej, axis), e = con.corridor, cp = con.parts?.find((p) => p.i === i && p.j === j);
      if (cp) links.push({ con, cp, axis, side });
      const c0 = (axis === 'x' ? mz : mx) + e.t - e.w / 2, c1 = c0 + e.w;
      // the corridor's far end: the cell edge, or 1 m inside the near wall of this cell's part of a connector room
      const hallEdge = side > 0 ? (axis === 'x' ? hall.x1 : hall.z1) : (axis === 'x' ? hall.x0 : hall.z0);
      const near = cp ? (side > 0 ? (axis === 'x' ? cp.x0 : cp.z0) : (axis === 'x' ? cp.x1 : cp.z1)) : side > 0 ? (axis === 'x' ? ox : oz) + CELL2 : (axis === 'x' ? ox : oz);
      const far = cp ? near + side : near, a0 = side > 0 ? hallEdge - 1 : far, a1 = side > 0 ? far : hallEdge + 1;
      const rect = axis === 'x' ? { x0: a0, x1: a1, z0: c0, z1: c1 } : { z0: a0, z1: a1, x0: c0, x1: c1 };
      const o = room(0, rect, e.ceil, 'corridor');
      addSlope2(mulberry32(hash2(this.seed, i * 4 + mouths.length, j, 7200)), o, axis, hallEdge, near);
      // the mouth: the corridor's last metres inside the hall, kept clear of flights
      mouths.push(axis === 'x' ? { x0: side > 0 ? hall.x1 - 3 : hall.x0, x1: side > 0 ? hall.x1 : hall.x0 + 3, z0: c0, z1: c1 }
        : { z0: side > 0 ? hall.z1 - 3 : hall.z0, z1: side > 0 ? hall.z1 : hall.z0 + 3, x0: c0, x1: c1 });
    }
    // connector rooms: this cell's part of each, open across the cell edge into the other part (after the corridors, so their
    // ids stay; kept clear of columns and drawing nothing from the plan's stream, so the rest of the plan stays as it was)
    for (const { con, cp, axis, side } of links) {
      const o = room(0, { x0: cp.x0, x1: cp.x1, z0: cp.z0, z1: cp.z1 }, con.ceil, 'connector-room');
      const s = { px: false, nx: false, pz: false, nz: false };
      s[(side > 0 ? 'p' : 'n') + axis] = axis === 'x' ? { lo: cp.z0, hi: cp.z1 } : { lo: cp.x0, hi: cp.x1 };
      Object.assign(o, { spaceId: con.connectorSpaceId, span: 'connector', seams: s, grid: con.lampGrid });
    }
    // flights: up to a 2F room, down to a B1 hall
    const run = (dy) => snap2(Math.abs(dy) / FLIGHT_SLOPE / 2 + 0.25) * 2 + LANDING;
    for (const [lv, share] of [[1, 0.5], [-1, 0.4]]) {
      if (r() >= share) continue;
      if (this.addSwitchback(plan, mulberry32(hash2(this.seed, i, j, 7500 + lv)), hall, mouths, lv, ox, oz, room)) continue;   // its own stream; a fold that does not fit falls back to the straight flight
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
    // voids: an atrium (the 2F floor open over the hall) and a pit (the hall floor open over the B1 room), before the pools
    plan.voids = [];
    plan.ladders = [];
    this.addVoids(plan, r, hall, mouths);
    this.addSplit(plan, mulberry32(hash2(this.seed, i, j, 7300)), hall, mouths, room);   // its own stream: the rest of the plan is unchanged
    // now and then a sealed showcase beside the hall, seen through a window in the hall wall
    plan.windows = [];
    this.addShowcase(plan, r, hall, mouths, room);
    // pools: none, one or two in the hall; one in an upper room now and then; B1 halls are mostly flooded
    const hallBox = { x0: hall.x0 + POOL_MARGIN, x1: hall.x1 - POOL_MARGIN, z0: hall.z0 + POOL_MARGIN, z1: hall.z1 - POOL_MARGIN };
    const blockers = plan.flights.flatMap((f) => [f, f.hallEntry]).concat(plan.voids.filter((v) => v.lv === -1), plan.windows.map((wn) => wn.front));
    const k = mega ? Math.max(r(), 0.2) : r();   // a giant hall is a pool hall: never left dry
    const boxes = k < 0.2 ? [] : k < 0.6 ? [hallBox] : splitBox2(hallBox, 3);
    for (const b of boxes) this.addPool(plan, r, hall, b, blockers);
    // a giant hall is a pool hall: when the first tries found no room, keep trying, then fall back to a plain pool in the first free spot
    if (mega && !plan.pools.some((p) => p.room === hall.id)) {
      if (!this.addPool(plan, r, hall, hallBox, blockers, true, false, 60)) this.addFallbackPool(plan, r, hall, hallBox, blockers);
    }
    for (const o of plan.rooms) {
      if (o.kind === 'showcase' && r() < 0.7) this.addPool(plan, r, o, inset2(o, 1), []);
      if (o.kind === 'upper' && r() < 0.4) this.addPool(plan, r, o, inset2(o, POOL_MARGIN), plan.voids.filter((v) => v.lv === 0));
      if (o.kind === 'basement' && r() < 0.8) this.addPool(plan, r, o, inset2(o, 1.5), [], false);
    }
    // B1: a small maze of low corridors out of the room at the foot of the stair
    const base = plan.rooms.find((o) => o.kind === 'basement');
    if (base) this.addMaze(plan, r, base, room);

    // a few columns in some rooms, one form and one arrangement per room
    plan.columns = [];
    for (const o of plan.rooms) if (o.kind !== 'corridor' && o.kind !== 'b1corridor' && o.kind !== 'connector-room') this.addColumns(plan, r, o, mouths);
    // ceiling lamps on a regular grid over every room (sparser and dimmer in corridors and B1)
    for (const o of plan.rooms) {
      let step = o.kind === 'corridor' || o.kind === 'b1corridor' ? 6 : o.kind === 'connector-room' ? o.grid.step : o.lv < 0 ? 7 : snapIn2(r, 5, 7);
      let gx = o.x0, gz = o.z0, lx = o.x0, lz = o.z0, xEnd = o.x1 - 0.6, zEnd = o.z1 - 0.6;
      // a shared hall's lamps run on one grid across its seams: a lamp belongs to the part its middle is in, even when it
      // overhangs the seam's opening; along a wall (and the walled stretch of a seam) it keeps 0.6 m inside
      const open = (s, c) => s && c - 0.6 >= s.lo && c + 0.6 <= s.hi;
      const overWall = (x, z) => o.grid && ((x - 0.6 < o.x0 && !open(o.seams.nx, z)) || (x + 0.6 > o.x1 && !open(o.seams.px, z)) || (z - 0.6 < o.z0 && !open(o.seams.nz, x)) || (z + 0.6 > o.z1 && !open(o.seams.pz, x)));
      if (o.grid) {
        step = o.grid.step; gx = o.grid.ox; gz = o.grid.oz;
        if (!o.seams.nx) lx += 0.6;
        if (!o.seams.nz) lz += 0.6;
        if (o.seams.px) xEnd = o.x1;
        if (o.seams.pz) zEnd = o.z1;
      }
      const first = (g, lo) => g + step / 2 + Math.max(0, Math.ceil((lo - g - step / 2) / step)) * step;
      for (let z = first(gz, lz); z < zEnd; z += step) for (let x = first(gx, lx); x < xEnd; x += step) {
        if (overWall(x, z)) continue;
        if (plan.flights.some((f) => inRect2(f, x, z) || inRect2(f, x + 1.2, z + 1.2))) continue;
        if (plan.voids.some((v) => v.lv === o.lv && overlap2({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.6, z1: z + 0.6 }, v))) continue;   // no ceiling there
        o.lamps.push({ x: x - 0.6, z: z - 0.6, w: 1.2, d: 1.2, k: o.lv < 0 ? 2 : 0 });
      }
    }
    return plan;
  }

  // a folded flight in place of a straight one: its footprint SWITCH_W wide along a hall wall, the far room beside the way in
  addSwitchback(plan, r, hall, mouths, lv, ox, oz, room) {
    if (r() >= SWITCH_SHARE) return false;
    const Lg = snap2(Math.abs(this.Y[lv]) / 2 / FLIGHT_SLOPE), slot = flightSlot2(r, hall, Lg + LANDING, mouths.concat(plan.flights), SWITCH_W);
    if (!slot) return false;
    const dir = r() < 0.5 ? 1 : -1, f = { ...slot, turn: true, dir, Lg, up: dir, lo: Math.min(0, lv), hi: Math.max(0, lv), yE: 0, yF: this.Y[lv] };
    f.y0 = this.Y[f.lo]; f.y1 = this.Y[f.hi];
    const entry = entryArea2(f, lv > 0);
    const legB = { ...switchLegB(f), up: lv > 0 ? -dir : dir };
    const beyond = roomBeyond2(r, legB, lv > 0, ox, oz, lv > 0 ? [snapIn2(r, 12, 30), snapIn2(r, 10, 26)] : [snapIn2(r, 12, 30), snapIn2(r, 8, 22)]);
    if (!beyond || !(entry.x0 >= hall.x0 && entry.x1 <= hall.x1 && entry.z0 >= hall.z0 && entry.z1 <= hall.z1)) return false;
    const ceil = lv > 0 ? snapIn2(r, 3.5, 6) : snapIn2(r, 2.6, Math.min(3.5, -this.Y[-1] - 1.5));
    const o = room(lv, beyond, ceil, lv > 0 ? 'upper' : 'basement');
    if (lv < 0) o.dark = 1;
    f.room = o.id;
    f.hallEntry = entry;
    plan.flights.push(f);
    return true;
  }

  addPool(plan, r, room, box, blockers, deepOk = true, deepOnly = false, tries = 6) {
    if (box.x1 - box.x0 < 4 || box.z1 - box.z0 < 4) return false;
    for (let t = 0; t < tries; t++) {
      const p = makePool2(r, box, this.Y[room.lv], deepOk, deepOnly);
      const bb = rectOf2(p.shape);
      if (bb.x0 < box.x0 || bb.x1 > box.x1 || bb.z0 < box.z0 || bb.z1 > box.z1) continue;
      if (blockers.some((b) => overlap2(bb, b, 2)) || plan.pools.some((q) => overlap2(bb, rectOf2(q.shape), 3))) continue;
      p.room = room.id; p.lv = room.lv;
      plan.pools.push(p);
      return true;
    }
    return false;
  }

  // a plain wading pool of the first size that fits, scanning the box on the Q2 grid: always found in a giant hall (the clear
  // walkways and flights leave most of its 40 × 20 m floor free)
  addFallbackPool(plan, r, room, box, blockers) {
    for (const [hw, hd] of [[6, 4], [4, 3], [3, 2]]) {
      for (let cz = box.z0 + hd; cz + hd <= box.z1; cz += 1) for (let cx = box.x0 + hw; cx + hw <= box.x1; cx += 1) {
        const bb = { x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd };
        if (blockers.some((b) => overlap2(bb, b, 2)) || plan.pools.some((q) => overlap2(bb, rectOf2(q.shape), 3))) continue;
        const d = Math.floor(between2(r, 0.3, EXIT_DEPTH) * 100) / 100;
        plan.pools.push({ shape: { type: 'rect', cx, cz, hw, hd }, axis: 'x', flip: false, d0: d, d1: d, water: this.Y[room.lv] - WATER_DROP, room: room.id, lv: room.lv });
        return true;
      }
    }
    return false;
  }

  // a tree of up to 7 corridor segments on an 8 m lattice, grown from the B1 room under the stair, clear of every flight that
  // reaches B1; about a third flooded wall to wall (wadeable, their junctions dry), and at a branch's end now and then a
  // reservoir hall round a deep pool
  addMaze(plan, r, base, room) {
    const ox = plan.ox, oz = plan.oz, G = 8, lo = 8, hi = CELL2 - 8;
    const down = plan.flights.filter((f) => f.lo < 0);
    const node = (v, o) => o + lo + Math.round((v - o - lo) / G) * G;
    const start = [node((base.x0 + base.x1) / 2, ox), node((base.z0 + base.z1) / 2, oz)];
    if (start[0] <= base.x0 || start[0] >= base.x1 || start[1] <= base.z0 || start[1] >= base.z1) return;
    const seen = new Set([start.join()]), stack = [start];
    let segs = 0, leaf = null;
    const corridors = [];
    while (stack.length && segs < 7) {
      const [x, z] = stack[stack.length - 1];
      const dirs = [[G, 0], [-G, 0], [0, G], [0, -G]].filter(([dx, dz]) => {
        const nx = x + dx, nz = z + dz;
        return nx >= ox + lo && nx <= ox + hi && nz >= oz + lo && nz <= oz + hi && !seen.has(nx + ',' + nz);
      });
      if (!dirs.length) { stack.pop(); continue; }
      const [dx, dz] = dirs[(r() * dirs.length) | 0], nx = x + dx, nz = z + dz, w = r() < 0.5 ? 2 : 3, h = w / 2;   // edges on the Q2 grid, like every rectangle
      const rect = { x0: Math.min(x, nx) - h, x1: Math.max(x, nx) + h, z0: Math.min(z, nz) - h, z1: Math.max(z, nz) + h };
      seen.add(nx + ',' + nz);
      if (down.some((f) => overlap2(rect, f, 1)) || plan.rooms.some((o) => o.kind === 'shaft' && overlap2(rect, o, 1))) continue;
      corridors.push(rect);
      const o = room(-1, rect, Math.round(between2(r, 2.2, 3) * 10) / 10, 'b1corridor');
      o.dark = 1;
      if (r() < 0.35) {   // flooded between its two junctions
        const ax = dx !== 0, len = G - w - 1;
        const shape = { type: 'rect', cx: (x + nx) / 2, cz: (z + nz) / 2, hw: ax ? len / 2 : h, hd: ax ? h : len / 2 };
        const d = Math.floor(between2(r, 0.3, EXIT_DEPTH) * 100) / 100;
        if (!plan.pools.some((p) => p.lv === -1 && overlap2(rectOf2(shape), rectOf2(p.shape), 1))) plan.pools.push({ shape, water: this.Y[-1] - WATER_DROP, axis: ax ? 'x' : 'z', flip: false, d0: d, d1: d, room: o.id, lv: -1, flooded: true });
      }
      stack.push([nx, nz]);
      segs++;
      leaf = [nx, nz, dx, dz];
    }
    if (!leaf || r() >= 0.6) return;
    // the reservoir: beyond the last corridor, along its direction, inside the cell and away from the flights
    const [x, z, dx, dz] = leaf, half = snapIn2(r, 7, 11), cx = x + Math.sign(dx) * (half + 1), cz = z + Math.sign(dz) * (half + 1);
    const rect = clampRect2({ x0: cx - half, x1: cx + half, z0: cz - half, z1: cz + half }, ox, oz);
    if (rect.x1 - rect.x0 < 12 || rect.z1 - rect.z0 < 12 || down.some((f) => overlap2(rect, f, 1)) || plan.rooms.some((o) => o.kind === 'shaft' && overlap2(rect, o, 1)) || !(x > rect.x0 - 1.5 && x < rect.x1 + 1.5 && z > rect.z0 - 1.5 && z < rect.z1 + 1.5)) return;
    // it must take in the corridor's end, so widen it to the junction when it stops short
    rect.x0 = Math.min(rect.x0, x - 1.5); rect.x1 = Math.max(rect.x1, x + 1.5); rect.z0 = Math.min(rect.z0, z - 1.5); rect.z1 = Math.max(rect.z1, z + 1.5);
    // and swallow no corridor but the one it ends
    if (corridors.slice(0, -1).some((c) => overlap2(rect, c)) || (base && overlap2(rect, base))) return;
    const o = room(-1, rect, snapIn2(r, 3.5, Math.min(5, -this.Y[-1] - 1.5)), 'reservoir');
    o.dark = 1;
    this.addPool(plan, r, o, inset2(o, 1.5), plan.pools.filter((p) => p.lv === -1).map((p) => rectOf2(p.shape)), true, true);
    if (!plan.pools.some((p) => p.room === o.id)) o.kind = 'b1hall';   // no room for the water: a plain dark hall
  }

  // a void through one floor: lv is the floor under it (its ceiling is gone), lv + 1 the floor that is open over it, ringed by
  // a parapet. A pit keeps 2.5 m of hall floor all round (the hall is a way through); an atrium only 1 m of its 2F room (a
  // dead end: the flight's landing is all it must keep); both keep 1 m of floor under them, and stay clear of the
  // flights, their entries and the corridor mouths (pools come after it and keep away), so it never cuts a way through
  addVoids(plan, r, hall, mouths) {
    const keep = plan.flights.flatMap((f) => [f, f.hallEntry]).concat(mouths);
    for (const [kind, lv, over, under] of [['atrium', 0, plan.rooms.find((o) => o.kind === 'upper'), hall], ['pit', -1, hall, plan.rooms.find((o) => o.kind === 'basement')]]) {
      if (!over || !under || r() >= 0.85) continue;
      const a = inset2(over, kind === 'pit' ? 2.5 : 1), b = inset2(under, 1);
      const room = { x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), z0: Math.max(a.z0, b.z0), z1: Math.min(a.z1, b.z1) };
      if (room.x1 - room.x0 < 4 || room.z1 - room.z0 < 4) continue;
      for (let t = 0; t < 12; t++) {
        const w = snapIn2(r, 4, Math.min(16, room.x1 - room.x0)), d = snapIn2(r, 4, Math.min(16, room.z1 - room.z0));
        const x0 = snap2(between2(r, room.x0, room.x1 - w)), z0 = snap2(between2(r, room.z0, room.z1 - d));
        const v = { kind, lv, x0, x1: x0 + w, z0, z1: z0 + d, under: under.id, over: over.id };
        if (v.x0 < room.x0 || v.x1 > room.x1 || v.z0 < room.z0 || v.z1 > room.z1 || keep.some((k) => overlap2(v, k, 2))) continue;
        plan.voids.push(v);
        break;
      }
    }
  }

  // a split: a pit from wall to wall across the hall, 4–7 m wide, that cuts one corridor mouth off from the rest of the hall.
  // Under it a dark B1 shaft as wide as the pit; a ladder up each of its two open sides, in line, through a gap in the
  // parapet. The way between the two halves of the hall goes down one ladder and up the other
  addSplit(plan, r, hall, mouths, room) {
    if (plan.voids.some((v) => v.lv === -1) || r() >= 0.3) return;
    const keep = plan.flights.flatMap((f) => [f, f.hallEntry]).concat(mouths), w = snapIn2(r, 4, 7), turn = (r() * 4) | 0;
    let v = null, runX = false;
    for (let t = 0; t < 4 && !v; t++) {
      const k = (turn + t) % 4, far = k & 1 ? 1 : -1;
      runX = k < 2;   // runX: the pit runs along x (cuts the hall's z extent)
      const lo = runX ? hall.z0 : hall.x0, hi = runX ? hall.z1 : hall.x1, mid = (lo + hi) / 2;
      // clear of the middle mouths (within 7 m of the middle) and 4 m short of the far wall (its mouth and a ladder's top)
      const a = far > 0 ? mid + 7 : lo + 4, b = far > 0 ? hi - 4 - w : mid - 7 - w;
      if (b < a) continue;
      const p0 = snap2(between2(r, a, b)), p1 = p0 + w;
      const c = runX ? { x0: hall.x0, x1: hall.x1, z0: p0, z1: p1 } : { x0: p0, x1: p1, z0: hall.z0, z1: hall.z1 };
      if (keep.some((q) => overlap2(c, q, 2)) || plan.rooms.some((o) => o.lv === -1 && overlap2(c, o, 1)) || plan.flights.some((f) => f.lo < 0 && overlap2(c, f, 1))) continue;
      v = c;
    }
    if (!v) return;
    const p0 = runX ? v.z0 : v.x0, p1 = runX ? v.z1 : v.x1;
    const shaft = room(-1, v, this.Y[0] - this.Y[-1], 'shaft');
    shaft.dark = 1;
    const along = runX ? [hall.x0 + 2, hall.x1 - 2] : [hall.z0 + 2, hall.z1 - 2], s = snap2(between2(r, along[0], along[1])) + Q2 / 2;
    const n = runX ? [0, 1] : [1, 0];
    for (const [c, sg] of [[p0, 1], [p1, -1]]) {
      plan.ladders.push({ x: runX ? s : c, z: runX ? c : s, nx: n[0] * sg, nz: n[1] * sg, h0: this.Y[-1], h1: this.Y[0] });
    }
    plan.voids.push({ kind: 'split', lv: -1, ...v, run: runX ? 'x' : 'z', gap: [s - 0.5, s + 0.5], under: shaft.id, over: hall.id });
  }

  // a showcase: a sealed room behind one hall wall, WIN_WALL beyond it, with a window through that wall (sill 0.9 m, a head
  // under both ceilings). Nothing walks into it: the wall's thickness has no floor. It keeps 1 m from every other 1F room
  // and the cell edge, and the hall floor in front of the window stays clear of flights, voids and corridor mouths
  addShowcase(plan, r, hall, mouths, room) {
    if (r() >= 0.6) return;
    const { ox, oz } = plan, rooms0 = plan.rooms.filter((o) => o.lv === 0 && o !== hall);
    const keep = plan.flights.flatMap((f) => [f, f.hallEntry]).concat(mouths, plan.voids.filter((v) => v.lv === -1));
    for (let t = 0; t < 10; t++) {
      const side = ['n', 's', 'w', 'e'][(r() * 4) | 0], runX = side === 'n' || side === 's', out = side === 'e' || side === 's' ? 1 : -1;
      const L = snapIn2(r, 6, 12), D = snapIn2(r, 4, 8), lo = runX ? hall.x0 : hall.z0, hi = runX ? hall.x1 : hall.z1;
      if (hi - lo - 2 < L) continue;
      const s0 = snap2(between2(r, lo + 1, hi - 1 - L)), c = runX ? (out > 0 ? hall.z1 : hall.z0) : (out > 0 ? hall.x1 : hall.x0);
      const d0 = c + out * WIN_WALL, d1 = d0 + out * D;
      const rect = runX ? { x0: s0, x1: s0 + L, z0: Math.min(d0, d1), z1: Math.max(d0, d1) } : { z0: s0, z1: s0 + L, x0: Math.min(d0, d1), x1: Math.max(d0, d1) };
      if (rect.x0 < ox + 1 || rect.z0 < oz + 1 || rect.x1 > ox + CELL2 - 1 || rect.z1 > oz + CELL2 - 1) continue;
      if (rooms0.some((o) => overlap2(rect, o, 1))) continue;
      const ws = snapIn2(r, 2, Math.min(5, L - 2)), w0 = snap2(s0 + between2(r, 1, L - 1 - ws));
      const front = runX ? { x0: w0, x1: w0 + ws, z0: out > 0 ? c - 2 : c, z1: out > 0 ? c : c + 2 } : { z0: w0, z1: w0 + ws, x0: out > 0 ? c - 2 : c, x1: out > 0 ? c : c + 2 };
      if (keep.some((k) => overlap2(front, k, 0.5))) continue;
      const o = room(0, rect, snapIn2(r, 3, 4.5), 'showcase');
      plan.windows.push({ lv: 0, run: runX ? 'x' : 'z', c, out, s0: w0, s1: w0 + ws, sill: 0.9, head: Math.min(2.4, hall.ceil - 0.4, o.ceil - 0.4), hall: hall.id, room: o.id, front });
      return;
    }
  }

  // half the rooms get columns: a row down the middle, two rows (across the room or along its walkways), a pair or a sparse
  // square, all of one form; an arrangement that
  // would crowd a wall, a pool, a flight or a corridor mouth is dropped whole (a room has its columns all alike or none)
  addColumns(plan, r, o, mouths) {
    if (r() >= 0.5) return;
    const form = r() < 0.6 ? 'round' : 'square', rad = Math.round(between2(r, 0.3, form === 'round' ? 0.5 : 0.45) * 20) / 20;
    const longX = o.x1 - o.x0 >= o.z1 - o.z0, L = longX ? o.x1 - o.x0 : o.z1 - o.z0, W = longX ? o.z1 - o.z0 : o.x1 - o.x0;
    const mx = (o.x0 + o.x1) / 2, mz = (o.z0 + o.z1) / 2, pt = (a, c) => (longX ? [mx + a, mz + c] : [mx + c, mz + a]);
    const keep = 2 + rad;   // a column's middle from a wall
    for (let t = 0; t < 8; t++) {
      const kind = ['row', 'rows', 'pair', 'square', 'aisles', 'aisles'][(r() * 6) | 0], m = 2 + ((r() * 2) | 0);
      const along = (k, n) => (k - (n - 1) / 2) * Math.min(snap2((L - 2 * keep) / Math.max(1, n - 1)), 8);
      const across = kind === 'aisles' ? W / 2 - keep : snap2(between2(r, 0.18, 0.32) * W);
      let pts;
      if (kind === 'row') pts = Array.from({ length: m + 1 }, (_, k) => pt(along(k, m + 1), 0));
      else if (kind === 'aisles') pts = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, c]) => pt(a * (L / 2 - keep), c * across));   // the walkways' far ends, clear of the corridor mouths
      else if (kind === 'rows') pts = [-1, 1].flatMap((sd) => Array.from({ length: m }, (_, k) => pt(along(k, m), sd * across)));
      else if (kind === 'pair') pts = [-1, 1].map((sd) => pt(sd * snap2(L * between2(r, 0.15, 0.3)), 0));
      else pts = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, c]) => pt(a * snap2(L * 0.2), c * across));
      const cs = pts.map(([x, z]) => ({ room: o.id, lv: o.lv, form, r: rad, x, z }));
      const box = (c) => ({ x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r });
      const ok = cs.every((c) => c.x - keep >= o.x0 - 1e-9 && c.x + keep <= o.x1 + 1e-9 && c.z - keep >= o.z0 - 1e-9 && c.z + keep <= o.z1 + 1e-9
        && !plan.pools.some((p) => p.lv === o.lv && overlap2(box(c), rectOf2(p.shape), COL_CLEAR))
        && !plan.windows.some((wn) => overlap2(box(c), wn.front, COL_CLEAR))
        && !plan.voids.some((v) => (v.lv === o.lv || v.lv + 1 === o.lv) && overlap2(box(c), v, COL_CLEAR + PARAPET))
        && !plan.flights.some((f) => overlap2(box(c), f, COL_CLEAR) || overlap2(box(c), f.hallEntry, COL_CLEAR))
        && !(o.lv === 0 && mouths.some((mo) => overlap2(box(c), mo, COL_CLEAR)))
        && !plan.rooms.some((q) => q !== o && q.lv === o.lv && overlap2(box(c), q, COL_CLEAR))   // corridors and rooms opening into it
        && cs.every((d) => d === c || Math.hypot(d.x - c.x, d.z - c.z) >= 2 * rad + COL_CLEAR + 1e-9));
      if (ok) { plan.columns.push(...cs); return; }
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
    for (const c of p.columns) if (inColumn2(c, x, z)) seen.push(c.lv);   // solid floor to ceiling
    for (const v of p.voids) if (inVoid2(v, x, z)) seen.push(v.lv + 1);   // open, or its parapet
    for (const o of p.rooms) {
      if (!inRect2(o, x, z) || seen.includes(o.lv)) continue;
      seen.push(o.lv);
      const y = this.Y[o.lv];
      const pool = p.pools.find((q) => q.lv === o.lv && shapeContains(q.shape, x, z));
      if (!pool) { out.push({ h: y + floorRise2(o, x, z), wl: NaN }); continue; }
      const d = poolDepth(pool, x, z);
      if (d <= WADE_MAX) out.push({ h: pool.water - d, wl: pool.water });
    }
    return out;
  }

  surfaceAt(x, z, curH) {
    let best = null;
    for (const c of this.candidates(x, z)) {
      if (c.wall || Math.abs(c.h - curH) > STEP2) continue;
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
  // the ladder a body at (x, z), height h, moving along (fx, fz) gets onto: from its foot towards it, or from the floor
  // over its top edge. { ladder, up } or null (as World.ladderAt)
  ladderAt(x, z, h, fx, fz) {
    for (const l of this.planAt(x, z).ladders) {
      const along = Math.abs((x - l.x) * l.nz - (z - l.z) * l.nx), off = (x - l.x) * l.nx + (z - l.z) * l.nz, out = fx * l.nx + fz * l.nz;
      if (along > 0.45) continue;
      if (Math.abs(h - l.h0) < 0.3 && off > 0 && off < 0.75 && out < -0.5) return { ladder: l, up: true };
      if (Math.abs(h - l.h1) < 0.3 && off < 0 && off > -0.75 && out > 0.5) return { ladder: l, up: false };
    }
    return null;
  }
  zoneAtChunk() { return null; }
  safePoint() { return null; }

  // dry floor beside a cell's hall's west wall (or another wall when a flight stands there): the start is cell 0, 0's
  restPoint(i, j) {
    const h = primaryHall(this.plan(i, j)), cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2;
    for (const [x, z, yaw] of [[h.x0 + 1.25, cz, -Math.PI / 2], [h.x1 - 1.25, cz, Math.PI / 2], [cx, h.z0 + 1.25, 0], [cx, h.z1 - 1.25, Math.PI]]) {
      if (!this.blockedAt(x - BODY_R2, z - BODY_R2, 0) && !this.blockedAt(x + BODY_R2, z + BODY_R2, 0) && this.surfaceAt(x, z, 0)) return { x, z, yaw, h: 0 };
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

// the cell's own 1F hall (or its part of a shared hall), by id: not whatever room comes first
export const primaryHall = (plan) => plan.rooms.find((o) => o.id === plan.primaryHallId);

// the strip of hall floor right outside a flight's hall end (kept clear so the way in is never blocked)
function entryArea2(f, lowEnd) {
  if (f.turn) {   // a switchback is entered, and left, at the same end
    const atMax = f.dir < 0;
    if (f.axis === 'x') return { x0: atMax ? f.x1 : f.x0 - 2, x1: atMax ? f.x1 + 2 : f.x0, z0: f.z0, z1: f.z1 };
    return { z0: atMax ? f.z1 : f.z0 - 2, z1: atMax ? f.z1 + 2 : f.z0, x0: f.x0, x1: f.x1 };
  }
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
// inside: 1 room floor; flight: 1 under a flight that touches this floor; pool: 1 under a pool's bounding box; hole: no floor
// (a void opens down from here); open: no ceiling (a void opens up from here);
// ceil: ceiling height over the floor (0 outside); room: the id of the room lighting the cell
export function cellRaster(world, i, j, lv) {
  const n = CELL2 / Q2, plan = world.plan(i, j), ox = i * CELL2, oz = j * CELL2;
  const R = { n, lv, ox, oz, inside: new Uint8Array(n * n), flight: new Uint8Array(n * n), pool: new Uint8Array(n * n), hole: new Uint8Array(n * n), open: new Uint8Array(n * n), ceil: new Float32Array(n * n), room: new Int16Array(n * n).fill(-1) };
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    const x = ox + (a + 0.5) * Q2, z = oz + (b + 0.5) * Q2, k = b * n + a;
    for (const o of plan.rooms) {
      if (o.lv !== lv || !inRect2(o, x, z)) continue;
      R.inside[k] = 1;
      if (o.ceil > R.ceil[k]) { R.ceil[k] = o.ceil; R.room[k] = o.id; }
    }
    for (const f of plan.flights) if ((f.lo === lv || f.hi === lv) && inRect2(f, x, z)) R.flight[k] = 1;
    for (const p of plan.pools) if (p.lv === lv && inRect2(poolBox(p), x, z)) R.pool[k] = 1;
    for (const v of plan.voids) if (inRect2(v, x, z)) { if (v.lv + 1 === lv) R.hole[k] = 1; if (v.lv === lv) R.open[k] = 1; }
  }
  return R;
}

// a pool's bounding box widened onto the Q2 grid: its floor is drawn as one piece with the rim cut out
export function poolBox(p) {
  const b = rectOf2(p.shape);
  return { x0: Math.floor(b.x0 / Q2) * Q2 - Q2, z0: Math.floor(b.z0 / Q2) * Q2 - Q2, x1: Math.ceil(b.x1 / Q2) * Q2 + Q2, z1: Math.ceil(b.z1 / Q2) * Q2 + Q2 };
}

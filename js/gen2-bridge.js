// Physical bridge compiler (S2 slice 2 of the cross-floor redesign, ROADMAP.md). An accepted S1 border (js/gen2-zoning.js) says: close these links,
// and join room A to room B through floor 2F or B1. This turns that record into parts that a body can walk: an entry flight in A, a passage on
// the other floor, an exit flight in B. Pure: it reads a context and returns a descriptor or a refusal. Nothing is built and the game does not load it.
//
// ctx: { Y: { '-1', 0, 1 },
//        anchor(nodeId) -> [x, z],                      the S1 anchor of a 1F room node
//        rects(nodeId) -> [{ x0, x1, z0, z1 }],          the 1F floor of the room, as rectangles
//        blockers(nodeId) -> [{ x0, x1, z0, z1 }],       what stands on that floor: pools, flights and their entries, voids, columns, windows
//        upper(floor) -> [{ x0, x1, z0, z1 }] }          what already stands on floor 1 or -1 (rooms, flights, voids), to keep clear of
// A refusal is { status: 'refused', reason: 'geometry-conflict' | 'ratio-unbuildable', detail }. The length of a bridge is the walk of its
// parts (flightWalk, the passage polyline), never a number made up to fit. The ratio window is the drawn ratio plus or minus ZONING.tolerance.
import { Q2, FLIGHT_W, FLIGHT_WALL, FLIGHT_SLOPE, LANDING, COL_CLEAR } from './gen2.js';
import { flightWalk } from './gen2-routes.js';
import { ZONING } from './gen2-zoning.js';

export const BRIDGE = {
  width: 3,            // the passage, wall to wall
  clear: COL_CLEAR,    // open floor kept round a flight on 1F, and round a passage against what stands on its floor
  entryDepth: 2,       // the open floor in front of a flight's entry end
  tries: 24,           // slots kept per room
  fallbackTries: 24,   // extra slots spread over axis, direction and position; bounded pair search
  jogs: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40],   // sideways jogs tried to wind a passage longer (each adds twice its size)
};

const snap = (v) => Math.round(v / Q2) * Q2;
const man = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
const mid = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
const overlap = (a, b, m = 0) => a.x0 - m < b.x1 && b.x0 - m < a.x1 && a.z0 - m < b.z1 && b.z0 - m < a.z1;
const inside = (r, q) => r.x0 >= q.x0 && r.x1 <= q.x1 && r.z0 >= q.z0 && r.z1 <= q.z1;
const DEPTH = FLIGHT_W + 2 * FLIGHT_WALL;

// the run of a straight flight over the level distance dy, landing included (the same rule as the flights of a hall, js/gen2.js addHallFeatures)
export const flightRun = (dy) => snap(Math.abs(dy) / FLIGHT_SLOPE / 2 + 0.25) * 2 + LANDING;

// the straight flights that fit in a room, best first: closest exit to the partner's anchor. A slot is { flight, entry, exit }; the entry end stands
// in the room with open floor in front of it, and the whole footprint keeps clear of the room's blockers
export function flightSlots(room, blockers, run, toward, y0, y1, entryDepth = BRIDGE.entryDepth, clear = BRIDGE.clear, options = {}) {
  const out = [], pad = clear, stats = options.stats;
  if (stats) Object.assign(stats, { scanned: 0, blocked1F: 0, legal1F: 0, blockedUpper: 0, uniqueExits: 0 });
  for (const rect of room) for (const axis of ['x', 'z']) for (const dir of [1, -1]) {
    const along = run + entryDepth, [u0, u1, v0, v1] = axis === 'x' ? [rect.x0, rect.x1, rect.z0, rect.z1] : [rect.z0, rect.z1, rect.x0, rect.x1];
    for (let u = u0; u + along <= u1 + 1e-9; u += Q2) for (let v = v0; v + DEPTH <= v1 + 1e-9; v += Q2) {
      // dir 1: the entry area first, then the flight; dir -1: the flight, then the entry area
      const [e0, f0] = dir > 0 ? [u, u + entryDepth] : [u + run, u], fv = v + FLIGHT_WALL;
      const box = (a0, a1, b0, b1) => (axis === 'x' ? { x0: a0, x1: a1, z0: b0, z1: b1 } : { x0: b0, x1: b1, z0: a0, z1: a1 });
      const flightRect = box(f0, f0 + run, v, v + DEPTH), hallEntry = box(e0, e0 + entryDepth, fv, fv + FLIGHT_W);
      const whole = box(u, u + along, v, v + DEPTH);
      if (stats) stats.scanned++;
      if (!inside(whole, rect) || blockers.some((b) => overlap(whole, b, pad))) { if (stats) stats.blocked1F++; continue; }
      if (stats) stats.legal1F++;
      if (options.upper?.some((b) => overlap(flightRect, b))) { if (stats) stats.blockedUpper++; continue; }
      // the stair of the game (js/gen2.js flightH): y0 = Y[lo] at the low end, up +1 when that end is at the smaller coordinate. The entry end meets the hall floor
      const hallLow = y1 > y0, flight = { axis, ...flightRect, up: (dir > 0) === hallLow ? 1 : -1, lo: hallLow ? 0 : -1, hi: hallLow ? 1 : 0, y0: Math.min(y0, y1), y1: Math.max(y0, y1), hallEntry, turn: false };
      const walk = flightWalk(flight);
      // the passage leaves the exit face straight for half its width before it may turn (a turn on the face would run over the last treads)
      const ox = axis === 'x' ? Math.sign(walk.exit[0] - walk.from[0]) : 0, oz = axis === 'z' ? Math.sign(walk.exit[1] - walk.from[1]) : 0, h = BRIDGE.width / 2;
      out.push({ flight, entry: mid(hallEntry), exit: walk.exit, lead: [walk.exit[0] + ox * h, walk.exit[1] + oz * h], walk, score: man(walk.exit, toward) });
    }
  }
  out.sort((p, q) => p.score - q.score || p.flight.x0 - q.flight.x0 || p.flight.z0 - q.flight.z0 || p.flight.axis.localeCompare(q.flight.axis));
  const seen = new Set(), unique = [];
  for (const s of out) {   // one slot per exit point, so the tries are not spent on mirror images
    const key = s.exit.join(',');
    if (!seen.has(key)) { seen.add(key); unique.push(s); }
  }
  if (stats) stats.uniqueExits = seen.size;
  const kept = unique.slice(0, BRIDGE.tries);
  if (options.fallback) {
    // Round-robin four orientation groups. Quantiles cover far slots as well as the nearest cluster.
    const groups = [];
    for (const axis of ['x', 'z']) for (const up of [1, -1]) groups.push(unique.filter((s) => s.flight.axis === axis && s.flight.up === up && !kept.includes(s)));
    const rounds = BRIDGE.fallbackTries / groups.length;
    for (let k = 0; k < rounds; k++) for (const group of groups) {
      if (!group.length) continue;
      const slot = group[Math.round(k * (group.length - 1) / (rounds - 1))];
      if (!kept.includes(slot)) kept.push(slot);
    }
  }
  return kept;
}

// polylines from P to Q: an L either way, and a Z that jogs sideways first (the winding that lengthens a passage)
export function passageLines(P, Q, jogs = BRIDGE.jogs) {
  const lines = [];
  const add = (pts) => {
    const clean = pts.filter((p, k) => k === 0 || man(p, pts[k - 1]) > 1e-9);
    if (clean.length >= 2) lines.push(clean);
  };
  for (const s of jogs) for (const sign of s ? [1, -1] : [1]) {
    add([P, [P[0], P[1] + sign * s], [Q[0], P[1] + sign * s], Q]);   // along z by the jog, across in x, then along z to Q
    add([P, [P[0] + sign * s, P[1]], [P[0] + sign * s, Q[1]], Q]);   // the same with the axes swapped
  }
  add([P, [Q[0], P[1]], Q]);
  add([P, [P[0], Q[1]], Q]);
  const seen = new Set();
  return lines.filter((l) => { const k = JSON.stringify(l); return seen.has(k) ? false : seen.add(k); });
}

// does the passage run over a stair? Each straight run is a body of the passage width: it reaches half a width past an inner turn, and stops at
// the end of the line. Touching a footprint is no hit, so a run that leaves a stair's exit face straight away is clear; one that runs along the
// face or back over the stair is a hit
export function passageHitsFlight(line, flights, width = BRIDGE.width) {
  const h = width / 2, last = line.length - 2;
  return line.slice(1).some((p, k) => {
    const q = line[k], pre = k > 0 ? h : 0, post = k < last ? h : 0;
    const flip = p[0] < q[0] || p[1] < q[1], [e0, e1] = flip ? [post, pre] : [pre, post];
    const body = q[0] === p[0]
      ? { x0: q[0] - h, x1: q[0] + h, z0: Math.min(p[1], q[1]) - e0, z1: Math.max(p[1], q[1]) + e1 }
      : { x0: Math.min(p[0], q[0]) - e0, x1: Math.max(p[0], q[0]) + e1, z0: q[1] - h, z1: q[1] + h };
    const rendered = { x0: Math.floor(body.x0 / Q2) * Q2, x1: Math.ceil(body.x1 / Q2) * Q2,
      z0: Math.floor(body.z0 / Q2) * Q2, z1: Math.ceil(body.z1 / Q2) * Q2 };
    return flights.some((f) => overlap(rendered, f));
  });
}

const lineLength = (line) => line.reduce((t, p, k) => (k ? t + man(p, line[k - 1]) : 0), 0);
// the passage as rectangles, one per straight run, widened by half its width at the turns
export function passageRects(line, width = BRIDGE.width) {
  const h = width / 2;
  return line.slice(1).map((p, k) => {
    const q = line[k];
    // The renderer uses Q2 cells. Check the full rendered footprint, including quarter-metre stair exits.
    return { x0: Math.floor((Math.min(p[0], q[0]) - h) / Q2) * Q2, x1: Math.ceil((Math.max(p[0], q[0]) + h) / Q2) * Q2,
      z0: Math.floor((Math.min(p[1], q[1]) - h) / Q2) * Q2, z1: Math.ceil((Math.max(p[1], q[1]) + h) / Q2) * Q2 };
  });
}

// the walk from a room's anchor to the end of a flight: to its entry, to the entry end, and up the flight
const reach = (anchor, slot) => man(anchor, slot.entry) + man(slot.entry, slot.walk.from) + slot.walk.length;

// compile one accepted border. Returns { status: 'accepted', ... } or { status: 'refused', reason, detail }
export function compileBridge(record, ctx, diagnostic = null) {
  const { floor, pair } = record, drawn = record.ratio, l1f = record.verification.l1f, tol = ZONING.tolerance;
  const refuse = (reason, detail) => ({ status: 'refused', borderId: record.id, reason, detail });
  if (floor !== 1 && floor !== -1) return refuse('geometry-conflict', `floor ${floor}`);
  const A = ctx.anchor(pair.a), B = ctx.anchor(pair.b), y0 = ctx.Y[0], y1 = ctx.Y[floor], run = flightRun(y1 - y0);
  const lo = l1f / (drawn + tol), hi = l1f / (drawn - tol), target = record.lengthBudget;
  if (diagnostic) Object.assign(diagnostic, { a: {}, b: {}, pairs: 0, stairsBlocked: 0, passageBlocked: 0, passageHitsStair: 0, clearLines: 0, minLength: null, maxLength: null, closestLength: null, window: [lo, hi], target });
  const upper = ctx.upper(floor);
  const slotsA = flightSlots(ctx.rects(pair.a), ctx.blockers(pair.a), run, B, y0, y1, BRIDGE.entryDepth, BRIDGE.clear, { stats: diagnostic?.a, upper, fallback: true });
  const slotsB = flightSlots(ctx.rects(pair.b), ctx.blockers(pair.b), run, A, y0, y1, BRIDGE.entryDepth, BRIDGE.clear, { stats: diagnostic?.b, upper, fallback: true });
  if (!slotsA.length || !slotsB.length) return refuse('geometry-conflict', `no flight fits in room ${slotsA.length ? pair.b : pair.a}`);
  let best = null, anyClear = false;
  for (const sa of slotsA) for (const sb of slotsB) {
    if (diagnostic) diagnostic.pairs++;
    const feet = [sa.flight, sb.flight];
    if (overlap(feet[0], feet[1]) || feet.some((f) => upper.some((u) => overlap(f, u)))) { if (diagnostic) diagnostic.stairsBlocked++; continue; }   // a stair is a body on the upper floor too
    const base = reach(A, sa) + reach(B, sb);
    for (const bend of passageLines(sa.lead, sb.lead)) {
      const line = [sa.exit, ...bend, sb.exit];
      const rects = passageRects(line);
      if (rects.some((r) => upper.some((u) => overlap(r, u, BRIDGE.clear)))) { if (diagnostic) diagnostic.passageBlocked++; continue; }
      if (passageHitsFlight(line, feet)) { if (diagnostic) diagnostic.passageHitsStair++; continue; }
      anyClear = true;
      const physical = base + lineLength(line);
      if (diagnostic) {
        diagnostic.clearLines++;
        diagnostic.minLength = diagnostic.minLength === null ? physical : Math.min(diagnostic.minLength, physical);
        diagnostic.maxLength = diagnostic.maxLength === null ? physical : Math.max(diagnostic.maxLength, physical);
        if (diagnostic.closestLength === null || Math.abs(physical - target) < Math.abs(diagnostic.closestLength - target)) diagnostic.closestLength = physical;
      }
      if (physical < lo - 1e-9 || physical > hi + 1e-9) continue;
      const off = Math.abs(physical - target);
      if (!best || off < best.off - 1e-9) best = { off, physical, sa, sb, line, rects };
    }
    if (best && best.off <= 0.5) break;
  }
  if (!best) return refuse(anyClear ? 'ratio-unbuildable' : 'geometry-conflict', anyClear ? `no clear passage has a walk in ${lo.toFixed(1)} to ${hi.toFixed(1)} m (target ${target.toFixed(1)})` : 'every passage meets what stands on its floor');
  const { sa, sb, line, rects, physical } = best;
  return {
    status: 'accepted', borderId: record.id, floor,
    closedConnectionIds: record.closedPorts.map((c) => c.connection), removedConnectorIds: [...record.closedNodes],
    parts: [
      { kind: 'entry-flight', room: pair.a, flight: sa.flight, entry: sa.entry, exit: sa.exit },
      { kind: 'upper-passage', floor, line, width: BRIDGE.width, rects },
      { kind: 'exit-flight', room: pair.b, flight: sb.flight, entry: sb.entry, exit: sb.exit },
    ],
    endpoints: { A: { roomId: pair.a, x: sa.entry[0], z: sa.entry[1], elevation: y0 }, B: { roomId: pair.b, x: sb.entry[0], z: sb.entry[1], elevation: y0 } },
    length: { target, physical, window: [lo, hi], ratio: l1f / physical },
  };
}

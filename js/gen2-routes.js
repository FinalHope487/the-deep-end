// Route metrics of v2 layouts (S0 of the cross-floor redesign, ROADMAP.md): how far the way between two 1F rooms is when it may use
// only 1F, and when it may also use 2F and B1. Pure data over a 3D room graph; the World2 adapter at the end builds that graph from the
// 1F room graph (js/gen2-measure.js) and the flights of the cell plans. Not loaded by the game (tools/gen2-measure.mjs --routes).
//
// graph: { nodes: Map(id -> { anchor: [x, z], floor: -1 | 0 | 1 }), edges: [{ id, a, b, length }] }, lengths in metres along the walk.
// Graph level only: a node stands at its anchor and an edge is a straight hop, so a cone test looks at anchors, not at passage lines.
// The final proof of a route is a walk with the real body (tests/unit/gen2-detour-walk.test.mjs).
import { LANDING, FLIGHT_W, FLIGHT_WALL, FLIGHT_MID, switchMid } from './gen2.js';
import { roomGraphRecords, roomGraphFromRecords } from './gen2-measure.js';

export const ROUTE = {
  minStraight: 64,    // m between the anchors of a pair: nearer pairs are one passage apart, not a route
  maxStraight: 160,
  coneHalfDeg: 25,    // half the angle of the forward fan round the straight line A to B
};

const bad = (msg) => new TypeError(msg);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const EPS = 1e-6;

function checkGraph(graph) {
  if (!graph || !(graph.nodes instanceof Map) || !Array.isArray(graph.edges)) throw bad('graph.nodes must be a Map and graph.edges an array');
  for (const [id, n] of graph.nodes) {
    if (!n || !Array.isArray(n.anchor) || n.anchor.length !== 2 || !n.anchor.every(Number.isFinite)) throw bad(`node ${id}: anchor`);
    if (![-1, 0, 1].includes(n.floor)) throw bad(`node ${id}: floor must be -1, 0 or 1`);
  }
  const ids = new Set();
  for (const e of graph.edges) {
    if (!e || typeof e.id !== 'string' || ids.has(e.id)) throw bad(`edge ${e?.id}: needs a unique id`);
    ids.add(e.id);
    if (!graph.nodes.has(e.a) || !graph.nodes.has(e.b) || e.a === e.b) throw bad(`edge ${e.id}: endpoints`);
    if (!(Number.isFinite(e.length) && e.length >= 0)) throw bad(`edge ${e.id}: length`);
  }
}

// the shortest walk from `from` to every node it reaches. floors: the floors a walk may stand on (null: any); allowed: a set of
// node ids a walk may pass (null: all). Ties break by node id, so the answer does not depend on the edge order
export function graphDistances(graph, from, { floors = null, allowed = null } = {}) {
  const ok = (id) => (!floors || floors.has(graph.nodes.get(id).floor)) && (!allowed || allowed.has(id));
  const adj = new Map();
  for (const e of graph.edges) {
    if (!ok(e.a) || !ok(e.b)) continue;
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push([e.b, e.length]);
    adj.get(e.b).push([e.a, e.length]);
  }
  const dist = new Map();
  if (!graph.nodes.has(from) || !ok(from)) return dist;
  dist.set(from, 0);
  const done = new Set();
  for (;;) {
    let best = null;
    for (const [id, d] of dist) if (!done.has(id) && (best === null || d < dist.get(best) || (d === dist.get(best) && cmp(id, best) < 0))) best = id;
    if (best === null) break;
    done.add(best);
    for (const [id, len] of adj.get(best) ?? []) {
      const d = dist.get(best) + len;
      if (!dist.has(id) || d < dist.get(id)) dist.set(id, d);
    }
  }
  return dist;
}

// the nodes inside the forward fan from `a` towards `b`: between the two along the line, and no further off it than tan(half angle)
// times the way along. a and b themselves are always in
export function coneNodes(graph, a, b, halfDeg = ROUTE.coneHalfDeg) {
  const A = graph.nodes.get(a).anchor, B = graph.nodes.get(b).anchor, tan = Math.tan((halfDeg * Math.PI) / 180);
  const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), out = new Set([a, b]);
  if (L === 0) return out;
  for (const [id, n] of graph.nodes) {
    const px = n.anchor[0] - A[0], pz = n.anchor[1] - A[1], t = (px * dx + pz * dz) / L, off = Math.abs(px * dz - pz * dx) / L;
    if (t >= 0 && t <= L && off <= t * tan + EPS) out.add(id);
  }
  return out;
}

// the shortest walk from a to b, or from b to a, that stays inside the forward fan (Infinity when there is none)
const fanWalk = (graph, a, b, floors, halfDeg) => Math.min(
  graphDistances(graph, a, { floors, allowed: coneNodes(graph, a, b, halfDeg) }).get(b) ?? Infinity,
  graphDistances(graph, b, { floors, allowed: coneNodes(graph, b, a, halfDeg) }).get(a) ?? Infinity,
);

// every pair of 1F nodes whose anchors stand minStraight to maxStraight apart, once (a before b by id). A pair record:
//   straight   the distance between the anchors
//   l1f, lAll  the shortest walk on 1F only and on any floor (Infinity when there is none)
//   ratio      l1f / lAll: 1 when the other floors save nothing, above 1 when a flight is a shortcut
//   detour     l1f / straight: how much longer than the straight line the 1F way is
//   cone1F, coneAll   a walk from a to b, or from b to a, inside the forward fan, on 1F only and on any floor
//   shortcut   the fan has no 1F way, and a walk inside the fan on some floor is shorter than the way round on 1F
//   forced     1F has no way at all and another floor has one (the halves of a split hall)
export function routePairs(graph, { minStraight = ROUTE.minStraight, maxStraight = ROUTE.maxStraight, coneHalfDeg = ROUTE.coneHalfDeg } = {}) {
  checkGraph(graph);
  const ground = new Set([0]), ids = [...graph.nodes].filter(([, n]) => n.floor === 0).map(([id]) => id).sort(cmp), pairs = [];
  const from1F = new Map(), fromAll = new Map();
  const dist = (cache, id, floors) => { if (!cache.has(id)) cache.set(id, graphDistances(graph, id, { floors })); return cache.get(id); };
  for (let k = 0; k < ids.length; k++) for (let m = k + 1; m < ids.length; m++) {
    const a = ids[k], b = ids[m], A = graph.nodes.get(a).anchor, B = graph.nodes.get(b).anchor, straight = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (straight < minStraight || straight > maxStraight) continue;
    const l1f = dist(from1F, a, ground).get(b) ?? Infinity, lAll = dist(fromAll, a, null).get(b) ?? Infinity;
    const lFan = fanWalk(graph, a, b, null, coneHalfDeg), cone1F = Number.isFinite(fanWalk(graph, a, b, ground, coneHalfDeg));
    pairs.push({
      a, b, straight, l1f, lAll,
      ratio: Number.isFinite(l1f) && lAll > 0 ? l1f / lAll : null,
      detour: Number.isFinite(l1f) ? l1f / straight : null,
      cone1F, coneAll: Number.isFinite(lFan),
      shortcut: !cone1F && Number.isFinite(l1f) && lFan < l1f,
      forced: !Number.isFinite(l1f) && Number.isFinite(lAll),
    });
  }
  return pairs;
}

const quant = (xs) => {
  const s = [...xs].sort((p, q) => p - q), at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return s.length ? { n: s.length, min: s[0], p25: at(0.25), median: at(0.5), p75: at(0.75), p90: at(0.9), max: s[s.length - 1] } : { n: 0 };
};

// the summary of pair records. Every field is a count, a share of a count or a sorted quantile, so it does not depend on the order
// the pairs came in. An empty list gives zeros and { n: 0 } quantiles, never NaN
export function summarizePairs(pairs) {
  const n = pairs.length, count = (f) => pairs.filter(f).length, share = (c) => (n ? c / n : 0);
  const joined = pairs.filter((p) => Number.isFinite(p.l1f));
  return {
    pairs: n,
    joined1F: joined.length,
    cutOff1F: n - joined.length,
    forced1F: count((p) => p.forced),
    shortcut: count((p) => p.shortcut),
    shortcutShare: share(count((p) => p.shortcut)),
    otherFloorShorter: count((p) => Number.isFinite(p.l1f) && p.lAll < p.l1f),
    coneBlocked1F: count((p) => !p.cone1F),
    coneBlocked1FShare: share(count((p) => !p.cone1F)),
    coneBlockedAll: count((p) => !p.coneAll),
    ratio: quant(joined.map((p) => p.ratio)),
    detour: quant(joined.map((p) => p.detour)),
    straight: quant(pairs.map((p) => p.straight)),
  };
}

// ---- the World2 adapter ----
const man = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
const mid = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];

// the walk along one flight, from the end face the hall entry touches to the far end face (centres, [x, z]): `from`, `exit`, and the
// `length` between them. A straight flight is two ramps and the landing; a switchback is a leg up, the landing crossed, and the other
// leg back to the entry end, where it leaves beside the way in
export function flightWalk(f) {
  const ax = f.axis === 'x', a0 = ax ? f.x0 : f.z0, a1 = ax ? f.x1 : f.z1, dy = Math.abs(f.y1 - f.y0);
  const at = (along, across) => (ax ? [along, across] : [across, along]);
  if (f.turn) {
    const c0 = ax ? f.z0 : f.x0, end = f.dir < 0 ? a1 : a0;
    return {
      length: 2 * Math.hypot(f.Lg, dy / 2) + FLIGHT_W + FLIGHT_MID,
      from: at(end, c0 + FLIGHT_WALL + FLIGHT_W / 2),
      exit: at(end, switchMid(f) + FLIGHT_MID / 2 + FLIGHT_W / 2),
    };
  }
  const across = mid(f)[ax ? 1 : 0], entry = mid(f.hallEntry)[ax ? 0 : 1], near = Math.abs(entry - a0) <= Math.abs(entry - a1) ? a0 : a1;
  return { length: Math.hypot(a1 - a0 - LANDING, dy) + LANDING, from: at(near, across), exit: at(near === a0 ? a1 : a0, across) };
}

// A split (js/gen2.js addSplit) is a pit from wall to wall across a hall fragment: the fragment is two 1F sides, and the only way between
// them is down one ladder into the B1 shaft and up the other. A hall shared by several cells (giant, L) can hold one split per cell, so a
// hall point belongs to a region named by its side of every split of the hall, in order: `<hall>#split:<bits>`. A split whose pit ends
// at a cell edge would leave the neighbour fragment's floor open round it: no generated plan has one, and such a split is not cut here.
// A split is { side(pt) -> 0 | 1, shaft, width, climb, ladders: [[x, z], [x, z]] }; the ladders stand at the low and the high edge
export const splitRegion = (splits, pt) => splits.map((s) => s.side(pt)).join('');

function splitsOf(w, cells, nodes) {
  const found = new Map();
  for (const [i, j] of cells) {
    const plan = w.plan(i, j);
    for (const v of plan.voids) {
      if (v.kind !== 'split') continue;
      const room = plan.rooms.find((o) => o.id === v.over), sid = room.spaceId, cut = v.run === 'x' ? 1 : 0, lo = cut ? v.z0 : v.x0, hi = cut ? v.z1 : v.x1;
      const ends = v.run === 'x' ? [room.x0, room.x1] : [room.z0, room.z1], edge = v.run === 'x' ? plan.ox : plan.oz;
      if (!nodes.has(sid) || ends[0] <= edge || ends[1] >= edge + 64) continue;
      if (!found.has(sid)) found.set(sid, []);
      found.get(sid).push({ side: (pt) => (pt[cut] < (lo + hi) / 2 ? 0 : 1), shaft: mid(v), width: hi - lo, climb: Math.abs(plan.ladders[0].h1 - plan.ladders[0].h0), ladders: plan.ladders.map((l) => [l.x, l.z]) });
    }
  }
  return found;
}

// 1F nodes and edges come from the room graph, with every split hall cut into regions. A region stands at the hall anchor when that lies in
// it, else at the mean of the points that open into it (corridor ends, flight entries, ladder feet). Each flight of a sampled cell adds the
// room it opens into (2F or B1) and one edge from the region it leaves; its walk is the leg to the flight, the flight (flightWalk) and the
// leg to the room anchor. The rooms the flights open into stay inside their own cell (roomBeyond2 clamps them), so no flight joins two
// cells: crossCell counts any that does
export function routeGraph3D(w, cells) {
  const records = roomGraphRecords(w, cells), base = roomGraphFromRecords(records, cells), nodes = new Map(), edges = [];
  const sampled = new Set(cells.map(([i, j]) => i + ',' + j)), order = [...cells].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  for (const [id, n] of base.nodes) nodes.set(id, { anchor: n.anchor, floor: 0 });
  const splits = splitsOf(w, order, nodes), links = new Map(records.links.map((l) => [l.id, l]));
  const region = (sid, pt) => (splits.has(sid) ? `${sid}#split:${splitRegion(splits.get(sid), pt)}` : sid);
  const shaftId = (sid, n) => `${sid}#split:shaft${n}`;

  // the flights first: which hall point each leaves from, so the regions know their points
  const flights = [];
  for (const [i, j] of order) {
    const plan = w.plan(i, j), hall = w.hallOf(i, j).spaceId;
    if (!sampled.has(i + ',' + j) || !base.nodes.has(hall)) continue;
    for (const f of plan.flights) {
      const o = plan.rooms.find((r) => r.id === f.room);
      if (o && o.lv !== 0) flights.push({ i, j, plan, hall, f, o, entry: mid(f.hallEntry) });
    }
  }
  const points = new Map();   // region id -> the hall points that open into it
  const note = (sid, pt) => { if (splits.has(sid)) { const id = region(sid, pt); points.set(id, [...(points.get(id) ?? []), pt]); } };
  for (const e of base.edges) { const l = links.get(e.id); note(l.a, l.line[0]); note(l.b, l.line[l.line.length - 1]); }
  for (const x of flights) note(x.hall, x.entry);
  for (const [sid, list] of splits) for (const s of list) for (const pt of s.ladders) note(sid, pt);
  const anchorOf = new Map();
  for (const [sid, list] of splits) {
    const hall = nodes.get(sid).anchor;
    nodes.delete(sid);
    for (const [id, pts] of points) {
      if (!id.startsWith(sid + '#split:')) continue;
      const here = region(sid, hall) === id, n = pts.length;
      const anchor = here ? hall : [pts.reduce((t, p) => t + p[0], 0) / n, pts.reduce((t, p) => t + p[1], 0) / n];
      anchorOf.set(id, anchor);
      nodes.set(id, { anchor, floor: 0 });
    }
    // down the ladder at the low edge of pit n, across the pit's width on the shaft floor, up the one at the high edge
    list.forEach((s, n) => {
      nodes.set(shaftId(sid, n), { anchor: s.shaft, floor: -1 });
      for (const k of [0, 1]) {
        const at = region(sid, s.ladders[k]);
        edges.push({ id: `${sid}#split:ladder${n}.${k}`, a: at, b: shaftId(sid, n), length: man(anchorOf.get(at), s.ladders[k]) + s.climb + (k ? s.width : 0) });
      }
    });
  }
  const moved = (sid, pt) => (splits.has(sid) ? man(anchorOf.get(region(sid, pt)), pt) - man(base.nodes.get(sid).anchor, pt) : 0);
  for (const e of base.edges) {
    const l = links.get(e.id), end = l.line[l.line.length - 1];
    if (!splits.has(l.a) && !splits.has(l.b)) { edges.push({ id: e.id, a: e.a, b: e.b, length: e.length }); continue; }
    edges.push({ id: e.id, a: region(l.a, l.line[0]), b: region(l.b, end), length: e.length + moved(l.a, l.line[0]) + moved(l.b, end) });
  }
  let vertical = 0, crossCell = 0;
  for (const { i, j, plan, hall, f, o, entry } of flights) {
    const id = `${hall}:flight:${i},${j}:${o.id}`, centre = mid(o), from = region(hall, entry), walk = flightWalk(f);
    if (o.x0 < plan.ox || o.x1 > plan.ox + 64 || o.z0 < plan.oz || o.z1 > plan.oz + 64) crossCell++;
    nodes.set(id, { anchor: centre, floor: o.lv });
    edges.push({ id: id + ':up', a: from, b: id, length: man(nodes.get(from).anchor, entry) + man(entry, walk.from) + walk.length + man(walk.exit, centre) });
    vertical++;
  }
  return { nodes, edges, vertical, crossCell, splits: [...splits.values()].reduce((t, l) => t + l.length, 0) };
}

// the pair summary of one world over a sample, and the per-seed pairs
export function measureRoutes(w, cells, opts) {
  const graph = routeGraph3D(w, cells), pairs = routePairs(graph, opts);
  return { pairs, vertical: graph.vertical, crossCell: graph.crossCell, splits: graph.splits };
}

// the pair summary of a corpus { seeds, cells }: one World2 per seed, the pairs of all seeds together
export function measureRouteCorpus({ seeds, cells }, makeWorld, opts) {
  const all = [];
  let vertical = 0, crossCell = 0, splits = 0;
  for (const seed of [...seeds].sort((p, q) => p - q)) {
    const m = measureRoutes(makeWorld(seed), cells, opts);
    all.push(...m.pairs);
    vertical += m.vertical;
    crossCell += m.crossCell;
    splits += m.splits;
  }
  return { ...summarizePairs(all), flights: vertical, flightsAcrossCells: crossCell, splits };
}

const pct = (v) => (v * 100).toFixed(1) + '%';
const q = (s) => (s.n ? `n ${s.n} · min ${s.min.toFixed(2)} · p25 ${s.p25.toFixed(2)} · median ${s.median.toFixed(2)} · p75 ${s.p75.toFixed(2)} · p90 ${s.p90.toFixed(2)} · max ${s.max.toFixed(2)}` : 'n 0');

export function formatRoutes(r) {
  return [
    `route pairs (anchors ${ROUTE.minStraight}–${ROUTE.maxStraight} m apart, fan ±${ROUTE.coneHalfDeg}°): ${r.pairs} · joined on 1F ${r.joined1F} · cut off on 1F ${r.cutOff1F} (reached through another floor: ${r.forced1F})`,
    `  flights as graph edges ${r.flights} · flights that leave their cell ${r.flightsAcrossCells} · splits ${r.splits}`,
    `  other floor shorter: ${r.otherFloorShorter} · shortcut pairs (fan blocked on 1F, other floor shorter): ${r.shortcut} (${pct(r.shortcutShare)})`,
    `  fan blocked on 1F only: ${r.coneBlocked1F} (${pct(r.coneBlocked1FShare)}) · fan blocked on any floor: ${r.coneBlockedAll}`,
    `  ratio 1F way / any-floor way: ${q(r.ratio)}`,
    `  detour 1F way / straight line: ${q(r.detour)}`,
  ].join('\n');
}

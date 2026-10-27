// Cross-floor topology plan (S1 of the cross-floor redesign, ROADMAP.md). On some district borders the 1F link between two far rooms A and B is
// closed and a bridge through 2F or B1 takes its place: the straight line and the fan round it have no 1F way, the other floor has one, and
// 1F still joins A and B by a longer way round. Pure data over the route graph of js/gen2-routes.js. Nothing here is built: the plan is a
// blueprint that stage S2 turns into floors, stairs and doors. Not loaded by the game (tools/gen2-zoning.mjs).
//
// inputs: { seed, Y: { '-1', 0, 1 }, graph, borders: [{ id, axis, a, b, line, span, edgeIds }] }
//   Y the floor heights; graph a route graph; a border the plane `line` (an x for axis 'x', a z for 'z') over `span` along the other axis,
//   with the ids of the graph edges that cross it.
// plan: { version, seed, borders: [accepted border], rejected: [{ id, reason, reasons }], stats }; an accepted border is
//   { id, axis, a, b, ratio, floor, pair: { a, b }, closedPorts: [{ connection, edgeIds }], closedNodes, addedNodes, addedEdges, stair, lengthMin, lengthBudget,
//     slack, verification: { l1f, lAll, ratio, cone1F, coneAll } }
import { hash2 } from './rng.js';
import { FLIGHT_SLOPE } from './gen2.js';
import { ROUTE, graphDistances, fanWalk, routeGraph3D, routePairs, summarizePairs } from './gen2-routes.js';

export const ZONING = {
  borderShare: 0.2,             // share of borders that draw a bridge
  coneHalfDeg: ROUTE.coneHalfDeg,
  ratioMin: 2, ratioMode: 3, ratioMax: 4,   // the 1F way over the any-floor way: triangular, symmetric about the mode
  tolerance: 0.15,              // the ratio of a built pair may differ from its draw by this much (conflicts with other borders move it)
  slackMax: 40,                 // the bridge may wind this far beyond its shortest length (a winding corridor adds a jog twice per bend)
  tries: 64,                    // pairs of one border tried, past the cheap checks
};

const SALT = { draw: 9101, ratio: 9102, floor: 9103, pair: 9104 };
const bad = (msg) => new TypeError(msg);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const ground = new Set([0]);
const man = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);

// ---- the draws: each a function of seed and border only, so no order of planning moves them ----
export function borderId(axis, a, b) {
  if (axis !== 'x' && axis !== 'z') throw bad('a border axis is x or z');
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) throw bad('a border is named by two integers');
  return `db:${axis}:${a},${b}`;
}

// db:x:a,b is the border between districts (a, b) and (a + 1, b); db:z:a,b the one between (a, b) and (a, b + 1)
export function parseBorderId(id) {
  const m = /^db:([xz]):(-?\d+),(-?\d+)$/.exec(String(id));
  if (!m) throw bad(`not a border id: ${id}`);
  return { axis: m[1], a: Number(m[2]), b: Number(m[3]) };
}

const unit = (seed, id, salt) => {
  const { axis, a, b } = parseBorderId(id);
  return hash2(seed >>> 0, a, b, salt + (axis === 'z' ? 500 : 0)) / 4294967296;
};
export const borderDrawn = (seed, id) => unit(seed, id, SALT.draw) < ZONING.borderShare;
export const drawFloor = (seed, id) => (unit(seed, id, SALT.floor) < 0.5 ? 1 : -1);

// the inverse of the triangular distribution on [2, 4] with its mode at 3: F(r) = (r - 2)² / 2 up to the mode
export function sampleRatio(seed, id) {
  const u = unit(seed, id, SALT.ratio), { ratioMin: lo, ratioMode: m, ratioMax: hi } = ZONING, c = (m - lo) / (hi - lo);
  return u < c ? lo + Math.sqrt(u * (hi - lo) * (m - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - m));
}

// the extra walk of a straight flight over the level distance dy: its run is dy / FLIGHT_SLOPE, its length the slope of that
export function stairExcess(dy) {
  const run = dy / FLIGHT_SLOPE;
  return Math.hypot(run, dy) - run;
}

// ---- graph helpers ----
// the shortest walk from `from` to `to`: { length, nodes, edges } (the edge ids in order), or null. Ties break by node id, then by edge id
export function shortestPath(graph, from, to, { floors = null, allowed = null } = {}) {
  const ok = (id) => (!floors || floors.has(graph.nodes.get(id).floor)) && (!allowed || allowed.has(id));
  if (!graph.nodes.has(from) || !graph.nodes.has(to) || !ok(from) || !ok(to)) return null;
  const adj = new Map();
  for (const e of graph.edges) {
    if (!ok(e.a) || !ok(e.b)) continue;
    for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push([y, e]); }
  }
  const dist = new Map([[from, 0]]), via = new Map(), done = new Set();
  for (;;) {
    let best = null;
    for (const [id, d] of dist) if (!done.has(id) && (best === null || d < dist.get(best) || (d === dist.get(best) && cmp(id, best) < 0))) best = id;
    if (best === null || best === to) break;
    done.add(best);
    for (const [id, e] of adj.get(best) ?? []) {
      const d = dist.get(best) + e.length;
      if (!dist.has(id) || d < dist.get(id) || (d === dist.get(id) && !done.has(id) && cmp(e.id, via.get(id).edge) < 0)) { dist.set(id, d); via.set(id, { from: best, edge: e.id }); }
    }
  }
  if (!dist.has(to)) return null;
  const nodes = [to], edges = [];
  for (let at = to; at !== from; at = via.get(at).from) { edges.unshift(via.get(at).edge); nodes.unshift(via.get(at).from); }
  return { length: dist.get(to), nodes, edges };
}

// the 1F pieces: node id -> the smallest id of its piece, over the edges between 1F nodes
function groundPieces(graph) {
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const [id, n] of graph.nodes) if (n.floor === 0) parent.set(id, id);
  for (const e of graph.edges) {
    if (!parent.has(e.a) || !parent.has(e.b)) continue;
    const [ra, rb] = [find(e.a), find(e.b)];
    if (ra !== rb) parent.set(cmp(ra, rb) < 0 ? rb : ra, cmp(ra, rb) < 0 ? ra : rb);
  }
  return new Map([...parent.keys()].map((id) => [id, find(id)]));
}
// the 1F pieces as one string, the same for the same partition: skipped nodes are left out
function partition(graph, skip = new Set()) {
  const by = new Map();
  for (const [id, root] of groundPieces(graph)) if (!skip.has(id)) by.set(root, [...(by.get(root) ?? []), id]);
  return [...by.values()].map((m) => m.sort(cmp).join(',')).sort(cmp).join('|');
}

// A connector room (a hall-to-hall link's middle room, id `...:connector`) goes with its link: when every edge of it is closed it is closed too
const isConnector = (id) => id.endsWith(':connector');
function orphans(graph, ids) {
  const open = new Map(), shut = new Map();
  for (const e of graph.edges) for (const n of [e.a, e.b]) { open.set(n, (open.get(n) ?? 0) + 1); if (ids.has(e.id)) shut.set(n, (shut.get(n) ?? 0) + 1); }
  return [...shut].filter(([n, k]) => isConnector(n) && graph.nodes.get(n).floor === 0 && open.get(n) === k).map(([n]) => n).sort(cmp);
}
function without(graph, ids, nodeIds) {
  const nodes = new Map(graph.nodes);
  for (const n of nodeIds) nodes.delete(n);
  return { nodes, edges: graph.edges.filter((e) => !ids.has(e.id)) };
}

// the graph with the plan's links closed and its bridges added; a new graph, the old one stays. A closed link that is not there, or a node
// or edge id that is already taken, means the plan is for another graph
export function applyZoningPlan(graph, plan) {
  const nodes = new Map(graph.nodes), have = new Set(graph.edges.map((e) => e.id)), closed = new Set(), edges = [];
  for (const b of plan.borders) for (const port of b.closedPorts) for (const id of port.edgeIds) {
    if (!have.has(id) || closed.has(id)) throw bad(`border ${b.id}: the link ${id} is not in the graph`);
    closed.add(id);
  }
  for (const e of graph.edges) if (!closed.has(e.id)) edges.push(e);
  for (const b of plan.borders) for (const id of b.closedNodes ?? []) {
    if (!nodes.has(id) || edges.some((e) => e.a === id || e.b === id)) throw bad(`border ${b.id}: node ${id} is not closed with its links`);
    nodes.delete(id);
  }
  for (const b of plan.borders) {
    for (const n of b.addedNodes) {
      if (nodes.has(n.id)) throw bad(`border ${b.id}: node ${n.id} is already in the graph`);
      nodes.set(n.id, { anchor: [...n.anchor], floor: n.floor });
    }
    for (const e of b.addedEdges) {
      if (have.has(e.id)) throw bad(`border ${b.id}: edge ${e.id} is already in the graph`);
      have.add(e.id);
      edges.push({ id: e.id, a: e.a, b: e.b, length: e.length });
    }
  }
  return { nodes, edges };
}

// ---- one border ----
const connectionOf = (edgeId) => edgeId.replace(/:[ab]$/, '');
const closedPortsOf = (ids) => {
  const by = new Map();
  for (const id of [...ids].sort(cmp)) { const c = connectionOf(id); by.set(c, [...(by.get(c) ?? []), id]); }
  return [...by].map(([connection, edgeIds]) => ({ connection, edgeIds }));
};

const strHash = (s) => { let h = 0x811c9dc5; for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 0x01000193); return h >>> 0; };

// the 1F pairs A (before the border) and B (after it) that stand minStraight to maxStraight apart with the line A to B crossing the border
// inside its span, in an order drawn from seed and ids alone
function pairsAcross(inputs, graph, border) {
  const along = border.axis === 'x' ? 0 : 1, other = 1 - along, lo = [], hi = [], out = [];
  for (const [id, n] of [...graph.nodes].sort((p, q) => cmp(p[0], q[0]))) if (n.floor === 0 && !isConnector(id)) (n.anchor[along] < border.line ? lo : hi).push([id, n.anchor]);
  for (const [a, A] of lo) for (const [b, B] of hi) {
    const straight = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (straight < ROUTE.minStraight || straight > ROUTE.maxStraight) continue;
    const cross = A[other] + ((border.line - A[along]) / (B[along] - A[along])) * (B[other] - A[other]);
    if (cross > border.span[0] && cross < border.span[1]) out.push({ a, b, A, B, rank: hash2(inputs.seed >>> 0, strHash(a), strHash(b), SALT.pair) });
  }
  return out.sort((p, q) => p.rank - q.rank || cmp(p.a, q.a) || cmp(p.b, q.b));
}

// how a border's pair stands on a graph: the two ways, the fans, and whether the shortest any-floor walk crosses the given edges
function standing(graph, a, b, bridgeEdges) {
  const l1f = graphDistances(graph, a, { floors: ground }).get(b) ?? Infinity, all = shortestPath(graph, a, b);
  return {
    l1f, lAll: all ? all.length : Infinity, ratio: all && all.length > 0 ? l1f / all.length : null,
    cone1F: Number.isFinite(fanWalk(graph, a, b, ground, ZONING.coneHalfDeg)), coneAll: Number.isFinite(fanWalk(graph, a, b, null, ZONING.coneHalfDeg)),
    usesBridge: !!all && bridgeEdges.every((id) => all.edges.includes(id)),
  };
}
const verification = (s) => ({ l1f: s.l1f, lAll: s.lAll, ratio: s.ratio, cone1F: s.cone1F, coneAll: s.coneAll });

// what is wrong with the border `b` on `graph`, as a list of short messages (empty: fine)
function problemsOf(graph, b, tolerance) {
  const out = [], s = standing(graph, b.pair.a, b.pair.b, b.addedEdges.map((e) => e.id));
  if (!Number.isFinite(s.l1f)) out.push('1F no longer joins the pair');
  if (s.cone1F) out.push('1F has a way inside the fan');
  if (!s.coneAll) out.push('no way inside the fan on any floor');
  if (!s.usesBridge) out.push('the shortest walk does not use the bridge');
  if (!(s.ratio !== null && Math.abs(s.ratio - b.ratio) <= tolerance)) out.push(`ratio ${s.ratio} is not within ${tolerance} of ${b.ratio}`);
  return { problems: out, standing: s };
}

function evaluate(inputs, current, border, opts) {
  const ids = new Set(border.edgeIds.filter((id) => current.edges.some((e) => e.id === id)));
  if (!ids.size) return { reason: 'no-link', reasons: {} };
  const closedNodes = orphans(current, ids), cut = without(current, ids, closedNodes);
  if (partition(current, new Set(closedNodes)) !== partition(cut)) return { reason: 'island', reasons: {} };
  const pairs = pairsAcross(inputs, current, border);
  if (!pairs.length) return { reason: 'no-pair', reasons: {} };
  const reasons = {}, count = (r) => { reasons[r] = (reasons[r] ?? 0) + 1; };
  const R = opts.ratioFor(border.id), pref = opts.floorFor(border.id);
  let tried = 0;
  for (const p of pairs) {
    if (!Number.isFinite(fanWalk(current, p.a, p.b, ground, ZONING.coneHalfDeg))) { count('no-cone'); continue; }
    if (tried++ >= opts.tries) break;
    const l1f = graphDistances(cut, p.a, { floors: ground }).get(p.b) ?? Infinity;
    if (!Number.isFinite(l1f)) { count('unjoined'); continue; }
    if (Number.isFinite(fanWalk(cut, p.a, p.b, ground, ZONING.coneHalfDeg))) { count('cone-open'); continue; }
    if (opts.structuralOnly) return { eligible: true };
    let first = null;
    for (const floor of [pref, -pref]) {
      const dy = Math.abs(inputs.Y[floor]), excess = stairExcess(dy), lengthMin = man(p.A, p.B) + 2 * excess, lengthBudget = l1f / R;
      if (lengthBudget < lengthMin) { first ??= 'ratio-low'; continue; }
      if (lengthBudget - lengthMin > ZONING.slackMax) { first ??= 'slack'; continue; }
      const M = `${border.id}:bridge`, mid = [(p.A[0] + p.B[0]) / 2, (p.A[1] + p.B[1]) / 2];
      const entry = {
        id: border.id, axis: border.axis, a: border.a, b: border.b, ratio: R, floor, pair: { a: p.a, b: p.b },
        closedPorts: closedPortsOf(ids), closedNodes,
        addedNodes: [{ id: M, floor, anchor: mid }],
        addedEdges: [{ id: `${M}:a`, a: p.a, b: M, length: lengthBudget / 2, kind: 'stair' }, { id: `${M}:b`, a: M, b: p.b, length: lengthBudget / 2, kind: 'stair' }],
        stair: { dy, excess }, lengthMin, lengthBudget, slack: lengthBudget - lengthMin,
      };
      const after = applyZoningPlan(current, { borders: [entry] }), { problems } = problemsOf(after, entry, ZONING.tolerance);
      if (problems.length) { first ??= 'verify'; continue; }
      return { entry };
    }
    count(first);
  }
  const stage = { 'no-cone': 1, unjoined: 2, 'cone-open': 2 }, top = Object.entries(reasons).sort((x, y) => (stage[y[0]] ?? 3) - (stage[x[0]] ?? 3) || y[1] - x[1] || cmp(x[0], y[0]))[0];
  return { reason: top ? top[0] : 'no-cone', reasons };
}

// ---- the plan ----
// Borders go in id order. A border is drawn (borderShare of them), then tried against the graph as the accepted ones leave it: its links closed,
// 1F still in the same pieces, a pair across it with a 1F way inside the fan before and none after, and a bridge as long as the 1F way over the
// drawn ratio (never shorter than the stairs allow, never more than slackMax longer than that). A border that works alone but breaks an
// accepted one, or is broken by it, is a conflict.
// options: drawn(id), ratioFor(id), floorFor(id) replace the draws; tries
export function buildZoningPlan(inputs, options = {}) {
  const { seed } = inputs, opts = {
    drawn: options.drawn ?? ((id) => borderDrawn(seed, id)),
    ratioFor: options.ratioFor ?? ((id) => sampleRatio(seed, id)),
    floorFor: options.floorFor ?? ((id) => drawFloor(seed, id)),
    tries: options.tries ?? ZONING.tries,
  };
  const base = inputs.graph, borders = [...inputs.borders].sort((p, q) => cmp(p.id, q.id));
  const accepted = [], rejected = [], drawnRatios = [];
  let current = base, linked = 0, eligible = 0, drawn = 0, drawnEligible = 0;
  for (const border of borders) {
    if (border.edgeIds.some((id) => base.edges.some((e) => e.id === id))) linked++;
    // eligible: on the base graph some pair across it passes the cut and fan checks, whatever ratio or floor is drawn
    const fit = !!evaluate(inputs, base, border, { ...opts, structuralOnly: true }).eligible;
    if (fit) eligible++;
    if (!opts.drawn(border.id)) continue;
    drawn++;
    if (fit) drawnEligible++;
    drawnRatios.push(opts.ratioFor(border.id));
    let r = evaluate(inputs, current, border, opts);
    if (r.entry) {
      const next = [...accepted, r.entry], graph = applyZoningPlan(base, { borders: next });
      const broken = partition(base, new Set(next.flatMap((b) => b.closedNodes))) === partition(graph) ? next.filter((b) => problemsOf(graph, b, ZONING.tolerance).problems.length) : next;
      if (broken.length) r = { reason: 'conflict', reasons: {} };
      else {
        for (const b of next) b.verification = verification(problemsOf(graph, b, ZONING.tolerance).standing);
        accepted.push(r.entry);
        current = graph;
        continue;
      }
    } else if (accepted.length && evaluate(inputs, base, border, opts).entry) r = { reason: 'conflict', reasons: {} };
    rejected.push({ id: border.id, reason: r.reason, reasons: r.reasons });
  }
  const byReason = {};
  for (const x of rejected) byReason[x.reason] = (byReason[x.reason] ?? 0) + 1;
  return { version: 1, seed, borders: accepted, rejected, stats: { borders: borders.length, linked, eligible, drawn, drawnEligible, accepted: accepted.length, rejected: rejected.length, byReason, drawnRatios } };
}

// what a border records about its bridge, worked out again: the floor of its nodes, the climb, the shortest length, the length budget and its slack
function bridgeProblems(inputs, graph, b) {
  const out = [], A = graph.nodes.get(b.pair.a)?.anchor, B = graph.nodes.get(b.pair.b)?.anchor, near = (x, y) => Math.abs(x - y) <= 1e-9;
  if (!A || !B) return [`${b.id}: the pair is not in the graph`];
  if (b.addedNodes.some((n) => n.floor !== b.floor)) out.push(`${b.id}: a bridge node is not on floor ${b.floor}`);
  const dy = Math.abs(inputs.Y[b.floor]), min = man(A, B) + 2 * stairExcess(dy), budget = b.addedEdges.reduce((t, e) => t + e.length, 0);
  const M = `${b.id}:bridge`, mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], at = b.addedNodes[0]?.anchor;
  if (b.addedNodes.length !== 1 || b.addedNodes[0].id !== M) out.push(`${b.id}: a bridge is one node named ${M}`);
  else if (!near(at[0], mid[0]) || !near(at[1], mid[1])) out.push(`${b.id}: the bridge node is not at the middle of its pair`);
  else if (b.addedEdges.length !== 2) out.push(`${b.id}: a bridge is two stair edges`);
  else for (const [k, [from, to, end]] of [[b.pair.a, M, A], [M, b.pair.b, B]].entries()) {   // each leg reaches its end: its horizontal run and the stair excess
    const e = b.addedEdges[k];
    if (e.id !== `${M}:${'ab'[k]}` || `${e.a}>${e.b}` !== `${from}>${to}` || e.kind !== 'stair') out.push(`${b.id}: leg ${'ab'[k]} is not the stair edge ${from} to ${to}`);
    else if (!(e.length >= man(end, at) + stairExcess(dy) - 1e-9)) out.push(`${b.id}: leg ${'ab'[k]} is too short for its run and its climb`);
  }
  if (!near(b.stair?.dy, dy) || !near(b.stair?.excess, stairExcess(dy))) out.push(`${b.id}: the recorded climb is not that of floor ${b.floor}`);
  if (!near(b.lengthMin, min)) out.push(`${b.id}: the recorded shortest length is not ${min}`);
  if (!near(b.lengthBudget, budget)) out.push(`${b.id}: the recorded length budget is not the sum of its edges (${budget})`);
  if (!near(b.slack, budget - min)) out.push(`${b.id}: the recorded slack is not ${budget - min}`);
  if (budget < min - 1e-9 || budget - min > ZONING.slackMax + 1e-9) out.push(`${b.id}: the bridge is shorter than its stairs allow or winds more than ${ZONING.slackMax} m`);
  return out;
}

// the plan checked again on the graph it was made for: its links exist, its draws are in range, 1F is in the same pieces, and every border's pair
// stands as the plan says
export function validateZoningPlan(inputs, plan) {
  const problems = [];
  let graph;
  try { graph = applyZoningPlan(inputs.graph, plan); } catch (err) { return { ok: false, problems: [err.message] }; }
  const dangling = graph.edges.filter((e) => !graph.nodes.has(e.a) || !graph.nodes.has(e.b));
  if (dangling.length) return { ok: false, problems: [`edges to nodes that are not in the graph: ${dangling.map((e) => e.id).join(', ')}`] };
  if (plan.version !== 1) problems.push('unknown plan version');
  if (plan.seed !== inputs.seed) problems.push(`the plan is for seed ${plan.seed}, the inputs for seed ${inputs.seed}`);
  if (partition(inputs.graph, new Set(plan.borders.flatMap((b) => b.closedNodes ?? []))) !== partition(graph)) problems.push('1F is cut into more pieces than before');
  for (const b of plan.borders) {
    const border = inputs.borders.find((o) => o.id === b.id);
    if (!border) { problems.push(`${b.id}: not a border of the inputs`); continue; }
    if (b.axis !== border.axis || b.a !== border.a || b.b !== border.b) problems.push(`${b.id}: its axis and districts differ from the border of the inputs`);
    for (const id of b.closedNodes ?? []) { const n = inputs.graph.nodes.get(id); if (!n || n.floor !== 0 || !isConnector(id)) problems.push(`${b.id}: ${id} is no connector room`); }
    if (b.closedPorts.some((c) => c.edgeIds.some((id) => !border.edgeIds.includes(id)))) problems.push(`${b.id}: closes a link that does not cross it`);
    const missing = border.edgeIds.filter((id) => inputs.graph.edges.some((e) => e.id === id) && !b.closedPorts.some((c) => c.edgeIds.includes(id)));
    if (missing.length) problems.push(`${b.id}: leaves ${missing.join(', ')} open`);
    if (!(b.ratio >= ZONING.ratioMin && b.ratio <= ZONING.ratioMax)) problems.push(`${b.id}: ratio ${b.ratio} is out of range`);
    if (![-1, 1].includes(b.floor)) problems.push(`${b.id}: floor ${b.floor}`);
    else problems.push(...bridgeProblems(inputs, graph, b));
    const r = problemsOf(graph, b, ZONING.tolerance);
    for (const p of r.problems) problems.push(`${b.id}: ${p}`);
    const v = b.verification, s = r.standing;
    if (!v || v.cone1F !== s.cone1F || v.coneAll !== s.coneAll || !(Math.abs(v.l1f - s.l1f) <= 1e-9) || !(Math.abs(v.lAll - s.lAll) <= 1e-9) || !(Math.abs(v.ratio - s.ratio) <= 1e-9)) problems.push(`${b.id}: the recorded verification is not what the graph gives`);
  }
  return { ok: problems.length === 0, problems };
}

// ---- the World2 adapter ----
const DISTRICT_M = 128;   // a district is 2 × 2 cells of 64 m

// the route graph of the sampled cells and, for every border between two districts that the sample holds whole, the edges through it. A border
// has two connections (its two cell edges); a connector room splits one into two edges (`<id>:a`, `<id>:b`)
export function collectZoningInputs(world, cells) {
  const graph = routeGraph3D(world, cells), have = new Set(cells.map(([i, j]) => i + ',' + j)), edgeIds = new Set(graph.edges.map((e) => e.id));
  const whole = (a, b) => [0, 1].every((u) => [0, 1].every((v) => have.has(2 * a + u + ',' + (2 * b + v))));
  const found = new Map();
  for (const [i, j] of cells) found.set(Math.floor(i / 2) + ',' + Math.floor(j / 2), [Math.floor(i / 2), Math.floor(j / 2)]);
  const borders = [];
  for (const [a, b] of [...found.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1])) {
    if (!whole(a, b)) continue;
    for (const axis of ['x', 'z']) {
      const [na, nb] = axis === 'x' ? [a + 1, b] : [a, b + 1];
      if (!whole(na, nb)) continue;
      const ids = [];
      for (const k of [0, 1]) {
        const [i, j] = axis === 'x' ? [2 * a + 1, 2 * b + k] : [2 * a + k, 2 * b + 1], c = world.connectionOf(i, j, axis);
        for (const id of [c.id, `${c.id}:a`, `${c.id}:b`]) if (edgeIds.has(id)) ids.push(id);
      }
      borders.push({
        id: borderId(axis, a, b), axis, a, b, line: DISTRICT_M * (axis === 'x' ? a + 1 : b + 1),
        span: axis === 'x' ? [DISTRICT_M * b, DISTRICT_M * (b + 1)] : [DISTRICT_M * a, DISTRICT_M * (a + 1)], edgeIds: ids.sort(cmp),
      });
    }
  }
  return { seed: world.seed, Y: { '-1': world.Y['-1'], 0: world.Y[0], 1: world.Y[1] }, graph, borders };
}

// ---- the report ----
const quant = (xs) => {
  const s = [...xs].sort((p, q) => p - q), at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return s.length ? { n: s.length, min: s[0], p25: at(0.25), median: at(0.5), p75: at(0.75), max: s[s.length - 1] } : { n: 0 };
};

// what a plan does to the route metrics of its graph: the pairs of S0 before and after, and the bridges themselves
export function summarizeZoning(inputs, plan) {
  const g = applyZoningPlan(inputs.graph, plan), before = summarizePairs(routePairs(inputs.graph)), pairs = routePairs(g), after = summarizePairs(pairs), shortcuts = pairs.filter((p) => p.shortcut);
  return {
    ...plan.stats,
    up: plan.borders.filter((b) => b.floor === 1).length,
    down: plan.borders.filter((b) => b.floor === -1).length,
    drawnRatio: plan.borders.map((b) => b.ratio), drawnRatioAll: plan.stats.drawnRatios,
    builtRatio: plan.borders.map((b) => b.verification.ratio),
    slack: plan.borders.map((b) => b.slack),
    pairs: after.pairs, shortcutBefore: before.shortcut, shortcut: after.shortcut, cutOff1F: after.cutOff1F, shortcutRatio: shortcuts.map((p) => p.ratio),
  };
}

// one summary over a corpus { seeds, cells }: one World2 per seed, the counts added, the lists joined
export function measureZoningCorpus({ seeds, cells }, makeWorld) {
  const sum = { borders: 0, linked: 0, eligible: 0, drawn: 0, drawnEligible: 0, accepted: 0, rejected: 0, byReason: {}, up: 0, down: 0, pairs: 0, shortcutBefore: 0, shortcut: 0, cutOff1F: 0 }, lists = { drawnRatioAll: [], drawnRatio: [], builtRatio: [], slack: [], shortcutRatio: [] };
  for (const seed of [...seeds].sort((p, q) => p - q)) {
    const inputs = collectZoningInputs(makeWorld(seed), cells), r = summarizeZoning(inputs, buildZoningPlan(inputs));
    for (const k of Object.keys(sum)) if (k !== 'byReason') sum[k] += r[k];
    for (const [k, v] of Object.entries(r.byReason)) sum.byReason[k] = (sum.byReason[k] ?? 0) + v;
    for (const k of Object.keys(lists)) lists[k].push(...r[k]);
  }
  return { ...sum, drawnRatioAll: quant(lists.drawnRatioAll), drawnRatio: quant(lists.drawnRatio), builtRatio: quant(lists.builtRatio), slack: quant(lists.slack), shortcutRatio: quant(lists.shortcutRatio) };
}

const pct = (v) => (v * 100).toFixed(1) + '%';
const q = (s, f = 2) => (s.n ? `n ${s.n} · min ${s.min.toFixed(f)} · p25 ${s.p25.toFixed(f)} · median ${s.median.toFixed(f)} · p75 ${s.p75.toFixed(f)} · max ${s.max.toFixed(f)}` : 'n 0');

export function formatZoning(r) {
  const share = (n, d) => (d ? pct(n / d) : '0.0%');
  return [
    `zoning (borders between districts, bridge on ${pct(ZONING.borderShare)} drawn, ratio ${ZONING.ratioMin}–${ZONING.ratioMax} mode ${ZONING.ratioMode}, fan ±${ZONING.coneHalfDeg}°): borders ${r.borders} · with a link ${r.linked} · eligible ${r.eligible} (${share(r.eligible, r.borders)}) · drawn ${r.drawn} (${share(r.drawn, r.borders)}), of them eligible ${r.drawnEligible} (${share(r.drawnEligible, r.eligible)} of the eligible)`,
    `  accepted ${r.accepted} (${share(r.accepted, r.eligible)} of the eligible, ${share(r.accepted, r.borders)} of all borders, ${share(r.accepted, r.drawn)} of the drawn) · rejected ${r.rejected} ${JSON.stringify(r.byReason)}`,
    `  bridge floor: 2F ${r.up} · B1 ${r.down}`,
    `  ratio drawn, every drawn border: ${q(r.drawnRatioAll)}`,
    `  ratio drawn, accepted borders (the stairs refuse the high draws): ${q(r.drawnRatio)}`,
    `  ratio built (1F way / any-floor way of the pair): ${q(r.builtRatio)}`,
    `  bridge winding beyond its shortest length (m): ${q(r.slack, 1)}`,
    `  route pairs ${r.pairs} · shortcut pairs before ${r.shortcutBefore}, after ${r.shortcut} (${share(r.shortcut, r.pairs)}) · cut off on 1F after ${r.cutOff1F}`,
    `  ratio over every shortcut pair: ${q(r.shortcutRatio)}`,
  ].join('\n');
}

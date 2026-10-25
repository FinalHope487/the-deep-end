// Floor and terrain audit of v2 plans: pure data over World2 plans, no three.js, not loaded by the game (tools/gen2-measure.mjs).
// Areas are counted at the centres of each cell's Q2 grid, as cellRaster samples it, so a rectangle on that grid is measured
// exactly and rooms overlapping on one floor count once.
// footprint: a floor's rooms (pool basins included) less what flights and voids take out of it; walkable: footprint less
// columns, deep water and sealed showcases; stairs are counted apart, once, whatever floors they join.
// A hall shared by several cells (a giant or L hall) is measured part by part, each in its own cell, and counted as one room.
import { CELL2, Q2, WADE_MAX, PARAPET, World2, inColumn2, inVoid2, poolBox, poolDepth, shapeContains } from './gen2.js';

const LEVELS = [-1, 0, 1];
const N = CELL2 / Q2, SQ = Q2 * Q2;
export const DISTRICT = 2;   // cells per side of the sample regions the report breaks the shares down by
export const CORPUS = { seeds: [1, 2, 3, 7, 42, 99, 1234, 20261024], cells: [] };
for (let j = -4; j < 4; j++) for (let i = -4; i < 4; i++) CORPUS.cells.push([i, j]);

// sample centres inside [r.x0, r.x1) × [r.z0, r.z1) of the plan's cell
function eachIn(r, plan, fn) {
  const span = (v0, v1, o) => [Math.max(0, Math.ceil((v0 - o) / Q2 - 0.5)), Math.min(N, Math.ceil((v1 - o) / Q2 - 0.5))];
  const [a0, a1] = span(r.x0, r.x1, plan.ox), [b0, b1] = span(r.z0, r.z1, plan.oz);
  for (let b = b0; b < b1; b++) for (let a = a0; a < a1; a++) fn(b * N + a, plan.ox + (a + 0.5) * Q2, plan.oz + (b + 0.5) * Q2);
}
const kindOf = (o) => (o.span && o.kind === 'hall' ? o.span + '-hall' : o.kind);
const add = (o, k, v = 1) => { o[k] = (o[k] ?? 0) + v; };

export function measurePlan(plan, Y) {
  const { rooms, pools = [], flights = [], voids = [], columns = [] } = plan;
  const stair = new Uint8Array(N * N);
  for (const f of flights) eachIn(f, plan, (k) => { stair[k] = 1; });
  const levels = {}, foot = {}, wet = {}, roomCounts = {}, spaces = [];
  const poolArea = {}, poolDeep = new Set();
  for (const lv of LEVELS) {
    const cover = new Uint8Array(N * N), owner = new Int16Array(N * N).fill(-1), open = new Uint8Array(N * N);
    const gone = new Uint8Array(N * N), solid = new Uint8Array(N * N), pool = new Int16Array(N * N).fill(-1), deep = new Uint8Array(N * N);
    roomCounts[lv] = {};
    rooms.forEach((o, n) => {
      if (o.lv !== lv) return;
      if (o.span) spaces.push({ spaceId: o.spaceId, lv, kind: kindOf(o) });   // a part of a shared hall: counted once over its cells
      else add(roomCounts[lv], kindOf(o));
      eachIn(o, plan, (k) => { cover[k]++; if (owner[k] < 0) owner[k] = n; if (o.kind !== 'showcase') open[k] = 1; });
    });
    for (const f of flights) if (f.lo <= lv && lv <= f.hi) eachIn(f, plan, (k) => { gone[k] = 1; });
    for (const v of voids) if (v.lv + 1 === lv) eachIn({ x0: v.x0 - PARAPET, x1: v.x1 + PARAPET, z0: v.z0 - PARAPET, z1: v.z1 + PARAPET }, plan, (k, x, z) => { if (inVoid2(v, x, z)) gone[k] = 1; });
    for (const c of columns) if (c.lv === lv) eachIn({ x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r }, plan, (k, x, z) => { if (inColumn2(c, x, z)) solid[k] = 1; });
    pools.forEach((p, n) => {
      if (p.lv !== lv) return;
      eachIn(poolBox(p), plan, (k, x, z) => {
        if (!shapeContains(p.shape, x, z)) return;
        pool[k] = n;
        if (poolDepth(p, x, z) > WADE_MAX) deep[k] = 1;
      });
    });
    const L = { rooms: 0, footprint: 0, walkable: 0, sealed: 0, pool: 0, deep: 0, column: 0, removed: 0, overlap: 0, kinds: {}, roomKinds: {} };
    const F = (foot[lv] = new Uint8Array(N * N)), W = (wet[lv] = new Uint8Array(N * N));
    for (let k = 0; k < N * N; k++) {
      if (!cover[k]) continue;
      L.rooms++;
      L.overlap += cover[k] - 1;
      add(L.roomKinds, kindOf(rooms[owner[k]]));
      if (gone[k]) { L.removed++; continue; }
      F[k] = 1;
      L.footprint++;
      add(L.kinds, kindOf(rooms[owner[k]]));
      if (pool[k] >= 0) { W[k] = 1; L.pool++; add(poolArea, pool[k]); }
      if (deep[k]) { L.deep++; poolDeep.add(pool[k]); }
      if (!open[k]) L.sealed++;
      if (solid[k]) L.column++;
      if (open[k] && !solid[k] && !deep[k]) L.walkable++;
    }
    for (const key of ['rooms', 'footprint', 'walkable', 'sealed', 'pool', 'deep', 'column', 'removed', 'overlap']) L[key] *= SQ;
    for (const key of Object.keys(L.kinds)) L.kinds[key] *= SQ;
    for (const key of Object.keys(L.roomKinds)) L.roomKinds[key] *= SQ;
    levels[lv] = L;
  }
  // floors stacked over each other: water over a lower floor's footprint, and pools stacked over pools
  const stacked = { poolOverFloor: { 0: 0, 1: 0 }, poolOverPool: { 0: 0, 1: 0 } };
  for (const lv of [0, 1]) for (let k = 0; k < N * N; k++) {
    if (!wet[lv][k]) continue;
    if (foot[lv - 1][k]) stacked.poolOverFloor[lv] += SQ;
    if (wet[lv - 1][k]) stacked.poolOverPool[lv] += SQ;
  }
  let stairArea = 0;
  for (let k = 0; k < N * N; k++) stairArea += stair[k] * SQ;
  const corridors = rooms.filter((o) => o.kind === 'corridor' || o.kind === 'b1corridor').map((o) => {
    const w = o.x1 - o.x0, d = o.z1 - o.z0;
    return { lv: o.lv, length: Math.max(w, d), width: Math.min(w, d) };
  });
  // 1F rooms (sealed showcases apart) cut off from the cell's hall and from every cell edge: pieces that lead nowhere
  const open0 = rooms.filter((o) => o.lv === 0 && o.kind !== 'showcase'), up = open0.map((_, k) => k);
  const root = (k) => (up[k] === k ? k : (up[k] = root(up[k])));
  const touch = (a, b) => { const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0); return ox >= 0 && oz >= 0 && ox + oz > 0; };
  open0.forEach((a, k) => open0.forEach((b, n) => { if (n > k && touch(a, b)) up[root(n)] = root(k); }));
  const atEdge = (o) => o.x0 <= plan.ox || o.x1 >= plan.ox + CELL2 || o.z0 <= plan.oz || o.z1 >= plan.oz + CELL2;
  const anchored = new Set(open0.flatMap((o, k) => (o.kind === 'hall' || atEdge(o) ? [root(k)] : [])));
  const halls0 = rooms.filter((o) => o.lv === 0 && o.kind === 'hall');
  const inHall = (o) => halls0.some((h) => Math.min(o.x1, h.x1) > Math.max(o.x0, h.x0) && Math.min(o.z1, h.z1) > Math.max(o.z0, h.z0));
  return {
    levels, stairArea, stacked, roomCounts, spaces, corridors,
    orphans: open0.filter((_, k) => !anchored.has(root(k))).length,
    stairs: flights.map((f) => ({ type: f.turn ? 'switchback' : 'straight', to: f.lo < 0 ? -1 : 1 })),
    ladders: (plan.ladders ?? []).length,
    voids: voids.map((v) => v.kind),
    pools: pools.map((p, n) => ({ lv: p.lv, shape: p.shape.type, deep: poolDeep.has(n), area: (poolArea[n] ?? 0) * SQ })),
    // ways out of the cell's 1F: its corridors that run out through a cell edge, the open seams of shared halls and
    // connector rooms (a corridor that ends in a connector room goes out through the room's seam), and each diagonal that
    // opens out of the hall (its pieces passing through another cell are no way out of it)
    connections1F: new Set(rooms.filter((o) => o.diagId && inHall(o)).map((o) => o.diagId)).size
      + rooms.filter((o) => o.kind === 'corridor' && !o.diagId && (o.x0 === plan.ox || o.x1 === plan.ox + CELL2 || o.z0 === plan.oz || o.z1 === plan.oz + CELL2)).length
      + rooms.reduce((t, o) => t + (o.seams ? Object.values(o.seams).filter(Boolean).length : 0), 0),
  };
}

const quant = (xs) => {
  const s = [...xs].sort((a, b) => a - b), at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return s.length ? { n: s.length, min: s[0], p25: at(0.25), median: at(0.5), p75: at(0.75), max: s[s.length - 1] } : { n: 0 };
};
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const shareOf = (f) => { const t = f[-1] + f[0] + f[1]; return t ? { '-1': f[-1] / t, 0: f[0] / t, 1: f[1] / t } : { '-1': 0, 0: 0, 1: 0 }; };
const quant90 = (xs) => {
  const s = quant(xs);
  if (!s.n) return s;
  const sorted = [...xs].sort((a, b) => a - b);
  return { ...s, p90: sorted[Math.min(s.n - 1, Math.floor(0.9 * s.n))] };
};

// ---- the room graph: logical 1F rooms and the passages between them, one canonical contract for every layout ----
// records: { rooms: [{ spaceId, kind, lv: 0, parts: [{ id, i, j, x0, x1, z0, z1 }] }], links: [{ id, a, b, kind, line }] }. A room is
// one spaceId whatever the cells and fragments it spans; a link is declared, never inferred from rooms touching. The
// graph: nodes (area in m² and anchor over the sampled cells only) and edges (gap: wall to wall along the passage line, length:
// anchor to anchor along it). Pure over its input: no World2, no rendering
const ROOM_KIND_BAN = new Set(['corridor', 'b1corridor', 'route', 'diagonal', 'showcase', 'shaft']);
const EDGE_KINDS = new Set(['seam', 'opening', 'corridor', 'route', 'connector', 'diagonal']);
const bad = (msg) => new TypeError(msg);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isInt = Number.isInteger;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const lineGap = (line) => line.slice(1).reduce((s, p, k) => s + man(line[k], p), 0);
const SQUARES = CELL2 / Q2;

// the sampled cells, sorted by i then j; a duplicate or a non-integer pair is refused
function normalizeCells(cells) {
  if (!Array.isArray(cells)) throw bad('cells must be an array');
  const seen = new Set();
  for (const c of cells) {
    if (!Array.isArray(c) || c.length !== 2 || !isInt(c[0]) || !isInt(c[1])) throw bad(`invalid cell ${JSON.stringify(c)}`);
    if (seen.has(c[0] + ',' + c[1])) throw bad(`duplicate cell ${c[0]},${c[1]}`);
    seen.add(c[0] + ',' + c[1]);
  }
  return cells.map(([i, j]) => [i, j]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

// whether p lies on the outer boundary of the union of rects: in its closure, with a point just beside it outside the union
// (a seam between two fragments of one room is no boundary)
function onOuterBoundary(rects, [x, z]) {
  if (!rects.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)) return false;
  const e = 1e-6, covered = (u, v) => rects.some((r) => u > r.x0 && u < r.x1 && v > r.z0 && v < r.z1);
  return [[e, e], [e, -e], [-e, e], [-e, -e]].some(([dx, dz]) => !covered(x + dx, z + dz));
}

function readPart(spaceId, p) {
  if (!p || !isStr(p.id)) throw bad(`room ${spaceId}: a fragment needs an id`);
  if (!isInt(p.i) || !isInt(p.j)) throw bad(`fragment ${p.id}: cell coordinates must be integers`);
  for (const k of ['x0', 'x1', 'z0', 'z1']) if (!Number.isFinite(p[k]) || !isInt(p[k] / Q2)) throw bad(`fragment ${p.id}: ${k} must be finite and on the ${Q2} m grid`);
  if (!(p.x0 < p.x1 && p.z0 < p.z1)) throw bad(`fragment ${p.id}: no area`);
  if (p.x0 < p.i * CELL2 || p.x1 > (p.i + 1) * CELL2 || p.z0 < p.j * CELL2 || p.z1 > (p.j + 1) * CELL2) throw bad(`fragment ${p.id}: outside its cell ${p.i},${p.j}`);
  return { id: p.id, i: p.i, j: p.j, x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 };
}

// every declared record checked, whole, before any sample filters it; links come back canonical (a < b, the line reversed with them)
function readRecords(records) {
  if (!records || !Array.isArray(records.rooms) || !Array.isArray(records.links)) throw bad('records.rooms and records.links must be arrays');
  const rooms = new Map(), fragments = new Map();
  for (const r of records.rooms) {
    if (!r || !isStr(r.spaceId)) throw bad('a room needs a spaceId');
    if (!isStr(r.kind) || ROOM_KIND_BAN.has(r.kind)) throw bad(`room ${r.spaceId}: kind ${r.kind} is not a canonical room`);
    if (r.lv !== 0) throw bad(`room ${r.spaceId}: lv must be 0`);
    if (!Array.isArray(r.parts)) throw bad(`room ${r.spaceId}: parts must be an array`);
    if (!rooms.has(r.spaceId)) rooms.set(r.spaceId, { spaceId: r.spaceId, kind: r.kind, parts: new Map() });
    const room = rooms.get(r.spaceId);
    if (room.kind !== r.kind) throw bad(`conflicting declarations of room ${r.spaceId}`);
    for (const raw of r.parts) {
      const p = readPart(r.spaceId, raw), old = fragments.get(p.id);
      if (old && (old.spaceId !== r.spaceId || ['i', 'j', 'x0', 'x1', 'z0', 'z1'].some((k) => old.p[k] !== p[k]))) throw bad(`conflicting fragment ${p.id}`);
      fragments.set(p.id, { spaceId: r.spaceId, p });
      room.parts.set(p.id, p);
    }
  }
  const links = new Map();
  for (const l of records.links) {
    if (!l || !isStr(l.id) || !isStr(l.a) || !isStr(l.b)) throw bad('a link needs an id and two endpoints');
    if (!rooms.has(l.a) || !rooms.has(l.b)) throw bad(`link ${l.id}: an endpoint is not a declared room`);
    if (l.a === l.b) throw bad(`link ${l.id}: a room joined to itself`);
    if (!EDGE_KINDS.has(l.kind)) throw bad(`link ${l.id}: kind ${l.kind}`);
    const line = l.line;
    if (!Array.isArray(line) || line.length < 2 || line.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) throw bad(`link ${l.id}: the line needs two or more finite points`);
    if (line.slice(1).some((p, k) => p[0] !== line[k][0] && p[1] !== line[k][1])) throw bad(`link ${l.id}: a segment is not along an axis`);
    if (!onOuterBoundary([...rooms.get(l.a).parts.values()], line[0]) || !onOuterBoundary([...rooms.get(l.b).parts.values()], line[line.length - 1])) throw bad(`link ${l.id}: an end is off its room's outer boundary`);
    if ((l.kind === 'seam' || l.kind === 'opening') && lineGap(line) !== 0) throw bad(`link ${l.id}: a ${l.kind} has no gap`);
    const swap = l.a > l.b, c = { id: l.id, a: swap ? l.b : l.a, b: swap ? l.a : l.b, kind: l.kind, line: (swap ? [...line].reverse() : [...line]).map((p) => [p[0], p[1]]) };
    const old = links.get(c.id);
    if (old && JSON.stringify(old) !== JSON.stringify(c)) throw bad(`conflicting link ${c.id}`);
    links.set(c.id, c);
  }
  return { rooms, links };
}

export function roomGraphFromRecords(records, cells) {
  const { rooms, links } = readRecords(records), sample = normalizeCells(cells), sampled = new Set(sample.map(([i, j]) => i + ',' + j));
  const nodes = new Map(), anchors = new Map();
  for (const spaceId of [...rooms.keys()].sort(cmp)) {
    const room = rooms.get(spaceId), maps = new Map();   // per sampled cell, the Q2 squares the room covers (half-open rectangles, each counted once)
    for (const p of room.parts.values()) {
      if (!sampled.has(p.i + ',' + p.j)) continue;
      const key = p.i + ',' + p.j;
      if (!maps.has(key)) maps.set(key, { i: p.i, j: p.j, bits: new Uint8Array(SQUARES * SQUARES) });
      const { bits } = maps.get(key), [a0, a1, b0, b1] = [(p.x0 - p.i * CELL2) / Q2, (p.x1 - p.i * CELL2) / Q2, (p.z0 - p.j * CELL2) / Q2, (p.z1 - p.j * CELL2) / Q2];
      for (let b = b0; b < b1; b++) for (let a = a0; a < a1; a++) bits[b * SQUARES + a] = 1;
    }
    if (!maps.size) continue;
    const covered = [];   // [u, v]: twice the square centre in grid squares, an integer, so the anchor search is exact
    for (const { i, j, bits } of maps.values()) for (let b = 0; b < SQUARES; b++) for (let a = 0; a < SQUARES; a++) if (bits[b * SQUARES + a]) covered.push([2 * (i * SQUARES + a) + 1, 2 * (j * SQUARES + b) + 1]);
    const n = covered.length, su = covered.reduce((t, [u]) => t + u, 0), sv = covered.reduce((t, [, v]) => t + v, 0);
    let best = null, bestD = Infinity;
    for (const [u, v] of covered) {
      const d = (n * u - su) ** 2 + (n * v - sv) ** 2;
      if (d < bestD || (d === bestD && (u < best[0] || (u === best[0] && v < best[1])))) { best = [u, v]; bestD = d; }
    }
    const anchor = [best[0] * Q2 / 2, best[1] * Q2 / 2];
    nodes.set(spaceId, { area: n * SQ, cells: [...maps.values()].map(({ i, j }) => [i, j]).sort((x, y) => x[0] - y[0] || x[1] - y[1]), kind: room.kind, anchor });
    anchors.set(spaceId, anchor);
  }
  const edges = [];
  for (const l of [...links.values()].sort((x, y) => cmp(x.id, y.id))) {
    if (!nodes.has(l.a) || !nodes.has(l.b)) continue;
    const gap = lineGap(l.line), length = man(anchors.get(l.a), l.line[0]) + gap + man(l.line[l.line.length - 1], anchors.get(l.b));
    if (!(Number.isFinite(gap) && gap >= 0 && Number.isFinite(length) && length >= 0)) throw bad(`link ${l.id}: gap or length is not finite and nonnegative`);
    edges.push({ id: l.id, a: l.a, b: l.b, kind: l.kind, gap, length });
  }
  return { nodes, edges };
}

// the parts of a polyline inside a closed rectangle, as [from, to] distances along the line, touching ones merged
function insideRect(line, r) {
  const spans = [];
  let at = 0;
  for (let k = 1; k < line.length; k++) {
    const [x0, z0] = line[k - 1], [x1, z1] = line[k], len = Math.abs(x1 - x0) + Math.abs(z1 - z0), X = x0 !== x1;
    const [f, f0, f1, u0, u1, lo, hi] = X ? [z0, r.z0, r.z1, x0, x1, r.x0, r.x1] : [x0, r.x0, r.x1, z0, z1, r.z0, r.z1];
    const from = Math.max(Math.min(u0, u1), lo), to = Math.min(Math.max(u0, u1), hi);
    if (f >= f0 && f <= f1 && from <= to) spans.push([at + Math.min(Math.abs(from - u0), Math.abs(to - u0)), at + Math.max(Math.abs(from - u0), Math.abs(to - u0))]);
    at += len;
  }
  const merged = [];
  for (const s of spans.sort((p, q) => p[0] - q[0])) {
    if (merged.length && s[0] <= merged[merged.length - 1][1] + 1e-9) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], s[1]);
    else merged.push([...s]);
  }
  return merged;
}

// the part of a polyline between distances s0 and s1 along it, its turns kept; a zero length stays two identical points
function cutLine(line, s0, s1) {
  const out = [];
  let at = 0;
  const pointAt = (s) => {
    let d = 0;
    for (let k = 1; k < line.length; k++) {
      const len = man(line[k - 1], line[k]);
      if (s <= d + len || k === line.length - 1) {
        const t = len ? Math.min(1, Math.max(0, (s - d) / len)) : 0;
        return [line[k - 1][0] + (line[k][0] - line[k - 1][0]) * t, line[k - 1][1] + (line[k][1] - line[k - 1][1]) * t];
      }
      d += len;
    }
    return line[0];
  };
  out.push(pointAt(s0));
  for (let k = 1; k < line.length - 1; k++) {
    at += man(line[k - 1], line[k]);
    if (at > s0 + 1e-9 && at < s1 - 1e-9) out.push([line[k][0], line[k][1]]);
  }
  out.push(pointAt(s1));
  return out.filter((p, k) => k === 0 || k === out.length - 1 || man(p, out[k - 1]) > 0);
}

// a centreline that starts inside room A and ends inside room B, cut back to their walls
function trimToWalls(line, A, B, id) {
  const total = lineGap(line), start = insideRect(line, A).find(([f]) => f <= 1e-9), end = insideRect(line, B).find(([, t]) => t >= total - 1e-9);
  if (!start || !end || start[1] > end[0] + 1e-9) throw bad(`${id}: the centreline does not run from one hall to the other`);
  return cutLine(line, start[1], end[0]);
}

const sameLength = (a, b) => Math.abs(a - b) <= 1e-9;

// the room graph of the sampled cells of a World2: halls, connector rooms across cell edges and in the middle of diagonals,
// and the declared ways between them (corridors, routes, seams of different spaces, connector stubs, diagonals). Asks World2
// only for hallOf, connectionOf and diagonalOf, and only for what the sample holds: the plan is not built
export function roomGraph(w, cells) {
  const sample = normalizeCells(cells), sampled = new Set(sample.map(([i, j]) => i + ',' + j)), rooms = new Map(), links = [], halls = new Map();
  const hall = (i, j) => { const k = i + ',' + j; if (!halls.has(k)) halls.set(k, w.hallOf(i, j)); return halls.get(k); };
  const addPart = (spaceId, kind, i, j, r) => {
    if (!rooms.has(spaceId)) rooms.set(spaceId, { spaceId, kind, lv: 0, parts: [] });
    rooms.get(spaceId).parts.push({ id: `${spaceId}:part:${i},${j}`, i, j, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });
  };
  for (const [i, j] of sample) { const h = hall(i, j); addPart(h.spaceId, 'hall', i, j, h); }
  for (const [i, j] of sample) for (const axis of ['x', 'z']) {
    const X = axis === 'x', [ni, nj] = X ? [i + 1, j] : [i, j + 1];
    if (!sampled.has(ni + ',' + nj)) continue;
    const c = w.connectionOf(i, j, axis);
    if (c.mode === 'closed' || (c.mode === 'seam' && c.fromSpaceId === c.toSpaceId)) continue;
    const A = hall(i, j), B = hall(ni, nj), edge = (X ? ni : nj) * CELL2, pt = (u, v) => (X ? [u, v] : [v, u]);
    if (c.mode === 'seam') {
      const lo = Math.max(X ? A.z0 : A.x0, X ? B.z0 : B.x0), hi = Math.min(X ? A.z1 : A.x1, X ? B.z1 : B.x1);
      if ((X ? A.x1 : A.z1) !== edge || (X ? B.x0 : B.z0) !== edge || !(hi > lo)) throw bad(`${c.id}: the halls' faces do not meet on the cell edge`);
      const at = pt(edge, (lo + hi) / 2);
      links.push({ id: c.id, a: c.fromSpaceId, b: c.toSpaceId, kind: 'seam', line: [at, [...at]] });
      continue;
    }
    const centre = (X ? j : i) * CELL2 + CELL2 / 2 + c.corridor.t + corridorPhase2(c.corridor.w), wallA = X ? A.x1 : A.z1, wallB = X ? B.x0 : B.z0;
    if (c.mode === 'connector-room') {
      for (const p of c.parts) addPart(c.connectorSpaceId, 'connector-room', p.i, p.j, p);
      const [gapA, gapB] = c.parts.map((p, k) => c.gaps[k] - (X ? p.x1 - p.x0 : p.z1 - p.z0));
      if (!(gapA >= 0 && gapB >= 0 && Number.isFinite(gapA + gapB))) throw bad(`${c.id}: a connector room deeper than its corridor`);
      links.push({ id: `${c.id}:a`, a: c.fromSpaceId, b: c.connectorSpaceId, kind: 'connector', line: [pt(wallA, centre), pt(wallA + gapA, centre)] },
        { id: `${c.id}:b`, a: c.connectorSpaceId, b: c.toSpaceId, kind: 'connector', line: [pt(wallB - gapB, centre), pt(wallB, centre)] });
      continue;
    }
    const line = c.route ? trimToWalls(c.route.line, A, B, c.id) : [pt(wallA, centre), pt(wallB, centre)];
    if (!sameLength(lineGap(line), c.route ? c.route.length : c.gaps[0] + c.gaps[1])) throw bad(`${c.id}: the passage line is not as long as the link`);
    links.push({ id: c.id, a: c.fromSpaceId, b: c.toSpaceId, kind: c.route ? 'route' : 'corridor', line });
  }
  const districts = [...new Set(sample.map(([i, j]) => Math.floor(i / 2) + ',' + Math.floor(j / 2)))].map((k) => k.split(',').map(Number)).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  for (const [a, b] of districts) {
    const d = w.diagonalOf(a, b);
    if (!d || !d.cells.every((c) => sampled.has(c.i + ',' + c.j))) continue;
    const line = trimToWalls(d.line, hall(d.cells[0].i, d.cells[0].j), hall(d.cells[1].i, d.cells[1].j), d.id), m = d.middleRoom ?? null;
    if (!m) {
      if (!sameLength(lineGap(line), d.length)) throw bad(`${d.id}: the diagonal is not as long as declared`);
      links.push({ id: d.id, a: d.fromSpaceId, b: d.toSpaceId, kind: 'diagonal', line });
      continue;
    }
    if (m.kind !== 'connector-room' || m.lv !== 0) throw bad(`${d.id}: the middle room must be a 1F connector room`);
    if (!Array.isArray(d.corridorLengths) || d.corridorLengths.length !== 2 || !d.corridorLengths.every((v) => Number.isFinite(v) && v >= 0)) throw bad(`${d.id}: corridorLengths`);
    for (let i = 2 * a; i < 2 * a + DISTRICT; i++) for (let j = 2 * b; j < 2 * b + DISTRICT; j++) {
      const f = { x0: Math.max(m.x0, i * CELL2), x1: Math.min(m.x1, (i + 1) * CELL2), z0: Math.max(m.z0, j * CELL2), z1: Math.min(m.z1, (j + 1) * CELL2) };
      if (f.x1 > f.x0 && f.z1 > f.z0) addPart(m.spaceId, 'connector-room', i, j, f);
    }
    const spans = insideRect(line, m), total = lineGap(line);
    if (!spans.length) throw bad(`${d.id}: the centreline misses its middle room`);
    const lineA = cutLine(line, 0, spans[0][0]), lineB = cutLine(line, spans[spans.length - 1][1], total);
    if (!sameLength(lineGap(lineA), d.corridorLengths[0]) || !sameLength(lineGap(lineB), d.corridorLengths[1])) throw bad(`${d.id}: the corridor lengths are not as declared`);
    links.push({ id: `${d.id}:a`, a: d.fromSpaceId, b: m.spaceId, kind: 'diagonal', line: lineA }, { id: `${d.id}:b`, a: m.spaceId, b: d.toSpaceId, kind: 'diagonal', line: lineB });
  }
  return roomGraphFromRecords({ rooms: [...rooms.values()], links }, sample);
}

// what a graph must be before its numbers are worth adding up
function checkGraph(graph, sampled) {
  if (!graph || !(graph.nodes instanceof Map) || !Array.isArray(graph.edges)) throw bad('graph.nodes must be a Map and graph.edges an array');
  const num = (v) => Number.isFinite(v) && v >= 0;
  for (const [id, n] of graph.nodes) {
    if (!isStr(id) || !n || !isStr(n.kind)) throw bad(`node ${id}: needs a key and a kind`);
    if (!Array.isArray(n.anchor) || n.anchor.length !== 2 || !n.anchor.every(Number.isFinite)) throw bad(`node ${id}: anchor`);
    if (!Array.isArray(n.cells) || !n.cells.length) throw bad(`node ${id}: cells`);
    const own = new Set();
    for (const c of n.cells) {
      if (!Array.isArray(c) || c.length !== 2 || !isInt(c[0]) || !isInt(c[1]) || own.has(c.join()) || !sampled.has(c.join())) throw bad(`node ${id}: cell ${JSON.stringify(c)}`);
      own.add(c.join());
    }
    if (!num(n.area)) throw bad(`node ${id}: area`);
  }
  const ids = new Set();
  for (const e of graph.edges) {
    if (!e || !isStr(e.id) || ids.has(e.id)) throw bad(`edge ${e?.id}: needs a unique id`);
    ids.add(e.id);
    if (!EDGE_KINDS.has(e.kind) || !num(e.gap) || !num(e.length)) throw bad(`edge ${e.id}: kind, gap or length`);
    if (!graph.nodes.has(e.a) || !graph.nodes.has(e.b) || e.a === e.b) throw bad(`edge ${e.id}: endpoints`);
  }
}

// the room graph metrics over samples [{ seed, cells, graph }]: proximity shares of the passages (gap 0, up to 6 m, over 30 m),
// 1F rooms per 2 × 2 district, the median room area, and the pieces of each seed's graph (a room joined to nothing is a piece)
export function measureRoomGraphs(samples) {
  if (!Array.isArray(samples)) throw bad('samples must be an array');
  const seeds = new Set(), checked = [];
  for (const s of samples) {
    if (!s || !isInt(s.seed) || s.seed < 0 || s.seed > 4294967295) throw bad('a sample needs an integer seed from 0 to 4294967295');
    if (seeds.has(s.seed)) throw bad(`duplicate seed ${s.seed}`);
    seeds.add(s.seed);
    const cells = normalizeCells(s.cells);
    checkGraph(s.graph, new Set(cells.map((c) => c.join())));
    checked.push({ seed: s.seed, cells, graph: s.graph });
  }
  const gaps = [], areas = [], perDistrict = [], roomComponents = {};
  let direct = 0, near = 0, long = 0;
  for (const { seed, cells, graph } of checked) {
    for (const e of graph.edges) { gaps.push(e.gap); direct += e.gap === 0; near += e.gap <= 6; long += e.gap > 30; }
    const districts = new Map(cells.map(([i, j]) => [Math.floor(i / 2) + ',' + Math.floor(j / 2), new Set()]));
    for (const [id, n] of graph.nodes) {
      areas.push(n.area);
      for (const [i, j] of n.cells) districts.get(Math.floor(i / 2) + ',' + Math.floor(j / 2)).add(id);
    }
    for (const ids of districts.values()) perDistrict.push(ids.size);
    const parent = new Map([...graph.nodes.keys()].map((id) => [id, id])), find = (a) => { while (parent.get(a) !== a) a = parent.get(a); return a; };
    for (const e of graph.edges) parent.set(find(e.a), find(e.b));
    roomComponents[seed] = new Set([...parent.keys()].map(find)).size;
  }
  const edges = gaps.length;
  return {
    rooms: { edges, gap: quant(gaps), direct: edges ? direct / edges : 0, near: edges ? near / edges : 0, long: edges ? long / edges : 0, perDistrict: quant(perDistrict), areaMedian: areas.length ? quant(areas).median : 0 },
    roomComponents,
  };
}

// the links between halls through the cell edges inside the sample (World2.connectionOf; edges out of the sample are left
// out and counted): their modes, the corridor run of each (hall to hall, less the connector room between), and per seed the
// the walk between every two neighbouring sampled cells' halls, centre to centre, the shortest way through the sampled cells:
// a link costs from one hall's centre to its opening, along the corridor, connector room or turns, and on to the other
// centre (all along the axes); a diagonal along its middle line; a closed edge is gone, so its pair walks round.
// A hall or connector room breaks a corridor stretch; equal-distance paths prefer the smaller longest stretch.
// a corridor's centre sits a quarter metre off the grid for widths 1.5, 2.5 and 3.5 (the generator's phase2, not exported)
const corridorPhase2 = (w) => Math.round(-w / (2 * Q2)) * Q2 + w / 2;
// restoreId: the id of one closed edge of the sample, taken as the link it was before its district closed it (World2.linkOf);
// every other edge and all diagonals stay as they are, so the walk shows what that one closure costs
export function measureWalks(w, cells, { restoreId = null } = {}) {
  if (restoreId !== null && !isStr(restoreId)) throw bad('restoreId must be a nonempty string or null');
  let restored = 0;
  const inSample = new Set(cells.map(([i, j]) => i + ',' + j)), mid = new Map(), next = new Map();
  const at = (i, j) => { const k = i + ',' + j; if (!mid.has(k)) { const h = w.hallOf(i, j); mid.set(k, [(h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2]); } return mid.get(k); };
  const link = (a, b, d, stretch, kind) => { for (const [p, q] of [[a, b], [b, a]]) { if (!next.has(p)) next.set(p, []); next.get(p).push([q, d, stretch, kind]); } };
  const pairs = [];
  for (const [i, j] of cells) for (const axis of ['x', 'z']) {
    const [ni, nj] = axis === 'x' ? [i + 1, j] : [i, j + 1];
    if (!inSample.has(ni + ',' + nj)) continue;
    let c = w.connectionOf(i, j, axis);
    if (restoreId !== null && c.id === restoreId) {
      if (c.mode !== 'closed') throw bad(`restoreId ${restoreId}: the edge is not closed`);
      c = w.linkOf(i, j, axis);
      restored++;
    }
    const X = axis === 'x', [a, b] = [at(i, j), at(ni, nj)];
    pairs.push({ i, j, axis, from: i + ',' + j, to: ni + ',' + nj, closed: c.mode === 'closed' });
    if (c.mode === 'closed') continue;
    const along = Math.abs(X ? b[0] - a[0] : b[1] - a[1]), across = X ? 1 : 0;
    let d;
    if (c.mode === 'seam') d = along + Math.abs(b[across] - a[across]);
    else {
      const m = (X ? j : i) * CELL2 + CELL2 / 2, t = m + c.corridor.t + corridorPhase2(c.corridor.w), [cA, cB] = c.route?.across ?? [t, t];
      d = along + (c.route ? c.route.length - (c.gaps[0] + c.gaps[1]) : 0) + Math.abs(a[across] - cA) + Math.abs(b[across] - cB);
    }
    let stretch = 0, kind = 'seam';
    if (c.mode === 'connector-room') {
      const edge = (X ? ni : nj) * CELL2;
      const near = Math.min(...c.parts.map((p) => X ? p.x0 : p.z0)), far = Math.max(...c.parts.map((p) => X ? p.x1 : p.z1));
      stretch = Math.max(c.gaps[0] - (edge - near), c.gaps[1] - (far - edge));
      kind = 'connector stub';
    } else if (c.mode !== 'seam') {
      stretch = c.gaps[0] + c.gaps[1];   // a route's stretch is its wall-to-wall axial gap: the jogs are corners, not run
      kind = c.route ? 'route ' + c.route.kind : 'straight';
    }
    link(i + ',' + j, ni + ',' + nj, d, stretch, kind);
  }
  for (const key of new Set(cells.map(([i, j]) => Math.floor(i / 2) + ',' + Math.floor(j / 2)))) {
    const dg = w.diagonalOf?.(...key.split(',').map(Number));
    if (!dg || !dg.cells.every((c) => inSample.has(c.i + ',' + c.j))) continue;
    const [P, Q] = dg.cells.map((c) => at(c.i, c.j)), L = dg.line, man = (u, v) => Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]);
    link(dg.cells[0].i + ',' + dg.cells[0].j, dg.cells[1].i + ',' + dg.cells[1].j, man(P, L[0]) + L.slice(1).reduce((t, p, k) => t + man(L[k], p), 0) + man(L[L.length - 1], Q), dg.stretch, 'diagonal');
  }
  if (restoreId !== null && restored !== 1) throw bad(`restoreId ${restoreId}: no such edge between two sampled cells`);
  // Dijkstra from each pair's first cell (the sample is small: a linear scan for the nearest open node will do)
  const from = new Map();
  for (const p of pairs) {
    if (!from.has(p.from)) {
      const dist = new Map([[p.from, { walk: 0, stretch: 0, stretchKind: 'seam' }]]), done = new Set();
      const better = (a, b) => !b || a.walk < b.walk || (a.walk === b.walk && a.stretch < b.stretch);
      for (;;) {
        let u = null;
        for (const [k, v] of dist) if (!done.has(k) && (u === null || better(v, dist.get(u)))) u = k;
        if (u === null) break;
        done.add(u);
        for (const [q, d, stretch, kind] of next.get(u) ?? []) {
          const prev = dist.get(u), candidate = { walk: prev.walk + d, stretch: Math.max(prev.stretch, stretch), stretchKind: stretch > prev.stretch ? kind : prev.stretchKind };
          if (better(candidate, dist.get(q))) dist.set(q, candidate);
        }
      }
      from.set(p.from, dist);
    }
    Object.assign(p, from.get(p.from).get(p.to) ?? { walk: Infinity, stretch: Infinity, stretchKind: 'unreachable' });
  }
  return pairs.map(({ i, j, axis, walk, closed, stretch, stretchKind }) => ({ i, j, axis, walk, closed, stretch, stretchKind }));
}

// per closed edge of the sample: the walk between its two halls with only that edge restored (before) and with the district's
// closure as it is (after), and what the closure adds (null when either walk does not exist), sorted by edge id
export function measureClosedDetours(w, cells) {
  const out = [];
  for (const p of measureWalks(w, cells)) {
    if (!p.closed) continue;
    const id = `v2:edge:${p.axis}:${p.i},${p.j}`, back = measureWalks(w, cells, { restoreId: id }).find((q) => q.i === p.i && q.j === p.j && q.axis === p.axis);
    let delta = Number.isFinite(back.walk) && Number.isFinite(p.walk) ? p.walk - back.walk : null;
    if (delta !== null) {
      if (delta < -1e-9) throw new RangeError(`${id}: restoring an edge made the walk longer by ${-delta} m`);
      delta = Math.max(0, delta);
    }
    out.push({ id, i: p.i, j: p.j, axis: p.axis, before: back.walk, after: p.walk, delta });
  }
  return out.sort((a, b) => cmp(a.id, b.id));
}

// the mean and the p90 (quant's index rule) of the finite values; 0 and 0 where there are none
const meanP90 = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? { mean: s.reduce((t, x) => t + x, 0) / s.length, p90: s[Math.min(s.length - 1, Math.floor(0.9 * s.length))] } : { mean: 0, p90: 0 };
};

// the closedDetour field of the report: the finite added walks as a quantile summary, the unreachable ones counted apart
export function summarizeClosedDetours(detours) {
  const finite = detours.filter((d) => d.delta !== null).map((d) => d.delta);
  return { ...quant90(finite), unreachable: detours.length - finite.length };
}

// number of pieces of the graph of the sampled halls and connector rooms (a shared hall is one node). A closed edge is left
// out of the runs after and of the graph; its way round (the district's three other inner edges) is measured apart
function measureConnections(seeds, cells) {
  const inSample = new Set(cells.map(([i, j]) => i + ',' + j)), modeCounts = {}, before = [], after = [], runBefore = [], runAfter = [], components = {};
  const ordinary = [], detour = [], offsets = {}, routes = { dogleg: [], winding: [] }, diagonals = { 0: 0, 1: 0 };   // offsets: links whose corridor runs 7 m or more off the middle line, by axis and side
  // corridor left on a link: hall to hall, less a connector room between (0 inside a shared hall)
  const left = (c) => (c.mode === 'seam' ? 0 : c.gaps[0] + c.gaps[1] - (c.parts ?? []).reduce((t, p) => t + (c.axis === 'x' ? p.x1 - p.x0 : p.z1 - p.z0), 0));
  let seams = 0, eligible = 0, boundary = 0;
  const walks = [];
  for (const seed of seeds) {
    const w = new World2(seed), parent = new Map();
    walks.push(...measureWalks(w, cells));
    const find = (a) => { while (parent.get(a) !== a) a = parent.get(a); return a; };
    const node = (a) => { if (!parent.has(a)) parent.set(a, a); return a; };
    const join = (a, b) => parent.set(find(node(a)), find(node(b)));
    for (const [i, j] of cells) {
      node(w.hallOf(i, j).spaceId);
      for (const [di, dj] of [[-1, 0], [0, -1]]) if (!inSample.has(i + di + ',' + (j + dj))) boundary++;
      for (const axis of ['x', 'z']) {
        const [ni, nj] = axis === 'x' ? [i + 1, j] : [i, j + 1];
        if (!inSample.has(ni + ',' + nj)) { boundary++; continue; }
        const c = w.connectionOf(i, j, axis);
        if (c.mode === 'seam') { seams++; continue; }
        add(modeCounts, c.mode);
        if (c.eligible) eligible++;
        const run = c.gaps[0] + c.gaps[1];
        runBefore.push(run);
        if (Math.abs(c.corridor?.t ?? 0) >= 7) add(offsets, axis + (c.corridor.t > 0 ? '+' : '-'));
        if (c.mode === 'closed') {
          const a = Math.floor(i / 2), b = Math.floor(j / 2);
          const round = [[2 * a, 2 * b, 'x'], [2 * a, 2 * b + 1, 'x'], [2 * a, 2 * b, 'z'], [2 * a + 1, 2 * b, 'z']].filter(([ei, ej, ax]) => !(ei === i && ej === j && ax === axis));
          detour.push({ hops: round.length, run: round.reduce((t, [ei, ej, ax]) => t + left(w.connectionOf(ei, ej, ax)), 0), was: run });
        } else if (c.mode === 'connector-room') {
          before.push(run); after.push(left(c)); runAfter.push(left(c));
          join(c.fromSpaceId, c.connectorSpaceId); join(c.connectorSpaceId, c.toSpaceId);
        } else if (c.route) { runAfter.push(c.route.length); routes[c.route.kind].push(c.route.length); join(c.fromSpaceId, c.toSpaceId); }
        else { runAfter.push(run); ordinary.push(run); join(c.fromSpaceId, c.toSpaceId); }
      }
    }
    // diagonals between two sampled cells of a district
    for (const key of new Set(cells.map(([i, j]) => Math.floor(i / 2) + ',' + Math.floor(j / 2)))) {
      const d = w.diagonalOf(...key.split(',').map(Number));
      if (!d || !d.cells.every((c) => inSample.has(c.i + ',' + c.j))) continue;
      diagonals[d.orientation]++;
      join(d.fromSpaceId, d.toSpaceId);
    }
    components[seed] = new Set([...parent.keys()].map(find)).size;
  }
  const sum = (xs) => xs.reduce((t, x) => t + x, 0), [b, a] = [sum(before), sum(after)];
  return {
    modeCounts: sortKeys(modeCounts), seams, uniqueEdges: runBefore.length, eligibleEdges: eligible, convertedEdges: before.length, boundaryEdges: boundary,
    corridorRunBefore: { ...quant(before), total: b }, corridorRunAfter: { ...quant(after), total: a }, shortening: { total: b - a, percent: b ? ((b - a) / b) * 100 : 0 },
    linkRunBefore: quant(runBefore), linkRunAfter: quant(runAfter), components,
    ordinaryRun: { ...quant(ordinary), over30: ordinary.filter((r) => r > 30).length, over36: ordinary.filter((r) => r > 36).length },
    offsets: sortKeys(offsets), diagonals,
    routes: Object.fromEntries(Object.entries(routes).map(([k, xs]) => [k, quant(xs)])),
    walk: { all: quant(walks.map((p) => p.walk)), closed: quant(walks.filter((p) => p.closed).map((p) => p.walk)), ...meanP90(walks.map((p) => p.walk)) },
    stretch: { ...quant(walks.map((p) => p.stretch)), over36: walks.filter((p) => p.stretch > 36).length },
    closed: { count: detour.length, hops: quant(detour.map((d) => d.hops)), detourRun: quant(detour.map((d) => d.run)), closedRun: quant(detour.map((d) => d.was)) },
  };
}

// one report over every seed × cell: totals, shares, per-district shares, room kinds, corridors, stairs, pools, stacking. Every
// field but cost is a sum over cells or a sorted list, so it does not depend on the order the cells are planned in
export function measureWorld({ seeds, cells } = CORPUS) {
  const sumL = () => ({ rooms: 0, footprint: 0, walkable: 0, sealed: 0, pool: 0, deep: 0, column: 0, removed: 0, overlap: 0 });
  const levels = { '-1': sumL(), 0: sumL(), 1: sumL() }, kinds = { '-1': {}, 0: {}, 1: {} }, roomKinds = { '-1': {}, 0: {}, 1: {} }, roomCounts = { '-1': {}, 0: {}, 1: {} };
  const spaces = new Set(), fragments = {};
  const withFloor = { '-1': 0, 0: 0, 1: 0 }, districts = new Map(), corr = { 0: [], '-1': [] }, widths = [], conn = {};
  const stairs = {}, voids = {}, pools = {}, stacked = { poolOverFloor: { 0: 0, 1: 0 }, poolOverPool: { 0: 0, 1: 0 } };
  let stairArea = 0, ladders = 0, planMs = 0, measureMs = 0, orphans = 0;
  const graphs = [], detours = [];
  for (const seed of [...seeds].sort((a, b) => a - b)) {
    const w = new World2(seed);
    for (const [i, j] of cells) {
      const t0 = performance.now(), plan = w.plan(i, j), t1 = performance.now(), m = measurePlan(plan, w.Y);
      planMs += t1 - t0; measureMs += performance.now() - t1;
      const dk = `${seed}:${Math.floor(i / DISTRICT)},${Math.floor(j / DISTRICT)}`;
      if (!districts.has(dk)) districts.set(dk, { '-1': 0, 0: 0, 1: 0 });
      for (const lv of LEVELS) {
        const L = m.levels[lv];
        for (const k of Object.keys(levels[lv])) levels[lv][k] += L[k];
        for (const [k, v] of Object.entries(L.kinds)) add(kinds[lv], k, v);
        for (const [k, v] of Object.entries(L.roomKinds)) add(roomKinds[lv], k, v);
        for (const [k, v] of Object.entries(m.roomCounts[lv])) add(roomCounts[lv], k, v);
        if (L.footprint > 0) withFloor[lv]++;
        districts.get(dk)[lv] += L.footprint;
      }
      for (const sp of m.spaces) {
        add(fragments, sp.kind);
        if (!spaces.has(seed + '|' + sp.spaceId)) { spaces.add(seed + '|' + sp.spaceId); add(roomCounts[sp.lv], sp.kind); }
      }
      for (const c of m.corridors) { corr[c.lv].push(c.length); widths.push(c.width); }
      add(conn, m.connections1F);
      orphans += m.orphans;
      for (const s of m.stairs) add(stairs, `${s.type} to ${s.to > 0 ? '2F' : 'B1'}`);
      for (const v of m.voids) add(voids, v);
      for (const p of m.pools) {
        const key = `${p.lv > 0 ? '2F' : p.lv < 0 ? 'B1' : '1F'} ${p.shape} ${p.deep ? 'deep' : 'wading'}`;
        pools[key] ??= { count: 0, area: 0 };
        pools[key].count++; pools[key].area += p.area;
      }
      for (const g of ['poolOverFloor', 'poolOverPool']) for (const lv of [0, 1]) stacked[g][lv] += m.stacked[g][lv];
      stairArea += m.stairArea; ladders += m.ladders;
    }
    graphs.push({ seed, cells, graph: roomGraph(w, cells) });
    detours.push(...measureClosedDetours(w, cells));
  }
  const rg = measureRoomGraphs(graphs);
  const total = { '-1': levels[-1].footprint, 0: levels[0].footprint, 1: levels[1].footprint };
  const list = [...districts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, f]) => ({ key, footprint: f, shares: shareOf(f) }));
  // counts per step-wide bin, bins in increasing order
  const hist = (xs, step) => { const h = {}; for (const x of [...xs].sort((a, b) => a - b)) add(h, `${Math.floor(x / step) * step}–${Math.floor(x / step) * step + step}`); return h; };
  return {
    sample: { seeds: [...seeds].sort((a, b) => a - b), cells: seeds.length * cells.length, cellSize: CELL2, grid: Q2, districtCells: DISTRICT },
    levels, kinds: { '-1': sortKeys(kinds[-1]), 0: sortKeys(kinds[0]), 1: sortKeys(kinds[1]) },
    roomKinds: { '-1': sortKeys(roomKinds[-1]), 0: sortKeys(roomKinds[0]), 1: sortKeys(roomKinds[1]) },
    fragments: sortKeys(fragments),
    shares: shareOf(total),
    ratios: { '2F/1F': total[0] ? total[1] / total[0] : 0, 'B1/1F': total[0] ? total[-1] / total[0] : 0, '2F/B1': total[-1] ? total[1] / total[-1] : 0 },
    cellsWithFloor: withFloor,
    districts: {
      list,
      share2F: quant(list.map((d) => d.shares[1])), shareB1: quant(list.map((d) => d.shares[-1])), share1F: quant(list.map((d) => d.shares[0])),
      no2F: list.filter((d) => d.footprint[1] === 0).length, noB1: list.filter((d) => d.footprint[-1] === 0).length,
    },
    roomTypes: { '-1': sortKeys(roomCounts[-1]), 0: sortKeys(roomCounts[0]), 1: sortKeys(roomCounts[1]) },
    corridors: { count: corr[0].length + corr[-1].length, length1F: quant(corr[0]), lengthB1: quant(corr[-1]), hist1F: hist(corr[0], 4), width: quant(widths) },
    connections1F: sortKeys(conn), orphans,
    connections: measureConnections(seeds, cells),
    rooms: rg.rooms,
    roomComponents: rg.roomComponents,
    closedDetour: summarizeClosedDetours(detours),
    stairs: sortKeys(stairs), stairArea, ladders, voids: sortKeys(voids), pools: sortKeys(pools), stacked,
    unmeasured: [
      'reachability: walkable area that cannot be reached from the start (inaccessible components) is not separated out',
      'door / opening heights and threshold steps',
      'connection degree of 2F and B1 rooms (each has one flight; no graph is built)',
      'a shared hall\'s parts outside the sampled cells (only the sampled cells\' parts are measured)',
    ],
    cost: { planMs, measureMs },
  };
}

const pct = (v) => (v * 100).toFixed(1) + '%';
const m2 = (v) => Math.round(v).toLocaleString('en-US') + ' m²';
const q = (s) => (s.n ? `n ${s.n} · min ${s.min} · p25 ${s.p25} · median ${s.median} · p75 ${s.p75} · max ${s.max}` : 'n 0');
const q90 = (s) => (s.n ? `n ${s.n} · min ${s.min} · p25 ${s.p25} · median ${s.median} · p75 ${s.p75} · p90 ${s.p90} · max ${s.max}` : 'n 0');
const qp = (s) => (s.n ? `min ${pct(s.min)} · p25 ${pct(s.p25)} · median ${pct(s.median)} · p75 ${pct(s.p75)} · max ${pct(s.max)}` : 'n 0');
const NAME = { '-1': 'B1', 0: '1F', 1: '2F' };

export function formatReport(r) {
  const out = [];
  out.push(`seeds ${r.sample.seeds.join(', ')} · ${r.sample.cells} cells of ${r.sample.cellSize} m · grid ${r.sample.grid} m · districts ${r.sample.districtCells}×${r.sample.districtCells} cells`);
  out.push('', '| floor | footprint | share | walkable | pool | deep | sealed | removed by flights/voids | same-floor overlap | cells with floor |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const lv of [0, 1, -1]) {
    const L = r.levels[lv];
    out.push(`| ${NAME[lv]} | ${m2(L.footprint)} | ${pct(r.shares[lv])} | ${m2(L.walkable)} | ${m2(L.pool)} | ${m2(L.deep)} | ${m2(L.sealed)} | ${m2(L.removed)} | ${m2(L.overlap)} | ${r.cellsWithFloor[lv]} / ${r.sample.cells} |`);
  }
  out.push('', `ratios: 2F/1F ${r.ratios['2F/1F'].toFixed(3)} · B1/1F ${r.ratios['B1/1F'].toFixed(3)} · 2F/B1 ${r.ratios['2F/B1'].toFixed(3)} (user target ≈ 0.5 · 0.5 · 1, a rough direction)`);
  out.push(`stairs ${m2(r.stairArea)} counted apart · ladders ${r.ladders}`);
  out.push('', `districts (${r.districts.list.length}): 1F share ${qp(r.districts.share1F)}`, `  2F share ${qp(r.districts.share2F)} · no 2F in ${r.districts.no2F}`, `  B1 share ${qp(r.districts.shareB1)} · no B1 in ${r.districts.noB1}`);
  out.push('', 'room kinds (count · footprint; a shared hall counts once, its parts per cell: ' + (Object.entries(r.fragments).map(([k, n]) => `${k} ${n} parts`).join(' · ') || 'none') + '):');
  for (const lv of [0, 1, -1]) out.push(`  ${NAME[lv]}: ` + Object.entries(r.roomTypes[lv]).map(([k, n]) => `${k} ${n} · ${m2(r.kinds[lv][k] ?? 0)}`).join(' | '));
  out.push('', `corridors ${r.corridors.count}: 1F length ${q(r.corridors.length1F)}`, `  B1 length ${q(r.corridors.lengthB1)}`, `  width ${q(r.corridors.width)}`, '  1F length histogram (m): ' + Object.entries(r.corridors.hist1F).map(([k, n]) => `${k}: ${n}`).join(' · '));
  out.push(`1F rooms leading nowhere (cut off from the hall and every cell edge): ${r.orphans}`);
  out.push('1F ways out per cell: ' + Object.entries(r.connections1F).map(([k, n]) => `${k}: ${n}`).join(' · '));
  const c = r.connections;
  out.push(`links between halls ${c.uniqueEdges} (${Object.entries(c.modeCounts).map(([k, n]) => `${k} ${n}`).join(' · ')}; inside shared halls ${c.seams}; out of the sample ${c.boundaryEdges}) · eligible for a connector room ${c.eligibleEdges}`,
    `  corridor between halls, every link (a connector room not counted, a closed link left out: not the walk): before ${q(c.linkRunBefore)}`, `    after ${q(c.linkRunAfter)}`,
    `  converted links: before ${q(c.corridorRunBefore)} · after ${q(c.corridorRunAfter)} · ${c.shortening.total} m less (${c.shortening.percent.toFixed(1)}%)`,
    `  straight ordinary corridor links: ${q(c.ordinaryRun)} · over 30 m ${c.ordinaryRun.over30} · over 36 m ${c.ordinaryRun.over36}`,
    `  corridors 7 m or more off the cell's middle line: ${Object.entries(c.offsets).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none'}`,
    `  turning corridors (hall wall to hall wall along the middle): dogleg ${q(c.routes.dogleg)} · winding ${q(c.routes.winding)}`,
    `  diagonal corridors across a district: ${c.diagonals[0] + c.diagonals[1]} (one way round ${c.diagonals[0]} · the other ${c.diagonals[1]})`,
    `  room graph edges: ${r.rooms.edges}`, `  room graph gaps (m): ${q(r.rooms.gap)}`, `  room graph direct (gap = 0): ${pct(r.rooms.direct)}`,
    `  room graph near (gap <= 6 m): ${pct(r.rooms.near)}`, `  room graph long (gap > 30 m): ${pct(r.rooms.long)}`,
    `  1F rooms per sampled 2x2 district: ${q(r.rooms.perDistrict)}`, `  1F logical room area median: ${m2(r.rooms.areaMedian)}`,
    `  longest corridor stretch on the way between neighbouring halls (no room between): ${q(c.stretch)} · over 36 m ${c.stretch.over36}`,
    `  walk between neighbouring halls (estimated on the graph of links, centre to centre, the shortest way, through rooms and round closed edges): ${q(c.walk.all)} · closed pairs ${q(c.walk.closed)} · mean ${c.walk.mean.toFixed(2)} m · p90 ${c.walk.p90.toFixed(2)} m`,
    `  closed edges ${c.closed.count}: their run ${q(c.closed.closedRun)} · way round: hops ${q(c.closed.hops)} · corridor on it ${q(c.closed.detourRun)}`,
    `  closed detour added walk (m): ${q90(r.closedDetour)} · unreachable ${r.closedDetour.unreachable}`,
    '  graph pieces per seed: ' + Object.entries(c.components).map(([s, n]) => `${s}: ${n}`).join(' · '),
    '  room graph components per seed: ' + (Object.keys(r.roomComponents).length ? Object.entries(r.roomComponents).sort(([a], [b]) => a - b).map(([s, n]) => `${s}: ${n}`).join(' · ') : 'none'));
  out.push('stairs: ' + Object.entries(r.stairs).map(([k, n]) => `${k} ${n}`).join(' · '), 'voids: ' + Object.entries(r.voids).map(([k, n]) => `${k} ${n}`).join(' · '));
  out.push('pools (count · area): ' + Object.entries(r.pools).map(([k, p]) => `${k} ${p.count} · ${m2(p.area)}`).join(' | '));
  out.push(`stacking: 2F water over 1F floor ${m2(r.stacked.poolOverFloor[1])} · 1F water over B1 floor ${m2(r.stacked.poolOverFloor[0])} · 2F pool over 1F pool ${m2(r.stacked.poolOverPool[1])} · 1F pool over B1 pool ${m2(r.stacked.poolOverPool[0])}`);
  out.push('', 'not measured: ' + r.unmeasured.join('; '));
  out.push(`cost: planning ${r.cost.planMs.toFixed(0)} ms · measuring ${r.cost.measureMs.toFixed(0)} ms`);
  return out.join('\n');
}

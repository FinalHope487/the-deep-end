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
  return {
    levels, stairArea, stacked, roomCounts, spaces, corridors,
    stairs: flights.map((f) => ({ type: f.turn ? 'switchback' : 'straight', to: f.lo < 0 ? -1 : 1 })),
    ladders: (plan.ladders ?? []).length,
    voids: voids.map((v) => v.kind),
    pools: pools.map((p, n) => ({ lv: p.lv, shape: p.shape.type, deep: poolDeep.has(n), area: (poolArea[n] ?? 0) * SQ })),
    // ways out of the cell's 1F: its corridors that run out through a cell edge, and the open seams of shared halls and
    // connector rooms (a corridor that ends in a connector room goes out through the room's seam)
    connections1F: rooms.filter((o) => o.kind === 'corridor' && (o.x0 === plan.ox || o.x1 === plan.ox + CELL2 || o.z0 === plan.oz || o.z1 === plan.oz + CELL2)).length
      + rooms.reduce((t, o) => t + (o.seams ? Object.values(o.seams).filter(Boolean).length : 0), 0),
  };
}

const quant = (xs) => {
  const s = [...xs].sort((a, b) => a - b), at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return s.length ? { n: s.length, min: s[0], p25: at(0.25), median: at(0.5), p75: at(0.75), max: s[s.length - 1] } : { n: 0 };
};
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const shareOf = (f) => { const t = f[-1] + f[0] + f[1]; return t ? { '-1': f[-1] / t, 0: f[0] / t, 1: f[1] / t } : { '-1': 0, 0: 0, 1: 0 }; };

// the links between halls through the cell edges inside the sample (World2.connectionOf; edges out of the sample are left
// out and counted): their modes, the corridor run of each (hall to hall, less the connector room between), and per seed the
// number of pieces of the graph of the sampled halls and connector rooms (a shared hall is one node). A closed edge is left
// out of the runs after and of the graph; its way round (the district's three other inner edges) is measured apart
function measureConnections(seeds, cells) {
  const inSample = new Set(cells.map(([i, j]) => i + ',' + j)), modeCounts = {}, before = [], after = [], runBefore = [], runAfter = [], components = {};
  const ordinary = [], detour = [], offsets = {}, routes = { dogleg: [], winding: [] }, diagonals = { 0: 0, 1: 0 };   // offsets: links whose corridor runs 7 m or more off the middle line, by axis and side
  // corridor left on a link: hall to hall, less a connector room between (0 inside a shared hall)
  const left = (c) => (c.mode === 'seam' ? 0 : c.gaps[0] + c.gaps[1] - (c.parts ?? []).reduce((t, p) => t + (c.axis === 'x' ? p.x1 - p.x0 : p.z1 - p.z0), 0));
  let seams = 0, eligible = 0, boundary = 0;
  for (const seed of seeds) {
    const w = new World2(seed), parent = new Map();
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
  let stairArea = 0, ladders = 0, planMs = 0, measureMs = 0;
  for (const seed of seeds) {
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
  }
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
    connections1F: sortKeys(conn),
    connections: measureConnections(seeds, cells),
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
  out.push('1F ways out per cell: ' + Object.entries(r.connections1F).map(([k, n]) => `${k}: ${n}`).join(' · '));
  const c = r.connections;
  out.push(`links between halls ${c.uniqueEdges} (${Object.entries(c.modeCounts).map(([k, n]) => `${k} ${n}`).join(' · ')}; inside shared halls ${c.seams}; out of the sample ${c.boundaryEdges}) · eligible for a connector room ${c.eligibleEdges}`,
    `  hall-to-hall corridor run, every link: before ${q(c.linkRunBefore)}`, `    after ${q(c.linkRunAfter)}`,
    `  converted links: before ${q(c.corridorRunBefore)} · after ${q(c.corridorRunAfter)} · ${c.shortening.total} m less (${c.shortening.percent.toFixed(1)}%)`,
    `  straight ordinary corridor links: ${q(c.ordinaryRun)} · over 30 m ${c.ordinaryRun.over30} · over 36 m ${c.ordinaryRun.over36}`,
    `  corridors 7 m or more off the cell's middle line: ${Object.entries(c.offsets).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none'}`,
    `  turning corridors (hall wall to hall wall along the middle): dogleg ${q(c.routes.dogleg)} · winding ${q(c.routes.winding)}`,
    `  diagonal corridors across a district: ${c.diagonals[0] + c.diagonals[1]} (one way round ${c.diagonals[0]} · the other ${c.diagonals[1]})`,
    `  closed edges ${c.closed.count}: their run ${q(c.closed.closedRun)} · way round: hops ${q(c.closed.hops)} · corridor on it ${q(c.closed.detourRun)}`,
    '  graph pieces per seed: ' + Object.entries(c.components).map(([s, n]) => `${s}: ${n}`).join(' · '));
  out.push('stairs: ' + Object.entries(r.stairs).map(([k, n]) => `${k} ${n}`).join(' · '), 'voids: ' + Object.entries(r.voids).map(([k, n]) => `${k} ${n}`).join(' · '));
  out.push('pools (count · area): ' + Object.entries(r.pools).map(([k, p]) => `${k} ${p.count} · ${m2(p.area)}`).join(' | '));
  out.push(`stacking: 2F water over 1F floor ${m2(r.stacked.poolOverFloor[1])} · 1F water over B1 floor ${m2(r.stacked.poolOverFloor[0])} · 2F pool over 1F pool ${m2(r.stacked.poolOverPool[1])} · 1F pool over B1 pool ${m2(r.stacked.poolOverPool[0])}`);
  out.push('', 'not measured: ' + r.unmeasured.join('; '));
  out.push(`cost: planning ${r.cost.planMs.toFixed(0)} ms · measuring ${r.cost.measureMs.toFixed(0)} ms`);
  return out.join('\n');
}

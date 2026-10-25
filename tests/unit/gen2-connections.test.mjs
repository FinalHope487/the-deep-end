// Generator v2, Stage 02B: the connection through each cell edge, and the connector rooms that take the middle of some of
// the long ones (hall → short corridor → connector room across the edge → short corridor → hall)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2, CELL2, Q2, PARAPET, cellRaster, primaryHall } from '../../js/gen2.js';
import { CORPUS, measureWalks } from '../../js/gen2-measure.js';
import { legacyReport } from './gen2-legacy-report.mjs';
import { Player } from '../../js/player.js';

const next = (i, j, axis) => (axis === 'x' ? [i + 1, j] : [i, j + 1]);
const inCorpus = (i, j) => CORPUS.cells.some(([a, b]) => a === i && b === j);
const overlap = (a, b, m = 0) => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.z0 < b.z1 + m && b.z0 < a.z1 + m;
// every edge between two cells of the corpus, with its connection
const EDGES = [];
for (const s of CORPUS.seeds) {
  const w = new World2(s, { clusterShare: 0 });
  for (const [i, j] of CORPUS.cells) for (const axis of ['x', 'z']) {
    if (inCorpus(...next(i, j, axis))) EDGES.push({ s, i, j, axis, c: w.connectionOf?.(i, j, axis) });
  }
}
const CONV = EDGES.filter((e) => e.c?.mode === 'connector-room');
const tagOf = (e) => `seed ${e.s} edge ${e.axis} ${e.i},${e.j}`;
// the edge's geometry seen from its two cells: the halls, where the edge is, and each cell's room of that connection
function sides(w, e) {
  const [ni, nj] = next(e.i, e.j, e.axis), X = e.axis === 'x', edge = (X ? ni : nj) * CELL2;
  const A = w.plan(e.i, e.j), B = w.plan(ni, nj);
  const conn = (plan) => plan.rooms.filter((o) => o.spaceId && o.spaceId === e.c.connectorSpaceId);
  return { X, edge, A, B, hA: primaryHall(A), hB: primaryHall(B), fA: conn(A), fB: conn(B), ni, nj };
}

test('connections: one record per cell edge, from the seed alone: the same from both cells, whichever is planned first', () => {
  assert.ok(EDGES.length > 800 && EDGES.every((e) => e.c), 'World2.connectionOf is missing');
  const fresh = new World2(42, { clusterShare: 0 }), had = [...fresh.plans.keys()];   // the spawn's cell is planned already
  for (const axis of ['x', 'z']) fresh.connectionOf(20, -20, axis);
  assert.deepEqual([...fresh.plans.keys()], had, 'resolving a connection built a plan');
  for (const e of EDGES.filter((_, k) => k % 7 === 0)) {
    const [ni, nj] = next(e.i, e.j, e.axis), w = new World2(e.s, { clusterShare: 0 });
    w.plan(ni, nj); w.plan(e.i, e.j);   // the far cell first
    assert.equal(JSON.stringify(w.connectionOf(e.i, e.j, e.axis)), JSON.stringify(e.c), tagOf(e));
    assert.equal(e.c.id, `v2:edge:${e.axis}:${e.i},${e.j}`, tagOf(e));
    assert.deepEqual([e.c.fromSpaceId, e.c.toSpaceId], [primaryHall(w.plan(e.i, e.j)).spaceId, primaryHall(w.plan(ni, nj)).spaceId], `${tagOf(e)}: its ends are the two halls' spaces`);
  }
});

test('connections: a cell edge inside one giant or L hall is that hall\'s own opening, never a connector room', () => {
  const inner = EDGES.filter((e) => e.c.fromSpaceId === e.c.toSpaceId);
  assert.ok(inner.length >= 20, `${inner.length} edges inside a shared hall`);
  for (const e of inner) assert.equal(e.c.mode, 'seam', tagOf(e));
  for (const e of EDGES) if (e.c.fromSpaceId !== e.c.toSpaceId) assert.notEqual(e.c.mode, 'seam', tagOf(e));
});

test('connections: some long links between two halls become connector rooms, the others stay corridors', () => {
  assert.ok(CONV.length >= 20, `${CONV.length} connector rooms`);
  assert.ok(EDGES.filter((e) => e.c.mode === 'corridor').length >= 100, 'ordinary corridors are left too');
  for (const e of CONV) {
    const { X, edge, hA, hB } = sides(new World2(e.s, { clusterShare: 0 }), e);
    const gaps = [edge - (X ? hA.x1 : hA.z1), (X ? hB.x0 : hB.z0) - edge];
    // both halls 12 m or more from the edge, or 8 m or more on a link with more than 30 m of corridor
    assert.ok(gaps.every((g) => g >= 12) || gaps.every((g) => g >= 8) && gaps[0] + gaps[1] > 30, `${tagOf(e)}: a hall only ${Math.min(...gaps)} m from the edge`);
  }
});

test('connections: a long link with a hall 8–12 m from the edge gets a shallower room on that side; under 8 m it stays a corridor', () => {
  // at 32bf56b: seed 3 (11.5 | 25 m), seed 2 (8 | 23.5 m), seed 1 in negative cells (24.5 | 9 m); seed 1 (24 | 6.5 m) stays
  for (const [s, i, j, axis] of [[3, 2, 3, 'x'], [2, 0, 3, 'x'], [1, -2, -4, 'x']]) assert.equal(new World2(s, { clusterShare: 0 }).connectionOf(i, j, axis).mode, 'connector-room', `seed ${s} edge ${axis} ${i},${j}`);
  assert.equal(new World2(1, { clusterShare: 0 }).connectionOf(0, 0, 'z').mode, 'corridor');
  const run = (e) => e.c.gaps[0] + e.c.gaps[1], narrow = EDGES.filter((e) => e.c.gaps && run(e) > 30 && Math.min(...e.c.gaps) < 12);
  assert.ok(narrow.length >= 40, `${narrow.length} long links with a hall under 12 m from the edge`);   // edges inside the sample (61 of 64 counting its border)
  for (const e of narrow) assert.equal(e.c.mode, Math.min(...e.c.gaps) >= 8 ? 'connector-room' : 'corridor', `${tagOf(e)}: gaps ${e.c.gaps}`);
  assert.ok(narrow.filter((e) => e.c.mode === 'connector-room').length >= 40);
});

test('connections: every eligible link longer than 30 m between its halls is a connector room; shorter ones still vary by seed', () => {
  // corridors at 32bf56b that lost the 40% roll: seed 1, 42 m and 45.5 m
  for (const [s, i, j, axis] of [[1, -4, -4, 'x'], [1, 0, -3, 'z']]) assert.equal(new World2(s, { clusterShare: 0 }).connectionOf(i, j, axis).mode, 'connector-room', `seed ${s} edge ${axis} ${i},${j}`);
  const run = (e) => e.c.gaps[0] + e.c.gaps[1], eligible = EDGES.filter((e) => e.c.eligible);
  const long = eligible.filter((e) => run(e) > 30), short = eligible.filter((e) => run(e) <= 30);
  assert.ok(long.length >= 200 && short.length >= 50, `${long.length} long, ${short.length} short eligible links`);
  for (const e of long) assert.equal(e.c.mode, 'connector-room', `${tagOf(e)}: ${run(e)} m of corridor`);
  const conv = short.filter((e) => e.c.mode === 'connector-room').length;
  assert.ok(conv > 0 && conv < short.length, `${conv} of ${short.length} short eligible links converted`);
});

test('connector rooms: one room across the cell edge, a part in each cell, much wider than a corridor, one ceiling', () => {
  assert.ok(CONV.length > 0, 'no connector rooms');
  for (const e of CONV) {
    const w = new World2(e.s, { clusterShare: 0 }), { X, edge, fA, fB, ni, nj } = sides(w, e), tag = tagOf(e);
    assert.deepEqual([fA.length, fB.length], [1, 1], `${tag}: one part in each cell`);
    const [a, b] = [fA[0], fB[0]];
    for (const [o, i, j] of [[a, e.i, e.j], [b, ni, nj]]) {
      assert.equal(o.kind, 'connector-room', tag);
      assert.equal(o.lv, 0, tag);
      assert.ok(o.x0 >= i * CELL2 && o.x1 <= (i + 1) * CELL2 && o.z0 >= j * CELL2 && o.z1 <= (j + 1) * CELL2, `${tag}: a part leaves its cell`);
    }
    // 8–10 m into each cell, less where the hall is nearer: 4 m or more of corridor stays between them
    for (const [o, gap] of [[a, e.c.gaps[0]], [b, e.c.gaps[1]]]) {
      const depth = X ? o.x1 - o.x0 : o.z1 - o.z0;
      assert.ok(depth >= Math.min(8, gap - 4) && depth <= Math.min(10, gap - 4) && depth >= 4, `${tag}: ${depth} m deep, the hall ${gap} m from the edge`);
    }
    assert.ok(X ? a.x1 === edge && b.x0 === edge : a.z1 === edge && b.z0 === edge, `${tag}: the parts do not meet at the edge`);
    assert.deepEqual(X ? [a.z0, a.z1] : [a.x0, a.x1], X ? [b.z0, b.z1] : [b.x0, b.x1], `${tag}: the parts are not one room`);
    const width = X ? a.z1 - a.z0 : a.x1 - a.x0;
    assert.ok(width >= 12 && width <= 16, `${tag}: ${width} m wide`);
    assert.equal(a.ceil, b.ceil, `${tag}: a ceiling step across the edge`);
  }
});

test('connector rooms: both corridors end in the room, short of the edge, at least 10 m less corridor and 25% less over all', () => {
  assert.ok(CONV.length >= 20, `${CONV.length} connector rooms`);
  let before = 0, after = 0;
  for (const e of CONV) {
    const w = new World2(e.s, { clusterShare: 0 }), { X, edge, A, B, hA, hB, fA, fB } = sides(w, e), tag = tagOf(e), [a, b] = [fA[0], fB[0]];
    for (const [plan, f, side] of [[A, a, 1], [B, b, -1]]) {
      const cors = plan.rooms.filter((o) => o.kind === 'corridor' && overlap(o, f));
      assert.equal(cors.length, 1, `${tag}: ${cors.length} corridors into the room`);
      const c = cors[0], near = side > 0 ? (X ? f.x0 : f.z0) : (X ? f.x1 : f.z1), end = side > 0 ? (X ? c.x1 : c.z1) : (X ? c.x0 : c.z0);
      assert.ok((end - near) * side >= 1, `${tag}: the corridor does not run 1 m into the room`);
      assert.ok((edge - end) * side >= 1, `${tag}: the corridor still runs to the edge`);
      assert.ok(X ? c.z0 >= f.z0 && c.z1 <= f.z1 : c.x0 >= f.x0 && c.x1 <= f.x1, `${tag}: the corridor is wider than the room`);
    }
    const gaps = [edge - (X ? hA.x1 : hA.z1), (X ? hB.x0 : hB.z0) - edge], left = [(X ? a.x0 - hA.x1 : a.z0 - hA.z1), (X ? hB.x0 - b.x1 : hB.z0 - b.z1)];
    assert.ok(left.every((g) => g >= 4), `${tag}: the room within ${Math.min(...left)} m of a hall`);
    const was = gaps[0] + gaps[1], now = left[0] + left[1];
    assert.ok(was - now >= 10, `${tag}: only ${was - now} m less corridor`);
    before += was; after += now;
  }
  assert.ok(after <= before * 0.75, `corridor run ${before} → ${after} m`);
});

test('connector rooms: no wall and no ceiling step across the edge, over the room\'s whole width', () => {
  assert.ok(CONV.length >= 20, `${CONV.length} connector rooms`);
  for (const e of CONV.filter((_, k) => k % 3 === 0)) {
    const w = new World2(e.s, { clusterShare: 0 }), { X, fA, ni, nj } = sides(w, e), tag = tagOf(e), a = fA[0];
    const RP = cellRaster(w, e.i, e.j, 0), RQ = cellRaster(w, ni, nj, 0), n = RP.n, lo = X ? a.z0 : a.x0, hi = X ? a.z1 : a.x1;
    let cells = 0;
    for (let t = 0; t < n; t++) {
      const c = (X ? RP.oz : RP.ox) + (t + 0.5) * Q2;
      if (c < lo || c >= hi) continue;
      const kp = X ? t * n + n - 1 : (n - 1) * n + t, kq = X ? t * n : t;
      assert.equal(RP.inside[kp] && RQ.inside[kq], 1, `${tag}: a wall across the room at ${c}`);
      assert.equal(RP.ceil[kp], RQ.ceil[kq], `${tag}: a ceiling step at ${c}`);
      cells++;
    }
    assert.equal(cells * Q2, hi - lo, tag);
  }
});

test('connector rooms: clear of every other room, flight, pool, void, window and column of their cells', () => {
  assert.ok(CONV.length >= 20, `${CONV.length} connector rooms`);
  for (const e of CONV) {
    const w = new World2(e.s, { clusterShare: 0 }), { A, B, fA, fB } = sides(w, e), tag = tagOf(e);
    for (const [plan, f] of [[A, fA[0]], [B, fB[0]]]) {
      for (const o of plan.rooms) {
        if (o === f || o.lv !== 0 || o.kind === 'corridor' && overlap(o, f) && plan.rooms.filter((q) => q.kind === 'corridor' && overlap(q, f)).length === 1) continue;
        assert.ok(!overlap(o, f), `${tag}: a ${o.kind} in the connector room`);
      }
      assert.ok(!plan.flights.some((fl) => overlap(fl, f) || overlap(fl.hallEntry, f)), `${tag}: a flight`);
      assert.ok(!plan.pools.some((p) => p.lv === 0 && overlap({ x0: p.shape.cx - p.shape.hw, x1: p.shape.cx + p.shape.hw, z0: p.shape.cz - p.shape.hd, z1: p.shape.cz + p.shape.hd }, f)), `${tag}: a pool`);
      assert.ok(!plan.voids.some((v) => v.lv === -1 && overlap({ x0: v.x0 - PARAPET, x1: v.x1 + PARAPET, z0: v.z0 - PARAPET, z1: v.z1 + PARAPET }, f)), `${tag}: a void`);
      assert.ok(!plan.windows.some((wn) => overlap(wn.front, f)), `${tag}: a window`);
      assert.ok(!plan.columns.some((c) => c.lv === 0 && overlap({ x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r }, f)), `${tag}: a column`);
    }
  }
});

test('connector rooms: every lamp hangs under the room, on one grid across the edge, never over a wall', () => {
  assert.ok(CONV.length >= 20, `${CONV.length} connector rooms`);
  let lamps = 0;
  for (const e of CONV) {
    const w = new World2(e.s, { clusterShare: 0 }), { fA, fB } = sides(w, e), [a, b] = [fA[0], fB[0]], room = { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) };
    for (const l of [...a.lamps, ...b.lamps]) {
      lamps++;
      assert.ok(l.x >= room.x0 && l.x + l.w <= room.x1 && l.z >= room.z0 && l.z + l.d <= room.z1, `${tagOf(e)}: a lamp at ${l.x},${l.z} over a wall`);
      const g = e.c.lampGrid, cx = l.x + l.w / 2 - g.ox - g.step / 2, cz = l.z + l.d / 2 - g.oz - g.step / 2;
      assert.ok(Math.abs(cx / g.step - Math.round(cx / g.step)) < 1e-6 && Math.abs(cz / g.step - Math.round(cz / g.step)) < 1e-6, `${tagOf(e)}: a lamp off the room's grid`);
    }
  }
  assert.ok(lamps >= CONV.length * 2, `${lamps} lamps`);
});

test('connections: no link between two halls is lost: each side has a corridor or the connector room open through the edge', () => {
  for (const e of EDGES.filter((q) => q.c.mode !== 'seam')) {
    const w = new World2(e.s, { clusterShare: 0 }), { X, edge, A, B } = sides(w, e), tag = tagOf(e);
    const through = (plan, o) => o.lv === 0 && !o.diagId && !o.spaceId?.startsWith('v2:space:diag:') && (X ? o.x0 === edge || o.x1 === edge : o.z0 === edge || o.z1 === edge);   // a diagonal's middle room is no link of this edge
    const ta = A.rooms.filter((o) => through(A, o)), tb = B.rooms.filter((o) => through(B, o));
    if (e.c.mode === 'closed') { assert.deepEqual([ta.length, tb.length], [0, 0], `${tag}: a closed edge has a way through`); continue; }
    const want = e.c.mode === 'connector-room' ? 'connector-room' : 'corridor';
    assert.ok(ta.length === 1 && tb.length === 1, `${tag}: ${ta.length} and ${tb.length} rooms through the edge`);
    assert.deepEqual([ta[0].kind, tb[0].kind], [want, want], tag);
    assert.deepEqual(X ? [ta[0].z0, ta[0].z1] : [ta[0].x0, ta[0].x1], X ? [tb[0].z0, tb[0].z1] : [tb[0].x0, tb[0].x1], `${tag}: the two sides do not line up`);
  }
});

test('connections: the graph of halls and connector rooms is one piece in every seed, and the report agrees with the plans', () => {
  const rep = legacyReport(CORPUS), c = rep.connections;
  assert.ok(c, 'no connections in the report');
  const links = EDGES.filter((e) => e.c.mode !== 'seam');
  assert.equal(c.uniqueEdges, links.length);
  assert.equal(c.convertedEdges, CONV.length);
  const closed = links.filter((e) => e.c.mode === 'closed').length;
  assert.deepEqual(c.modeCounts, { closed, corridor: links.length - CONV.length - closed, 'connector-room': CONV.length });
  assert.ok(c.eligibleEdges >= c.convertedEdges, `${c.eligibleEdges} eligible`);
  assert.deepEqual(Object.values(c.components), CORPUS.seeds.map(() => 1), `components ${JSON.stringify(c.components)}`);
  assert.equal(rep.orphans, 0, '1F rooms that lead nowhere');
  assert.ok(c.shortening.percent >= 25 && c.corridorRunAfter.total < c.corridorRunBefore.total, JSON.stringify(c.shortening));
  // one room per connector with a part in the sample (those on the sample's border included)
  let rooms = 0;
  for (const s of CORPUS.seeds) {
    const w = new World2(s, { clusterShare: 0 }), ids = new Set();
    for (const [i, j] of CORPUS.cells) for (const [ei, ej, axis] of [[i, j, 'x'], [i - 1, j, 'x'], [i, j, 'z'], [i, j - 1, 'z']]) {
      const k = w.connectionOf(ei, ej, axis);
      if (k.mode === 'connector-room') ids.add(k.connectorSpaceId);
    }
    rooms += ids.size;
    // a long diagonal's middle room is a connector room too (one per district with a diagonal across sampled cells)
    for (const key of new Set(CORPUS.cells.map(([i, j]) => `${Math.floor(i / 2)},${Math.floor(j / 2)}`))) {
      const d = w.diagonalOf(...key.split(',').map(Number));
      if (d?.middleRoom && d.cells.every((c) => inCorpus(c.i, c.j))) rooms++;
    }
  }
  assert.ok(rooms > CONV.length, 'no connector room on the border of the sample');
  assert.equal(rep.roomTypes[0]['connector-room'], rooms, 'a connector room counted more than once, or not at all');
});

test('walks: every two neighbouring halls have a shortest way between them, never shorter than the gap between their walls, closed pairs included', () => {
  const seed = CORPUS.seeds[0], w = new World2(seed, { clusterShare: 0 }), walks = measureWalks(w, CORPUS.cells);
  const pairs = EDGES.filter((e) => e.s === seed);
  assert.equal(walks.length, pairs.length);
  for (const { i, j, axis, walk, closed } of walks) {
    const c = w.connectionOf(i, j, axis), [ni, nj] = axis === 'x' ? [i + 1, j] : [i, j + 1];
    const A = w.hallOf(i, j), B = w.hallOf(ni, nj), X = axis === 'x';
    const gap = c.mode === 'seam' ? 0 : (X ? B.x0 - A.x1 : B.z0 - A.z1);
    assert.ok(Number.isFinite(walk) && walk >= gap, `${i},${j},${axis} ${c.mode}: walk ${walk} < gap ${gap}`);
    assert.equal(closed, c.mode === 'closed');
    // a connector room is walked through: the halls are no nearer than with a straight corridor at the same opening
    if (c.mode === 'connector-room') assert.ok(walk >= (X ? (B.x0 + B.x1 - A.x0 - A.x1) / 2 : (B.z0 + B.z1 - A.z0 - A.z1) / 2), `${i},${j},${axis}: connector shorter than centre to centre`);
  }
  assert.ok(walks.some((p) => p.closed), 'no closed pair in the first seed');
  const rep = legacyReport({ seeds: [seed], cells: CORPUS.cells }).connections.walk;
  assert.equal(rep.all.n, walks.length);
  assert.equal(rep.closed.n, walks.filter((p) => p.closed).length);
});

test('connector rooms: the same plans after the cache has dropped them, negative cells included', () => {
  const neg = CONV.find((e) => e.i < 0 && e.j < 0) ?? CONV.find((e) => e.i < 0 || e.j < 0);
  assert.ok(neg, 'no connector room in negative cells');
  const w = new World2(neg.s, { clusterShare: 0 }), [ni, nj] = next(neg.i, neg.j, neg.axis), first = JSON.stringify([w.plan(neg.i, neg.j), w.plan(ni, nj)]);
  for (let k = 0; k < 450; k++) w.plan(100 + k, 40);
  assert.equal(w.plans.has(neg.i + ',' + neg.j), false, 'the plan is still cached');
  assert.equal(JSON.stringify([w.plan(ni, nj), w.plan(neg.i, neg.j)].reverse()), first);
});

// ---------- 02B-4: in a 2×2 district (cells 2a..2a+1, 2b..2b+1) one ordinary corridor of its four inner edges may close ----------
const district = (i, j) => [Math.floor(i / 2), Math.floor(j / 2)];
const innerEdges = (a, b) => [[2 * a, 2 * b, 'x'], [2 * a, 2 * b + 1, 'x'], [2 * a, 2 * b, 'z'], [2 * a + 1, 2 * b, 'z']];
const CLOSED = EDGES.filter((e) => e.c.mode === 'closed');

test('pruning: at most one corridor closes per 2×2 district, the shortest ordinary one inside it; never a seam, a connector room or an edge between districts', () => {
  assert.ok(CLOSED.length >= 64, `${CLOSED.length} closed edges`);
  for (const e of CLOSED) {
    const [a, b] = district(e.i, e.j), tag = tagOf(e);
    assert.deepEqual(district(...next(e.i, e.j, e.axis)), [a, b], `${tag}: closed between two districts`);
    const w = new World2(e.s, { clusterShare: 0 }), inner = innerEdges(a, b).map(([i, j, axis]) => w.connectionOf(i, j, axis));
    assert.equal(inner.filter((c) => c.mode === 'closed').length, 1, `${tag}: more than one closed in its district`);
    const run = (c) => c.gaps[0] + c.gaps[1];
    for (const c of inner) if (c.mode === 'corridor') assert.ok(run(c) >= run(e.c), `${tag}: a shorter corridor ${c.id} stays open`);
    assert.equal(e.c.fromSpaceId !== e.c.toSpaceId, true, tag);
  }
  // some districts keep all four, and cells now differ in how many ways they have out
  const districts = new Set(EDGES.map((e) => `${e.s}:${district(e.i, e.j)}`)), pruned = new Set(CLOSED.map((e) => `${e.s}:${district(e.i, e.j)}`));
  assert.ok(pruned.size < districts.size, 'every district lost a corridor');
  const ways = Object.keys(legacyReport({ seeds: [CORPUS.seeds[0]], cells: CORPUS.cells }).connections1F);
  assert.ok(ways.length >= 2, `ways out per cell: ${ways}`);
});

test('pruning: the same closed edges whichever cell is planned first, after the cache dropped them, in negative districts too', () => {
  const neg = CLOSED.find((e) => e.i < 0 && e.j < 0);
  assert.ok(neg, 'no closed edge in a negative district');
  const w = new World2(neg.s, { clusterShare: 0 }), [ni, nj] = next(neg.i, neg.j, neg.axis);
  w.plan(ni, nj);
  assert.equal(w.connectionOf(neg.i, neg.j, neg.axis).mode, 'closed');
  const first = JSON.stringify([w.plan(neg.i, neg.j), w.plan(ni, nj)]);
  for (let k = 0; k < 450; k++) w.plan(100 + k, 40);
  assert.equal(JSON.stringify([w.plan(ni, nj), w.plan(neg.i, neg.j)].reverse()), first);
});

// the corridor of a link in each of its two cells: from 1 m inside the hall out towards the edge
function corridorsOf(w, e) {
  const { X, A, B, hA, hB } = sides(w, e);
  const a = A.rooms.filter((o) => o.kind === 'corridor' && !o.diagId && (X ? o.x0 === hA.x1 - 1 && o.x1 > hA.x1 : o.z0 === hA.z1 - 1 && o.z1 > hA.z1));
  const b = B.rooms.filter((o) => o.kind === 'corridor' && !o.diagId && (X ? o.x1 === hB.x0 + 1 && o.x0 < hB.x0 : o.z1 === hB.z0 + 1 && o.z0 < hB.z0));
  return { X, a, b, hA, hB };
}
const ACTIVE = EDGES.filter((e) => (e.c.mode === 'corridor' || e.c.mode === 'connector-room') && !e.c.route);   // a route's two ends lie apart on purpose

test('portals: a link\'s corridor lines up across the edge, inside both halls; some sit 7 m or more off the middle, on both axes and both sides', () => {
  const seen = new Map(), off = [];
  for (const e of ACTIVE) {
    const w = seen.get(e.s) ?? new World2(e.s, { clusterShare: 0 }), tag = tagOf(e);
    seen.set(e.s, w);
    const { X, a, b, hA, hB } = corridorsOf(w, e);
    assert.deepEqual([a.length, b.length], [1, 1], `${tag}: one corridor out of each hall`);
    const across = (o) => (X ? [o.z0, o.z1] : [o.x0, o.x1]);
    assert.deepEqual(across(a[0]), across(b[0]), `${tag}: the two corridors do not line up`);
    const [c0, c1] = across(a[0]), lo = Math.max(...[hA, hB].map((h) => across(h)[0])), hi = Math.min(...[hA, hB].map((h) => across(h)[1]));
    assert.ok(c0 >= lo && c1 <= hi, `${tag}: the corridor ${c0}..${c1} leaves the halls' ${lo}..${hi}`);
    // a connector room is offset by its body (its narrow stubs sit a quarter metre off the body's middle at most)
    const room = e.c.mode === 'connector-room' ? across(e.c.parts[0]) : [c0, c1];
    const mid = (X ? e.j : e.i) * CELL2 + CELL2 / 2, offset = (room[0] + room[1]) / 2 - mid;
    if (Math.abs(offset) < 7) continue;
    off.push({ e, offset });
    // well inside both halls: 2 m of wall beside the mouth, and a connector room's whole width inside them too
    assert.ok(room[0] >= lo + 2 && room[1] <= hi - 2, `${tag}: offset ${offset}: ${room[0]}..${room[1]} within 2 m of the halls' ${lo}..${hi}`);
  }
  assert.ok(off.length >= 24, `only ${off.length} portals 7 m or more off the middle`);
  assert.ok(off.length < ACTIVE.length / 4, `${off.length} of ${ACTIVE.length} offset: no longer a minority`);
  for (const axis of ['x', 'z']) for (const sign of [1, -1]) {
    assert.ok(off.some(({ e, offset }) => e.axis === axis && Math.sign(offset) === sign), `no ${sign > 0 ? '+' : '-'} offset on ${axis} edges`);
  }
  assert.ok(off.some(({ e }) => e.c.mode === 'connector-room') && off.some(({ e }) => e.c.mode === 'corridor'), 'offsets on both corridors and connector rooms');
});

// a body walks a route's centreline from inside one hall to inside the other, half a metre at a time, on the 1F floor
function walksAlong(w, line) {
  const p = new Player();
  for (let k = 1; k < line.length; k++) {
    const [x0, z0] = line[k - 1], [x1, z1] = line[k], n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / Q2));
    for (let s = 0; s <= n; s++) {
      const x = x0 + ((x1 - x0) * s) / n, z = z0 + ((z1 - z0) * s) / n;
      p.reset(x, z, 0, 0);
      if (w.surfaceAt(x, z, 0)?.h !== 0 || !p.canStand(w, x, z, 0)) return `stuck at ${x},${z}`;
    }
  }
  return null;
}
// a route's pieces: axis-aligned, on the Q2 grid, each overlapping the next by the corridor's whole width
function checkPieces(rects, w, tag) {
  for (const o of rects) for (const v of [o.x0, o.x1, o.z0, o.z1]) assert.equal(v / Q2, Math.round(v / Q2), `${tag}: ${v} off the grid`);
  for (let k = 1; k < rects.length; k++) {
    const a = rects[k - 1], b = rects[k], ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    assert.ok(ox >= w && oz >= w, `${tag}: piece ${k} meets the one before over ${ox} × ${oz}, under the corridor's ${w} m`);
  }
}

test('routes: some corridors turn twice (a dogleg) or more (winding), a minority; walkable along their middle, flat, one ceiling', () => {
  const routed = EDGES.filter((e) => e.c.route), ordinary = EDGES.filter((e) => e.c.mode === 'corridor');
  const kinds = { dogleg: 0, winding: 0 };
  for (const e of routed) {
    const w = new World2(e.s, { clusterShare: 0 }), tag = tagOf(e), { route, corridor } = e.c;
    assert.equal(e.c.mode, 'corridor', `${tag}: a route on a ${e.c.mode}`);
    kinds[route.kind]++;
    assert.equal(route.rects.length, route.kind === 'dogleg' ? 3 : 5, `${tag}: ${route.kind} in ${route.rects.length} pieces`);
    checkPieces(route.rects, corridor.w, tag);
    // the length along the middle line: the straight run between the halls and every jog across
    const jogs = route.line.slice(1).reduce((t, [x, z], k) => t + Math.abs(x - route.line[k][0]) + Math.abs(z - route.line[k][1]), 0);
    assert.equal(route.length, jogs - 2, `${tag}: length ${route.length}, its middle line ${jogs} less the 1 m inside each hall`);
    assert.ok(route.length > e.c.gaps[0] + e.c.gaps[1], tag);
    assert.equal(walksAlong(w, route.line), null, `${tag}: ${walksAlong(w, route.line)}`);
    // every piece in the plans of the cells it crosses, under one ceiling
    const ceils = new Set();
    for (const o of route.rects) for (let i = Math.floor(o.x0 / CELL2); i * CELL2 < o.x1; i++) for (let j = Math.floor(o.z0 / CELL2); j * CELL2 < o.z1; j++) {
      const cut = { x0: Math.max(o.x0, i * CELL2), x1: Math.min(o.x1, (i + 1) * CELL2), z0: Math.max(o.z0, j * CELL2), z1: Math.min(o.z1, (j + 1) * CELL2) };
      const room = w.plan(i, j).rooms.find((q) => q.kind === 'corridor' && q.x0 === cut.x0 && q.x1 === cut.x1 && q.z0 === cut.z0 && q.z1 === cut.z1);
      assert.ok(room, `${tag}: no piece ${JSON.stringify(cut)} in cell ${i},${j}`);
      ceils.add(room.ceil);
      assert.ok(!room.slope, `${tag}: a sloping piece`);
    }
    assert.equal(ceils.size, 1, `${tag}: ceilings ${[...ceils]}`);
  }
  assert.ok(kinds.dogleg + kinds.winding >= 24 && kinds.winding >= 8, `routes ${JSON.stringify(kinds)}`);
  assert.ok(routed.length < (ordinary.length + routed.length) / 4, `${routed.length} of ${ordinary.length} corridors routed: no longer a minority`);
  assert.ok(['x', 'z'].every((axis) => routed.some((e) => e.axis === axis)), 'routes on both axes');
});

test('diagonals: some districts link two opposite cells\' halls straight across their corner, both ways round, the same from every cell', () => {
  const found = { 0: 0, 1: 0 };
  for (const s of CORPUS.seeds) {
    const w = new World2(s, { clusterShare: 0 });
    for (let b = -2; b < 2; b++) for (let a = -2; a < 2; a++) {
      const d = w.diagonalOf(a, b);
      if (!d) continue;
      const tag = `seed ${s} district ${a},${b}`;
      found[d.orientation]++;
      assert.equal(d.id, `v2:diag:${a},${b}`, tag);
      const [P, Q] = d.cells;
      assert.ok(Math.abs(P.i - Q.i) === 1 && Math.abs(P.j - Q.j) === 1, `${tag}: not opposite cells`);
      assert.ok([P, Q].every((c) => Math.floor(c.i / 2) === a && Math.floor(c.j / 2) === b), `${tag}: leaves its district`);
      assert.deepEqual([d.fromSpaceId, d.toSpaceId], [w.hallOf(P.i, P.j).spaceId, w.hallOf(Q.i, Q.j).spaceId], tag);
      assert.notEqual(d.fromSpaceId, d.toSpaceId, `${tag}: inside one hall`);
      checkPieces(d.rects, d.w, tag);
      assert.equal(walksAlong(w, d.line), null, `${tag}: ${walksAlong(w, d.line)}`);
      // the same record from a fresh world planned the other way round
      const v = new World2(s, { clusterShare: 0 });
      for (const [i, j] of [[2 * a + 1, 2 * b + 1], [2 * a, 2 * b]]) v.plan(i, j);
      assert.deepEqual(v.diagonalOf(a, b), d, `${tag}: differs with the plan order`);
      // clear of every other room of the district's 1F but where it opens into its two halls
      for (const [i, j] of [[2 * a, 2 * b], [2 * a + 1, 2 * b], [2 * a, 2 * b + 1], [2 * a + 1, 2 * b + 1]]) {
        const own = (q) => q.kind === 'corridor' && d.rects.some((o) => q.x0 >= o.x0 && q.x1 <= o.x1 && q.z0 >= o.z0 && q.z1 <= o.z1);
        for (const q of w.plan(i, j).rooms) {
          if (q.lv !== 0 || own(q) || q.spaceId === d.middleRoom?.spaceId || (q.kind === 'hall' && [P, Q].some((c) => c.i === i && c.j === j))) continue;
          assert.ok(!d.rects.some((o) => overlap(o, q)), `${tag}: crosses ${q.kind} ${q.id} of cell ${i},${j}`);
        }
      }
    }
  }
  assert.ok(found[0] + found[1] >= 4 && found[0] > 0 && found[1] > 0, `diagonals ${JSON.stringify(found)}`);
});

// ---------- 02B finish: narrow low corridors, every rectangle edge on the Q2 grid ----------
const WIDTHS = [1.5, 2, 2, 2.5, 3, 3.5], DIAG_WIDTHS = [1.5, 2, 2, 2.5], CEILS = [2, 2.5, 3];
const phaseOf = (w) => Math.round(-w / (2 * Q2)) * Q2 + w / 2;   // a width's shift of the centre onto the grid, from the public width alone
const onGrid = (o) => [o.x0, o.x1, o.z0, o.z1].every((v) => v / Q2 === Math.round(v / Q2));

test('connections: Stage 02B widths ceilings and rectangle edges follow the Q2 grid', () => {
  const links = EDGES.filter((e) => e.c.mode === 'corridor' || e.c.mode === 'connector-room');
  const count = new Map(CEILS.map((c) => [c, 0]));
  for (const e of links) {
    assert.ok(WIDTHS.includes(e.c.corridor.w), `${tagOf(e)}: width ${e.c.corridor.w}`);
    assert.ok(CEILS.includes(e.c.corridor.ceil), `${tagOf(e)}: ceiling ${e.c.corridor.ceil}`);
    count.set(e.c.corridor.ceil, count.get(e.c.corridor.ceil) + 1);
  }
  for (const [c, n] of count) assert.ok(n >= links.length * 0.25 && n <= links.length * 0.42, `ceiling ${c} on ${n} of ${links.length} links`);
  // every 1F corridor room (routes, stubs and diagonals included; B1 maze corridors and connector rooms are other kinds)
  let corridors = 0;
  for (const seed of CORPUS.seeds) {
    const w = new World2(seed, { clusterShare: 0 });
    for (const [i, j] of CORPUS.cells) for (const o of w.plan(i, j).rooms) {
      if (o.kind !== 'corridor' || o.lv !== 0) continue;
      corridors++;
      assert.ok(CEILS.includes(o.ceil), `seed ${seed} cell ${i},${j}: corridor ${o.id} ceiling ${o.ceil}`);
      assert.ok(onGrid(o), `seed ${seed} cell ${i},${j}: corridor ${o.id} off the grid`);
    }
  }
  assert.ok(corridors > 500, `${corridors} corridor rooms`);
  // an ordinary link's corridor centre is the middle line + its offset + the width's phase (a connector room's stubs too, its body not)
  const worlds = new Map();
  for (const e of ACTIVE) {
    const w = worlds.get(e.s) ?? new World2(e.s, { clusterShare: 0 }), tag = tagOf(e);
    worlds.set(e.s, w);
    const { X, a, b } = corridorsOf(w, e), mid = (X ? e.j : e.i) * CELL2 + CELL2 / 2;
    for (const o of [a[0], b[0]]) assert.equal(((X ? o.z0 + o.z1 : o.x0 + o.x1)) / 2, mid + e.c.corridor.t + phaseOf(e.c.corridor.w), `${tag}: corridor centre`);
    if (e.c.mode === 'connector-room') {
      const body = e.c.parts[0];
      assert.equal((X ? body.z0 + body.z1 : body.x0 + body.x1) / 2, mid + e.c.corridor.t, `${tag}: the connector room's centre`);
      const width = X ? body.z1 - body.z0 : body.x1 - body.x0;
      assert.ok(width >= 12 && width <= 16, `${tag}: ${width} m wide`);
    }
  }
  // routes: the first piece's middle is that centre, every piece on the grid, every jog a whole number of steps from the next
  for (const e of EDGES.filter((q) => q.c.route)) {
    const { route, corridor } = e.c, mid = (e.axis === 'x' ? e.j : e.i) * CELL2 + CELL2 / 2, tag = tagOf(e);
    assert.equal(route.across[0], mid + corridor.t + phaseOf(corridor.w), `${tag}: route start`);
    for (const o of route.rects) assert.ok(onGrid(o), `${tag}: a route piece off the grid`);
    // every piece is one corridor wide one way; seen across, its middle sits on the width's phase (so a jog's pieces and
    // every straight piece keep their edges on the grid)
    for (const o of route.rects) {
      const [dx, dz] = [o.x1 - o.x0, o.z1 - o.z0];
      assert.ok(dx === corridor.w || dz === corridor.w, `${tag}: a route piece ${dx} × ${dz} is not ${corridor.w} wide`);
      const [lo, hi] = dx === corridor.w ? [o.x0, o.x1] : [o.z0, o.z1], off = ((lo + hi) / 2 - phaseOf(corridor.w)) / Q2;
      assert.equal(off, Math.round(off), `${tag}: a route piece's middle is off the width's phase`);
    }
  }
  // diagonals
  let diagonals = 0;
  for (const s of CORPUS.seeds) {
    const w = new World2(s, { clusterShare: 0 });
    for (let b = -2; b < 2; b++) for (let a = -2; a < 2; a++) {
      const d = w.diagonalOf(a, b);
      if (!d) continue;
      diagonals++;
      assert.ok(DIAG_WIDTHS.includes(d.w), `seed ${s} district ${a},${b}: width ${d.w}`);
      assert.ok(CEILS.includes(d.ceil), `seed ${s} district ${a},${b}: ceiling ${d.ceil}`);
      for (const o of [...d.rects, ...(d.middleRoom ? [d.middleRoom] : [])]) assert.ok(onGrid(o), `seed ${s} district ${a},${b}: a piece off the grid`);
    }
  }
  assert.ok(diagonals >= 4, `${diagonals} diagonals`);
});

test('walks: route stretch is the wall-to-wall axial gap, not the route length', () => {
  const routed = EDGES.filter((e) => e.c.route);
  assert.ok(routed.length >= 24, `${routed.length} routed links`);
  const worlds = new Map();
  for (const e of routed) {
    const w = worlds.get(e.s) ?? new World2(e.s, { clusterShare: 0 }), c = e.c, tag = tagOf(e);
    worlds.set(e.s, w);
    assert.ok(c.route.length > c.gaps[0] + c.gaps[1], `${tag}: the route is no longer than the straight run`);
    // alone in a two-cell graph the link is the only way between its halls
    const [p] = measureWalks(w, [[e.i, e.j], next(e.i, e.j, e.axis)]);
    assert.equal(p.stretch, c.gaps[0] + c.gaps[1], `${tag}: stretch ${p.stretch}, route length ${c.route.length}`);
    assert.ok(p.stretch <= 36, `${tag}: stretch ${p.stretch}`);
    assert.equal(p.stretchKind, 'route ' + c.route.kind, tag);
  }
});

// ---------- 02B finish: a long diagonal gets one connector room in its middle ----------
const districtCells = (a, b) => [[2 * a, 2 * b], [2 * a + 1, 2 * b], [2 * a, 2 * b + 1], [2 * a + 1, 2 * b + 1]];
const clipTo = (q, i, j) => {
  const c = { x0: Math.max(q.x0, i * CELL2), x1: Math.min(q.x1, (i + 1) * CELL2), z0: Math.max(q.z0, j * CELL2), z1: Math.min(q.z1, (j + 1) * CELL2) };
  return c.x1 > c.x0 && c.z1 > c.z0 ? c : null;
};
// the cells a room of the district may reach into: the four of it and their neighbours
const around = (a, b) => {
  const out = [];
  for (let j = 2 * b - 1; j <= 2 * b + 2; j++) for (let i = 2 * a - 1; i <= 2 * a + 2; i++) out.push([i, j]);
  return out;
};

test('diagonals: middle connector rooms split long corridor runs', () => {
  const found = { 0: 0, 1: 0 };
  let long = 0, negative = false;
  for (const s of CORPUS.seeds) {
    const w = new World2(s, { clusterShare: 0 });
    for (let b = -2; b <= 1; b++) for (let a = -2; a <= 1; a++) {
      const d = w.diagonalOf(a, b);
      if (!d) continue;
      const tag = `seed ${s} district ${a},${b}`;
      found[d.orientation]++;
      if (a < 0 || b < 0) negative = true;
      assert.ok(d.stretch <= 36, `${tag}: stretch ${d.stretch}`);
      if (d.length <= 36) {
        assert.equal(d.middleRoom, null, tag);
        assert.equal(d.corridorLengths[0], d.length, tag);
        assert.equal(d.corridorLengths[1], 0, tag);
        assert.equal(d.stretch, d.length, tag);
        continue;
      }
      long++;
      const m = d.middleRoom;
      assert.ok(m !== null, `${tag}: ${d.length} m with no middle room`);
      assert.equal(m.kind, 'connector-room', tag);
      assert.equal(m.lv, 0, tag);
      assert.equal(m.spaceId, `v2:space:diag:${a},${b}`, tag);
      const size = m.x1 - m.x0;
      assert.ok((size === 8 || size === 6) && m.z1 - m.z0 === size, `${tag}: ${size} x ${m.z1 - m.z0}`);
      assert.ok(m.ceil >= 3.5 && m.ceil <= 4.5, `${tag}: ceiling ${m.ceil}`);
      assert.deepEqual(m.lampGrid, { ox: m.x0, oz: m.z0, step: 6 }, tag);
      assert.ok(onGrid(m), `${tag}: off the grid`);
      // 1 m clear of the district's halls and of every way through its inner edges, touching its own corridor
      for (const [i, j] of districtCells(a, b)) assert.ok(!overlap(m, w.hallOf(i, j), 1), `${tag}: within 1 m of the hall of ${i},${j}`);
      for (const [i, j, axis] of [[2 * a, 2 * b, 'x'], [2 * a, 2 * b + 1, 'x'], [2 * a, 2 * b, 'z'], [2 * a + 1, 2 * b, 'z']]) {
        const [ni, nj] = next(i, j, axis);
        for (const q of w.linkRects(w.connectionOf(i, j, axis), w.hallOf(i, j), w.hallOf(ni, nj))) assert.ok(!overlap(m, q, 1), `${tag}: within 1 m of the link ${axis} ${i},${j}`);
      }
      assert.ok(d.rects.some((o) => overlap(o, m)), `${tag}: no contact with its own corridor`);
      // the corridor's middle line (hall wall to hall wall) crosses the room in one stretch, and the runs either side are what is reported
      const sx = d.orientation ? -1 : 1, [p0, p1, p2, p3] = d.line, pts = [[p0[0] + sx, p0[1]], p1, p2, [p3[0] - sx, p3[1]]], STEP = 0.125;
      let at = 0, run = null;
      const stretches = [];
      for (let k = 1; k < pts.length; k++) {
        const [x0, z0] = pts[k - 1], [x1, z1] = pts[k], n = Math.round((Math.abs(x1 - x0) + Math.abs(z1 - z0)) / STEP);
        for (let t = k === 1 ? 0 : 1; t <= n; t++) {
          const x = x0 + ((x1 - x0) * t) / n, z = z0 + ((z1 - z0) * t) / n, dist = at + t * STEP;
          const inside = x >= m.x0 && x <= m.x1 && z >= m.z0 && z <= m.z1;
          if (inside && !run) run = [dist, dist];
          else if (inside) run[1] = dist;
          else if (run) { stretches.push(run); run = null; }
        }
        at += n * STEP;
      }
      if (run) stretches.push(run);
      assert.equal(stretches.length, 1, `${tag}: the middle line enters the room ${stretches.length} times`);
      const [entry, exit] = stretches[0];
      assert.ok(entry > 0 && exit > entry && exit < d.length, `${tag}: ${entry}..${exit} of ${d.length}`);
      assert.ok(Math.abs(d.corridorLengths[0] - entry) <= STEP && Math.abs(d.corridorLengths[1] - (d.length - exit)) <= STEP, `${tag}: ${d.corridorLengths} vs ${entry}, ${d.length - exit}`);
      assert.ok(d.corridorLengths.every((v) => v <= 36), `${tag}: ${d.corridorLengths}`);
      assert.equal(d.stretch, Math.max(...d.corridorLengths), tag);
      // its fragments in the cells it covers: one spaceId, unique ids, one ceiling and grid, seams exactly where it crosses a cell boundary
      let area = 0;
      for (const [i, j] of around(a, b)) {
        const plan = w.plan(i, j), frags = plan.rooms.filter((o) => o.spaceId === m.spaceId), cut = clipTo(m, i, j);
        assert.equal(new Set(plan.rooms.map((o) => o.id)).size, plan.rooms.length, `${tag}: duplicate room ids in cell ${i},${j}`);
        assert.equal(frags.length, cut ? 1 : 0, `${tag}: ${frags.length} fragments in cell ${i},${j}`);
        if (!cut) continue;
        const f = frags[0], ox = i * CELL2, oz = j * CELL2;
        assert.deepEqual([f.x0, f.x1, f.z0, f.z1, f.kind, f.lv, f.ceil, f.span], [cut.x0, cut.x1, cut.z0, cut.z1, 'connector-room', 0, m.ceil, 'connector'], `${tag}: fragment in ${i},${j}`);
        assert.deepEqual(f.grid, m.lampGrid, tag);
        assert.deepEqual(f.seams, {
          px: m.x0 < ox + CELL2 && m.x1 > ox + CELL2 ? { lo: m.z0, hi: m.z1 } : false,
          nx: m.x0 < ox && m.x1 > ox ? { lo: m.z0, hi: m.z1 } : false,
          pz: m.z0 < oz + CELL2 && m.z1 > oz + CELL2 ? { lo: m.x0, hi: m.x1 } : false,
          nz: m.z0 < oz && m.z1 > oz ? { lo: m.x0, hi: m.x1 } : false,
        }, `${tag}: seams of the fragment in ${i},${j}`);
        area += (f.x1 - f.x0) * (f.z1 - f.z0);
        // features keep clear of it: flights 1.5 m (their hall entries 1 m), pits and splits 2 m, hall pools out of it, windows' fronts 0.5 m, columns 1 m
        for (const fl of plan.flights) assert.ok(!overlap(fl, f, 1.5) && !overlap(fl.hallEntry, f, 1), `${tag}: a flight in cell ${i},${j} too near the middle room`);
        for (const v of plan.voids) if (v.lv === -1) assert.ok(!overlap(v, f, 2), `${tag}: a pit or split in cell ${i},${j} within 2 m of the middle room`);
        for (const p of plan.pools) if (p.lv === 0) assert.ok(!overlap({ x0: p.shape.cx - p.shape.hw, x1: p.shape.cx + p.shape.hw, z0: p.shape.cz - p.shape.hd, z1: p.shape.cz + p.shape.hd }, f), `${tag}: a pool in cell ${i},${j} inside the middle room`);
        for (const wn of plan.windows) assert.ok(!overlap(wn.front, f, 0.5), `${tag}: a window front in cell ${i},${j} within 0.5 m of the middle room`);
        for (const c of plan.columns) if (c.lv === 0) assert.ok(!overlap({ x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r }, f, 1), `${tag}: a column in cell ${i},${j} within 1 m of the middle room`);
      }
      assert.equal(area, size * size, `${tag}: the fragments do not add up to the room`);
    }
  }
  assert.ok(long >= 4, `${long} diagonals with a middle room`);
  assert.ok(found[0] > 0 && found[1] > 0, `orientations ${JSON.stringify(found)}`);
  assert.ok(negative, 'no accepted diagonal in a negative district');
});

test('diagonals: middle rooms remain deterministic after cache eviction', () => {
  let pick = null;
  search: for (const seed of CORPUS.seeds) for (let b = -2; b <= 1; b++) for (let a = -2; a <= 1; a++) {
    const w = new World2(seed, { clusterShare: 0 });
    const d = w.diagonalOf(a, b);
    if ((a < 0 || b < 0) && d !== null && d.middleRoom !== null) { pick = { seed, a, b }; break search; }
  }
  assert.ok(pick, 'no accepted long diagonal with a middle room in a negative district');
  const { seed, a, b } = pick, w = new World2(seed, { clusterShare: 0 }), cells = districtCells(a, b);
  const first = cells.map(([i, j]) => JSON.stringify(w.plan(i, j))), diag = JSON.stringify(w.diagonalOf(a, b));
  for (let k = 0; k < 451; k++) w.plan(1000 + k, 1000);
  for (const [i, j] of cells) assert.equal(w.plans.has(`${i},${j}`), false, `the plan ${i},${j} is still cached`);
  const reversed = [...cells].reverse().map(([i, j]) => JSON.stringify(w.plan(i, j))).reverse();
  assert.deepEqual(reversed, first);
  assert.equal(JSON.stringify(w.diagonalOf(a, b)), diag);
  const d = w.diagonalOf(a, b), m = d.middleRoom;
  assert.equal(d.id, `v2:diag:${a},${b}`);
  assert.ok([0, 1].includes(d.orientation) && DIAG_WIDTHS.includes(d.w) && CEILS.includes(d.ceil), `${d.orientation} ${d.w} ${d.ceil}`);
  assert.ok(m.x0 >= (2 * a - 1) * CELL2 && m.x1 <= (2 * a + 3) * CELL2 && m.z0 >= (2 * b - 1) * CELL2 && m.z1 <= (2 * b + 3) * CELL2, 'the room leaves its district');
  assert.ok(d.corridorLengths.every((v) => v <= 36) && d.stretch === Math.max(...d.corridorLengths));
  assert.equal(m.spaceId, `v2:space:diag:${a},${b}`);
  assert.ok(onGrid(m));
  assert.ok(around(a, b).some(([i, j]) => w.plan(i, j).rooms.some((o) => o.spaceId === m.spaceId)), 'no fragment of the middle room');
});

test('walks: on the shortest way between every two neighbouring halls no corridor stretch is longer than 36 m', (t) => {
  const pairs = CORPUS.seeds.flatMap((seed) => measureWalks(new World2(seed, { clusterShare: 0 }), CORPUS.cells).map((p) => ({ seed, ...p })));
  assert.equal(pairs.length, 896, '8 seeds × 64 cells: 896 neighbouring pairs');
  assert.ok(pairs.every((p) => Number.isFinite(p.walk)), 'every pair needs a finite walk');
  assert.ok(pairs.every((p) => Number.isFinite(p.stretch)), 'every pair needs a finite corridor stretch');
  const bad = pairs.filter((p) => p.stretch > 36).sort((a, b) => b.stretch - a.stretch);
  t.diagnostic(`pairs=${pairs.length}; over36=${bad.length}; max=${Math.max(...pairs.map((p) => p.stretch))}`);
  assert.equal(bad.length, 0, bad.slice(0, 10).map((p) => `seed=${p.seed} axis=${p.axis} i=${p.i} j=${p.j} closed=${p.closed} stretch=${p.stretch} kind=${p.stretchKind}`).join('\n'));
  assert.ok(Math.max(...pairs.map((p) => p.stretch)) <= 36);
});

test('walks: seed 1 x:-4,-4 connector room breaks the corridor into stubs, longest 12.5 m', () => {
  const w = new World2(1, { clusterShare: 0 }), c = w.connectionOf(-4, -4, 'x');
  assert.equal(c.mode, 'connector-room');
  assert.deepEqual(c.gaps, [21.5, 20.5]);
  assert.equal(Math.min(...c.parts.map((p) => p.x0)), -201);
  assert.equal(Math.max(...c.parts.map((p) => p.x1)), -183);
  // With just these two cells the only path is their own link.
  const [p] = measureWalks(w, [[-4, -4], [-3, -4]]);
  assert.equal(p.stretch, 12.5);
  assert.equal(p.stretchKind, 'connector stub');
});

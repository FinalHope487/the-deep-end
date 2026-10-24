// Generator v2, Stage 02B: the connection through each cell edge, and the connector rooms that take the middle of some of
// the long ones (hall → short corridor → connector room across the edge → short corridor → hall)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2, CELL2, Q2, PARAPET, cellRaster, primaryHall } from '../../js/gen2.js';
import { CORPUS, measureWorld } from '../../js/gen2-measure.js';

const next = (i, j, axis) => (axis === 'x' ? [i + 1, j] : [i, j + 1]);
const inCorpus = (i, j) => CORPUS.cells.some(([a, b]) => a === i && b === j);
const overlap = (a, b, m = 0) => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.z0 < b.z1 + m && b.z0 < a.z1 + m;
// every edge between two cells of the corpus, with its connection
const EDGES = [];
for (const s of CORPUS.seeds) {
  const w = new World2(s);
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
  const fresh = new World2(42), had = [...fresh.plans.keys()];   // the spawn's cell is planned already
  for (const axis of ['x', 'z']) fresh.connectionOf(20, -20, axis);
  assert.deepEqual([...fresh.plans.keys()], had, 'resolving a connection built a plan');
  for (const e of EDGES.filter((_, k) => k % 7 === 0)) {
    const [ni, nj] = next(e.i, e.j, e.axis), w = new World2(e.s);
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
  assert.ok(EDGES.filter((e) => e.c.mode === 'corridor').length > CONV.length, 'most links stay corridors');
  for (const e of CONV) {
    const { X, edge, hA, hB } = sides(new World2(e.s), e);
    const gaps = [edge - (X ? hA.x1 : hA.z1), (X ? hB.x0 : hB.z0) - edge];
    // both halls 12 m or more from the edge, or 8 m or more on a link with more than 30 m of corridor
    assert.ok(gaps.every((g) => g >= 12) || gaps.every((g) => g >= 8) && gaps[0] + gaps[1] > 30, `${tagOf(e)}: a hall only ${Math.min(...gaps)} m from the edge`);
  }
});

test('connections: a long link with a hall 8–12 m from the edge gets a shallower room on that side; under 8 m it stays a corridor', () => {
  // at 32bf56b: seed 3 (11.5 | 25 m), seed 2 (8 | 23.5 m), seed 1 in negative cells (24.5 | 9 m); seed 1 (24 | 6.5 m) stays
  for (const [s, i, j, axis] of [[3, 2, 3, 'x'], [2, 0, 3, 'x'], [1, -2, -4, 'x']]) assert.equal(new World2(s).connectionOf(i, j, axis).mode, 'connector-room', `seed ${s} edge ${axis} ${i},${j}`);
  assert.equal(new World2(1).connectionOf(0, 0, 'z').mode, 'corridor');
  const run = (e) => e.c.gaps[0] + e.c.gaps[1], narrow = EDGES.filter((e) => e.c.gaps && run(e) > 30 && Math.min(...e.c.gaps) < 12);
  assert.ok(narrow.length >= 40, `${narrow.length} long links with a hall under 12 m from the edge`);   // edges inside the sample (61 of 64 counting its border)
  for (const e of narrow) assert.equal(e.c.mode, Math.min(...e.c.gaps) >= 8 ? 'connector-room' : 'corridor', `${tagOf(e)}: gaps ${e.c.gaps}`);
  assert.ok(narrow.filter((e) => e.c.mode === 'connector-room').length >= 40);
});

test('connections: every eligible link longer than 30 m between its halls is a connector room; shorter ones still vary by seed', () => {
  // corridors at 32bf56b that lost the 40% roll: seed 1, 42 m and 45.5 m
  for (const [s, i, j, axis] of [[1, -4, -4, 'x'], [1, 0, -3, 'z']]) assert.equal(new World2(s).connectionOf(i, j, axis).mode, 'connector-room', `seed ${s} edge ${axis} ${i},${j}`);
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
    const w = new World2(e.s), { X, edge, fA, fB, ni, nj } = sides(w, e), tag = tagOf(e);
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
    const w = new World2(e.s), { X, edge, A, B, hA, hB, fA, fB } = sides(w, e), tag = tagOf(e), [a, b] = [fA[0], fB[0]];
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
    const w = new World2(e.s), { X, fA, ni, nj } = sides(w, e), tag = tagOf(e), a = fA[0];
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
    const w = new World2(e.s), { A, B, fA, fB } = sides(w, e), tag = tagOf(e);
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
    const w = new World2(e.s), { fA, fB } = sides(w, e), [a, b] = [fA[0], fB[0]], room = { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) };
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
    const w = new World2(e.s), { X, edge, A, B } = sides(w, e), tag = tagOf(e);
    const through = (plan, o) => o.lv === 0 && (X ? o.x0 === edge || o.x1 === edge : o.z0 === edge || o.z1 === edge);
    const ta = A.rooms.filter((o) => through(A, o)), tb = B.rooms.filter((o) => through(B, o));
    const want = e.c.mode === 'connector-room' ? 'connector-room' : 'corridor';
    assert.ok(ta.length === 1 && tb.length === 1, `${tag}: ${ta.length} and ${tb.length} rooms through the edge`);
    assert.deepEqual([ta[0].kind, tb[0].kind], [want, want], tag);
    assert.deepEqual(X ? [ta[0].z0, ta[0].z1] : [ta[0].x0, ta[0].x1], X ? [tb[0].z0, tb[0].z1] : [tb[0].x0, tb[0].x1], `${tag}: the two sides do not line up`);
  }
});

test('connections: the graph of halls and connector rooms is one piece in every seed, and the report agrees with the plans', () => {
  const rep = measureWorld(CORPUS), c = rep.connections;
  assert.ok(c, 'no connections in the report');
  const links = EDGES.filter((e) => e.c.mode !== 'seam');
  assert.equal(c.uniqueEdges, links.length);
  assert.equal(c.convertedEdges, CONV.length);
  assert.deepEqual(c.modeCounts, { corridor: links.length - CONV.length, 'connector-room': CONV.length });
  assert.ok(c.eligibleEdges >= c.convertedEdges, `${c.eligibleEdges} eligible`);
  assert.deepEqual(Object.values(c.components), CORPUS.seeds.map(() => 1), `components ${JSON.stringify(c.components)}`);
  assert.ok(c.shortening.percent >= 25 && c.corridorRunAfter.total < c.corridorRunBefore.total, JSON.stringify(c.shortening));
  // one room per connector with a part in the sample (those on the sample's border included)
  let rooms = 0;
  for (const s of CORPUS.seeds) {
    const w = new World2(s), ids = new Set();
    for (const [i, j] of CORPUS.cells) for (const [ei, ej, axis] of [[i, j, 'x'], [i - 1, j, 'x'], [i, j, 'z'], [i, j - 1, 'z']]) {
      const k = w.connectionOf(ei, ej, axis);
      if (k.mode === 'connector-room') ids.add(k.connectorSpaceId);
    }
    rooms += ids.size;
  }
  assert.ok(rooms > CONV.length, 'no connector room on the border of the sample');
  assert.equal(rep.roomTypes[0]['connector-room'], rooms, 'a connector room counted more than once, or not at all');
});

test('connector rooms: the same plans after the cache has dropped them, negative cells included', () => {
  const neg = CONV.find((e) => e.i < 0 && e.j < 0) ?? CONV.find((e) => e.i < 0 || e.j < 0);
  assert.ok(neg, 'no connector room in negative cells');
  const w = new World2(neg.s), [ni, nj] = next(neg.i, neg.j, neg.axis), first = JSON.stringify([w.plan(neg.i, neg.j), w.plan(ni, nj)]);
  for (let k = 0; k < 450; k++) w.plan(100 + k, 40);
  assert.equal(w.plans.has(neg.i + ',' + neg.j), false, 'the plan is still cached');
  assert.equal(JSON.stringify([w.plan(ni, nj), w.plan(neg.i, neg.j)].reverse()), first);
});

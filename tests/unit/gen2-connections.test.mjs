// Generator v2, Stage 02B: the connection through each cell edge, and the connector rooms that take the middle of some of
// the long ones (hall → short corridor → connector room across the edge → short corridor → hall)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2, CELL2, Q2, PARAPET, cellRaster, primaryHall } from '../../js/gen2.js';
import { CORPUS, measureWorld } from '../../js/gen2-measure.js';
import { Player } from '../../js/player.js';

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
  assert.ok(EDGES.filter((e) => e.c.mode === 'corridor').length >= 100, 'ordinary corridors are left too');
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
    if (e.c.mode === 'closed') { assert.deepEqual([ta.length, tb.length], [0, 0], `${tag}: a closed edge has a way through`); continue; }
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
  const closed = links.filter((e) => e.c.mode === 'closed').length;
  assert.deepEqual(c.modeCounts, { closed, corridor: links.length - CONV.length - closed, 'connector-room': CONV.length });
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

// ---------- 02B-4: in a 2×2 district (cells 2a..2a+1, 2b..2b+1) one ordinary corridor of its four inner edges may close ----------
const district = (i, j) => [Math.floor(i / 2), Math.floor(j / 2)];
const innerEdges = (a, b) => [[2 * a, 2 * b, 'x'], [2 * a, 2 * b + 1, 'x'], [2 * a, 2 * b, 'z'], [2 * a + 1, 2 * b, 'z']];
const CLOSED = EDGES.filter((e) => e.c.mode === 'closed');

test('pruning: at most one corridor closes per 2×2 district, the shortest ordinary one inside it; never a seam, a connector room or an edge between districts', () => {
  assert.ok(CLOSED.length >= 64, `${CLOSED.length} closed edges`);
  for (const e of CLOSED) {
    const [a, b] = district(e.i, e.j), tag = tagOf(e);
    assert.deepEqual(district(...next(e.i, e.j, e.axis)), [a, b], `${tag}: closed between two districts`);
    const w = new World2(e.s), inner = innerEdges(a, b).map(([i, j, axis]) => w.connectionOf(i, j, axis));
    assert.equal(inner.filter((c) => c.mode === 'closed').length, 1, `${tag}: more than one closed in its district`);
    const run = (c) => c.gaps[0] + c.gaps[1];
    for (const c of inner) if (c.mode === 'corridor') assert.ok(run(c) >= run(e.c), `${tag}: a shorter corridor ${c.id} stays open`);
    assert.equal(e.c.fromSpaceId !== e.c.toSpaceId, true, tag);
  }
  // some districts keep all four, and cells now differ in how many ways they have out
  const districts = new Set(EDGES.map((e) => `${e.s}:${district(e.i, e.j)}`)), pruned = new Set(CLOSED.map((e) => `${e.s}:${district(e.i, e.j)}`));
  assert.ok(pruned.size < districts.size, 'every district lost a corridor');
  const ways = Object.keys(measureWorld({ seeds: [CORPUS.seeds[0]], cells: CORPUS.cells }).connections1F);
  assert.ok(ways.length >= 2, `ways out per cell: ${ways}`);
});

test('pruning: the same closed edges whichever cell is planned first, after the cache dropped them, in negative districts too', () => {
  const neg = CLOSED.find((e) => e.i < 0 && e.j < 0);
  assert.ok(neg, 'no closed edge in a negative district');
  const w = new World2(neg.s), [ni, nj] = next(neg.i, neg.j, neg.axis);
  w.plan(ni, nj);
  assert.equal(w.connectionOf(neg.i, neg.j, neg.axis).mode, 'closed');
  const first = JSON.stringify([w.plan(neg.i, neg.j), w.plan(ni, nj)]);
  for (let k = 0; k < 450; k++) w.plan(100 + k, 40);
  assert.equal(JSON.stringify([w.plan(ni, nj), w.plan(neg.i, neg.j)].reverse()), first);
});

// lattice reach with the real body, ladders of a split hall included (as reachSet in gen2.test.mjs)
function reach(w, x0, z0, x1, z1, start) {
  const p = new Player(), seen = new Map(), q = [start];
  const key = (x, z, h) => `${x},${z},${Math.round(h * 4)}`;
  seen.set(key(...start), start);
  while (q.length) {
    const [x, z, h] = q.pop();
    for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < x0 || nz < z0 || nx > x1 || nz > z1) continue;
      p.x = x; p.z = z;
      if (!p.canStand(w, nx, nz, h)) continue;
      const nh = w.surfaceAt(nx, nz, h).h, k = key(nx, nz, nh);
      if (seen.has(k)) continue;
      const st = [nx, nz, nh];
      seen.set(k, st);
      q.push(st);
    }
    for (const l of w.planAt(x, z).ladders) {
      const foot = [l.x + l.nx * 0.75, l.z + l.nz * 0.75, l.h0], top = [l.x - l.nx * 0.45, l.z - l.nz * 0.45, l.h1];
      for (const [a, b] of [[foot, top], [top, foot]]) {
        if (Math.abs(h - a[2]) >= 0.3 || Math.hypot(x - a[0], z - a[1]) >= 0.75) continue;
        const snap = (v, o, f) => o + f((v - o) / 0.5) * 0.5;
        const land = [Math.floor, Math.ceil].flatMap((fx) => [Math.floor, Math.ceil].map((fz) => [snap(b[0], start[0], fx), snap(b[1], start[1], fz), b[2]]))
          .filter(([bx, bz, bh]) => p.canStand(w, bx, bz, bh)).sort((u, v) => Math.hypot(u[0] - b[0], u[1] - b[1]) - Math.hypot(v[0] - b[0], v[1] - b[1]))[0];
        if (!land || seen.has(key(...land))) continue;
        seen.set(key(...land), land);
        q.push(land);
      }
    }
  }
  return [...seen.values()];
}

test('pruning: around every closed edge a body still walks from one hall to the other the long way, inside their district', () => {
  assert.ok(CLOSED.length >= 64, `${CLOSED.length} closed edges`);
  for (const e of CLOSED.filter((_, k) => k % 4 === 0)) {
    const w = new World2(e.s), [a, b] = district(e.i, e.j), [ni, nj] = next(e.i, e.j, e.axis), tag = tagOf(e);
    const hA = primaryHall(w.plan(e.i, e.j)), hB = primaryHall(w.plan(ni, nj)), box = [2 * a * CELL2 + 0.25, 2 * b * CELL2 + 0.25, (2 * a + 2) * CELL2 - 0.25, (2 * b + 2) * CELL2 - 0.25];
    const inHall = (h) => ([x, z, y]) => y === 0 && x > h.x0 + 1 && x < h.x1 - 1 && z > h.z0 + 1 && z < h.z1 - 1;
    // a dry spot in hall A on the walk's lattice
    let start = null;
    for (let x = Math.ceil(hA.x0) + 1.25; x < hA.x1 - 1 && !start; x += 0.5) for (let z = Math.ceil(hA.z0) + 1.25; z < hA.z1 - 1 && !start; z += 0.5) if (new Player().canStand(w, x, z, 0) && w.surfaceAt(x, z, 0).h === 0) start = [x, z, 0];
    assert.ok(start, `${tag}: no dry floor in the hall`);
    const set = reach(w, ...box, start);
    assert.ok(set.some(inHall(hB)), `${tag}: the other hall is out of reach once the corridor is closed`);
  }
});

// the corridor of a link in each of its two cells: from 1 m inside the hall out towards the edge
function corridorsOf(w, e) {
  const { X, A, B, hA, hB } = sides(w, e);
  const a = A.rooms.filter((o) => o.kind === 'corridor' && (X ? o.x0 === hA.x1 - 1 && o.x1 > hA.x1 : o.z0 === hA.z1 - 1 && o.z1 > hA.z1));
  const b = B.rooms.filter((o) => o.kind === 'corridor' && (X ? o.x1 === hB.x0 + 1 && o.x0 < hB.x0 : o.z1 === hB.z0 + 1 && o.z0 < hB.z0));
  return { X, a, b, hA, hB };
}
const ACTIVE = EDGES.filter((e) => e.c.mode === 'corridor' || e.c.mode === 'connector-room');

test('portals: a link\'s corridor lines up across the edge, inside both halls; some sit 7 m or more off the middle, on both axes and both sides', () => {
  const seen = new Map(), off = [];
  for (const e of ACTIVE) {
    const w = seen.get(e.s) ?? new World2(e.s), tag = tagOf(e);
    seen.set(e.s, w);
    const { X, a, b, hA, hB } = corridorsOf(w, e);
    assert.deepEqual([a.length, b.length], [1, 1], `${tag}: one corridor out of each hall`);
    const across = (o) => (X ? [o.z0, o.z1] : [o.x0, o.x1]);
    assert.deepEqual(across(a[0]), across(b[0]), `${tag}: the two corridors do not line up`);
    const [c0, c1] = across(a[0]), lo = Math.max(...[hA, hB].map((h) => across(h)[0])), hi = Math.min(...[hA, hB].map((h) => across(h)[1]));
    assert.ok(c0 >= lo && c1 <= hi, `${tag}: the corridor ${c0}..${c1} leaves the halls' ${lo}..${hi}`);
    const mid = (X ? e.j : e.i) * CELL2 + CELL2 / 2, offset = (c0 + c1) / 2 - mid;
    if (Math.abs(offset) < 7) continue;
    off.push({ e, offset });
    // well inside both halls: 2 m of wall beside the mouth, and a connector room's whole width inside them too
    const room = e.c.mode === 'connector-room' ? across(e.c.parts[0]) : [c0, c1];
    assert.ok(room[0] >= lo + 2 && room[1] <= hi - 2, `${tag}: offset ${offset}: ${room[0]}..${room[1]} within 2 m of the halls' ${lo}..${hi}`);
  }
  assert.ok(off.length >= 24, `only ${off.length} portals 7 m or more off the middle`);
  assert.ok(off.length < ACTIVE.length / 4, `${off.length} of ${ACTIVE.length} offset: no longer a minority`);
  for (const axis of ['x', 'z']) for (const sign of [1, -1]) {
    assert.ok(off.some(({ e, offset }) => e.axis === axis && Math.sign(offset) === sign), `no ${sign > 0 ? '+' : '-'} offset on ${axis} edges`);
  }
  assert.ok(off.some(({ e }) => e.c.mode === 'connector-room') && off.some(({ e }) => e.c.mode === 'corridor'), 'offsets on both corridors and connector rooms');
});

// S0 route metrics: 1F-only and any-floor walks, the fan test, the World2 adapter (js/gen2-routes.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2, FLIGHT_SLOPE, LANDING, FLIGHT_W, FLIGHT_MID } from '../../js/gen2.js';
import { CORPUS, roomGraph, roomGraphRecords } from '../../js/gen2-measure.js';
import { ROUTE, graphDistances, coneNodes, flightWalk, splitRegion, routePairs, summarizePairs, routeGraph3D, measureRouteCorpus, formatRoutes } from '../../js/gen2-routes.js';

const node = (x, z, floor = 0) => ({ anchor: [x, z], floor });
const edge = (a, b, length) => ({ id: `${a}-${b}`, a, b, length });
const graphOf = (nodes, edges) => ({ nodes: new Map(Object.entries(nodes)), edges });

// A and B stand 100 m apart on the x axis. The 1F way goes round through C and D, 60 m off the line (220 m).
// U is a 2F room half way between them, 50 m from each end by stairs.
const detour = (extra = {}, edges = []) => graphOf(
  { A: node(0, 0), B: node(100, 0), C: node(0, 60), D: node(100, 60), ...extra },
  [edge('A', 'C', 60), edge('C', 'D', 100), edge('D', 'B', 60), ...edges],
);
const withShortcut = () => detour({ U: node(50, 0, 1) }, [edge('A', 'U', 50), edge('U', 'B', 50)]);
const pairOf = (g, a = 'A', b = 'B') => routePairs(g).find((p) => p.a === a && p.b === b);

test('graphDistances: floors and allowed nodes limit the walk, an unreachable node is absent', () => {
  const g = withShortcut();
  assert.equal(graphDistances(g, 'A').get('B'), 100);
  assert.equal(graphDistances(g, 'A', { floors: new Set([0]) }).get('B'), 220);
  assert.equal(graphDistances(g, 'A', { floors: new Set([0]) }).has('U'), false);
  assert.equal(graphDistances(g, 'A', { allowed: new Set(['A', 'C']) }).has('B'), false);
  assert.equal(graphDistances(g, 'Z').size, 0);
});

test('graphDistances: the answer does not depend on the order of the edges', () => {
  const g = withShortcut(), r = { ...g, edges: [...g.edges].reverse() };
  assert.deepEqual([...graphDistances(g, 'A')].sort(), [...graphDistances(r, 'A')].sort());
});

test('coneNodes: the fan holds the line and its sides, not the points behind, beyond or wide of it', () => {
  const g = graphOf({ A: node(0, 0), B: node(100, 0), on: node(50, 0), side: node(50, 20), wide: node(50, 30), back: node(-10, 0), past: node(110, 0), near: node(5, 5) }, []);
  const fan = coneNodes(g, 'A', 'B', 25);
  for (const id of ['A', 'B', 'on', 'side']) assert.ok(fan.has(id), id);
  for (const id of ['wide', 'back', 'past', 'near']) assert.ok(!fan.has(id), id);
});

test('routePairs: a flight that shortens a blocked line is a shortcut, with the ratio of the two ways', () => {
  const p = pairOf(withShortcut());
  assert.equal(p.l1f, 220);
  assert.equal(p.lAll, 100);
  assert.ok(Math.abs(p.ratio - 2.2) < 1e-9);
  assert.ok(Math.abs(p.detour - 2.2) < 1e-9);
  assert.equal(p.cone1F, false);
  assert.equal(p.coneAll, true);
  assert.equal(p.shortcut, true);
});

test('routePairs: with no flight the two ways are the same and nothing is a shortcut', () => {
  const p = pairOf(detour());
  assert.equal(p.ratio, 1);
  assert.equal(p.coneAll, false);
  assert.equal(p.shortcut, false);
});

test('routePairs: a 1F room on the line keeps the fan open, so a faster flight is no shortcut', () => {
  const g = detour({ M: node(50, 0), U: node(50, 10, 1) }, [edge('A', 'M', 55), edge('M', 'B', 55), edge('A', 'U', 40), edge('U', 'B', 40)]);
  const p = pairOf(g);
  assert.equal(p.cone1F, true);
  assert.equal(p.lAll, 80);
  assert.ok(p.l1f > p.lAll);   // the flight is faster, yet the line is open on 1F
  assert.equal(p.shortcut, false);
});

// review c2c_a51d F1: a shorter way through another floor counts only when it runs inside the fan
test('routePairs: a shorter other-floor way outside the fan is no shortcut', () => {
  const g = detour({ V: node(50, 100, 1) }, [edge('A', 'V', 85), edge('V', 'B', 85)]);
  const p = pairOf(g);
  assert.equal(p.lAll, 170);
  assert.ok(p.lAll < p.l1f);
  assert.equal(p.coneAll, false);
  assert.equal(p.shortcut, false);
});

test('routePairs: a way through another floor inside the fan that is not shorter than 1F is no shortcut', () => {
  const g = detour({ U: node(50, 0, 1), V: node(50, 100, 1) }, [edge('A', 'U', 120), edge('U', 'B', 120), edge('A', 'V', 85), edge('V', 'B', 85)]);
  const p = pairOf(g);
  assert.equal(p.coneAll, true);
  assert.ok(p.lAll < p.l1f);   // the way round through V is shorter, but it is not the straight way
  assert.equal(p.shortcut, false);
});

// review c2c_a51d F4: a graph distance is exact; no tolerance hides a shorter way
test('graphDistances: a shorter way is taken however small the gain', () => {
  const g = graphOf({ A: node(0, 0), B: node(1, 0), C: node(0, 1) }, [edge('A', 'B', 100), edge('A', 'C', 50), edge('C', 'B', 49.9999995)]);
  assert.ok(graphDistances(g, 'A').get('B') < 100);
  assert.equal(graphDistances(g, 'A').get('B'), 50 + 49.9999995);
  assert.equal(graphDistances({ ...g, edges: [...g.edges].reverse() }, 'A').get('B'), 50 + 49.9999995);
});

test('routePairs: a pair cut off on 1F has no ratio and is not a shortcut; a pair out of range is not listed', () => {
  const g = graphOf({ A: node(0, 0), B: node(100, 0), N: node(10, 0) }, [edge('A', 'N', 10)]);
  const p = pairOf(g);
  assert.equal(p.l1f, Infinity);
  assert.equal(p.ratio, null);
  assert.equal(p.shortcut, false);
  assert.equal(routePairs(g).some((q) => q.a === 'A' && q.b === 'N'), false);
});

test('routePairs: a pair 1F cannot join but a flight can is forced, not a shortcut', () => {
  const g = graphOf({ A: node(0, 0), B: node(100, 0), U: node(50, 0, 1) }, [edge('A', 'U', 50), edge('U', 'B', 50)]);
  const p = pairOf(g);
  assert.equal(p.l1f, Infinity);
  assert.equal(p.lAll, 100);
  assert.equal(p.forced, true);
  assert.equal(p.shortcut, false);
  assert.equal(summarizePairs([p]).forced1F, 1);
  assert.equal(summarizePairs([p]).otherFloorShorter, 0);   // there is no 1F way to be shorter than
  assert.equal(pairOf(withShortcut()).forced, false);
  assert.equal(pairOf(graphOf({ A: node(0, 0), B: node(100, 0) }, [])).forced, false);   // cut off on every floor: nothing forces anything
});

test('routePairs: refuses a malformed graph', () => {
  assert.throws(() => routePairs({ nodes: new Map(), edges: 1 }), TypeError);
  assert.throws(() => routePairs(graphOf({ A: { anchor: [0, 0], floor: 3 } }, [])), TypeError);
  assert.throws(() => routePairs(graphOf({ A: node(0, 0), B: node(1, 0) }, [edge('A', 'B', -1)])), TypeError);
  assert.throws(() => routePairs(graphOf({ A: node(0, 0) }, [edge('A', 'Q', 1)])), TypeError);
});

test('summarizePairs: an empty layout gives zeros and empty quantiles, never NaN', () => {
  const s = summarizePairs(routePairs(graphOf({}, [])));
  assert.equal(s.pairs, 0);
  assert.equal(s.shortcutShare, 0);
  assert.equal(s.coneBlocked1FShare, 0);
  assert.deepEqual(s.ratio, { n: 0 });
  assert.ok(!JSON.stringify(s).includes('null') && !JSON.stringify(s).includes('NaN'));
});

test('summarizePairs: counts the shortcut and does not depend on the pair order', () => {
  const pairs = routePairs(withShortcut());
  const s = summarizePairs(pairs);
  assert.equal(s.shortcut, 1);
  assert.equal(s.otherFloorShorter, 1);
  assert.deepEqual(summarizePairs([...pairs].reverse()), s);
});

// review c2c_a51d F2: the walk of a flight is its two legs and the landing, entered at the end the hall entry touches
test('flightWalk: a straight flight is two ramps and a landing, from the near end face to the far end face', () => {
  const f = { axis: 'x', x0: 10, x1: 10 + 6 / FLIGHT_SLOPE + LANDING, z0: 0, z1: FLIGHT_W + 0.5, up: 1, y0: 0, y1: 6, hallEntry: { x0: 8, x1: 10, z0: 0, z1: FLIGHT_W + 0.5 } };
  const w = flightWalk(f), ramp = Math.hypot((f.x1 - f.x0 - LANDING) / 2, 3);
  assert.ok(Math.abs(w.length - (2 * ramp + LANDING)) < 1e-9);
  assert.deepEqual(w.from, [10, (FLIGHT_W + 0.5) / 2]);
  assert.deepEqual(w.exit, [f.x1, (FLIGHT_W + 0.5) / 2]);
  const back = flightWalk({ ...f, hallEntry: { x0: f.x1, x1: f.x1 + 2, z0: 0, z1: FLIGHT_W + 0.5 } });   // entered at the other end
  assert.ok(Math.abs(back.length - w.length) < 1e-9);
  assert.deepEqual(back.from, w.exit);
  assert.deepEqual(back.exit, w.from);
});

test('flightWalk: a switchback goes up one leg, across the landing and back down the other, and leaves beside the way in', () => {
  const Lg = 2.5, W = 2 * FLIGHT_W + 2 * 0.25 + FLIGHT_MID;
  const f = { axis: 'x', turn: true, dir: 1, Lg, x0: 10, x1: 10 + Lg + LANDING, z0: 0, z1: W, y0: 0, y1: 3, yE: 0, yF: 3, up: 1, hallEntry: { x0: 8, x1: 10, z0: 0, z1: W } };
  const w = flightWalk(f), leg = Math.hypot(Lg, 1.5);
  assert.ok(Math.abs(w.length - (2 * leg + FLIGHT_W + FLIGHT_MID)) < 1e-9);
  assert.deepEqual(w.from, [10, 0.25 + FLIGHT_W / 2]);
  assert.deepEqual(w.exit, [10, W - 0.25 - FLIGHT_W / 2]);
});

// review c2c_a51d F3: a split cuts its hall in two on 1F and joins the halves only through the B1 shaft
function splitCase() {
  for (const seed of [1, 42, 2, 3, 7, 99]) {
    const w = new World2(seed);
    for (const [i, j] of CORPUS.cells) if (w.plan(i, j).voids.some((v) => v.kind === 'split')) return { w, i, j, cells: CORPUS.cells };
  }
  throw new Error('no split in the sample');
}

test('routeGraph3D: a split hall is two 1F halves joined only by a B1 shaft node, and the edges still point at real nodes', () => {
  const { w, i, j, cells } = splitCase(), g = routeGraph3D(w, cells), sid = w.hallOf(i, j).spaceId;
  assert.equal(g.nodes.has(sid), false);
  const halves = [...g.nodes].filter(([id]) => id.startsWith(sid + '#split:') && !id.includes(':shaft'));
  assert.equal(halves.length, 2);
  assert.ok(halves.every(([, n]) => n.floor === 0));
  const shaft = g.nodes.get(sid + '#split:shaft0');
  assert.equal(shaft.floor, -1);
  const at = g.edges.filter((e) => e.a === sid + '#split:shaft0' || e.b === sid + '#split:shaft0');
  assert.equal(at.length, 2);
  assert.deepEqual(at.flatMap((e) => [e.a, e.b]).filter((id) => id !== sid + '#split:shaft0').sort(), halves.map(([id]) => id).sort());
  const plan = w.plan(i, j), pit = plan.voids.find((v) => v.kind === 'split'), width = pit.run === 'x' ? pit.z1 - pit.z0 : pit.x1 - pit.x0;
  const ladder = Math.abs(plan.ladders[0].h1 - plan.ladders[0].h0);
  const reach = [0, 1].map((k) => Math.abs(g.nodes.get(`${sid}#split:${k}`).anchor[0] - plan.ladders[k].x) + Math.abs(g.nodes.get(`${sid}#split:${k}`).anchor[1] - plan.ladders[k].z));
  assert.ok(Math.abs(at.reduce((t, e) => t + e.length, 0) - (reach[0] + reach[1] + 2 * ladder + width)) < 1e-9);   // to a ladder, down it, across the pit's floor, up the other, to the far half's anchor
  assert.ok(!g.edges.some((e) => halves.every(([id]) => e.a === id || e.b === id)));   // no way between the halves on their own floor
  assert.ok(g.edges.every((e) => g.nodes.has(e.a) && g.nodes.has(e.b)));
  for (const [id] of halves) assert.ok(g.edges.some((e) => (e.a === id || e.b === id) && !e.id.includes(':ladder')), id);   // each half has its own corridor or flight
  assert.ok(routePairs(g).length > 0);
});

// the World2 adapter, on a small sample of the fixed corpus
const SAMPLE = { seeds: [1, 42], cells: CORPUS.cells };

test('routeGraph3D: each flight adds one room and one edge, each split two edges and a node, and the other 1F edges stay as they were', () => {
  const w = new World2(42), g = routeGraph3D(w, SAMPLE.cells), base = roomGraph(w, SAMPLE.cells);
  assert.equal(g.crossCell, 0);
  assert.ok(g.vertical > 0);
  assert.equal(g.nodes.size, base.nodes.size + g.vertical + 2 * g.splits);   // a split hall: two halves and a shaft in place of one node
  assert.equal(g.edges.length, base.edges.length + g.vertical + 2 * g.splits);
  for (const e of base.edges) {
    const x = g.edges.find((y) => y.id === e.id);
    if (x.a === e.a && x.b === e.b) assert.equal(x.length, e.length);
    else assert.ok(x.length >= 0 && [x.a, x.b].some((id) => id.includes('#split:')));
  }
  const flights = SAMPLE.cells.reduce((t, [i, j]) => t + w.plan(i, j).flights.length, 0);
  assert.equal(g.vertical, flights);
});

// review c2c_a51d round 2: a shared hall holds one split per cell, so a hall point is named by its side of every split of the hall
test('splitRegion: a point is named by its side of each split in turn', () => {
  const cutX = { side: (p) => (p[0] < 10 ? 0 : 1) }, cutZ = { side: (p) => (p[1] < 20 ? 0 : 1) };
  assert.equal(splitRegion([cutX], [5, 0]), '0');
  assert.equal(splitRegion([cutX, cutZ], [5, 30]), '01');
  assert.equal(splitRegion([cutX, cutZ], [15, 30]), '11');
  assert.equal(splitRegion([], [1, 1]), '');
});

// seed 16: a giant hall across two cells with a split in each; seed 57: an L hall with two splits that cut across each other
for (const [seed, what] of [[16, 'giant'], [57, 'L']]) {
  test(`routeGraph3D: a ${what} hall with two splits is cut by both, each shaft joins two regions that differ in its own split`, () => {
    const w = new World2(seed), g = routeGraph3D(w, CORPUS.cells);
    assert.equal(g.edges.every((e) => g.nodes.has(e.a) && g.nodes.has(e.b)), true);
    const shafts = [...g.nodes].filter(([id]) => /#split:shaft\d+$/.test(id)).map(([id]) => id), multi = new Map();
    for (const id of shafts) { const sid = id.slice(0, id.indexOf('#split:')); multi.set(sid, (multi.get(sid) ?? 0) + 1); }
    assert.ok([...multi.values()].some((k) => k === 2), 'a hall with two splits');
    for (const id of shafts) {
      const sid = id.slice(0, id.indexOf('#split:')), n = Number(id.slice(id.lastIndexOf('shaft') + 5));
      const regions = g.edges.filter((e) => e.a === id || e.b === id).map((e) => (e.a === id ? e.b : e.a).slice(sid.length + '#split:'.length));
      assert.equal(regions.length, 2);
      const [x, y] = regions;
      assert.equal(x.length, multi.get(sid));
      assert.ok([...x].every((c, k) => (k === n ? c !== y[k] : c === y[k])), `${x} / ${y} differ only at ${n}`);
    }
    assert.ok(routePairs(g).length > 0);
  });
}

test('routeGraph3D: a corridor into a split hall is as long as the walk from the anchor of the region it opens into', () => {
  const w = new World2(16), g = routeGraph3D(w, CORPUS.cells), base = roomGraph(w, CORPUS.cells), links = new Map(roomGraphRecords(w, CORPUS.cells).links.map((l) => [l.id, l]));
  const man = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
  let moved = 0, apart = 0;
  for (const e of base.edges) {
    const x = g.edges.find((y) => y.id === e.id), l = links.get(e.id), A = l.line[0], B = l.line[l.line.length - 1];
    const end = (id, pt, was) => (id.includes('#split:') ? man(g.nodes.get(id).anchor, pt) - man(base.nodes.get(was).anchor, pt) : 0);
    assert.ok(Math.abs(x.length - (e.length + end(x.a, A, l.a) + end(x.b, B, l.b))) < 1e-9, e.id);
    if (x.a.includes('#split:') || x.b.includes('#split:')) moved++;
  }
  for (const [id, n] of g.nodes) if (id.includes('#split:') && !id.includes(':shaft') && n.floor === 0) apart += n.anchor.join() !== base.nodes.get(id.slice(0, id.indexOf('#split:'))).anchor.join() ? 1 : 0;
  assert.ok(moved > 0 && apart > 0, 'the sample has a corridor into a split hall, and a region away from the hall anchor');
});

test('measureRouteCorpus: the report does not depend on the order the cells are asked in', () => {
  const a = measureRouteCorpus(SAMPLE, (s) => new World2(s));
  const reversed = { seeds: [...SAMPLE.seeds].reverse(), cells: [...SAMPLE.cells].reverse() };
  const b = measureRouteCorpus(reversed, (s) => new World2(s));
  assert.deepEqual(a, b);
});

test('measureRouteCorpus: an other-floor way is never longer than the 1F way, and a pair cut off on 1F is joined through another floor', () => {
  const r = measureRouteCorpus(SAMPLE, (s) => new World2(s));
  assert.ok(r.pairs > 1000);
  assert.equal(r.forced1F, r.cutOff1F);   // a pair 1F cannot join (the halves of a split hall) is joined through the B1 shaft
  assert.ok(r.ratio.min >= 1);
  assert.ok(r.detour.min >= 1 - 1e-9);
  assert.ok(Number.isFinite(r.detour.max));
  assert.ok(r.coneBlockedAll <= r.coneBlocked1F);   // more floors only open the fan, never close it
});

test('formatRoutes: prints the pair counts and both quantile lines, and an empty report too', () => {
  const text = formatRoutes(measureRouteCorpus(SAMPLE, (s) => new World2(s)));
  for (const needle of ['route pairs', `±${ROUTE.coneHalfDeg}°`, 'shortcut pairs', 'ratio 1F way', 'detour 1F way']) assert.ok(text.includes(needle), needle);
  assert.ok(formatRoutes({ ...summarizePairs([]), flights: 0, flightsAcrossCells: 0 }).includes('n 0'));
});

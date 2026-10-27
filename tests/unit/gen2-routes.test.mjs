// S0 route metrics: 1F-only and any-floor walks, the fan test, the World2 adapter (js/gen2-routes.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../../js/gen2.js';
import { CORPUS, roomGraph } from '../../js/gen2-measure.js';
import { ROUTE, graphDistances, coneNodes, routePairs, summarizePairs, routeGraph3D, measureRouteCorpus, formatRoutes } from '../../js/gen2-routes.js';

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

test('routePairs: a pair cut off on 1F has no ratio and is not a shortcut; a pair out of range is not listed', () => {
  const g = graphOf({ A: node(0, 0), B: node(100, 0), N: node(10, 0) }, [edge('A', 'N', 10)]);
  const p = pairOf(g);
  assert.equal(p.l1f, Infinity);
  assert.equal(p.ratio, null);
  assert.equal(p.shortcut, false);
  assert.equal(routePairs(g).some((q) => q.a === 'A' && q.b === 'N'), false);
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

// the World2 adapter, on a small sample of the fixed corpus
const SAMPLE = { seeds: [1, 42], cells: CORPUS.cells };

test('routeGraph3D: the flights add one room each and keep the 1F graph as it was', () => {
  const w = new World2(42), g = routeGraph3D(w, SAMPLE.cells), base = roomGraph(w, SAMPLE.cells);
  assert.equal(g.crossCell, 0);
  assert.ok(g.vertical > 0);
  assert.equal(g.nodes.size, base.nodes.size + g.vertical);
  assert.equal(g.edges.length, base.edges.length + g.vertical);
  for (const e of base.edges) assert.equal(g.edges.find((x) => x.id === e.id).length, e.length);
  const flights = SAMPLE.cells.reduce((t, [i, j]) => t + w.plan(i, j).flights.length, 0);
  assert.equal(g.vertical, flights);
});

test('measureRouteCorpus: the report does not depend on the order the cells are asked in', () => {
  const a = measureRouteCorpus(SAMPLE, (s) => new World2(s));
  const reversed = { seeds: [...SAMPLE.seeds].reverse(), cells: [...SAMPLE.cells].reverse() };
  const b = measureRouteCorpus(reversed, (s) => new World2(s));
  assert.deepEqual(a, b);
});

test('measureRouteCorpus: an other-floor way is never longer than the 1F way, and 1F joins every pair', () => {
  const r = measureRouteCorpus(SAMPLE, (s) => new World2(s));
  assert.ok(r.pairs > 1000);
  assert.equal(r.cutOff1F, 0);
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

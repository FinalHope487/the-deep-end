// T6 link by distance, slice 3: the full room graph of a world with cluster districts, its shortest walks, the source-link shares and the report
import test from 'node:test';
import assert from 'node:assert/strict';
import { slow } from './slow.mjs';
import { World2, CELL2 } from '../../js/gen2.js';
import { buildClusterDistrict, buildSharedOpening, fixtureCluster, fixtureSeamCluster } from '../../js/gen2-district.js';
import { CORPUS, roomGraph, roomGraphFromRecords, measureWalks, measureClosedDetours, measureWorld, formatReport } from '../../js/gen2-measure.js';
import { Player } from '../../js/player.js';
import { walkLength } from './reach.mjs';

const part = (id, i, j, x0, x1, z0, z1) => ({ id, i, j, x0, x1, z0, z1 });
const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const lineLen = (line) => line.slice(1).reduce((t, p, k) => t + man(line[k], p), 0);
const gapOf = (A, B) => Math.min(...A.flatMap((p) => B.map((q) => Math.hypot(Math.max(0, p.x0 - q.x1, q.x0 - p.x1), Math.max(0, p.z0 - q.z1, q.z0 - p.z1)))));
const cellOf = (v) => Math.floor(v / CELL2);

// a stand-in world that answers only what the full graph asks of World2; the district plan is the one given, unvalidated
function standIn({ plan, halls, link = {} }) {
  return {
    districtPlan: (a, b) => (a === plan.a && b === plan.b ? plan : null),
    hallOf: (i, j) => { const h = halls[`${i},${j}`]; if (!h) throw new Error(`unrequested hall ${i},${j}`); return h; },
    connectionOf: (i, j, axis) => {
      const [ni, nj] = axis === 'x' ? [i + 1, j] : [i, j + 1];
      return { id: `v2:edge:${axis}:${i},${j}`, axis, mode: 'district', fromSpaceId: halls[`${i},${j}`].spaceId, toSpaceId: halls[`${ni},${nj}`].spaceId, ...link };
    },
    diagonalOf: () => null,
  };
}
const sourceRoom = (spaceId, ...rects) => ({ spaceId, lv: 0, rects, ceil: 4, role: 'anchor', grid: { ox: rects[0].x0, oz: rects[0].z0, step: 6 } });
const box = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });

// ---- 6.5: the doorway bridge ----
test('link distance measure: opening bridge and reversal', () => {
  const d = fixtureCluster(1, 1), [A, B] = d.rooms, link = buildSharedOpening(42, 1, 1, 0, A, B, 'doorway');
  assert.equal(link.opening.axis, 'x');
  assert.equal(link.opening.c0, 191.5);
  assert.equal(link.opening.c1, 192);
  assert.deepEqual(link.opening.apertures[0], { lo: 173, hi: 175.5 });
  assert.equal(link.opening.height, 2);
  const cells = [[2, 2], [3, 2]];
  const rooms = (swap) => [A, B].map((r, k) => ({ spaceId: r.spaceId, kind: 'hall', lv: 0, parts: r.rects.map((q, n) => part(`${r.spaceId}:rect:${n}:cell:${k + 2},2`, k + 2, 2, q.x0, q.x1, q.z0, q.z1)) }));
  const forward = { id: link.id, a: A.spaceId, b: B.spaceId, kind: 'opening', form: 'shared-opening', bridgeGap: 0.5, physicalGap: 0.5, stretch: 0, line: [[191.5, 174.25], [192, 174.25]] };
  const g = roomGraphFromRecords({ rooms: rooms(), links: [forward] }, cells);
  assert.deepEqual(g.nodes.get(A.spaceId).anchor, [169.75, 169.75]);
  assert.deepEqual(g.nodes.get(B.spaceId).anchor, [213.75, 169.75]);
  assert.equal(g.edges.length, 1);
  const e = g.edges[0];
  assert.equal(e.gap, 0);
  assert.equal(e.bridgeGap, 0.5);
  assert.equal(e.length, 53);
  assert.equal(e.kind, 'opening');
  assert.equal(e.form, 'shared-opening');
  assert.equal(e.stretch, 0);
  const reversed = { ...forward, a: B.spaceId, b: A.spaceId, line: [[192, 174.25], [191.5, 174.25]] };
  assert.deepStrictEqual(roomGraphFromRecords({ rooms: rooms().reverse(), links: [reversed] }, cells), g);

  // the ordinary zero-gap opening of T1 stays as it was
  const touching = [{ spaceId: 'T0', kind: 'hall', lv: 0, parts: [part('T0:0', 2, 2, 130, 140, 130, 140)] }, { spaceId: 'T1', kind: 'hall', lv: 0, parts: [part('T1:0', 2, 2, 140, 150, 130, 140)] }];
  const flat = (extra) => ({ rooms: touching, links: [{ id: 'flat', a: 'T0', b: 'T1', kind: 'opening', line: [[140, 135], [140, 135]], ...extra }] });
  assert.equal(roomGraphFromRecords(flat(), [[2, 2]]).edges[0].gap, 0);
  // a 0.5 m opening must say so, and only an opening of exactly 0.5 m may
  const { bridgeGap, ...noBridge } = forward;
  assert.throws(() => roomGraphFromRecords({ rooms: rooms(), links: [noBridge] }, cells), TypeError, 'missing bridgeGap');
  assert.throws(() => roomGraphFromRecords(flat({ bridgeGap: 0.5 }), [[2, 2]]), TypeError, 'bridgeGap on a zero-gap opening');
  for (const bad of [1, 0, 0.25, -0.5, NaN, '0.5', undefined, null]) assert.throws(() => roomGraphFromRecords({ rooms: rooms(), links: [{ ...forward, bridgeGap: bad }] }, cells), TypeError, `bridgeGap ${bad}`);
  for (const kind of ['corridor', 'seam', 'route', 'connector', 'diagonal']) assert.throws(() => roomGraphFromRecords({ rooms: rooms(), links: [{ ...forward, kind }] }, cells), TypeError, `bridgeGap on ${kind}`);
});

// ---- 4.5-4.6: sampled rooms, complete unions, links once ----
test('link distance measure: sampled rooms and link deduplication', () => {
  const worldOf = (make) => new World2(42, { clusterShare: 0, cluster: (a, b) => (a === 1 && b === 1 ? make(a, b) : null) });
  const w = worldOf(fixtureSeamCluster), source = w.districtPlan(1, 1), room = (k) => source.rooms[k];
  // every source link once, however many sampled cells hold its ends
  const all = [[2, 2], [3, 2], [2, 3], [3, 3]], full = roomGraph(w, all);
  assert.equal(full.nodes.size, 4);
  assert.deepEqual(full.edges.map((e) => e.id), source.links.map((l) => l.id).sort());
  assert.deepStrictEqual(roomGraph(w, [...all].reverse()), full, 'sample order changes nothing');
  assert.ok(full.edges.every((e) => e.form === 'straight' && e.kind === 'corridor' && e.stretch === e.gap && e.gap === 0.5));
  assert.deepEqual(full.edges.map((e) => e.physicalGap), [0, 0.5, 0.5, 0.5], 'room 0 reaches into room 1 by its arm: physical gap 0, bridged by 0.5 m');
  // links need both ends sampled; contact between rooms (the arm of room 0 touches room 1) declares nothing
  const two = roomGraph(w, [[2, 2], [3, 2]]);
  assert.deepEqual([...two.nodes.keys()].sort(), [room(0).spaceId, room(1).spaceId]);
  assert.deepEqual(two.edges.map((e) => e.id), ['v2:dlink:1,1:0']);
  assert.equal(roomGraph(w, [[2, 2]]).edges.length, 0);
  assert.equal(roomGraph(w, [[2, 2]]).nodes.size, 1);
  // a node counts the sampled squares of its complete union only: room 0 is 43.5 × 43.5 m in cell 2,2 plus 0.5 × 4 m of its arm
  const solo = roomGraph(w, [[2, 2]]).nodes.get(room(0).spaceId);
  assert.equal(solo.area, 43.5 * 43.5 + 2);
  assert.deepEqual(solo.cells, [[2, 2]]);
  const both = roomGraph(w, [[2, 2], [3, 2]]).nodes.get(room(0).spaceId);
  assert.equal(both.area, 43.5 * 43.5 + 2 + 2 * 4);
  assert.deepEqual(both.cells, [[2, 2], [3, 2]]);
  // room 1 is two rectangles that continue each other: one node, its seam no boundary
  assert.equal(roomGraph(w, [[3, 2]]).nodes.get(room(1).spaceId).area, 44 * 29.5 + 42 * 14);

  // exterior edges beside a cluster district: its cells are left to the source, a legacy neighbour keeps its own hall
  const legacy = new World2(42, { clusterShare: 0, cluster: (a, b) => (a === 1 && b === 0 ? fixtureCluster(a, b) : null) });
  const mixed = roomGraph(legacy, [[2, 0], [3, 0], [4, 0]]);
  assert.ok(mixed.nodes.has('v2:space:4,0:hall') || [...mixed.nodes.keys()].some((id) => id.startsWith('v2:space:4,0')), 'the legacy cell is a node');
  assert.ok([...mixed.nodes.keys()].filter((id) => id.startsWith('v2:space:1,0:r')).length >= 2);
  assert.ok(mixed.edges.every((e) => Number.isFinite(e.stretch) && e.stretch >= 0 && Number.isFinite(e.physicalGap) && typeof e.form === 'string' || e.kind === 'seam'));
  assert.ok(mixed.edges.some((e) => e.kind === 'corridor' || e.kind === 'route' || e.kind === 'connector'), 'an exterior link joins the legacy hall');

  // optional record fields: own data only, inert extras ignored, conflicts refused
  const base = () => ({
    rooms: [
      { spaceId: 'A', kind: 'hall', lv: 0, parts: [part('A:0', 0, 0, 0, 4, 0, 4)] },
      { spaceId: 'B', kind: 'hall', lv: 0, parts: [part('B:0', 0, 0, 8, 12, 0, 4)] },
    ],
    links: [{ id: 'L', a: 'A', b: 'B', kind: 'corridor', line: [[4, 2], [8, 2]], form: 'short-passage', physicalGap: 4, stretch: 4 }],
  });
  const g = roomGraphFromRecords(base(), [[0, 0]]);
  assert.deepEqual(g.edges.map(({ form, physicalGap, stretch, gap }) => [form, physicalGap, stretch, gap]), [['short-passage', 4, 4, 4]]);
  const withExtra = base();
  withExtra.links[0].tag = 'inert';
  withExtra.links[0][Symbol('s')] = 1;
  assert.deepStrictEqual(roomGraphFromRecords(withExtra, [[0, 0]]), g);
  let ran = false;
  const getter = base();
  Object.defineProperty(getter.links[0], 'stretch', { enumerable: true, get() { ran = true; return 4; } });
  assert.throws(() => roomGraphFromRecords(getter, [[0, 0]]), TypeError);
  assert.equal(ran, false, 'the accessor never runs');
  for (const [name, patch] of [['unknown form', { form: 'tunnel' }], ['negative physicalGap', { physicalGap: -1 }], ['infinite stretch', { stretch: Infinity }],
    ['own undefined stretch', { stretch: undefined }], ['own undefined form', { form: undefined }], ['own undefined physicalGap', { physicalGap: undefined }],
    ['stretch longer than the line', { stretch: 4.5 }], ['NaN physicalGap', { physicalGap: NaN }], ['string stretch', { stretch: '4' }]]) {
    const r = base();
    Object.assign(r.links[0], patch);
    assert.throws(() => roomGraphFromRecords(r, [[0, 0]]), TypeError, name);
  }
  // the stretch bound is exact: equal to the line gap passes, a hair over fails, a hair under passes
  for (const [stretch, ok] of [[4, true], [4 + 5e-10, false], [4 - 5e-10, true]]) {
    const r = base();
    r.links[0].stretch = stretch;
    if (ok) assert.equal(roomGraphFromRecords(r, [[0, 0]]).edges[0].stretch, stretch);
    else assert.throws(() => roomGraphFromRecords(r, [[0, 0]]), TypeError, `stretch ${stretch}`);
  }
  // each optional field: absent passes, a legal value passes, an own undefined and an accessor fail
  for (const [key, legal] of [['form', 'straight'], ['physicalGap', 4], ['stretch', 4]]) {
    const absent = base(), legalR = base(), undef = base(), acc = base();
    delete absent.links[0][key];
    legalR.links[0][key] = legal;
    undef.links[0][key] = undefined;
    Object.defineProperty(acc.links[0], key, { enumerable: true, get() { return legal; } });
    assert.doesNotThrow(() => roomGraphFromRecords(absent, [[0, 0]]), key);
    assert.doesNotThrow(() => roomGraphFromRecords(legalR, [[0, 0]]), key);
    assert.throws(() => roomGraphFromRecords(undef, [[0, 0]]), TypeError, `${key} undefined`);
    assert.throws(() => roomGraphFromRecords(acc, [[0, 0]]), TypeError, `${key} accessor`);
  }
  const noBridgeUndef = base();
  noBridgeUndef.links[0].bridgeGap = undefined;
  assert.throws(() => roomGraphFromRecords(noBridgeUndef, [[0, 0]]), TypeError, 'bridgeGap undefined on a corridor');
  const twin = base();
  twin.links.push({ ...twin.links[0], a: 'B', b: 'A', line: [[8, 2], [4, 2]] });
  assert.deepStrictEqual(roomGraphFromRecords(twin, [[0, 0]]), g, 'identical declarations merge, reversed or not');
  twin.links[1].stretch = 3;
  assert.throws(() => roomGraphFromRecords(twin, [[0, 0]]), TypeError, 'a differing optional field conflicts');
});

// ---- 6.6: four rooms, two ways round ----
function fixtureFourPathWorld() {
  const id = (k) => `v2:space:0,0:r${k}`;
  const rooms = [sourceRoom(id(0), box(28, 36, 28, 36)), sourceRoom(id(1), box(92, 100, 28, 36)), sourceRoom(id(2), box(28, 36, 92, 100)), sourceRoom(id(3), box(92, 100, 92, 100))];
  const passage = (k, from, to, r) => ({ id: `v2:dlink:0,0:${k}`, from: id(from), to: id(to), kind: 'passage', rects: [r], grid: { ox: r.x0, oz: r.z0, step: 6 } });
  const links = [passage(0, 0, 1, box(35.5, 92.5, 30.5, 33.5)), passage(1, 0, 2, box(30.5, 33.5, 35.5, 92.5)), passage(2, 1, 3, box(94.5, 97.5, 35.5, 92.5)), passage(3, 2, 3, box(35.5, 92.5, 94.5, 97.5))];
  const halls = {};
  [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([i, j], k) => { halls[`${i},${j}`] = { ...rooms[k].rects[0], spaceId: id(k) }; });
  const plan = { a: 0, b: 0, rooms, links, anchors: {} };
  return standIn({ plan, halls });
}

// every simple path between two rooms of the graph, the shortest by [length, longest stretch]
function exhaustive(graph, from, to) {
  const adj = new Map([...graph.nodes.keys()].map((k) => [k, []]));
  for (const e of graph.edges) { adj.get(e.a).push([e.b, e]); adj.get(e.b).push([e.a, e]); }
  let best = null;
  const walk = (at, seen, len, stretch) => {
    if (at === to) { if (!best || len < best[0] || (len === best[0] && stretch < best[1])) best = [len, stretch]; return; }
    for (const [next, e] of adj.get(at)) if (!seen.has(next)) walk(next, new Set([...seen, next]), len + e.length, Math.max(stretch, e.stretch));
  };
  walk(from, new Set([from]), 0, 0);
  return best;
}

test('link distance measure: competing full graph paths', () => {
  const w = fixtureFourPathWorld(), cells = [[0, 0], [1, 0], [0, 1], [1, 1]], g = roomGraph(w, cells);
  assert.equal(g.nodes.size, 4);
  assert.equal(g.edges.length, 4);
  assert.deepEqual(g.nodes.get('v2:space:0,0:r0').anchor, [31.75, 31.75]);
  assert.deepEqual(g.nodes.get('v2:space:0,0:r1').anchor, [95.75, 31.75]);
  assert.deepEqual(g.nodes.get('v2:space:0,0:r2').anchor, [31.75, 95.75]);
  assert.deepEqual(g.nodes.get('v2:space:0,0:r3').anchor, [95.75, 95.75]);
  for (const e of g.edges) {
    assert.equal(e.gap, 56, e.id);
    assert.equal(e.length, 64.5, e.id);
    assert.equal(e.form, 'straight');
    assert.equal(e.physicalGap, 56);
  }
  // one piece
  const seen = new Set(['v2:space:0,0:r0']);
  for (let n = 0; n < 4; n++) for (const e of g.edges) if (seen.has(e.a) || seen.has(e.b)) { seen.add(e.a); seen.add(e.b); }
  assert.equal(seen.size, 4);
  const walks = measureWalks(w, cells);
  assert.deepEqual(walks.map(({ i, j, axis }) => `${axis}:${i},${j}`).sort(), ['x:0,0', 'x:0,1', 'z:0,0', 'z:1,0']);
  for (const p of walks) {
    assert.equal(p.walk, 65.5, `${p.axis}:${p.i},${p.j}`);
    assert.equal(p.stretch, 56);
    assert.equal(p.stretchKind, 'straight');
    assert.equal(p.closed, false);
    const [ni, nj] = p.axis === 'x' ? [p.i + 1, p.j] : [p.i, p.j + 1], A = w.hallOf(p.i, p.j), B = w.hallOf(ni, nj), centre = (h) => [(h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2];
    const [len, stretch] = exhaustive(g, A.spaceId, B.spaceId);
    assert.equal(p.walk, man(centre(A), g.nodes.get(A.spaceId).anchor) + len + man(g.nodes.get(B.spaceId).anchor, centre(B)), 'agrees with the exhaustive simple-path oracle');
    assert.equal(p.stretch, stretch);
    assert.ok(Number.isFinite(p.walk) && Number.isFinite(p.stretch));
  }
  // the way round (three passages) is longer, so removing the direct passage routes the pair round it
  const detour = fixtureFourPathWorld();
  const plan = detour.districtPlan(0, 0);
  plan.links = plan.links.filter((l) => l.id !== 'v2:dlink:0,0:0');
  const around = measureWalks(detour, cells).find((p) => p.axis === 'x' && p.i === 0 && p.j === 0);
  assert.equal(around.walk, 0.5 + 3 * 64.5 + 0.5);
  assert.equal(around.stretch, 56);
  authoredCentrelines();
});

// ---- 4.8: legacy-only samples keep the legacy walker ----
test('link distance measure: legacy walk compatibility', () => {
  // the start district is always legacy, and a share of 0 plans none: both take the legacy walker and agree exactly
  const startCells = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (const seed of [1, 42, 99]) {
    const dflt = new World2(seed), zero = new World2(seed, { clusterShare: 0 });
    assert.deepStrictEqual(measureWalks(dflt, startCells), measureWalks(zero, startCells), `${seed}: walks`);
    assert.deepStrictEqual(roomGraph(dflt, startCells), roomGraph(zero, startCells), `${seed}: graph`);
    for (const p of measureWalks(zero, startCells)) assert.ok(['seam', 'straight', 'connector stub', 'route dogleg', 'route winding', 'diagonal'].includes(p.stretchKind), p.stretchKind);
    assert.ok(roomGraph(zero, startCells).edges.every((e) => e.form === undefined && e.stretch === undefined), 'legacy edges carry no new fields');
  }
  // the legacy corpus numbers, frozen from the walker before this change
  const sum = (seed, cells) => {
    const w = new World2(seed, { clusterShare: 0 }), p = measureWalks(w, cells);
    return [p.length, p.reduce((t, q) => t + q.walk, 0), Math.max(...p.map((q) => q.stretch)), p.filter((q) => q.closed).length];
  };
  assert.deepEqual(sum(1, CORPUS.cells), LEGACY_SUMS[1]);
  assert.deepEqual(sum(42, CORPUS.cells), LEGACY_SUMS[42]);
  // restoreId on a legacy world still restores one closed edge and refuses the rest
  const w = new World2(42, { clusterShare: 0 }), closed = measureWalks(w, CORPUS.cells).find((p) => p.closed);
  assert.ok(closed, 'seed 42 closes an edge in the corpus');
  const id = `v2:edge:${closed.axis}:${closed.i},${closed.j}`;
  assert.ok(measureWalks(w, CORPUS.cells, { restoreId: id }).find((p) => p.i === closed.i && p.j === closed.j && p.axis === closed.axis).walk < closed.walk);
});

// ---- 6.7 corpus: the default world ----
const walkPairs = (report) => report.connections.walk.all.n;
let corpusReport = null;
const corpus = () => (corpusReport ??= measureWorld(CORPUS));
const noNaN = (o, path = '') => {
  if (typeof o === 'number') assert.ok(!Number.isNaN(o), `NaN at ${path}`);
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) noNaN(v, `${path}.${k}`);
};

test('link distance measure: default corpus stretch and components', slow, () => {
  const r = corpus();
  assert.equal(walkPairs(r), 896, '8 seeds × 112 neighbouring pairs');
  assert.equal(r.connections.stretch.n, 896);
  assert.ok(r.connections.stretch.max <= 36 && r.connections.stretch.over36 === 0, `longest stretch ${r.connections.stretch.max}`);
  for (const seed of CORPUS.seeds) {
    assert.equal(r.roomComponents[seed], 1, `room graph pieces of seed ${seed}`);
    assert.equal(r.connections.components[seed], 1, `graph pieces of seed ${seed}`);
  }
  // every pair has a finite walk and stretch, at least the straight Manhattan distance between its halls
  for (const seed of CORPUS.seeds) {
    const w = new World2(seed), walks = measureWalks(w, CORPUS.cells);
    assert.equal(walks.length, 112, `seed ${seed}`);
    for (const p of walks) {
      const [ni, nj] = p.axis === 'x' ? [p.i + 1, p.j] : [p.i, p.j + 1], A = w.hallOf(p.i, p.j), B = w.hallOf(ni, nj);
      const lower = man([(A.x0 + A.x1) / 2, (A.z0 + A.z1) / 2], [(B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2]);
      assert.ok(Number.isFinite(p.walk) && Number.isFinite(p.stretch), `${seed} ${p.axis}:${p.i},${p.j}`);
      assert.ok(p.walk >= lower, `${seed} ${p.axis}:${p.i},${p.j}: ${p.walk} < ${lower}`);
      assert.ok(p.stretch <= 36, `${seed} ${p.axis}:${p.i},${p.j}: stretch ${p.stretch}`);
    }
  }
  // a cluster district's four inner cell edges are references to its source links, not corridors
  assert.equal(r.connections.districtInnerEdges, 4 * r.sourceLinks.selected.districts);
  assert.ok(r.connections.districtInnerEdges > 0);
  // the spec's acceptance numbers for the default corpus: every district built, no link past 30 m, none longer than a short passage
  const f = r.sourceLinks.forced;
  assert.deepEqual([f.districts, f.totalSourceLinks, f.directCount, f.directOrShortCount, f.longGapCount], [128, 1813, 1231, 1813, 0]);
  assert.equal(f.directOrShortShare, 1);
  assert.equal(f.longGapShare, 0);
  assert.equal(f.directShare, 1231 / 1813);
  assert.ok(!('district' in r.connections.modeCounts));
  assert.equal(r.closedDetour.n + r.closedDetour.unreachable, r.connections.closed.count);
  noNaN(r);
  assert.deepEqual(JSON.parse(JSON.stringify(r)).sourceLinks, r.sourceLinks, 'plain JSON');
  const keys = Object.keys(r);
  assert.equal(keys[keys.length - 1], 'sourceLinks');
  assert.deepEqual(keys.slice(keys.indexOf('connections'), keys.indexOf('connections') + 4), ['connections', 'rooms', 'roomComponents', 'closedDetour']);
  // a closed edge beside a cluster district can be restored: the walk only gets shorter
  const detours = measureClosedDetours(new World2(CORPUS.seeds[0]), CORPUS.cells);
  for (const d of detours) assert.ok(d.delta === null || d.delta >= 0, d.id);
});

// ---- 4.9: the source-link shares ----
test('link distance measure: selected and forced report denominators', () => {
  const statsOf = (plans) => {
    let total = 0, direct = 0, short = 0, long = 0;
    for (const D of plans) {
      const rects = new Map(D.rooms.map((q) => [q.spaceId, q.rects]));
      for (const l of D.links) {
        const gap = gapOf(rects.get(l.from), rects.get(l.to));
        total++;
        if (l.kind === 'shared-opening') direct++;
        if (l.kind === 'shared-opening' || gap <= 6) short++;
        if (gap > 30) long++;
      }
    }
    return { districts: plans.length, totalSourceLinks: total, directCount: direct, directOrShortCount: short, longGapCount: long,
      directShare: total ? direct / total : 0, directOrShortShare: total ? short / total : 0, longGapShare: total ? long / total : 0 };
  };
  const seeds = [1, 42], cells = CORPUS.cells;
  const selected = [], forced = [];
  for (const seed of seeds) {
    const w = new World2(seed), Y = new World2(seed, { clusterShare: 0 }).Y;
    for (let a = -2; a < 2; a++) for (let b = -2; b < 2; b++) {
      const d = w.districtPlan(a, b);
      if (d) selected.push(d);
      forced.push(buildClusterDistrict(seed, a, b, Y));
    }
  }
  const r = measureWorld({ seeds, cells });
  assert.deepStrictEqual(r.sourceLinks.selected, statsOf(selected));
  assert.deepStrictEqual(r.sourceLinks.forced, statsOf(forced));
  assert.equal(r.sourceLinks.forced.districts, 2 * 16);
  assert.ok(r.sourceLinks.selected.districts > 0 && r.sourceLinks.selected.districts < r.sourceLinks.forced.districts, 'the start and legacy-shared districts are not selected');
  assert.deepEqual(Object.keys(r.sourceLinks.selected), ['districts', 'totalSourceLinks', 'directCount', 'directOrShortCount', 'longGapCount', 'directShare', 'directOrShortShare', 'longGapShare']);
  assert.deepEqual(Object.keys(r.sourceLinks), ['selected', 'forced']);
  // the graph denominator is the graph's own edges, not the source links
  assert.equal(r.rooms.gap.n, r.rooms.edges);
  const graphs = seeds.map((seed) => roomGraph(new World2(seed), cells));
  const edges = graphs.flatMap((g) => g.edges);
  assert.equal(r.rooms.edges, edges.length);
  assert.equal(r.rooms.direct, edges.filter((e) => e.gap === 0).length / edges.length);
  assert.equal(r.rooms.near, edges.filter((e) => e.gap <= 6).length / edges.length);
  assert.equal(r.rooms.long, edges.filter((e) => e.gap > 30).length / edges.length);
  // a sample holding one complete district, and a half one: counted once
  const w42 = new World2(42), found = [];
  for (let a = -2; a < 2; a++) for (let b = -2; b < 2; b++) if (w42.districtPlan(a, b)) found.push([a, b]);
  const [a, b] = found[0], whole = [2 * a, 2 * a + 1].flatMap((i) => [2 * b, 2 * b + 1].map((j) => [i, j]));
  const half = measureWorld({ seeds: [42], cells: [...whole, [2 * a + 2, 2 * b]] });
  assert.equal(half.sourceLinks.selected.districts, 1);
  assert.equal(half.sourceLinks.forced.districts, 1);
  assert.deepStrictEqual(half.sourceLinks.selected, statsOf([w42.districtPlan(a, b)]));
  // the report lines
  const text = formatReport(r), pct = (v) => (v * 100).toFixed(1) + '%', line = (s, which) => `cluster source links, ${which}: districts ${s.districts} · links ${s.totalSourceLinks} · direct ${s.directCount} (${pct(s.directShare)}) · direct or short ${s.directOrShortCount} (${pct(s.directOrShortShare)}) · gap over 30 m ${s.longGapCount} (${pct(s.longGapShare)})`;
  const lines = text.split('\n');
  assert.equal(lines[lines.length - 2], line(r.sourceLinks.selected, 'selected'));
  assert.equal(lines[lines.length - 1], line(r.sourceLinks.forced, 'forced'));
  assert.ok(lines[lines.length - 3].startsWith('cost: planning '));
  const inner = lines.findIndex((l) => l === `  district inner cell edges ${r.connections.districtInnerEdges}`), first = lines.findIndex((l) => l.startsWith('  room graph edges:'));
  assert.ok(inner >= 0 && inner === first - 1, 'the inner edge count comes right before the seven room-graph lines');
  assert.ok(lines.findIndex((l) => l.includes('longest corridor stretch on the way')) > first + 6);
});

// ---- 4.9: empty and malformed samples ----
test('link distance measure: empty and malformed samples', () => {
  const zero = (r) => {
    for (const which of ['selected', 'forced']) assert.deepStrictEqual(r.sourceLinks[which], { districts: 0, totalSourceLinks: 0, directCount: 0, directOrShortCount: 0, longGapCount: 0, directShare: 0, directOrShortShare: 0, longGapShare: 0 });
    assert.equal(r.rooms.edges, 0);
    assert.equal(r.connections.districtInnerEdges, 0);
    assert.equal(r.connections.stretch.over36, 0);
    assert.equal(r.connections.walk.mean, 0);
    assert.equal(r.connections.walk.p90, 0);
    assert.deepEqual(r.connections.stretch.n, 0);
    assert.deepEqual(r.connections.walk.all, { n: 0 });
    noNaN(r);
  };
  const none = measureWorld({ seeds: [], cells: CORPUS.cells });
  zero(none);
  assert.deepEqual(none.roomComponents, {});
  assert.deepEqual(none.connections.components, {});
  const bare = measureWorld({ seeds: [42, 7], cells: [] });
  zero(bare);
  assert.deepEqual(bare.roomComponents, { 7: 0, 42: 0 });
  assert.deepEqual(bare.connections.components, { 7: 0, 42: 0 });
  assert.equal(measureWorld({ seeds: [], cells: [] }).sample.cells, 0);
  const text = formatReport(none).split('\n');
  assert.equal(text[text.length - 2], 'cluster source links, selected: districts 0 · links 0 · direct 0 (0.0%) · direct or short 0 (0.0%) · gap over 30 m 0 (0.0%)');
  assert.equal(text[text.length - 1], 'cluster source links, forced: districts 0 · links 0 · direct 0 (0.0%) · direct or short 0 (0.0%) · gap over 30 m 0 (0.0%)');
  assert.ok(text.includes('  district inner cell edges 0'));
  // a lone cell, an incomplete district: no source link is counted
  const lone = measureWorld({ seeds: [42], cells: [[2, 2]] });
  assert.equal(lone.sourceLinks.forced.districts, 0);
  assert.equal(lone.rooms.edges, 0);
  // malformed samples are refused whole
  const w = new World2(42);
  for (const cells of [[[0, 0], [0, 0]], [[0.5, 0]], [[0]], 'cells', null]) {
    assert.throws(() => roomGraph(w, cells), TypeError, JSON.stringify(cells));
    assert.throws(() => measureWalks(w, cells), TypeError, JSON.stringify(cells));
  }
  assert.throws(() => measureWalks(w, [[2, 2], [3, 2]], { restoreId: '' }), TypeError);
  assert.throws(() => measureWalks(w, [[2, 2], [3, 2]], { restoreId: 5 }), TypeError);
  // mixed restoreId: the target must be one closed edge between two sampled cells
  const cluster = found42(w);
  const cells = [cluster[0] * 2, cluster[0] * 2 + 1].flatMap((i) => [cluster[1] * 2, cluster[1] * 2 + 1].map((j) => [i, j]));
  for (const restoreId of [`v2:edge:x:${cluster[0] * 2},${cluster[1] * 2}`, 'v2:edge:x:9999,9999', 'nope']) assert.throws(() => measureWalks(w, cells, { restoreId }), TypeError, restoreId);
  assert.equal(measureWalks(w, cells, { restoreId: null }).length, 4);
  // an authored passage nothing can carry: no centreline, and nothing declared is left out
  const A = sourceRoom('v2:space:0,0:r0', box(0, 8, 0, 8)), B = sourceRoom('v2:space:0,0:r1', box(20, 28, 0, 8));
  const far = { id: 'v2:dlink:0,0:0', from: A.spaceId, to: B.spaceId, kind: 'passage', rects: [box(50, 52, 50, 52)], grid: { ox: 50, oz: 50, step: 6 } };
  const halls = { '0,0': { ...A.rects[0], spaceId: A.spaceId } };
  assert.throws(() => roomGraph(standIn({ plan: { a: 0, b: 0, rooms: [A, B], links: [far], anchors: {} }, halls }), [[0, 0]]), { name: 'TypeError', message: 'v2:dlink:0,0:0: no passage centreline' });
});
const found42 = (w) => { for (let a = -2; a < 2; a++) for (let b = -2; b < 2; b++) if (w.districtPlan(a, b)) return [a, b]; assert.fail('no cluster district'); };

// authored passages without metadata: a bend, a zero-gap contact, and the endpoint order
function authoredCentrelines() {
  const A = sourceRoom('v2:space:0,0:r0', box(0, 8, 0, 8));
  const edgeOf = (rooms, rects) => {
    const links = [{ id: 'v2:dlink:0,0:0', from: rooms[0].spaceId, to: rooms[1].spaceId, kind: 'passage', rects, grid: { ox: rects[0].x0, oz: rects[0].z0, step: 6 } }];
    const w = standIn({ plan: { a: 0, b: 0, rooms, links, anchors: {} }, halls: { '0,0': { ...A.rects[0], spaceId: A.spaceId } } });
    const g = roomGraph(w, [[0, 0]]);
    return { edge: g.edges[0], nodes: g.nodes };
  };
  // a bend: the shortest cell path from room A's east face to room B's south face
  const B = sourceRoom('v2:space:0,0:r1', box(20, 28, 20, 28));
  const bent = edgeOf([A, B], [box(7.5, 22, 3, 5), box(20, 22, 3, 20.5)]);
  assert.equal(bent.edge.form, 'straight');
  assert.equal(bent.edge.gap, 27.5);
  assert.equal(bent.edge.stretch, 27.5);
  assert.equal(bent.edge.physicalGap, Math.hypot(12, 12));
  const [pa, pb] = [bent.nodes.get(A.spaceId).anchor, bent.nodes.get(B.spaceId).anchor];
  assert.equal(bent.edge.length, man(pa, [8, 4.75]) + 27.5 + man([20.25, 20], pb), 'the line starts at (8, 4.75) and ends at (20.25, 20)');
  // swapping the endpoints changes nothing about the line
  const swapped = edgeOf([B, A], [box(7.5, 22, 3, 5), box(20, 22, 3, 20.5)]);
  assert.equal(swapped.edge.length, bent.edge.length);
  // a straight bridge in one rectangle
  const C = sourceRoom('v2:space:0,0:r1', box(20, 28, 0, 8));
  const straight = edgeOf([A, C], [box(7.5, 20.5, 3, 5)]);
  assert.equal(straight.edge.gap, 12);
  assert.equal(straight.edge.length, man(straight.nodes.get(A.spaceId).anchor, [8, 4]) + 12 + man([20, 4], straight.nodes.get(C.spaceId).anchor));
  // zero-gap contact over a positive face: identical points, no gap
  const D = sourceRoom('v2:space:0,0:r1', box(8, 16, 2, 6));
  const touch = edgeOf([A, D], [box(7.5, 8.5, 3, 5)]);
  assert.equal(touch.edge.gap, 0);
  assert.equal(touch.edge.stretch, 0);
  assert.equal(touch.edge.physicalGap, 0);
  assert.equal(touch.edge.length, man(touch.nodes.get(A.spaceId).anchor, [8, 4]) + man([8, 4], touch.nodes.get(D.spaceId).anchor));
}

// ---- 6.7: thirty physical body walks ----
test('link distance measure: thirty body walks', { ...slow, timeout: 1_800_000 }, (t) => {
  const all = [];
  for (const seed of CORPUS.seeds) for (const p of measureWalks(new World2(seed), CORPUS.cells)) all.push({ seed, id: `v2:edge:${p.axis}:${p.i},${p.j}`, ...p });
  const byWalk = (a, b) => (b.walk > a.walk) - (b.walk < a.walk) || a.seed - b.seed || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const key = (p) => `${p.seed}|${p.id}`;
  const take = (list, what) => {
    const top = list.sort(byWalk).slice(0, 10);
    assert.equal(top.length, 10, `fewer than 10 ${what}`);
    return top;
  };
  const closed = take(all.filter((p) => p.closed), 'closed pairs'), used = new Set(closed.map(key));
  const xs = take(all.filter((p) => p.axis === 'x' && !used.has(key(p))), 'remaining x pairs');
  for (const p of xs) used.add(key(p));
  const zs = take(all.filter((p) => p.axis === 'z' && !used.has(key(p))), 'remaining z pairs');
  const pick = [...closed, ...xs, ...zs];
  assert.equal(new Set(pick.map(key)).size, 30, 'thirty unique pairs');
  const near = (w, h) => {
    const cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2, player = new Player(), spots = [];
    for (let x = 0.25 + 0.5 * Math.floor((h.x0 - 0.25) / 0.5); x < h.x1; x += 0.5) for (let z = 0.25 + 0.5 * Math.floor((h.z0 - 0.25) / 0.5); z < h.z1; z += 0.5) {
      if (x > h.x0 && z > h.z0) spots.push([x, z, (x - cx) ** 2 + (z - cz) ** 2]);
    }
    for (const [x, z] of spots.sort((p, q) => p[2] - q[2] || p[0] - q[0] || p[1] - q[1])) {
      const surface = player.canStand(w, x, z, 0) ? w.surfaceAt(x, z, 0) : null;
      if (surface !== null && surface.h === 0 && Number.isNaN(surface.wl)) return [x, z];
    }
    return assert.fail(`no dry floor in the hall ${JSON.stringify(h)}`);
  };
  const report = [];
  for (const p of pick) {
    const w = new World2(p.seed), [ni, nj] = p.axis === 'x' ? [p.i + 1, p.j] : [p.i, p.j + 1], tag = `seed=${p.seed} ${p.id}`;
    const [s, e] = [near(w, w.hallOf(p.i, p.j)), near(w, w.hallOf(ni, nj))], [targetX, targetZ] = e;
    const done = (x, z, h) => x === targetX && z === targetZ && Math.abs(h) < 0.01, limit = p.walk * 1.25;
    const [i0, i1, j0, j1] = [p.i, ni, p.j, nj];
    const minDI = Math.min(Math.floor(i0 / 2), Math.floor(i1 / 2)) - 1, maxDI = Math.max(Math.floor(i0 / 2), Math.floor(i1 / 2)) + 1;
    const minDJ = Math.min(Math.floor(j0 / 2), Math.floor(j1 / 2)) - 1, maxDJ = Math.max(Math.floor(j0 / 2), Math.floor(j1 / 2)) + 1;
    const x0 = Math.max(-255.75, 2 * minDI * 64 + 0.25), x1 = Math.min(255.75, 2 * (maxDI + 1) * 64 - 0.25);
    const z0 = Math.max(-255.75, 2 * minDJ * 64 + 0.25), z1 = Math.min(255.75, 2 * (maxDJ + 1) * 64 - 0.25);
    let body = walkLength(w, x0, z0, x1, z1, [s[0], s[1], 0], done), retried = false;
    if (!Number.isFinite(body) || body > limit) { body = walkLength(w, -255.75, -255.75, 255.75, 255.75, [s[0], s[1], 0], done); retried = true; }
    report.push(`${tag}${retried ? ' (retried)' : ''}: ${p.walk} → ${body}`);
    assert.ok(Number.isFinite(p.walk), `${tag}: no estimate`);
    assert.ok(Number.isFinite(body), `${tag}: a body cannot walk it`);
    assert.ok(body <= limit, `${tag}: estimated ${p.walk} m, a body walks ${body} m`);
  }
  t.diagnostic(report.join(' · '));
});

// the legacy walker's numbers over the corpus before this change: [pairs, total walk, longest stretch, closed pairs]
const LEGACY_SUMS = { 1: [112, 9717.5, 32, 13], 42: [112, 9333.5, 30, 10] };

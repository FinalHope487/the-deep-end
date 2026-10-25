// T1 room proximity measurement: the room graph (canonical records, the World2 adapter), its metrics and the report
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../../js/gen2.js';
import { CORPUS, roomGraph, roomGraphFromRecords, measureRoomGraphs, measureWalks, measureClosedDetours, summarizeClosedDetours, measureWorld, formatReport } from '../../js/gen2-measure.js';

const part = (id, i, j, x0, x1, z0, z1) => ({ id, i, j, x0, x1, z0, z1 });
const room = (spaceId, parts, kind = 'hall') => ({ spaceId, kind, lv: 0, parts });
const link = (id, a, b, kind, line) => ({ id, a, b, kind, line });

// F1: four rooms, one cell
const f1 = () => ({
  rooms: [
    room('A', [part('A:0,0', 0, 0, 0, 4, 0, 4)]),
    room('B', [part('B:0,0', 0, 0, 4, 8, 0, 4)]),
    room('C', [part('C:0,0', 0, 0, 10, 16, 0, 4)]),
    room('D', [part('D:0,0', 0, 0, 50, 58, 0, 4)]),
  ],
  links: [
    link('AB', 'A', 'B', 'opening', [[4, 1.75], [4, 1.75]]),
    link('BC', 'B', 'C', 'corridor', [[8, 1.75], [10, 1.75]]),
    link('AC', 'A', 'C', 'corridor', [[4, 1.75], [10, 1.75]]),
    link('CD', 'C', 'D', 'corridor', [[16, 1.75], [50, 1.75]]),
  ],
});
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const edgeOf = (g, id) => g.edges.find((e) => e.id === id);

// a stand-in for World2 that answers only what the adapter should ask: an unrequested hall or connection throws
function synth({ halls, conns = {}, diags = {}, links = {} }) {
  const need = (m, k, what) => { if (!(k in m)) throw new Error(`unrequested ${what} ${k}`); return m[k]; };
  return {
    hallOf: (i, j) => need(halls, `${i},${j}`, 'hall'),
    connectionOf: (i, j, axis) => need(conns, `${axis}:${i},${j}`, 'connection'),
    linkOf: (i, j, axis) => need(links, `${axis}:${i},${j}`, 'link'),
    diagonalOf: (a, b) => diags[`${a},${b}`] ?? null,
  };
}

test('roomGraph: output is independent of cell planning order', () => {
  for (const seed of CORPUS.seeds) {
    const fwd = new World2(seed), rev = new World2(seed);
    for (const [i, j] of CORPUS.cells) fwd.plan(i, j);
    for (const [i, j] of [...CORPUS.cells].reverse()) rev.plan(i, j);
    assert.deepStrictEqual(roomGraph(fwd, CORPUS.cells), roomGraph(rev, [...CORPUS.cells].reverse()), `seed ${seed}`);
  }
});

test('roomGraph: shared space fragments count once', () => {
  const rec = { rooms: [room('S', [part('S:0,0', 0, 0, 63, 64, 0, 2), part('S:1,0', 1, 0, 64, 65, 0, 2)])], links: [] };
  const g = roomGraphFromRecords(rec, [[1, 0], [0, 0]]);
  assert.equal(g.nodes.size, 1);
  const n = g.nodes.get('S');
  assert.equal(n.area, 4);
  assert.deepEqual(n.anchor, [63.75, 0.75]);
  assert.deepEqual(n.cells, [[0, 0], [1, 0]]);
  const m = measureRoomGraphs([{ seed: 1, cells: [[0, 0], [1, 0]], graph: g }]);
  assert.deepEqual(m.rooms.perDistrict, { n: 1, min: 1, p25: 1, median: 1, p75: 1, max: 1 });
});

test('roomGraphFromRecords: four rooms have exact proximity metrics', () => {
  const g = roomGraphFromRecords(f1(), [[0, 0]]);
  assert.equal(g.nodes.size, 4);
  assert.equal(g.edges.length, 4);
  assert.deepEqual([...g.nodes.keys()], ['A', 'B', 'C', 'D']);
  for (const [id, area, anchor] of [['A', 16, [1.75, 1.75]], ['B', 16, [5.75, 1.75]], ['C', 24, [12.75, 1.75]], ['D', 32, [53.75, 1.75]]]) {
    assert.equal(g.nodes.get(id).area, area, id);
    assert.deepEqual(g.nodes.get(id).anchor, anchor, id);
  }
  for (const [id, gap, length] of [['AB', 0, 4], ['BC', 2, 7], ['AC', 6, 11], ['CD', 34, 41]]) {
    const e = edgeOf(g, id);
    assert.equal(e.gap, gap, id);
    assert.equal(e.length, length, id);
  }
  const m = measureRoomGraphs([{ seed: 1, cells: [[0, 0]], graph: g }]);
  assert.deepEqual(m.rooms.gap, { n: 4, min: 0, p25: 2, median: 6, p75: 34, max: 34 });
  assert.equal(m.rooms.edges, 4);
  assert.equal(m.rooms.direct, 0.25);
  assert.equal(m.rooms.near, 0.75);
  assert.equal(m.rooms.long, 0.25);
  assert.deepEqual(m.rooms.perDistrict, { n: 1, min: 4, p25: 4, median: 4, p75: 4, max: 4 });
  assert.equal(m.rooms.areaMedian, 24);
  assert.equal(m.roomComponents[1], 1);
});

test('roomGraphFromRecords: overlapping fragments use union area', () => {
  const rec = { rooms: [room('X', [part('X:a', 0, 0, 0, 4, 0, 4), part('X:b', 0, 0, 2, 6, 0, 4)])], links: [] };
  assert.equal(roomGraphFromRecords(rec, [[0, 0]]).nodes.get('X').area, 24);
});

test('roomGraphFromRecords: missing endpoints and conflicting IDs fail', () => {
  const sample = [[0, 0]], bad = (mutate, cells = sample) => { const r = f1(); mutate(r); assert.throws(() => roomGraphFromRecords(r, cells), TypeError); };
  bad((r) => { r.links[0].b = 'Z'; });                                                    // an endpoint that is declared nowhere
  bad((r) => { r.links[0].a = 'Z'; });
  bad((r) => { r.rooms[1].parts[0].id = 'A:0,0'; });                                      // one fragment id, two rectangles
  bad((r) => { r.rooms[1].parts[0].id = 'A:0,0'; r.rooms[1].parts[0].x0 = 0; r.rooms[1].parts[0].x1 = 4; });   // same rectangle, other room
  bad((r) => { r.links.push(link('AB', 'A', 'B', 'opening', [[4, 2.25], [4, 2.25]])); });  // one link id, two lines
  bad((r) => { r.rooms.push(room('A', [part('A:0,0:b', 0, 0, 20, 22, 0, 2)], 'connector-room')); });   // one space, two kinds
  bad(() => {}, [[0, 0], [0, 0]]);                                                        // a sampled cell twice
  bad((r) => { r.rooms[0].parts[0].x0 = 0.3; });                                           // off the Q2 grid
  bad((r) => { r.rooms[0].parts[0].x1 = Infinity; });
  bad((r) => { r.rooms[0].parts[0].z0 = NaN; });
  bad((r) => { r.rooms[0].parts[0].x1 = r.rooms[0].parts[0].x0; });                       // no area
  bad((r) => { r.rooms[0].parts[0].z1 = r.rooms[0].parts[0].z0 - 1; });
  bad((r) => { r.rooms[3].parts[0].x1 = 64.5; });                                          // out of its cell
  bad((r) => { r.rooms[0].parts[0].i = 1; });                                              // not in its declared cell
  bad((r) => { r.rooms[0].parts[0].i = 0.5; });
  bad((r) => { r.rooms[0].lv = 1; });
  for (const kind of ['corridor', 'b1corridor', 'route', 'diagonal', 'showcase', 'shaft']) bad((r) => { r.rooms[0].kind = kind; });
  bad((r) => { r.rooms[0].spaceId = ''; });
  bad((r) => { r.links[0].kind = 'tunnel'; });
  bad((r) => { r.links[1].line = [[8, 1.75]]; });                                          // one point
  bad((r) => { r.links[1].line = [[8, 1.75], [10, 2.25]]; });                              // a diagonal segment
  bad((r) => { r.links[1].line = [[8, NaN], [10, NaN]]; });
  bad((r) => { r.links[1].line = [[8, 5], [10, 5]]; });                                    // off the room's wall
  bad((r) => { r.links[3].line = [[16, 1.75], [30, 1.75]]; });                             // ends in the open, not on D
  bad((r) => { r.links[1].line = [[7, 1.75], [10, 1.75]]; });                              // starts inside B, ends on C
  bad((r) => { r.links[1].line = [[8, 1.75], [11, 1.75]]; });                              // starts on B, ends inside C
  bad((r) => { r.links[0].line = [[4, 1.75], [5, 1.75]]; });                               // an opening with a gap
  bad((r) => { r.rooms = {}; });
  bad((r) => { r.links = null; });
});

test('roomGraphFromRecords: a seam between two fragments of one room is no outer boundary', () => {
  const rooms = () => [room('S', [part('S:0,0', 0, 0, 63, 64, 0, 2), part('S:1,0', 1, 0, 64, 65, 0, 2)]), room('T', [part('T:0,0', 0, 0, 58, 62, 0, 2)])];
  const cells = [[0, 0], [1, 0]];
  // the room's own wall at x = 63 is a boundary, even with the sample holding only one fragment
  assert.equal(roomGraphFromRecords({ rooms: rooms(), links: [link('TS', 'S', 'T', 'corridor', [[63, 1], [62, 1]])] }, [[0, 0]]).edges.length, 1);
  assert.throws(() => roomGraphFromRecords({ rooms: rooms(), links: [link('TS', 'S', 'T', 'corridor', [[64, 1], [62, 1]])] }, cells), TypeError);
  assert.throws(() => roomGraphFromRecords({ rooms: rooms(), links: [link('TS', 'S', 'T', 'corridor', [[64, 1], [62, 1]])] }, [[0, 0]]), TypeError);   // the other fragment is declared, not sampled: still no boundary
});

test('roomGraphFromRecords: valid repeats merge and inputs stay untouched', () => {
  const r = f1();
  r.rooms.push(room('A', [part('A:0,0', 0, 0, 0, 4, 0, 4)]));                              // the same fragment again
  r.links.push(link('AB', 'A', 'B', 'opening', [[4, 1.75], [4, 1.75]]));                    // the same link again
  r.rooms.push(room('B', [part('B:0,0:more', 0, 0, 4, 8, 4, 6)]));                          // another fragment of B
  const before = JSON.stringify(r);
  const g = roomGraphFromRecords(deepFreeze(r), deepFreeze([[0, 0]]));
  assert.equal(JSON.stringify(r), before);
  assert.equal(g.nodes.size, 4);
  assert.equal(g.edges.length, 4);
  assert.equal(g.nodes.get('B').area, 16 + 8);
});

test('roomGraphFromRecords: contact does not create an edge', () => {
  const rec = f1();
  rec.links = [];
  rec.rooms = rec.rooms.slice(0, 2);
  const g = roomGraphFromRecords(rec, [[0, 0]]);
  assert.equal(g.nodes.size, 2);
  assert.equal(g.edges.length, 0);
  assert.equal(measureRoomGraphs([{ seed: 1, cells: [[0, 0]], graph: g }]).roomComponents[1], 2);
});

test('roomGraph: isolated nodes count as components', () => {
  const graph = (ids) => ({ nodes: new Map(ids.map((id) => [id, { area: 1, cells: [[0, 0]], kind: 'hall', anchor: [0.25, 0.25] }])), edges: [] });
  const comp = (g) => measureRoomGraphs([{ seed: 5, cells: [[0, 0]], graph: g }]).roomComponents[5];
  assert.equal(comp(graph([])), 0);
  assert.equal(comp(graph(['A'])), 1);
  assert.equal(comp(graph(['A', 'B'])), 2);
  const joined = graph(['A', 'B']);
  joined.edges.push({ id: 'AB', a: 'A', b: 'B', kind: 'opening', gap: 0, length: 1 }, { id: 'AB2', a: 'A', b: 'B', kind: 'corridor', gap: 3, length: 4 });
  assert.equal(comp(joined), 1);   // a parallel edge adds no component
});

// F3: two halls on either side of a cell edge, joined by a seam
const f3 = (b = 'B') => synth({
  halls: { '0,0': { x0: 60, x1: 64, z0: 0, z1: 4, spaceId: 'A' }, '1,0': { x0: 64, x1: 68, z0: 0, z1: 4, spaceId: b } },
  conns: { 'x:0,0': { id: 'v2:edge:x:0,0', axis: 'x', mode: 'seam', fromSpaceId: 'A', toSpaceId: b } },
});

test('roomGraph: different-space seams create zero-gap edges', () => {
  const g = roomGraph(f3(), [[1, 0], [0, 0]]);
  assert.equal(g.nodes.size, 2);
  assert.equal(g.nodes.get('A').area, 16);
  assert.equal(g.nodes.get('B').area, 16);
  assert.deepEqual(g.nodes.get('A').anchor, [61.75, 1.75]);
  assert.deepEqual(g.nodes.get('B').anchor, [65.75, 1.75]);
  assert.equal(g.edges.length, 1);
  assert.deepEqual(g.edges[0], { id: 'v2:edge:x:0,0', a: 'A', b: 'B', kind: 'seam', gap: 0, length: 4.5 });
  assert.equal(measureRoomGraphs([{ seed: 1, cells: [[0, 0], [1, 0]], graph: g }]).roomComponents[1], 1);
  // the midpoint of the faces' overlap is where the seam is crossed: [64, 2]
  // (halls A: z 0-6, B: z 3-5 overlap on 3-5: the seam is crossed at [64, 4], 3.5 m from A's anchor and 2 m from B's)
  const tall = f3(), hall = tall.hallOf;
  tall.hallOf = (i, j) => (i === 0 ? { ...hall(i, j), z1: 6 } : { ...hall(i, j), z0: 3, z1: 5 });
  const offset = roomGraph(tall, [[0, 0], [1, 0]]);
  assert.deepEqual(offset.edges[0], { id: 'v2:edge:x:0,0', a: 'A', b: 'B', kind: 'seam', gap: 0, length: 5.5 });
  // the same space on both sides: one room, no edge
  const same = roomGraph(f3('A'), [[0, 0], [1, 0]]);
  assert.equal(same.nodes.size, 1);
  assert.equal(same.nodes.get('A').area, 32);
  assert.deepEqual(same.nodes.get('A').anchor, [63.75, 1.75]);
  assert.equal(same.edges.length, 0);
  assert.equal(measureRoomGraphs([{ seed: 1, cells: [[0, 0], [1, 0]], graph: same }]).roomComponents[1], 1);
  // faces that do not touch on the cell edge are no seam
  const apart = f3(); apart.hallOf = (i, j) => (i === 1 ? { x0: 65, x1: 68, z0: 0, z1: 4, spaceId: 'B' } : f3().hallOf(i, j));
  assert.throws(() => roomGraph(apart, [[0, 0], [1, 0]]), TypeError);
});

// F4: a diagonal with a connector room in its middle, over the four cells of district (0, 0)
const f4 = (withRoom = true) => {
  const conn = (axis, i, j) => ({ id: `v2:edge:${axis}:${i},${j}`, axis, mode: 'closed', fromSpaceId: 'X', toSpaceId: 'Y' });
  const d = {
    id: 'v2:diag:0,0', cells: [{ i: 0, j: 0 }, { i: 1, j: 1 }], fromSpaceId: 'A', toSpaceId: 'B',
    line: [[60, 54], [64, 54], [64, 74], [68, 74]], length: 28,
    middleRoom: { spaceId: 'M', kind: 'connector-room', lv: 0, x0: 62, x1: 66, z0: 62, z1: 66, ceil: 4, lampGrid: { ox: 62, oz: 62, step: 6 } },
    corridorLengths: [12, 12], stretch: 12,
  };
  if (!withRoom) { delete d.middleRoom; delete d.corridorLengths; delete d.stretch; }
  return synth({
    halls: {
      '0,0': { x0: 48, x1: 60, z0: 48, z1: 60, spaceId: 'A' }, '1,0': { x0: 92, x1: 104, z0: 16, z1: 28, spaceId: 'X' },
      '0,1': { x0: 16, x1: 28, z0: 92, z1: 104, spaceId: 'Y' }, '1,1': { x0: 68, x1: 80, z0: 68, z1: 80, spaceId: 'B' },
    },
    conns: { 'x:0,0': conn('x', 0, 0), 'x:0,1': conn('x', 0, 1), 'z:0,0': conn('z', 0, 0), 'z:1,0': conn('z', 1, 0) },
    diags: { '0,0': d },
  });
};
const four = [[0, 0], [0, 1], [1, 0], [1, 1]];

test('roomGraph: diagonal middle rooms split one link into two edges', () => {
  const g = roomGraph(f4(), four);
  assert.equal(g.nodes.size, 5);
  assert.equal(g.edges.length, 2);
  const m = g.nodes.get('M');
  assert.equal(m.area, 16);
  assert.deepEqual(m.anchor, [63.75, 63.75]);
  assert.deepEqual(m.cells, [[0, 0], [0, 1], [1, 0], [1, 1]]);   // all four fragments, one per cell
  assert.deepEqual(g.edges.map((e) => [e.id, e.a, e.b, e.kind, e.gap, e.length]), [
    ['v2:diag:0,0:a', 'A', 'M', 'diagonal', 12, 20.5],
    ['v2:diag:0,0:b', 'B', 'M', 'diagonal', 12, 20.5],
  ]);
  assert.ok(!g.edges.some((e) => (e.a === 'A' && e.b === 'B') || (e.a === 'B' && e.b === 'A')), 'no direct A-B edge');
  // a partial sample keeps the four fragments for validation and counts only the sampled two
  const part2 = roomGraph(f4(), [[1, 1], [0, 0]]);
  assert.equal(part2.nodes.size, 3);
  assert.equal(part2.nodes.get('M').area, 8);
  assert.deepEqual(part2.nodes.get('M').anchor, [63.75, 63.75]);
  assert.deepEqual(part2.edges.map((e) => e.gap), [12, 12]);
  // before the middle room existed: one direct diagonal edge
  const old = roomGraph(f4(false), four);
  assert.equal(old.nodes.has('M'), false);
  assert.equal(old.edges.length, 1);
  assert.deepEqual([old.edges[0].a, old.edges[0].b, old.edges[0].kind, old.edges[0].gap, old.edges[0].length], ['A', 'B', 'diagonal', 28, 40.5]);
  // a diagonal with an end cell out of the sample is left out
  assert.equal(roomGraph(f4(), [[0, 0], [1, 0]]).edges.length, 0);
});

test('roomGraph: boundary connectors do not create isolated nodes', () => {
  // the declared connector room across the edge to the unsampled cell (1, 0): it exists in the world, but the adapter must not ask for it
  const boundary = {
    id: 'v2:edge:x:0,0', axis: 'x', mode: 'connector-room', fromSpaceId: 'A', toSpaceId: 'B', connectorSpaceId: 'M',
    gaps: [27, 27], corridor: { t: 0, w: 2, ceil: 2.5 },
    parts: [{ i: 0, j: 0, x0: 56, x1: 64, z0: 28, z1: 36 }, { i: 1, j: 0, x0: 64, x1: 72, z0: 28, z1: 36 }],
  };
  const w = synth({ halls: { '0,0': { x0: 60, x1: 64, z0: 0, z1: 4, spaceId: 'A' } }, conns: { 'x:0,0': boundary } }), asked = [];
  const connectionOf = w.connectionOf;
  w.connectionOf = (...a) => { asked.push(a.join()); return connectionOf(...a); };
  const g = roomGraph(w, [[0, 0]]);
  assert.deepEqual(asked, []);
  assert.deepEqual([...g.nodes.keys()], ['A']);
  assert.equal(g.edges.length, 0);
});

test('roomGraphFromRecords: record order does not change the result', () => {
  const r = f1();
  const rev = { rooms: [...r.rooms].reverse().map((o) => ({ ...o, parts: [...o.parts].reverse() })), links: [...r.links].reverse() };
  assert.deepStrictEqual(roomGraphFromRecords(rev, [[0, 0]]), roomGraphFromRecords(f1(), [[0, 0]]));
});

test('roomGraphFromRecords: canonical self-links are rejected', () => {
  const r = f1();
  r.links.push(link('AA', 'A', 'A', 'corridor', [[4, 1.75], [4, 1.75]]));
  assert.throws(() => roomGraphFromRecords(r, [[0, 0]]), TypeError);
});

// the contract the metrics demand of a graph, one violation at a time
test('measureRoomGraphs: empty graphs and isolated nodes have exact component counts', () => {
  assert.deepStrictEqual(measureRoomGraphs([]), {
    rooms: { edges: 0, gap: { n: 0 }, direct: 0, near: 0, long: 0, perDistrict: { n: 0 }, areaMedian: 0 },
    roomComponents: {},
  });
  const comps = (...ids) => measureRoomGraphs([{ seed: 9, cells: [[0, 0]], graph: { nodes: new Map(ids.map((id) => [id, { area: 0, cells: [[0, 0]], kind: 'hall', anchor: [0, 0] }])), edges: [] } }]).roomComponents[9];
  assert.equal(comps(), 0);
  assert.equal(comps('A'), 1);
  assert.equal(comps('A', 'B'), 2);
  const two = { nodes: new Map(['A', 'B'].map((id) => [id, { area: 1, cells: [[0, 0]], kind: 'hall', anchor: [0, 0] }])), edges: [{ id: 'e', a: 'A', b: 'B', kind: 'seam', gap: 0, length: 0 }] };
  assert.equal(measureRoomGraphs([{ seed: 9, cells: [[0, 0]], graph: two }]).roomComponents[9], 1);
});

test('measureRoomGraphs: duplicate seeds are rejected', () => {
  const s = () => ({ seed: 1, cells: [[0, 0]], graph: roomGraphFromRecords(f1(), [[0, 0]]) });
  assert.throws(() => measureRoomGraphs([s(), s()]), TypeError);
  assert.throws(() => measureRoomGraphs([{ ...s(), seed: -1 }]), TypeError);
  assert.throws(() => measureRoomGraphs([{ ...s(), seed: 4294967296 }]), TypeError);
  assert.throws(() => measureRoomGraphs([{ ...s(), seed: 1.5 }]), TypeError);
});

test('measureRoomGraphs: canonical self-edges are rejected', () => {
  const g = roomGraphFromRecords(f1(), [[0, 0]]);
  g.edges.push({ id: 'AA', a: 'A', b: 'A', kind: 'corridor', gap: 1, length: 2 });
  assert.throws(() => measureRoomGraphs([{ seed: 1, cells: [[0, 0]], graph: g }]), TypeError);
});

test('measureRoomGraphs: invalid graph values are rejected and inputs stay untouched', () => {
  const sample = (mutate, cells = [[0, 0]]) => { const g = roomGraphFromRecords(f1(), [[0, 0]]); mutate(g); return [{ seed: 1, cells, graph: g }]; };
  const node = (g) => g.nodes.get('A');
  for (const [name, mutate] of [
    ['nodes not a Map', (g) => { g.nodes = {}; }],
    ['edges not an array', (g) => { g.edges = null; }],
    ['empty edge id', (g) => { g.edges[0].id = ''; }],
    ['duplicate edge id', (g) => { g.edges[1].id = g.edges[0].id; }],
    ['unknown endpoint', (g) => { g.edges[0].b = 'Z'; }],
    ['bad edge kind', (g) => { g.edges[0].kind = 'door'; }],
    ['negative gap', (g) => { g.edges[0].gap = -1; }],
    ['infinite length', (g) => { g.edges[0].length = Infinity; }],
    ['empty node kind', (g) => { node(g).kind = ''; }],
    ['anchor of three', (g) => { node(g).anchor = [0, 0, 0]; }],
    ['anchor with NaN', (g) => { node(g).anchor = [NaN, 0]; }],
    ['no cells', (g) => { node(g).cells = []; }],
    ['duplicate cells', (g) => { node(g).cells = [[0, 0], [0, 0]]; }],
    ['cell out of sample', (g) => { node(g).cells = [[3, 3]]; }],
    ['negative area', (g) => { node(g).area = -1; }],
    ['empty node key', (g) => { g.nodes.set('', node(g)); }],
  ]) assert.throws(() => measureRoomGraphs(sample(mutate)), TypeError, name);
  assert.throws(() => measureRoomGraphs(sample(() => {}, [[0, 0], [0, 0]])), TypeError, 'duplicate sampled cells');
  const ok = roomGraphFromRecords(f1(), [[0, 0]]);
  ok.nodes.get('A').area = 0;   // a zero area is allowed
  const input = [{ seed: 1, cells: [[0, 0]], graph: ok }], before = JSON.stringify([...ok.nodes, ok.edges]);
  measureRoomGraphs(deepFreeze(input));
  assert.equal(JSON.stringify([...ok.nodes, ok.edges]), before);
});

test('measureWorld: the room graph fields and gates hold over the corpus', () => {
  const r = measureWorld(CORPUS);
  assert.deepEqual(Object.keys(r).slice(Object.keys(r).indexOf('connections'), Object.keys(r).indexOf('connections') + 4), ['connections', 'rooms', 'roomComponents', 'closedDetour']);
  assert.equal(r.rooms.gap.n, r.rooms.edges);
  for (const k of ['direct', 'near', 'long']) assert.ok(Number.isFinite(r.rooms[k]) && r.rooms[k] >= 0 && r.rooms[k] <= 1, k);
  for (const seed of CORPUS.seeds) assert.equal(r.roomComponents[seed], 1, `room graph pieces of seed ${seed}`);
  assert.ok(Number.isFinite(r.connections.walk.mean) && Number.isFinite(r.connections.walk.p90));
  assert.ok(r.connections.walk.all.n > 0 && r.connections.walk.closed.n > 0);
  assert.ok(r.connections.stretch.max <= 36 && r.connections.stretch.over36 === 0, `longest corridor stretch on a shortest route: ${r.connections.stretch.max}`);
  assert.equal(r.closedDetour.n + r.closedDetour.unreachable, r.connections.closed.count);
  const text = formatReport(r);
  for (const label of ['room graph edges:', 'room graph gaps (m):', 'room graph direct (gap = 0):', 'room graph near (gap <= 6 m):', 'room graph long (gap > 30 m):',
    '1F rooms per sampled 2x2 district:', '1F logical room area median:', 'closed detour added walk (m):', 'room graph components per seed:']) assert.ok(text.includes(label), label);
  assert.match(text, / · mean \d+\.\d\d m · p90 \d+\.\d\d m/);
  const before = text.indexOf('longest corridor stretch on the way');
  for (const label of ['room graph edges:', '1F logical room area median:']) assert.ok(text.indexOf(label) < before, `${label} comes before the stretch line`);
});

test('formatReport: closed detour and component lines in their exact shapes', () => {
  const r = measureWorld({ seeds: [], cells: CORPUS.cells });
  assert.ok(formatReport(r).includes('room graph components per seed: none'));
  assert.ok(formatReport({ ...r, closedDetour: { n: 0, unreachable: 5 } }).includes('closed detour added walk (m): n 0 · unreachable 5'));
  const full = formatReport({ ...r, closedDetour: { n: 3, min: 1, p25: 2, median: 3, p75: 4, p90: 5, max: 6, unreachable: 2 } });
  assert.ok(full.includes('closed detour added walk (m): n 3 · min 1 · p25 2 · median 3 · p75 4 · p90 5 · max 6 · unreachable 2'));
  assert.ok(formatReport({ ...r, roomComponents: { 42: 1, 7: 2, 1234: 1 } }).includes('room graph components per seed: 7: 2 · 42: 1 · 1234: 1'));
});

// F5: a square of four 10 × 10 m halls joined by 54 m corridors, the edge x:0,0 closed
function f5() {
  const halls = {}, conns = {}, links = {}, id = (axis, i, j) => `v2:edge:${axis}:${i},${j}`;
  for (const i of [0, 1]) for (const j of [0, 1]) { const cx = i * 64 + 32, cz = j * 64 + 32; halls[`${i},${j}`] = { x0: cx - 5, x1: cx + 5, z0: cz - 5, z1: cz + 5, spaceId: `H:${i},${j}` }; }
  for (const [axis, i, j] of [['x', 0, 0], ['x', 0, 1], ['z', 0, 0], ['z', 1, 0]]) {
    const [ni, nj] = axis === 'x' ? [i + 1, j] : [i, j + 1];
    const open = { id: id(axis, i, j), axis, mode: 'corridor', fromSpaceId: `H:${i},${j}`, toSpaceId: `H:${ni},${nj}`, gaps: [27, 27], corridor: { t: 0, w: 2, ceil: 2.5 } };
    links[`${axis}:${i},${j}`] = open;
    conns[`${axis}:${i},${j}`] = axis === 'x' && i === 0 && j === 0 ? { id: open.id, axis, mode: 'closed', fromSpaceId: open.fromSpaceId, toSpaceId: open.toSpaceId } : open;
  }
  return deepFreeze(synth({ halls, conns, links })) && { world: synth({ halls, conns, links }), data: deepFreeze({ halls, conns, links }) };
}
const square = [[0, 0], [1, 0], [0, 1], [1, 1]];

test('closedDetour: restores only the selected closed edge', () => {
  const { world, data } = f5(), before = JSON.stringify(data);
  const d = measureClosedDetours(world, square);
  assert.deepStrictEqual(d, [{ id: 'v2:edge:x:0,0', i: 0, j: 0, axis: 'x', before: 64, after: 192, delta: 128 }]);
  assert.equal(JSON.stringify(data), before, 'the world data is untouched');
  assert.equal(world.connectionOf(0, 0, 'x').mode, 'closed');
  assert.deepStrictEqual(summarizeClosedDetours(d), { n: 1, min: 128, p25: 128, median: 128, p75: 128, max: 128, p90: 128, unreachable: 0 });
});

test('closedDetour: unreachable detours are counted', () => {
  const { world } = f5();
  const d = measureClosedDetours(world, [[0, 0], [1, 0]]);
  assert.deepStrictEqual(d, [{ id: 'v2:edge:x:0,0', i: 0, j: 0, axis: 'x', before: 64, after: Infinity, delta: null }]);
  assert.deepStrictEqual(summarizeClosedDetours(d), { n: 0, unreachable: 1 });
  assert.deepStrictEqual(summarizeClosedDetours([]), { n: 0, unreachable: 0 });
});

test('measureWalks: restoreId rejects missing and nonclosed edges', () => {
  const { world } = f5();
  assert.equal(measureWalks(world, square).find((p) => p.i === 0 && p.j === 0 && p.axis === 'x').walk, 192);
  const restored = measureWalks(world, square, { restoreId: 'v2:edge:x:0,0' });
  assert.equal(restored.find((p) => p.i === 0 && p.j === 0 && p.axis === 'x').walk, 64);
  assert.deepStrictEqual(restored.filter((p) => !(p.i === 0 && p.j === 0 && p.axis === 'x')).map((p) => p.walk), measureWalks(world, square).filter((p) => !(p.i === 0 && p.j === 0 && p.axis === 'x')).map((p) => p.walk));
  for (const restoreId of ['v2:edge:x:9,9', 'v2:edge:x:0,1', 'v2:edge:z:0,0', '', 5, 'nope']) assert.throws(() => measureWalks(world, square, { restoreId }), TypeError, String(restoreId));   // missing, open, open, invalid
  assert.throws(() => measureWalks(world, [[0, 0], [0, 1]], { restoreId: 'v2:edge:x:0,0' }), TypeError, 'out of the sample');
  assert.deepStrictEqual(measureWalks(world, square, { restoreId: null }), measureWalks(world, square));
});

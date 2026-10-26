// T5 cluster topology: the pure source-room graph (buildClusterTopology). Link materialization, protection and world tests join this file in later commits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../../js/gen2.js';
import { buildClusterDistrict, buildClusterTopology } from '../../js/gen2-district.js';
import { hash2, mulberry32 } from '../../js/rng.js';

const SLOT_ORDER = ['anchor', 'E', 'S', 'T'];
const GROUPS = ['tight-cluster', 'main-and-side', 'ring', 'nested', 'gallery-grid'];
const GROUP_SEEDS = {   // seeds for district (1, 1): the group and the omitted perimeter edge o = 0..3
  'tight-cluster': [16, 20, 2, 18],
  'main-and-side': [0, 23, 7, 42],
  ring: [5, 19, 48, 10],
  nested: [27, 52, 1, 12],
  'gallery-grid': [4, 60, 8, 50],
};
const PERIMETER = [['0E', '1E'], ['0S', '2S'], ['1S', '3S'], ['2E', '3E']];   // AB, AC, BD, CD by cell number and slot

const idOf = (a, b, k) => `v2:space:${a},${b}:r${k}`;
const renumber = (list, a, b) => { list.forEach((r, k) => { r.spaceId = idOf(a, b, k); }); return list; };
// the T3 source order: per cell anchor, E, S and, when the mask bit holds, T
function makeSpec(a, b, mask, { giantCell = -1, shape = 'rect' } = {}) {
  const list = [];
  for (let cell = 0; cell < 4; cell++) {
    for (const slot of SLOT_ORDER) {
      if (slot === 'T' && !((mask >> cell) & 1)) continue;
      list.push({ spaceId: '', cell, slot, role: slot === 'anchor' ? (cell === giantCell ? 'giant' : 'main') : 'small', shape: slot === 'anchor' ? 'rect' : shape });
    }
  }
  return renumber(list, a, b);
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const popcount = (m) => [0, 1, 2, 3].filter((c) => (m >> c) & 1).length;
const bad = { name: 'TypeError', message: 'Invalid cluster topology' };

// the two 8810 draws and what they select, reconstructed from the public rng helpers
function drawsOf(seed, a, b) {
  const r = mulberry32(hash2(seed >>> 0, a, b, 8810));
  const typeDraw = r(), perimeterDraw = r();
  const group = typeDraw < 0.25 ? 'tight-cluster' : typeDraw < 0.5 ? 'main-and-side' : typeDraw < 0.7 ? 'ring' : typeDraw < 0.85 ? 'nested' : 'gallery-grid';
  return { group, o: Math.floor(perimeterDraw * 4) };
}

// an edge oracle written from the handoff table, on "<cell><slot>" names
function oracleEdges(group, o, mask) {
  const has = (c) => (mask >> c) & 1;
  const pairs = [];
  for (let c = 0; c < 4; c++) pairs.push([`${c}anchor`, `${c}E`], [`${c}anchor`, `${c}S`]);
  PERIMETER.forEach((p, i) => { if (group === 'ring' || group === 'gallery-grid' || i !== o) pairs.push(p); });
  for (let c = 0; c < 4; c++) {
    if (!has(c)) continue;
    if (group !== 'nested') pairs.push([`${c}anchor`, `${c}T`]);
    if (group === 'tight-cluster' || group === 'nested' || group === 'gallery-grid') pairs.push([`${c}E`, `${c}T`]);
  }
  if (group === 'gallery-grid') {
    if (has(0) && has(1)) pairs.push(['0T', '1T']);
    if (has(2) && has(3)) pairs.push(['2T', '3T']);
  }
  return pairs;
}
const sortPairs = (pairs) => pairs.map(([p, q]) => (p < q ? [p, q] : [q, p])).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
const indexEdges = (topology) => topology.edges.map((e) => [topology.roomIds.indexOf(e.from), topology.roomIds.indexOf(e.to)]);

function componentCount(n, edges) {
  const seen = new Array(n).fill(false);
  let parts = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    parts++;
    const stack = [s];
    seen[s] = true;
    while (stack.length) {
      const v = stack.pop();
      for (const [p, q] of edges) {
        const w = p === v ? q : q === v ? p : -1;
        if (w >= 0 && !seen[w]) { seen[w] = true; stack.push(w); }
      }
    }
  }
  return parts;
}

test('topology: input schema', () => {
  const a = 1, b = 1, seed = 7;
  const valid = () => makeSpec(a, b, 0b1111);
  const ok = buildClusterTopology(seed, a, b, valid());
  assert.deepEqual(Object.keys(ok), ['groupType', 'roomIds', 'edges', 'exterior']);
  assert.equal(ok.roomIds.length, 16);

  // valid shapes of input
  for (let mask = 0; mask < 16; mask++) assert.equal(buildClusterTopology(seed, a, b, makeSpec(a, b, mask)).roomIds.length, 12 + popcount(mask), `mask ${mask}`);
  for (let giantCell = 0; giantCell < 4; giantCell++) buildClusterTopology(seed, a, b, makeSpec(a, b, 0b0110, { giantCell }));
  buildClusterTopology(seed, a, b, makeSpec(a, b, 0b1111, { shape: 'L' }));
  assert.deepEqual(buildClusterTopology(seed, a, b, valid().map((r) => Object.assign(Object.create(null), r))), ok, 'null prototype records');
  for (const [s, t] of [[-1, 4294967295], [0, 4294967296], [5, 4294967301]]) assert.deepEqual(buildClusterTopology(s, a, b, valid()), buildClusterTopology(t, a, b, valid()), `seed ${s}`);

  // one field changed per case; every other rule stays satisfied so the named rule is what rejects it
  const cases = [];
  const add = (label, make) => cases.push([label, make]);
  const record = (mutate) => () => { const s = valid(); mutate(s); return { spec: s }; };
  for (const [label, v] of [['float', 1.5], ['NaN', NaN], ['string', '1'], ['undefined', undefined], ['null', null], ['Infinity', Infinity], ['unsafe', 2 ** 53]]) {
    add(`seed ${label}`, () => ({ seed: v }));
    add(`a ${label}`, () => ({ a: v }));
    add(`b ${label}`, () => ({ b: v }));
  }
  for (const [label, v] of [['null', null], ['undefined', undefined], ['object', {}], ['string', 'abc'], ['number', 3]]) add(`roomSpec ${label}`, () => ({ spec: v }));
  add('too few records', record((s) => { s.length = 11; }));
  add('too many records', () => { const s = makeSpec(a, b, 0b1111); s.push({ spaceId: idOf(a, b, 16), cell: 3, slot: 'T', role: 'small', shape: 'rect' }); return { spec: s }; });
  add('sparse array', () => { const s = valid(); delete s[5]; return { spec: s }; });
  add('extra array key', record((s) => { s.extra = 1; }));
  add('symbol array key', record((s) => { s[Symbol('x')] = 1; }));
  add('array accessor element', () => { const s = valid(); const first = s[0]; Object.defineProperty(s, 0, { get: () => first, enumerable: true }); return { spec: s }; });
  for (const [label, v] of [['null', null], ['array', []], ['number', 4], ['string', 'x'], ['Date', new Date(0)]]) add(`record ${label}`, record((s) => { s[4] = v; }));
  add('record class instance', record((s) => { class Rec {}; const r = Object.assign(new Rec(), s[4]); s[4] = r; }));
  add('record inherited prototype', record((s) => { s[4] = Object.assign(Object.create({ extra: 1 }), s[4]); }));
  for (const field of ['spaceId', 'cell', 'slot', 'role', 'shape']) {
    add(`missing ${field}`, record((s) => { delete s[4][field]; }));
    add(`inherited ${field}`, record((s) => { const own = s[4][field]; delete s[4][field]; s[4] = Object.assign(Object.create({ [field]: own }), s[4]); }));
    add(`accessor ${field}`, record((s) => { const own = s[4][field]; delete s[4][field]; Object.defineProperty(s[4], field, { get: () => own, enumerable: true, configurable: true }); }));
  }
  add('extra key', record((s) => { s[4].extra = 1; }));
  add('symbol key', record((s) => { s[4][Symbol('x')] = 1; }));
  add('spaceId number', record((s) => { s[4].spaceId = 4; }));
  add('cell string', record((s) => { s[4].cell = '1'; }));
  add('cell float', record((s) => { s[4].cell = 1.5; }));
  add('slot number', record((s) => { s[4].slot = 5; }));
  add('role null', record((s) => { s[4].role = null; }));
  add('shape object', record((s) => { s[4].shape = {}; }));
  add('wrong ID index', record((s) => { s[4].spaceId = idOf(a, b, 5); }));
  add('wrong ID district', record((s) => { s[4].spaceId = idOf(a + 1, b, 4); }));
  add('wrong ID format', record((s) => { s[4].spaceId = `space:${a},${b}:r4`; }));
  add('wrong cell', record((s) => { s[4].cell = 2; }));
  add('unknown slot', record((s) => { s[4].slot = 'X'; }));
  add('wrong slot order', record((s) => { [s[1], s[2]] = [s[2], s[1]]; renumber(s, a, b); }));
  add('wrong cell order', record((s) => { [s[0], s[4]] = [s[4], s[0]]; renumber(s, a, b); }));
  add('duplicate slot', record((s) => { s[3].slot = 'S'; }));
  add('duplicate T', () => { const s = makeSpec(a, b, 0b1111); s.splice(4, 0, { spaceId: '', cell: 0, slot: 'T', role: 'small', shape: 'rect' }); return { spec: renumber(s, a, b) }; });
  add('missing anchor', () => { const s = makeSpec(a, b, 0b1111); s.splice(0, 1); return { spec: renumber(s, a, b) }; });
  add('missing E', () => { const s = makeSpec(a, b, 0b1111); s.splice(1, 1); return { spec: renumber(s, a, b) }; });
  add('missing S', () => { const s = makeSpec(a, b, 0b1111); s.splice(2, 1); return { spec: renumber(s, a, b) }; });
  add('two-record cell', () => { const s = makeSpec(a, b, 0b0000); s.splice(1, 2); return { spec: renumber(s, a, b) }; });
  add('anchor role small', record((s) => { s[0].role = 'small'; }));
  add('anchor role medium', record((s) => { s[0].role = 'medium'; }));
  add('satellite role main', record((s) => { s[1].role = 'main'; }));
  add('satellite role giant', record((s) => { s[1].role = 'giant'; }));
  add('unknown role', record((s) => { s[1].role = 'huge'; }));
  add('anchor shape L', record((s) => { s[0].shape = 'L'; }));
  add('unknown shape', record((s) => { s[1].shape = 'round'; }));
  add('two giants', record((s) => { s[0].role = 'giant'; s[4].role = 'giant'; }));
  for (const [label, make] of cases) {
    const input = { seed, a, b, spec: valid(), ...make() };
    assert.throws(() => buildClusterTopology(input.seed, input.a, input.b, input.spec), bad, label);
  }

  // an accessor never runs, a throwing input leaves no trace
  let calls = 0;
  const trap = valid();
  Object.defineProperty(trap[4], 'role', { get() { calls++; return 'main'; }, enumerable: true });
  assert.throws(() => buildClusterTopology(seed, a, b, trap), bad);
  assert.equal(calls, 0, 'no accessor ran');

  // caller input stays as it was, the output is new and deeply frozen
  const spec = valid(), before = clone(spec);
  const out = buildClusterTopology(seed, a, b, spec);
  assert.deepEqual(spec, before);
  assert.equal(Object.isFrozen(spec) || spec.some((r) => Object.isFrozen(r)), false);
  const frozenDeep = (o) => !o || typeof o !== 'object' || (Object.isFrozen(o) && Object.values(o).every(frozenDeep));
  assert.ok(frozenDeep(out));
  assert.notEqual(out.roomIds, spec.map((r) => r.spaceId));
  assert.ok(Object.isFrozen(out.roomIds) && Object.isFrozen(out.edges) && Object.isFrozen(out.exterior));
  spec.forEach((r, k) => { assert.equal(out.roomIds[k], r.spaceId); });
});

test('topology: independent RNG and IDs', () => {
  const FACES = [['nx', 'nz'], ['px', 'nz'], ['nx', 'pz'], ['px', 'pz']];
  let seen = new Set();
  for (const seed of [0, 1, 2, 3, 7, 42, 99, 1234, 20261024, -5, 4294967295, 2 ** 40 + 3]) {
    for (const [a, b] of [[0, 0], [1, 1], [-1, -1], [-2, 1], [3, -4]]) {
      const mask = (seed + a + 2 * b) & 15;
      const spec = makeSpec(a, b, mask);
      const t = buildClusterTopology(seed, a, b, spec);
      const { group, o } = drawsOf(seed, a, b);
      seen.add(group);
      assert.equal(t.groupType, group, `${seed} ${a},${b}`);
      assert.deepEqual(t.roomIds, spec.map((r) => r.spaceId));
      assert.deepEqual(indexEdges(t), sortPairs(oracleEdges(group, o, mask).map(([x, y]) => [x, y].map((n) => spec.findIndex((r) => `${r.cell}${r.slot}` === n)))));
      for (const e of t.edges) assert.deepEqual(Object.keys(e), ['from', 'to']);
      const anchors = [0, 1, 2, 3].map((c) => spec.find((r) => r.cell === c && r.slot === 'anchor').spaceId);
      assert.deepEqual(t.exterior, anchors.map((anchor, cell) => ({ cell, anchor, faces: FACES[cell] })));
    }
  }
  assert.equal(seen.size, 5, 'all five groups drawn in this corpus');

  // the topology draws depend on the district and the seed, never on the rooms
  const spec = makeSpec(1, 1, 0b1111);
  const shifted = makeSpec(1, 1, 0b0000);
  assert.equal(buildClusterTopology(42, 1, 1, spec).groupType, buildClusterTopology(42, 1, 1, shifted).groupType);
  for (const [s, t] of [[-1, 4294967295], [0, 4294967296], [3, 4294967299]]) {
    assert.deepEqual(buildClusterTopology(s, 1, 1, spec), buildClusterTopology(t, 1, 1, spec), `${s}/${t}`);
    assert.equal(JSON.stringify(drawsOf(s, 1, 1)), JSON.stringify(drawsOf(t, 1, 1)));
  }

  // the public builder keeps its coercion and its validation order
  const Y = new World2(1, { clusterShare: 0 }).Y;
  assert.equal(JSON.stringify(buildClusterDistrict(-1, 1, 1, Y)), JSON.stringify(buildClusterDistrict(4294967295, 1, 1, Y)));
  assert.equal(JSON.stringify(buildClusterDistrict(0, 1, 1, Y)), JSON.stringify(buildClusterDistrict(4294967296, 1, 1, Y)));
  assert.throws(() => buildClusterDistrict(1, 1.5, 0, null), { name: 'TypeError', message: 'Invalid district plan' });
  assert.throws(() => buildClusterDistrict(1, 0, Number.NaN, { 1: 1 }), { name: 'TypeError', message: 'Invalid district plan' });
  assert.throws(() => buildClusterDistrict(1, 0, 0, null), { name: 'RangeError', message: 'Invalid district ceiling range' });
  assert.throws(() => buildClusterDistrict(1, 0, 0, { 1: Number.NaN }), { name: 'RangeError', message: 'Invalid district ceiling range' });
  assert.throws(() => buildClusterDistrict(1, 0, 0, { 1: 3 }), { name: 'RangeError', message: 'Invalid district ceiling range' });
});

test('topology: 320 motif cases', () => {
  const expected = {   // E, cycle rank, dead ends, direct D as functions of N, P, M
    'tight-cluster': (N, P, M) => ({ E: 11 + 2 * N, cycle: N, dead: 2 - M, direct: 8 + N }),
    'main-and-side': (N) => ({ E: 11 + N, cycle: 0, dead: 2 + N, direct: 8 + N }),
    ring: (N) => ({ E: 12 + N, cycle: 1, dead: N, direct: 8 + N }),
    nested: (N, P, M) => ({ E: 11 + N, cycle: 0, dead: 2 + N - M, direct: 8 }),
    'gallery-grid': (N, P) => ({ E: 12 + 2 * N + P, cycle: 1 + N + P, dead: 0, direct: 8 + N }),
  };
  let cases = 0;
  const byGraph = new Map();
  for (const group of GROUPS) {
    for (let o = 0; o < 4; o++) {
      const seed = GROUP_SEEDS[group][o];
      assert.deepEqual(drawsOf(seed, 1, 1), { group, o }, `${group} seed ${seed} draws`);
      for (let mask = 0; mask < 16; mask++) {
        cases++;
        const spec = makeSpec(1, 1, mask), t = buildClusterTopology(seed, 1, 1, spec);
        const label = `${group} o=${o} mask=${mask}`;
        assert.equal(t.groupType, group, label);
        const want = sortPairs(oracleEdges(group, o, mask).map(([x, y]) => [x, y].map((n) => spec.findIndex((r) => `${r.cell}${r.slot}` === n))));
        const got = indexEdges(t);
        assert.deepEqual(got, want, label);
        assert.deepEqual(t.edges, want.map(([p, q]) => ({ from: spec[p].spaceId, to: spec[q].spaceId })), label);
        for (const [p, q] of got) assert.ok(p < q, `${label} canonical`);

        const N = popcount(mask), R = 12 + N;
        const P = Number(!!(mask & 1) && !!(mask & 2)) + Number(!!(mask & 4) && !!(mask & 8));
        const M = group === 'tight-cluster' || group === 'nested' ? ({ 0: [0, 1], 3: [2, 3] }[o] ?? []).filter((c) => (mask >> c) & 1).length : 0;
        const w = expected[group](N, P, M);
        assert.equal(spec.length, R, label);
        assert.equal(got.length, w.E, `${label} E`);
        assert.equal(componentCount(R, got), 1, `${label} connected`);
        assert.equal(got.length - R + 1, w.cycle, `${label} cycle rank`);
        const degree = new Array(R).fill(0);
        for (const [p, q] of got) { degree[p]++; degree[q]++; }
        assert.ok(degree.every((d) => d >= 1), `${label} every room has a neighbour`);
        assert.equal(degree.filter((d) => d === 1).length, w.dead, `${label} dead ends`);
        const anchorIdx = spec.map((r, k) => (r.slot === 'anchor' ? k : -1)).filter((k) => k >= 0);
        anchorIdx.forEach((k) => assert.equal(degree[k], group === 'nested' ? 2 : 2 + ((mask >> spec[k].cell) & 1), `${label} anchor degree`));
        assert.equal(got.filter(([p, q]) => spec[p].slot === 'anchor' || spec[q].slot === 'anchor').length, w.direct, `${label} direct`);
        assert.deepEqual(new Set(got.map((e) => e.join())).size, got.length, `${label} no duplicate`);

        const key = `${o}|${mask}|${JSON.stringify(got)}`;
        byGraph.set(key, [...(byGraph.get(key) ?? []), group]);
      }
    }
  }
  assert.equal(cases, 5 * 4 * 16);

  // with no T room the three omit-one groups share one graph and ring and gallery share another, each under its own label
  for (let o = 0; o < 4; o++) {
    const graph = (group) => JSON.stringify(indexEdges(buildClusterTopology(GROUP_SEEDS[group][o], 1, 1, makeSpec(1, 1, 0))));
    assert.equal(graph('tight-cluster'), graph('main-and-side'));
    assert.equal(graph('tight-cluster'), graph('nested'));
    assert.equal(graph('ring'), graph('gallery-grid'));
    assert.notEqual(graph('ring'), graph('tight-cluster'));
    const labels = GROUPS.map((g) => buildClusterTopology(GROUP_SEEDS[g][o], 1, 1, makeSpec(1, 1, 0)).groupType);
    assert.deepEqual(labels, GROUPS);
  }
  assert.ok(byGraph.size > 0);
});

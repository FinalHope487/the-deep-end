// T5 cluster topology: the pure source-room graph (buildClusterTopology). Link materialization, protection and world tests join this file in later commits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { World2 } from '../../js/gen2.js';
import { buildClusterDistrict, buildClusterTopology, buildSharedOpening, cutDistrictCell, validateDistrictPlan } from '../../js/gen2-district.js';
import { hash2, mulberry32 } from '../../js/rng.js';
import { Player } from '../../js/player.js';
import { reachSet } from './reach.mjs';
import { SLOT_ORDER, specOf, passageDraws, wantPassage } from './gen2-passage-oracle.mjs';

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
const frozenDeep = (o) => !o || typeof o !== 'object' || (Object.isFrozen(o) && Object.values(o).every(frozenDeep));
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

const EXPECTED = {   // E, cycle rank, dead ends, direct D as functions of N, P, M
  'tight-cluster': (N, P, M) => ({ E: 11 + 2 * N, cycle: N, dead: 2 - M, direct: 8 + N }),
  'main-and-side': (N) => ({ E: 11 + N, cycle: 0, dead: 2 + N, direct: 8 + N }),
  ring: (N) => ({ E: 12 + N, cycle: 1, dead: N, direct: 8 + N }),
  nested: (N, P, M) => ({ E: 11 + N, cycle: 0, dead: 2 + N - M, direct: 8 }),
  'gallery-grid': (N, P) => ({ E: 12 + 2 * N + P, cycle: 1 + N + P, dead: 0, direct: 8 + N }),
};
const maskOf = (spec) => [0, 1, 2, 3].reduce((m, c) => m | (spec.some((r) => r.cell === c && r.slot === 'T') ? 1 << c : 0), 0);
// the handoff's quantitative graph gates for one district: spec is the descriptor list, edges the sorted room-index pairs
function gates(label, group, spec, o, got) {
  const mask = maskOf(spec), N = popcount(mask), R = 12 + N;
  const P = Number(!!(mask & 1) && !!(mask & 2)) + Number(!!(mask & 4) && !!(mask & 8));
  const M = group === 'tight-cluster' || group === 'nested' ? ({ 0: [0, 1], 3: [2, 3] }[o] ?? []).filter((c) => (mask >> c) & 1).length : 0;
  const w = EXPECTED[group](N, P, M);
  assert.equal(spec.length, R, label);
  assert.equal(got.length, w.E, `${label} E`);
  assert.equal(componentCount(R, got), 1, `${label} connected`);
  assert.equal(got.length - R + 1, w.cycle, `${label} cycle rank`);
  const degree = new Array(R).fill(0);
  for (const [p, q] of got) { degree[p]++; degree[q]++; }
  assert.ok(degree.every((d) => d >= 1), `${label} every room has a neighbour`);
  assert.equal(degree.filter((d) => d === 1).length, w.dead, `${label} dead ends`);
  spec.forEach((r, k) => { if (r.slot === 'anchor') assert.equal(degree[k], group === 'nested' ? 2 : 2 + ((mask >> r.cell) & 1), `${label} anchor degree`); });
  assert.equal(got.filter(([p, q]) => spec[p].slot === 'anchor' || spec[q].slot === 'anchor').length, w.direct, `${label} direct`);
  return w;
}

test('topology: 320 motif cases', () => {
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

        gates(label, group, spec, o, got);
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

// ---------- slice 2: link materialization ----------

const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 20261024];
const ROOMS_HASH = '31faf27d15260e21416ae83c3edd57e93b4682ca950574414cc3c22d53f76f58';   // sha256 over the 128 plans' { rooms, anchors } JSON, as T3 shipped them
const worlds = new Map();
const yOf = (seed) => { if (!worlds.has(seed)) worlds.set(seed, new World2(seed, { clusterShare: 0 }).Y); return worlds.get(seed); };
const corpus = [];
for (const seed of SEEDS) for (let b = -2; b <= 1; b++) for (let a = -2; a <= 1; a++) corpus.push({ seed, a, b });
const built = new Map();
const planOf = (seed, a, b) => { const k = `${seed},${a},${b}`; if (!built.has(k)) built.set(k, buildClusterDistrict(seed, a, b, yOf(seed))); return built.get(k); };

const rectArea = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const overlapArea = (p, q) => Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0));
const unionOverlap = (rect, room) => room.rects.reduce((s, q) => s + overlapArea(rect, q), 0);
// a positive-length shared edge without shared area
const touches = (p, q) => overlapArea(p, q) === 0 && (((p.x1 === q.x0 || q.x1 === p.x0) && Math.min(p.z1, q.z1) > Math.max(p.z0, q.z0)) || ((p.z1 === q.z0 || q.z1 === p.z0) && Math.min(p.x1, q.x1) > Math.max(p.x0, q.x0)));
const bounds = (rects) => ({ x0: Math.min(...rects.map((q) => q.x0)), x1: Math.max(...rects.map((q) => q.x1)), z0: Math.min(...rects.map((q) => q.z0)), z1: Math.max(...rects.map((q) => q.z1)) });
const q2 = (v) => Number.isInteger(v / 0.5);

const indexOf = (spec, cell, slot) => spec.findIndex((r) => r.cell === cell && r.slot === slot);
// the separation of two rooms along the axis that divides them
function gapOf(p, q) {
  let best = Infinity;
  for (const s of p.rects) for (const t of q.rects) best = Math.min(best, Math.max(0, s.x0 - t.x1, t.x0 - s.x1, s.z0 - t.z1, t.z0 - s.z1));
  return best;
}


const BRIDGE_SEEDS = [   // [first variant, second variant, EE, SS, ET, TT]: variant 0 small rect, 1 small L, 2 medium rect, 3 medium L
  [0, 0, 1, 2, 2, 142], [0, 1, 7, 11, 18, 1035], [0, 2, 17, 1, 4, 159], [0, 3, 6, 121, 107, 128],
  [1, 0, 5, 17, 59, 1036], [1, 1, 74, 59, 166, 197], [1, 2, 86, 16, 72, 345], [1, 3, 10, 413, 330, 1592],
  [2, 0, 3, 25, 35, 257], [2, 1, 9, 0, 30, 580], [2, 2, 12, 43, 3, 287], [2, 3, 70, 50, 77, 452],
  [3, 0, 37, 4, 39, 443], [3, 1, 51, 14, 197, 318], [3, 2, 197, 33, 350, 461], [3, 3, 97, 40, 298, 4227],
];
const BRIDGE_CLASSES = { EE: [[0, 'E'], [1, 'E']], SS: [[0, 'S'], [2, 'S']], ET: [[0, 'E'], [0, 'T']], TT: [[0, 'T'], [1, 'T']] };

// the satellites each cell draws, read from the 7710 stream by position (an oracle independent of the builder)
function drawnRooms(seed, a, b) {
  const r = mulberry32(hash2(seed >>> 0, a, b, 7710));
  const d = Array.from({ length: 46 }, () => r());
  return [0, 1, 2, 3].map((n) => {
    const c = d.slice(2 + 11 * n, 13 + 11 * n), sat = (k) => ({ role: c[k] < 0.6 ? 'small' : 'medium', L: c[k + 1] < 0.25 });
    return { E: sat(2), S: sat(5), T: c[0] < 0.5 ? null : sat(8) };
  });
}
const variantOf = (s) => (s.role === 'medium' ? 2 : 0) + (s.L ? 1 : 0);

test('topology: 128 production cases', () => {
  assert.equal(corpus.length, 128);
  const hash = createHash('sha256'), counts = Object.fromEntries(GROUPS.map((g) => [g, 0]));
  let loops = 0;
  for (const c of corpus) {
    const plan = planOf(c.seed, c.a, c.b), tag = `${c.seed}:${c.a},${c.b}`;
    hash.update(JSON.stringify({ rooms: plan.rooms, anchors: plan.anchors }));
    const spec = specOf(plan), mask = maskOf(spec), { group, o } = drawsOf(c.seed, c.a, c.b);
    counts[group]++;
    const want = sortPairs(oracleEdges(group, o, mask).map(([x, y]) => [x, y].map((n) => spec.findIndex((r) => `${r.cell}${r.slot}` === n))));
    const index = (id) => plan.rooms.findIndex((r) => r.spaceId === id);
    assert.deepEqual(plan.links.map((l) => [index(l.from), index(l.to)]), want, `${tag}: the selected edges, sorted`);
    const w = gates(tag, group, spec, o, want);
    if (w.cycle > 0) loops++;
    let direct = 0, short = 0;
    plan.links.forEach((l, k) => {
      const [p, q] = want[k], isDirect = spec[p].slot === 'anchor' || spec[q].slot === 'anchor', gap = gapOf(plan.rooms[p], plan.rooms[q]);
      assert.equal(l.id, `v2:dlink:${c.a},${c.b}:${k}`, tag);
      assert.equal(l.kind, isDirect ? 'shared-opening' : 'passage', `${tag} link ${k}`);
      assert.equal('opening' in l, isDirect, `${tag} link ${k}`);
      if (isDirect) {
        assert.equal(l.opening.c1 - l.opening.c0, gap, `${tag} link ${k} wall`);
        assert.ok(gap <= 0.5);
        assert.deepEqual(clone(l), clone(buildSharedOpening(c.seed, c.a, c.b, k, plan.rooms[p], plan.rooms[q], 'auto')), `${tag} link ${k}: the T4 opening for the sorted edge index`);
        direct++;
      } else {
        const draws = passageDraws(c.seed, c.a, c.b, k);
        assert.deepEqual(l.rects[0], wantPassage(plan, spec, p, q, k, c.seed), `${tag} link ${k}: the handoff passage rectangle`);
        assert.deepEqual([l.distance.width, l.distance.ceil], [draws.width, draws.ceil], `${tag} link ${k}: the 8820/8821 draws`);
      }
      if (gap <= 5) short++;
    });
    assert.equal(direct, w.direct, `${tag}: sharedOpeningLinkCount`);
    assert.equal(plan.links.length, w.E, `${tag}: totalSourceLinkCount`);
    assert.equal(direct / plan.links.length, w.direct / w.E, `${tag}: directShare`);
    assert.equal(short, w.E, `${tag}: directOrShortCount`);
    assert.equal(short / plan.links.length, 1, `${tag}: directOrShortShare`);
    assert.ok(frozenDeep(plan), tag);
    assert.equal(JSON.stringify(validateDistrictPlan(clone(plan), c.a, c.b)), JSON.stringify(plan), `${tag}: a copy validates to the same plan`);
  }
  assert.equal(hash.digest('hex'), ROOMS_HASH, 'the physical rooms and anchors are the T3 ones, byte for byte');
  assert.deepEqual(GROUPS.map((g) => counts[g]), [38, 28, 23, 20, 19]);
  assert.equal(loops, 76);
  assert.equal(loops / 128, 0.59375);
  assert.ok(Math.abs(0.25 * (1 - 0.5 ** 4) + 0.2 + 0.15 - 0.584375) < 1e-12, 'expected loop probability');
});

test('topology: 64 bridge endpoint combinations', () => {
  let cases = 0;
  for (const row of BRIDGE_SEEDS) {
    Object.keys(BRIDGE_CLASSES).forEach((cls, n) => {
      cases++;
      const seed = row[2 + n], tag = `${cls} seed ${seed} variants ${row[0]}/${row[1]}`, plan = planOf(seed, 1, 1);
      const spec = specOf(plan), drawn = drawnRooms(seed, 1, 1), [[c0, s0], [c1, s1]] = BRIDGE_CLASSES[cls];
      const first = drawn[c0][s0], second = drawn[c1][s1];
      assert.ok(first && second, `${tag}: both endpoints exist`);
      assert.deepEqual([variantOf(first), variantOf(second)], [row[0], row[1]], `${tag}: the 7710 draws give these variants`);
      const iA = indexOf(spec, c0, s0), iB = indexOf(spec, c1, s1);
      assert.equal(spec[iA].shape, first.L ? 'L' : 'rect', tag);
      assert.equal(spec[iB].shape, second.L ? 'L' : 'rect', tag);
      const { group, o } = drawsOf(seed, 1, 1);
      const names = oracleEdges(group, o, maskOf(spec)).map((p) => p.join());
      assert.ok(names.includes(`${c0}${s0},${c1}${s1}`), `${tag}: the 8810 graph (${group}) selects the edge`);

      const A = plan.rooms[iA], B = plan.rooms[iB], link = plan.links.find((l) => l.from === A.spaceId && l.to === B.spaceId);
      assert.ok(link, `${tag}: link found by canonical endpoint ids`);
      assert.equal(link.kind, 'passage', tag);
      assert.equal(link.rects.length, 1, tag);
      const k = plan.links.indexOf(link), { width: w } = passageDraws(seed, 1, 1, k), r = link.rects[0];
      assert.deepEqual(r, wantPassage(plan, spec, iA, iB, k, seed), tag);
      assert.ok([r.x0, r.x1, r.z0, r.z1].every(q2), `${tag}: Q2 edges`);
      assert.equal(link.distance.width, w, `${tag}: the 8820/8821 width`);
      assert.equal(cls === 'EE' || cls === 'TT' ? r.z1 - r.z0 : r.x1 - r.x0, w, `${tag}: ${w} m wide`);
      assert.deepEqual(link.grid, { ox: r.x0, oz: r.z0, step: 6 }, tag);
      assert.equal(unionOverlap(r, A), 0.5 * w, `${tag}: reaches the first room by 0.5 x ${w} m`);
      assert.equal(unionOverlap(r, B), 0.5 * w, `${tag}: reaches the second room by 0.5 x ${w} m`);
      for (const room of plan.rooms) {
        if (room === A || room === B) continue;
        assert.equal(unionOverlap(r, room), 0, `${tag}: no overlap with ${room.spaceId}`);
        assert.ok(room.rects.every((q) => !touches(r, q)), `${tag}: no edge contact with ${room.spaceId}`);
      }
      for (const other of plan.links) if (other !== link) assert.ok(other.rects.every((q) => overlapArea(r, q) === 0 && !touches(r, q)), `${tag}: clear of ${other.id}`);
    });
  }
  assert.equal(cases, 64);
});

test('topology: all selected link geometry', () => {
  for (const c of corpus) {
    const plan = planOf(c.seed, c.a, c.b), tag = `${c.seed}:${c.a},${c.b}`, OX = 128 * c.a, OZ = 128 * c.b;
    const roomOf = new Map(plan.rooms.map((o) => [o.spaceId, o]));
    const spec = specOf(plan), { group, o: omitted } = drawsOf(c.seed, c.a, c.b);
    const w = gates(tag, group, spec, omitted, plan.links.map((l) => [plan.rooms.indexOf(roomOf.get(l.from)), plan.rooms.indexOf(roomOf.get(l.to))]));
    const sharedOpeningLinkCount = plan.links.filter((l) => l.kind === 'shared-opening').length;
    assert.equal(sharedOpeningLinkCount, w.direct, `${tag}: sharedOpeningLinkCount`);
    assert.equal(plan.links.length, w.E, `${tag}: totalSourceLinkCount`);
    assert.equal(sharedOpeningLinkCount / plan.links.length, w.direct / w.E, `${tag}: directShare`);
    assert.equal(plan.links.filter((l) => gapOf(roomOf.get(l.from), roomOf.get(l.to)) <= 5).length, w.E, `${tag}: directOrShortCount`);
    plan.links.forEach((l, k) => {
      const from = roomOf.get(l.from), to = roomOf.get(l.to), t = `${tag} link ${k}`;
      for (const r of l.rects) {
        assert.ok([r.x0, r.x1, r.z0, r.z1].every((v) => Number.isFinite(v) && q2(v)), `${t}: finite Q2 edges`);
        assert.ok(r.x1 > r.x0 && r.z1 > r.z0, t);
        assert.ok(r.x0 >= OX + 12 && r.x1 <= OX + 116 && r.z0 >= OZ + 12 && r.z1 <= OZ + 116, `${t}: inside the exterior source bounds`);
        for (const room of plan.rooms) {
          if (room === from || room === to) continue;
          assert.equal(unionOverlap(r, room), 0, `${t}: no overlap with ${room.spaceId}`);
          assert.ok(room.rects.every((q) => !touches(r, q)), `${t}: no edge contact with ${room.spaceId}`);
        }
        for (const end of [from, to]) assert.ok(unionOverlap(r, end) > 0, `${t}: every rectangle reaches both ends`);
      }
      assert.ok(q2(l.grid.ox) && q2(l.grid.oz) && l.grid.step === 6, `${t}: grid`);
      plan.links.forEach((m, n) => { if (n > k) for (const r of l.rects) for (const s of m.rects) assert.equal(overlapArea(r, s), 0, `${t} vs ${n}: links never overlap`); });
      if (l.kind === 'passage') {
        assert.equal(l.rects.length, 1, t);
        const r = l.rects[0], dx = r.x1 - r.x0, dz = r.z1 - r.z0;
        const { width: w } = passageDraws(c.seed, c.a, c.b, k);
        assert.equal(l.distance.width, w, `${t}: the 8820/8821 width`);
        assert.ok(dx === w || dz === w, `${t}: ${w} m wide`);
        assert.equal(unionOverlap(r, from), 0.5 * w, t);
        assert.equal(unionOverlap(r, to), 0.5 * w, t);
        assert.deepEqual(l.grid, { ox: r.x0, oz: r.z0, step: 6 }, t);
      } else {
        const o = l.opening, floor = Math.min(from.ceil, to.ceil);
        assert.equal(l.kind, 'shared-opening', t);
        assert.ok(o.height >= 2 && o.height <= floor, `${t}: height ${o.height} in 2..${floor}`);
        assert.ok(o.c1 - o.c0 === 0 || o.c1 - o.c0 === 0.5, t);
        assert.equal(l.rects.length, o.apertures.length, t);
        const bridges = o.apertures.map((p) => (o.axis === 'x' ? { x0: o.c0 - 0.5, x1: o.c1 + 0.5, z0: p.lo, z1: p.hi } : { x0: p.lo, x1: p.hi, z0: o.c0 - 0.5, z1: o.c1 + 0.5 }));
        bridges.sort((p, q) => p.x0 - q.x0 || p.z0 - q.z0);
        assert.deepEqual(l.rects.map((r) => ({ ...r })), bridges, `${t}: one bridge per aperture`);
        for (const r of l.rects) for (const end of [from, to]) assert.ok(unionOverlap(r, end) >= 0.5 * (o.axis === 'x' ? r.z1 - r.z0 : r.x1 - r.x0), `${t}: each bridge reaches 0.5 m into both rooms`);
      }
    });

    // the cell cut: half-open clips, no area lost or doubled, frozen fragments that share nothing with the plan
    const total = { room: 0, link: 0 }, fragmentArea = { room: 0, link: 0 };
    for (const o of plan.rooms) total.room += o.rects.reduce((s, q) => s + rectArea(q), 0);
    for (const l of plan.links) total.link += l.rects.reduce((s, q) => s + rectArea(q), 0);
    for (let j = 2 * c.b; j < 2 * c.b + 2; j++) {
      for (let i = 2 * c.a; i < 2 * c.a + 2; i++) {
        const cut = cutDistrictCell(plan, i, j);
        assert.ok(frozenDeep(cut), `${tag}: cut ${i},${j} is frozen`);
        for (const f of cut.fragments) {
          fragmentArea[f.sourceType] += rectArea(f.rect);
          assert.ok(f.rect.x0 >= 64 * i && f.rect.x1 <= 64 * i + 64 && f.rect.z0 >= 64 * j && f.rect.z1 <= 64 * j + 64, `${tag}: fragment inside cell`);
          if (f.sourceType === 'link') {
            const l = plan.links.find((m) => m.id === f.sourceId);
            assert.equal(f.ceil, l.opening ? l.opening.height : Math.min(passageDraws(c.seed, c.a, c.b, plan.links.indexOf(l)).ceil, roomOf.get(l.from).ceil, roomOf.get(l.to).ceil), `${tag}: fragment ceiling`);
            if (!l.opening) assert.deepEqual(f.distance, l.distance, `${tag}: the fragment keeps the link distance`);
            assert.notEqual(f.rect, l.rects[f.rectIndex]);
          }
        }
      }
    }
    assert.equal(fragmentArea.room, total.room, `${tag}: room area survives the cut`);
    assert.equal(fragmentArea.link, total.link, `${tag}: link area survives the cut`);
    assert.throws(() => { plan.links[0].rects[0].x0 = 0; }, TypeError);
  }
});

// ---------- slice 3: protection, planning order, reachability ----------

const worldOf = (seed, a, b) => new World2(seed, { clusterShare: 0, cluster: (x, z) => (x === a && z === b ? planOf(seed, a, b) : null) });
const cellsOf = (a, b) => [[2 * a, 2 * b], [2 * a + 1, 2 * b], [2 * a, 2 * b + 1], [2 * a + 1, 2 * b + 1]];
const snapOut = (q) => ({ x0: Math.floor(q.x0 / 0.5) * 0.5, x1: Math.ceil(q.x1 / 0.5) * 0.5, z0: Math.floor(q.z0 / 0.5) * 0.5, z1: Math.ceil(q.z1 / 0.5) * 0.5 });
const H = (xa, xb, z) => ({ x0: Math.min(xa, xb) - 2, x1: Math.max(xa, xb) + 2, z0: z - 2, z1: z + 2 });
const V = (x, za, zb) => ({ x0: x - 2, x1: x + 2, z0: Math.min(za, zb) - 2, z1: Math.max(za, zb) + 2 });
const kOf = (l) => Number(l.id.split(':').pop());

// the T5 strips of one anchor, from the public opening metadata alone: the aperture-to-centre strips in link then aperture order, each with
// the centreline a body walks (one segment from just inside the hall, one to the cell centre)
function topologyStrips(plan, i, j, hall) {
  const id = plan.anchors[`${i},${j}`], cx = 64 * i + 32, cz = 64 * j + 32, out = [];
  const links = plan.links.filter((l) => l.opening && (l.from === id || l.to === id)).sort((p, q) => kOf(p) - kOf(q));
  for (const l of links) {
    const { axis, c0, c1, apertures } = l.opening;
    for (const { lo, hi } of apertures) {
      const mid = (lo + hi) / 2;
      let raw, path;
      if (axis === 'x') {
        assert.equal([hall.x1 === c0, hall.x0 === c1].filter(Boolean).length, 1, 'exactly one face meets the opening');
        assert.ok(hall.z0 <= lo && hi <= hall.z1, 'the aperture lies on the hall face');
        const lowSide = hall.x1 === c0, face = lowSide ? hall.x1 : hall.x0;
        raw = [H(face, cx, mid), V(cx, mid, cz)];
        path = [[face + (lowSide ? -0.5 : 0.5), mid], [cx, mid], [cx, cz]];
      } else {
        assert.equal([hall.z1 === c0, hall.z0 === c1].filter(Boolean).length, 1, 'exactly one face meets the opening');
        assert.ok(hall.x0 <= lo && hi <= hall.x1, 'the aperture lies on the hall face');
        const lowSide = hall.z1 === c0, face = lowSide ? hall.z1 : hall.z0;
        raw = [V(mid, face, cz), H(mid, cx, cz)];
        path = [[mid, face + (lowSide ? -0.5 : 0.5)], [mid, cz], [cx, cz]];
      }
      const rects = raw.map(snapOut).map((q) => ({ x0: Math.max(q.x0, hall.x0, 64 * i), x1: Math.min(q.x1, hall.x1, 64 * i + 64), z0: Math.max(q.z0, hall.z0, 64 * j), z1: Math.min(q.z1, hall.z1, 64 * j + 64) }))
        .filter((q) => q.x1 > q.x0 && q.z1 > q.z0);
      out.push({ link: l.id, rects, path });
    }
  }
  return out;
}

// the first point of a polyline (sampled every 0.25 m) where the real Player cannot stand, is wet or is off level zero; null when all stand
function firstBlocked(world, player, path) {
  let prev = null;
  for (let s = 0; s + 1 < path.length; s++) {
    const [ax, az] = path[s], [bx, bz] = path[s + 1], n = Math.round(Math.hypot(bx - ax, bz - az) / 0.25);
    for (let t = s ? 1 : 0; t <= n; t++) {
      const x = n ? ax + ((bx - ax) * t) / n : ax, z = n ? az + ((bz - az) * t) / n : az;
      player.x = prev ? prev[0] : x; player.z = prev ? prev[1] : z;
      if (player.canStand(world, x, z, 0) !== true) return `${x},${z}: blocked`;
      const surf = world.surfaceAt(x, z, 0), h = surf.h, wl = surf.wl;
      if (h !== 0 || !Number.isNaN(wl)) return `${x},${z}: h ${h} wl ${wl}`;
      prev = [x, z];
    }
  }
  return null;
}

const PROTECT_CASES = corpus.filter((c) => c.a || c.b);   // the start district is always legacy

test('topology: protection and error boundaries', () => {
  let strips = 0;
  for (const c of PROTECT_CASES) {
    const world = worldOf(c.seed, c.a, c.b), source = planOf(c.seed, c.a, c.b), player = new Player();
    cellsOf(c.a, c.b).forEach(([i, j], n) => {
      const plan = world.plan(i, j), hall = plan.rooms[0], tag = `${c.seed}:${c.a},${c.b} cell ${n}`;
      assert.equal(hall.spaceId, source.anchors[`${i},${j}`], tag);
      assert.equal(plan.voids.filter((v) => v.kind === 'split').length, 0, `${tag}: no successful split`);
      assert.ok(!plan.rooms.some((o) => o.kind === 'shaft'), `${tag}: no split shaft`);
      const expected = topologyStrips(source, i, j, hall);
      assert.ok(expected.length >= 1, `${tag}: the anchor has at least one aperture`);
      for (const { link, rects, path } of expected) {
        assert.ok(rects.length >= 1, `${tag} ${link}: a strip survives the clip`);
        for (const q of rects) {
          strips++;
          assert.ok([q.x0, q.x1, q.z0, q.z1].every(q2) && q.x1 > q.x0 && q.z1 > q.z0, `${tag} ${link}: a Q2 strip of positive area`);
          assert.ok(q.x0 >= hall.x0 && q.x1 <= hall.x1 && q.z0 >= hall.z0 && q.z1 <= hall.z1 && q.x0 >= 64 * i && q.x1 <= 64 * i + 64 && q.z0 >= 64 * j && q.z1 <= 64 * j + 64, `${tag} ${link}: inside the hall and its cell`);
          const hits = (r) => overlapArea(q, r) > 0;
          for (const p of plan.pools.filter((o) => o.lv === 0)) assert.ok(!hits({ x0: p.shape.cx - p.shape.hw, x1: p.shape.cx + p.shape.hw, z0: p.shape.cz - p.shape.hd, z1: p.shape.cz + p.shape.hd }), `${tag} ${link}: a pool on the strip`);
          for (const col of plan.columns.filter((o) => o.lv === 0)) assert.ok(!hits({ x0: col.x - col.r, x1: col.x + col.r, z0: col.z - col.r, z1: col.z + col.r }), `${tag} ${link}: a column on the strip`);
          for (const f of plan.flights) assert.ok(!hits(f) && !hits(f.hallEntry), `${tag} ${link}: a flight on the strip`);
          for (const v of plan.voids.filter((o) => o.lv === -1 || o.lv === 0)) assert.ok(!hits(v), `${tag} ${link}: a void on the strip`);
          for (const wn of plan.windows.filter((o) => o.lv === 0)) assert.ok(!hits(wn.front), `${tag} ${link}: a showcase on the strip`);
        }
        assert.equal(firstBlocked(world, player, path), null, `${tag} ${link}: the centreline is walkable`);
      }
    });
  }
  assert.ok(strips >= 1000, `${strips} strips checked`);

  // the T2 and T4 validator keeps its own errors for corrupted fixtures
  const base = clone(planOf(42, 1, 1)), k = base.links.findIndex((l) => l.opening);
  const cases = [
    ['unknown kind', (p) => { p.links[0].kind = 'bogus'; }, 'TypeError', 'Invalid district plan'],
    ['opening dropped', (p) => { delete p.links[k].opening; }, 'TypeError', 'Invalid district plan'],
    ['no apertures', (p) => { p.links[k].opening.apertures = []; }, 'TypeError', 'Invalid district plan'],
    ['unknown style', (p) => { p.links[k].opening.style = 'bogus'; }, 'TypeError', 'Invalid district plan'],
    ['unknown endpoint', (p) => { p.links[k].from = 'nope'; }, 'TypeError', 'Invalid district plan'],
    ['wall gap moved', (p) => { p.links[k].opening.c1 += 0.5; }, 'RangeError', 'Invalid district geometry'],
    ['aperture off its bridge', (p) => { p.links[k].opening.apertures[0].lo -= 0.5; }, 'RangeError', 'Invalid district geometry'],
    ['opening too low', (p) => { p.links[k].opening.height = 1; }, 'RangeError', 'Invalid district geometry'],
    ['room outside its seams', (p) => { p.rooms[0].rects[0].x1 += 100; }, 'RangeError', 'Invalid district geometry'],
  ];
  for (const [label, mutate, name, message] of cases) {
    const p = clone(base);
    mutate(p);
    assert.throws(() => validateDistrictPlan(p, 1, 1), { name, message }, label);
  }
  assert.ok(frozenDeep(planOf(42, 1, 1)), 'the validated source stays frozen');
});

test('topology: planning order and eviction', () => {
  const seed = 42, Y = yOf(seed), cells = cellsOf(1, 1);
  assert.deepEqual(cells, [[2, 2], [3, 2], [2, 3], [3, 3]]);
  const source = buildClusterDistrict(seed, 1, 1, Y), before = JSON.stringify(source);
  const forward = new World2(seed, { clusterShare: 0, cluster: (x, z) => (x === 1 && z === 1 ? source : null) });
  const reverse = new World2(seed, { clusterShare: 0, cluster: (x, z) => (x === 1 && z === 1 ? buildClusterDistrict(seed, 1, 1, Y) : null) });
  const fwd = cells.map(([i, j]) => JSON.stringify(forward.plan(i, j)));
  const back = [];
  for (const k of [3, 2, 1, 0]) back[k] = JSON.stringify(reverse.plan(...cells[k]));
  assert.deepEqual(back, fwd, 'the order of cell requests changes nothing');
  assert.equal(JSON.stringify(source), before, 'the caller-owned source is unchanged');
  const held = forward.districtPlan(1, 1);
  assert.ok(frozenDeep(held) && held !== source, 'the cached district is a frozen copy');
  assert.ok(held.rooms.every((room) => room !== source.rooms.find((o) => o.spaceId === room.spaceId)), 'no room record is shared with the caller');

  // FIFO: DISTRICT_CACHE (100) entries; a rebuild enters at the back
  const fifo = (target, filler) => {
    const factory = (x, z) => (x || z ? buildClusterDistrict(seed, x, z, Y) : null);
    const w = new World2(seed, { clusterShare: 0, cluster: factory });
    w.districts.clear();
    const [ta, tb] = target, first = JSON.stringify(w.districtPlan(ta, tb));
    for (const [x, z] of filler) w.districtPlan(x, z);
    assert.equal(w.districts.size, 100);
    assert.ok(!w.districts.has(`${ta},${tb}`), 'the target was evicted');
    return { w, first, keys: () => [...w.districts.keys()] };
  };
  const one = fifo([1, 1], Array.from({ length: 100 }, (_, n) => [n + 2, 1]));
  assert.equal(one.keys()[0], '2,1');
  assert.equal(JSON.stringify(one.w.districtPlan(1, 1)), one.first, 'the rebuilt district is identical');
  assert.equal(one.w.districts.size, 100);
  assert.equal(one.keys()[0], '3,1');
  assert.equal(one.keys().at(-1), '1,1');
  const two = fifo([-1, -1], Array.from({ length: 100 }, (_, n) => [n, -1]));
  assert.equal(two.keys()[0], '0,-1');
  assert.equal(JSON.stringify(two.w.districtPlan(-1, -1)), two.first, 'the rebuilt district is identical');
  assert.equal(two.keys()[0], '1,-1');
  assert.equal(two.keys().at(-1), '-1,-1');
  assert.equal(two.w.districtPlan(0, 0), null, 'the start district stays legacy');
});

const BODY_CASES = [[2, 1, 1, 'tight-cluster'], [0, 1, 1, 'main-and-side'], [5, 1, 1, 'ring'], [1, 1, 1, 'nested'], [4, 1, 1, 'gallery-grid'], [42, -1, -1, null]];

test('topology: real body reaches every source', () => {
  for (const [seed, a, b, group] of BODY_CASES) {
    const source = planOf(seed, a, b), world = worldOf(seed, a, b), OX = 128 * a, OZ = 128 * b, player = new Player(), tag = `${seed}:${a},${b}`;
    assert.equal(buildClusterTopology(seed, a, b, specOf(source)).groupType, group ?? drawsOf(seed, a, b).group, `${tag}: the group`);
    let start = null;
    for (const [x, z] of [[OX + 47.5, OZ + 32], [OX + 47, OZ + 32], [OX + 46.5, OZ + 32], [OX + 46, OZ + 32]]) {
      player.x = x; player.z = z;
      if (player.canStand(world, x, z, 0) !== true) continue;
      const surf = world.surfaceAt(x, z, 0), h = surf.h, wl = surf.wl;
      if (h === 0 && Number.isNaN(wl)) { start = [x, z, 0]; break; }
    }
    assert.ok(start, `${tag}: a start candidate stands`);
    const states = reachSet(world, OX + 12, OZ + 12, OX + 116, OZ + 116, start);
    const dry = ([x, z, h]) => {
      player.x = x; player.z = z;
      if (player.canStand(world, x, z, h) !== true) return false;
      const surf = world.surfaceAt(x, z, 0), sh = surf.h, wl = surf.wl;
      return sh === 0 && Number.isNaN(wl);
    };
    for (const room of source.rooms) {
      const hit = states.find(([x, z, h]) => h === 0 && room.rects.some((r) => x - 0.4 > r.x0 && x + 0.4 < r.x1 && z - 0.4 > r.z0 && z + 0.4 < r.z1) && dry([x, z, h]));
      assert.ok(hit, `${tag}: ${room.spaceId} (${room.role}) is reached`);
    }
    // every aperture on its own: its midline from a metre before the wall gap to a metre past it, both ways
    for (const l of source.links.filter((o) => o.opening)) {
      const { axis, c0, c1, apertures } = l.opening;
      apertures.forEach(({ lo, hi }, q) => {
        const mid = (lo + hi) / 2, near = axis === 'x' ? [c0 - 1, mid] : [mid, c0 - 1], far = axis === 'x' ? [c1 + 1, mid] : [mid, c1 + 1];
        assert.equal(firstBlocked(world, player, [near, far]), null, `${tag} ${l.id} aperture ${q}: forward`);
        assert.equal(firstBlocked(world, player, [far, near]), null, `${tag} ${l.id} aperture ${q}: reverse`);
      });
    }
  }
});

test('topology: eight outer edges and mixed component', () => {
  const seed = 42, Y = yOf(seed), forced = new Set(['-1,-1', '0,-1', '-1,0']);
  const world = new World2(seed, { clusterShare: 0, cluster: (x, z) => (forced.has(`${x},${z}`) ? buildClusterDistrict(seed, x, z, Y) : null) });
  const parent = new Map();
  const find = (v) => { if (!parent.has(v)) parent.set(v, v); while (parent.get(v) !== v) { parent.set(v, parent.get(parent.get(v))); v = parent.get(v); } return v; };
  const join = (p, q) => parent.set(find(p), find(q));
  assert.equal(world.districtPlan(0, 0), null, 'the start district is legacy');
  for (let j = -2; j <= 1; j++) for (let i = -2; i <= 1; i++) find(world.hallOf(i, j).spaceId);
  for (const key of forced) {
    const plan = world.districtPlan(...key.split(',').map(Number));
    assert.ok(plan, `${key}: a cluster district`);
    for (const room of plan.rooms) find(room.spaceId);
    for (const l of plan.links) join(l.from, l.to);
  }
  const edges = [];
  for (let j = -2; j <= 1; j++) for (let i = -2; i <= 0; i++) edges.push([i, j, 'x']);
  for (let j = -2; j <= 0; j++) for (let i = -2; i <= 1; i++) edges.push([i, j, 'z']);
  for (const [i, j, axis] of edges) {
    const c = world.connectionOf(i, j, axis);
    if (c.mode === 'district' || c.mode === 'closed') continue;
    join(c.fromSpaceId, c.toSpaceId);
  }
  assert.equal(new Set([...parent.keys()].map(find)).size, 1, 'one component over cluster rooms and legacy halls');

  for (const key of forced) {
    const [a, b] = key.split(',').map(Number), outer = [];
    for (const j of [2 * b, 2 * b + 1]) outer.push([2 * a - 1, j, 'x'], [2 * a + 1, j, 'x']);
    for (const i of [2 * a, 2 * a + 1]) outer.push([i, 2 * b - 1, 'z'], [i, 2 * b + 1, 'z']);
    assert.equal(outer.length, 8);
    for (const [i, j, axis] of outer) {
      const c = world.connectionOf(i, j, axis);
      assert.equal(c.id, `v2:edge:${axis}:${i},${j}`, `${key}: canonical id`);
      assert.ok(c.mode !== 'district' && c.mode !== 'closed', `${key} ${c.id}: an open outer record (${c.mode})`);
    }
    for (const [i, j, axis] of [[2 * a, 2 * b, 'x'], [2 * a, 2 * b + 1, 'x'], [2 * a, 2 * b, 'z'], [2 * a + 1, 2 * b, 'z']]) assert.equal(world.connectionOf(i, j, axis).mode, 'district', `${key}: inner edge`);
  }
});

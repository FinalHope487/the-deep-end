// T6 link by distance. Slice 1: the two pure exports roomGap2 and classifyRoomLink2. Slice 2: the production passages, metadata, RNG and world tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../../js/gen2.js';
import { buildClusterDistrict, classifyRoomLink2, cutDistrictCell, fixtureCluster, roomGap2, validateDistrictPlan } from '../../js/gen2-district.js';
import { hash2, mulberry32 } from '../../js/rng.js';
import { Player } from '../../js/player.js';
import { reachSet } from './reach.mjs';
import { passageDraws, passageOracle, specOf } from './gen2-passage-oracle.mjs';

const rect = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });
const room = (...rects) => ({ rects });
const clone = (o) => JSON.parse(JSON.stringify(o));
const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const badUnion = { name: 'TypeError', message: 'Invalid room union' };
const badGeometry = { name: 'RangeError', message: 'Invalid room geometry' };
const badClassType = { name: 'TypeError', message: 'Invalid room link classification' };
const badClassRange = { name: 'RangeError', message: 'Invalid room link classification' };

test('link distance: strict inputs and union geometry', () => {
  const unit = room(rect(0, 4, 0, 4));
  // overlap, shared edge and shared corner all give zero
  assert.equal(roomGap2(unit, room(rect(2, 6, 2, 6))), 0);
  assert.equal(roomGap2(unit, room(rect(4, 8, 1, 3))), 0);
  assert.equal(roomGap2(unit, room(rect(4, 8, 4, 8))), 0);
  assert.equal(roomGap2(unit, room(rect(1, 2, 1, 2))), 0);
  // axial gaps, and a diagonal gap by the Euclidean distance between the two nearest corners
  assert.equal(roomGap2(unit, room(rect(6.5, 9, 0, 4))), 2.5);
  assert.equal(roomGap2(unit, room(rect(0, 4, 7, 9))), 3);
  assert.equal(roomGap2(unit, room(rect(7, 9, 8, 10))), 5);
  assert.equal(roomGap2(room(rect(7, 9, 8, 10)), unit), 5);
  assert.equal(roomGap2(unit, room(rect(5, 6, 5, 6))), Math.SQRT2);
  // an L union: the second room sits in the notch of A's bounding box, one metre from both arms
  const L = room(rect(0, 6, 0, 2), rect(0, 2, 2, 6));
  const notch = room(rect(3, 4, 3, 4));
  assert.equal(roomGap2(L, notch), 1);
  assert.equal(roomGap2(notch, L), 1);
  // the rectangle order inside a union changes nothing, and the nearest pair of any two rectangles counts
  assert.equal(roomGap2(room(rect(0, 2, 2, 6), rect(0, 6, 0, 2)), notch), 1);
  assert.equal(roomGap2(room(rect(0, 2, 0, 2), rect(10, 12, 0, 2)), room(rect(5, 7, 0, 2), rect(30, 31, 0, 2))), 3);
  // negative coordinates, extra inert keys and null-prototype records
  assert.equal(roomGap2(room(rect(-10, -8, -4, -2)), room(rect(-6, -5, -4, -2))), 2);
  assert.equal(roomGap2({ rects: [{ x0: 0, x1: 1, z0: 0, z1: 1, tag: 'x', [Symbol('s')]: 1 }], extra: 1 }, room(rect(3, 4, 0, 1))), 2);
  const bare = Object.assign(Object.create(null), rect(0, 1, 0, 1));
  assert.equal(roomGap2({ rects: [bare] }, room(rect(1, 2, 0, 1))), 0);

  // the TypeError class: structure, own data and coordinate type
  const rectFault = (mutate) => { const r = rect(0, 1, 0, 1); mutate(r); return { rects: [r] }; };
  const typeFaults = [
    null, undefined, 0, 'room', [], [rect(0, 1, 0, 1)], {}, { rects: null }, { rects: {} }, { rects: [] },
    { rects: [null] }, { rects: [1] }, { rects: [[0, 1, 0, 1]] }, { rects: [rect(0, 1, 0, 1), undefined] },
    { rects: [Object.create({ x0: 0, x1: 1, z0: 0, z1: 1 })] },
    { rects: [new (class Box { constructor() { Object.assign(this, rect(0, 1, 0, 1)); } })()] },
    rectFault((r) => { delete r.x0; }), rectFault((r) => { r.x1 = '1'; }), rectFault((r) => { r.z0 = null; }), rectFault((r) => { r.z1 = undefined; }),
    rectFault((r) => { r.x0 = 0n; }), rectFault((r) => { r.x0 = true; }),
    Object.create({ rects: [rect(0, 1, 0, 1)] }),
  ];
  const sparse = { rects: [rect(0, 1, 0, 1), rect(2, 3, 0, 1)] };
  delete sparse.rects[0];
  typeFaults.push(sparse);
  const sparseLength = { rects: [rect(0, 1, 0, 1)] };
  sparseLength.rects.length = 2;
  typeFaults.push(sparseLength);
  for (const bad of typeFaults) {
    assert.throws(() => roomGap2(bad, unit), badUnion);
    assert.throws(() => roomGap2(unit, bad), badUnion);
  }

  // accessors are refused and never run
  let calls = 0;
  const trap = () => { calls++; return 0; };
  const accessorRoom = {}; Object.defineProperty(accessorRoom, 'rects', { get: trap, enumerable: true });
  const accessorList = { rects: [rect(0, 1, 0, 1)] }; Object.defineProperty(accessorList.rects, 0, { get: trap, enumerable: true });
  const accessorCoord = rect(0, 1, 0, 1); Object.defineProperty(accessorCoord, 'x1', { get: trap, enumerable: true });
  const accessorExtra = rect(0, 1, 0, 1); Object.defineProperty(accessorExtra, 'tag', { get: trap, enumerable: true });
  for (const bad of [accessorRoom, accessorList, { rects: [accessorCoord] }]) {
    assert.throws(() => roomGap2(bad, unit), badUnion);
    assert.throws(() => roomGap2(unit, bad), badUnion);
  }
  assert.equal(roomGap2({ rects: [accessorExtra] }, unit), 0, 'an inert accessor on an unused key is never read');
  assert.equal(calls, 0);

  // the RangeError class: non-finite, off-grid, nonpositive area and computed overflow
  const geometryFaults = [
    rect(NaN, 1, 0, 1), rect(0, Infinity, 0, 1), rect(-Infinity, 1, 0, 1), rect(0, 1, NaN, 1), rect(0, 1, 0, -Infinity),
    rect(0.25, 1, 0, 1), rect(0, 1.1, 0, 1), rect(0, 1, 0.75, 2), rect(0, 1, 0, 1 / 3),
    rect(1, 1, 0, 1), rect(0, 1, 1, 1), rect(2, 1, 0, 1), rect(0, 1, 2, 1), rect(0, 0, 0, 0),
  ];
  for (const g of geometryFaults) {
    assert.throws(() => roomGap2(room(g), unit), badGeometry);
    assert.throws(() => roomGap2(unit, room(g)), badGeometry);
  }
  // each coordinate is on the grid and finite, but the diagonal distance leaves the double range
  const huge = 8e307, span = 1e300;
  assert.throws(() => roomGap2(room(rect(-huge, -huge + span, -huge, -huge + span)), room(rect(huge - span, huge, huge - span, huge))), badGeometry);
  assert.throws(() => roomGap2(room(rect(huge - span, huge, -huge, -huge + span)), room(rect(-huge, -huge + span, huge - span, huge))), badGeometry);
  // a type fault anywhere wins over a numeric fault in the other room
  assert.throws(() => roomGap2(room(rect(NaN, 1, 0, 1)), { rects: [] }), badUnion);
  assert.throws(() => roomGap2(room(rect(NaN, 1, 0, 1)), room(rect(0, 1, 0, 1), rect(0, 1, 0, '1'))), badUnion);
  // a bad later rectangle is found even when the first pair already touches
  assert.throws(() => roomGap2(room(rect(0, 4, 0, 4), rect(0.25, 1, 0, 1)), unit), badGeometry);

  // no input is touched: frozen inputs work and a JSON snapshot stays equal
  const a = deepFreeze(room(rect(0, 6, 0, 2), rect(0, 2, 2, 6)));
  const b = deepFreeze(room(rect(3, 4, 3, 4)));
  const snapshot = clone([a, b]);
  assert.equal(roomGap2(a, b), 1);
  assert.deepEqual(clone([a, b]), snapshot);
  const broken = clone(a); broken.rects.push(rect(0.25, 1, 0, 1));
  const brokenSnapshot = clone(broken);
  assert.throws(() => roomGap2(broken, b), badGeometry);
  assert.deepEqual(clone(broken), brokenSnapshot);
});

test('link distance: classification thresholds', () => {
  const call = (physicalGap, sharedOpening, connectorEligible, connectorDraw) => classifyRoomLink2({ physicalGap, sharedOpening, connectorEligible, connectorDraw });
  const table = [
    [0, false, false, 0, 'short-passage'],
    [0.5, false, false, 0, 'short-passage'],
    [6, false, true, 0, 'short-passage'],
    [6.5, false, true, 0.399999, 'connector-room'],
    [6.5, false, true, 0.4, 'corridor'],
    [6.5, false, false, 0, 'corridor'],
    [30, false, true, 0.399999, 'connector-room'],
    [30, false, true, 0.4, 'corridor'],
    [30.5, false, true, 0.999999, 'connector-room'],
    [30.5, false, false, 0, 'corridor'],
    [36, false, true, 0.999999, 'connector-room'],
    [36.5, false, true, 0.999999, 'connector-room'],
    [36.5, false, false, 0, 'corridor'],
    [0.5, true, false, 0, 'shared-opening'],
    [36.5, true, true, 0.4, 'shared-opening'],
  ];
  for (const [gap, shared, eligible, draw, expected] of table) {
    assert.equal(call(gap, shared, eligible, draw), expected, `${gap} ${shared} ${eligible} ${draw}`);
  }
  // draw 1 and the flag combinations of an ineligible long gap
  assert.throws(() => call(6.5, false, true, 1), badClassRange);
  assert.equal(call(100, false, false, 0.999999), 'corridor');
  assert.equal(call(6, true, false, 0), 'shared-opening');

  // numeric domain, checked even when the shared flag would decide at once
  for (const shared of [false, true]) {
    for (const bad of [-0.5, -1e-9, NaN, Infinity, -Infinity]) assert.throws(() => call(bad, shared, true, 0), badClassRange);
    for (const bad of [-0.1, 1, 1.5, NaN, Infinity, -Infinity]) assert.throws(() => call(3, shared, true, bad), badClassRange);
  }
  assert.equal(call(0, false, false, 0), 'short-passage');
  assert.equal(call(3, false, false, 0.999999999), 'short-passage');

  // structure and types
  const good = { physicalGap: 3, sharedOpening: false, connectorEligible: false, connectorDraw: 0 };
  const typeFaults = [
    null, undefined, 0, 'x', [], [3, false, false, 0], () => {}, Object.create(good),
    new (class Input { constructor() { Object.assign(this, good); } })(),
    ...Object.keys(good).map((k) => { const o = { ...good }; delete o[k]; return o; }),
    { ...good, physicalGap: '3' }, { ...good, physicalGap: null }, { ...good, physicalGap: 3n },
    { ...good, sharedOpening: 0 }, { ...good, sharedOpening: 'false' }, { ...good, sharedOpening: undefined },
    { ...good, connectorEligible: 1 }, { ...good, connectorEligible: null },
    { ...good, connectorDraw: '0' }, { ...good, connectorDraw: false }, { ...good, connectorDraw: undefined },
  ];
  for (const bad of typeFaults) assert.throws(() => classifyRoomLink2(bad), badClassType);

  // accessors are refused and never run
  let calls = 0;
  for (const key of Object.keys(good)) {
    const o = { ...good };
    Object.defineProperty(o, key, { get: () => { calls++; return good[key]; }, enumerable: true });
    assert.throws(() => classifyRoomLink2(o), badClassType);
  }
  assert.equal(calls, 0);
  // a type fault wins over a numeric fault in another field
  assert.throws(() => classifyRoomLink2({ ...good, physicalGap: -1, sharedOpening: 'no' }), badClassType);

  // a null prototype and inert extra keys are valid
  assert.equal(classifyRoomLink2(Object.assign(Object.create(null), good)), 'short-passage');
  assert.equal(classifyRoomLink2({ ...good, physicalGap: 40, connectorEligible: true, tag: 1, [Symbol('s')]: 2 }), 'connector-room');
  const inertAccessor = { ...good }; Object.defineProperty(inertAccessor, 'tag', { get: () => { calls++; return 1; }, enumerable: true });
  assert.equal(classifyRoomLink2(inertAccessor), 'short-passage');
  assert.equal(calls, 0);

  // no RNG draw and no mutation: frozen input, Math.random never called
  const random = Math.random; let drawn = 0;
  Math.random = () => { drawn++; return 0.5; };
  try {
    const frozen = deepFreeze({ physicalGap: 6.5, sharedOpening: false, connectorEligible: true, connectorDraw: 0.2 });
    const snapshot = clone(frozen);
    assert.equal(classifyRoomLink2(frozen), 'connector-room');
    assert.deepEqual(clone(frozen), snapshot);
  } finally { Math.random = random; }
  assert.equal(drawn, 0);
});

// ---------- slice 2: production passages ----------

const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 20261024];
const WIDTHS = [1.5, 2, 2.5, 3, 3.5], CEILS = [2, 2.5, 3];
const DISTANCE_KEYS = ['form', 'physicalGap', 'width', 'ceil', 'line', 'measurementGap', 'routeLength', 'stretch'];
const planFault = { name: 'TypeError', message: 'Invalid district plan' };
const geometryFault = { name: 'RangeError', message: 'Invalid district geometry' };
const worlds = new Map();
const yOf = (seed) => { if (!worlds.has(seed)) worlds.set(seed, new World2(seed, { clusterShare: 0 }).Y); return worlds.get(seed); };
const corpus = [];
for (const seed of SEEDS) for (let b = -2; b <= 1; b++) for (let a = -2; a <= 1; a++) corpus.push({ seed, a, b });
const built = new Map();
const planOf = (seed, a, b) => { const k = `${seed},${a},${b}`; if (!built.has(k)) built.set(k, buildClusterDistrict(seed, a, b, yOf(seed))); return built.get(k); };
const q2 = (v) => Number.isInteger(v / 0.5);
const frozenDeep = (o) => !o || typeof o !== 'object' || (Object.isFrozen(o) && Object.values(o).every(frozenDeep));
const lineGap = (line) => Math.abs(line[1][0] - line[0][0]) + Math.abs(line[1][1] - line[0][1]);
const overlapArea = (p, q) => Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0));
const unionOverlap = (r, o) => o.rects.reduce((s, q) => s + overlapArea(r, q), 0);
// a positive-length shared edge without shared area
const touches = (p, q) => overlapArea(p, q) === 0 && (((p.x1 === q.x0 || q.x1 === p.x0) && Math.min(p.z1, q.z1) > Math.max(p.z0, q.z0)) || ((p.z1 === q.z0 || q.z1 === p.z0) && Math.min(p.x1, q.x1) > Math.max(p.x0, q.x0)));
const bounds = (rects) => ({ x0: Math.min(...rects.map((q) => q.x0)), x1: Math.max(...rects.map((q) => q.x1)), z0: Math.min(...rects.map((q) => q.z0)), z1: Math.max(...rects.map((q) => q.z1)) });
// the oracle's line: face to face on the lane centre, from the link's first room to its second
function lineOf(o, A, B) {
  const mid = (room) => { const bb = bounds(room.rects); return o.axis === 'x' ? (bb.x0 + bb.x1) / 2 : (bb.z0 + bb.z1) / 2; };
  const [f0, f1] = mid(A) < mid(B) ? o.faces : [o.faces[1], o.faces[0]];
  return o.axis === 'x' ? [[f0, o.centre], [f1, o.centre]] : [[o.centre, f0], [o.centre, f1]];
}
const cellsOf = (a, b) => [[2 * a, 2 * b], [2 * a + 1, 2 * b], [2 * a, 2 * b + 1], [2 * a + 1, 2 * b + 1]];
const worldOf = (seed, a, b) => new World2(seed, { clusterShare: 0, cluster: (x, z) => (x === a && z === b ? planOf(seed, a, b) : null) });

test('link distance: passage metadata and validation', () => {
  const source = planOf(42, 1, 1), k = source.links.findIndex((l) => l.kind === 'passage'), s = source.links.findIndex((l) => l.kind === 'shared-opening');
  assert.ok(k >= 0 && s >= 0);
  const v = source.links[k].distance;
  assert.deepEqual(Object.keys(v).sort(), [...DISTANCE_KEYS].sort(), 'exactly eight own fields');
  assert.equal(v.form, 'short-passage');
  assert.ok(!('distance' in source.links[s]), 'an opening carries no distance');
  assert.ok(frozenDeep(source), 'the source and its metadata are frozen');

  const expectFault = (label, mutate, error) => {
    const p = clone(source);
    mutate(p, p.links[k].distance, p.links[k]);
    assert.throws(() => validateDistrictPlan(p, 1, 1), error, label);
  };
  // structure and type faults are TypeErrors
  for (const key of DISTANCE_KEYS) expectFault(`missing ${key}`, (p, d) => { delete d[key]; }, planFault);
  expectFault('extra string key', (p, d) => { d.extra = 1; }, planFault);
  expectFault('extra symbol key', (p, d) => { d[Symbol('x')] = 1; }, planFault);
  expectFault('unknown form', (p, d) => { d.form = 'corridor'; }, planFault);
  for (const key of ['physicalGap', 'width', 'ceil', 'measurementGap', 'routeLength', 'stretch']) expectFault(`${key} as text`, (p, d) => { d[key] = String(d[key]); }, planFault);
  expectFault('line of one point', (p, d) => { d.line = [d.line[0]]; }, planFault);
  expectFault('line of three points', (p, d) => { d.line = [...d.line, d.line[0]]; }, planFault);
  expectFault('point of three coordinates', (p, d) => { d.line[0] = [...d.line[0], 0]; }, planFault);
  expectFault('text coordinate', (p, d) => { d.line[1][0] = 'x'; }, planFault);
  expectFault('distance is null', (p, d, l) => { l.distance = null; }, planFault);
  expectFault('distance is an array', (p, d, l) => { l.distance = []; }, planFault);
  expectFault('distance on an opening', (p) => { p.links[s].distance = clone(v); }, planFault);
  expectFault('inherited fields', (p, d, l) => { l.distance = Object.create(d); }, planFault);
  expectFault('sparse line', (p, d) => { delete d.line[0]; }, planFault);
  let calls = 0;
  expectFault('accessor field', (p, d) => { Object.defineProperty(d, 'width', { get() { calls++; return 2; }, enumerable: true }); }, planFault);
  expectFault('accessor distance', (p, d, l) => { Object.defineProperty(l, 'distance', { get() { calls++; return d; }, enumerable: true }); }, planFault);
  expectFault('accessor line point', (p, d) => { Object.defineProperty(d.line, '1', { get() { calls++; return [0, 0]; }, enumerable: true }); }, planFault);
  assert.equal(calls, 0, 'no accessor ran');
  // number and geometry faults are RangeErrors
  expectFault('width outside the set', (p, d) => { d.width = 4; }, geometryFault);
  expectFault('another width than the rectangle has', (p, d) => { d.width = WIDTHS.find((x) => x !== d.width); }, geometryFault);
  expectFault('ceiling outside the set', (p, d) => { d.ceil = 3.5; }, geometryFault);
  for (const key of ['physicalGap', 'width', 'ceil', 'measurementGap', 'routeLength', 'stretch']) {
    for (const bad of [NaN, Infinity]) expectFault(`${key} ${bad}`, (p, d) => { d[key] = bad; }, geometryFault);
  }
  for (const key of ['physicalGap', 'measurementGap', 'routeLength', 'stretch']) {
    expectFault(`${key} negative`, (p, d) => { d[key] = -1; }, geometryFault);
    expectFault(`${key} off by 0.5 m`, (p, d) => { d[key] += 0.5; }, geometryFault);
  }
  expectFault('diagonal line', (p, d) => { d.line[1] = [d.line[1][0] + 0.5, d.line[1][1] + 0.5]; }, geometryFault);
  expectFault('line coordinate NaN', (p, d) => { d.line[0][0] = NaN; }, geometryFault);
  expectFault('line off its lane', (p, d) => {
    const along = d.line[0][0] !== d.line[1][0] ? 1 : 0;
    d.line[0][along] += 0.5; d.line[1][along] += 0.5;
  }, geometryFault);
  expectFault('line reversed', (p, d) => { d.line = [d.line[1], d.line[0]]; }, geometryFault);
  expectFault('rectangle shortened',(p, d, l) => { l.rects[0].x1 -= 0.5; }, geometryFault);
  expectFault('grid moved', (p, d, l) => { l.grid.ox += 0.5; }, geometryFault);

  // an authored zero-gap passage: the rooms touch along 28.5 m of z, the lane is 3 m wide and the two line points are the same
  const zero = (mutate) => {
    const p = clone(fixtureCluster(1, 1));
    p.rooms[1].rects[0].x0 = 191.5;
    p.links[0].rects = [{ x0: 191, x1: 192, z0: 158.5, z1: 161.5 }];
    p.links[0].grid = { ox: 191, oz: 158.5, step: 6 };
    p.links[0].distance = { form: 'short-passage', physicalGap: 0, width: 3, ceil: 3, line: [[191.5, 160], [191.5, 160]], measurementGap: 0, routeLength: 0, stretch: 0 };
    mutate?.(p);
    return p;
  };
  const accepted = validateDistrictPlan(zero(), 1, 1);
  assert.deepEqual(accepted.links[0].distance.line, [[191.5, 160], [191.5, 160]], 'a valid zero-gap passage with identical endpoints');
  assert.throws(() => validateDistrictPlan(zero((p) => { p.rooms[1].rects[0].z0 = 160; }), 1, 1), geometryFault, 'partial support across the lane');
  assert.throws(() => validateDistrictPlan(zero((p) => { p.rooms[1].rects[0].z0 = 161.5; }), 1, 1), geometryFault, 'the lane is outside the shared face');
  assert.throws(() => validateDistrictPlan(zero((p) => { p.links[0].distance.line = [[191.5, 160], [192, 160]]; }), 1, 1), geometryFault, 'a line that leaves the touching face');
  assert.throws(() => validateDistrictPlan(zero((p) => { p.rooms[0].ceil = 2.5; }), 1, 1), geometryFault, 'ceiling above a room ceiling');
  assert.doesNotThrow(() => validateDistrictPlan(zero((p) => { p.rooms[0].ceil = 3; }), 1, 1), 'ceiling equal to the lowest room ceiling');

  // the validated copy shares nothing with its input and is frozen all the way down
  const raw = clone(source), out = validateDistrictPlan(raw, 1, 1);
  assert.ok(frozenDeep(out));
  assert.equal(JSON.stringify(out), JSON.stringify(source));
  assert.notEqual(out.links[k].distance, raw.links[k].distance);
  assert.notEqual(out.links[k].distance.line, raw.links[k].distance.line);
  assert.notEqual(out.links[k].distance.line[0], raw.links[k].distance.line[0]);
  raw.links[k].distance.width = 99; raw.links[k].distance.line[0][0] = -1;
  assert.equal(JSON.stringify(out), JSON.stringify(source), 'a later edit of the input changes nothing');
  // an authored passage without metadata keeps the T2 rules
  const authored = validateDistrictPlan(clone(fixtureCluster(1, 1)), 1, 1);
  assert.ok(authored.links.length >= 1 && authored.links.every((l) => !('distance' in l)));

  // cuts: the whole source line goes to the link fragments only, one deep frozen copy per cut
  let carried = 0;
  for (const [i, j] of cellsOf(1, 1)) {
    const one = cutDistrictCell(source, i, j), two = cutDistrictCell(source, i, j);
    assert.ok(frozenDeep(one));
    one.fragments.forEach((f, n) => {
      const link = f.sourceType === 'link' ? source.links.find((l) => l.id === f.sourceId) : null, g = two.fragments[n];
      if (!link || !link.distance) { assert.ok(!('distance' in f), 'no metadata on rooms and openings'); return; }
      carried++;
      assert.deepEqual(f.distance, link.distance, 'the whole source line, not clipped to the cell');
      assert.notEqual(f.distance, link.distance);
      assert.notEqual(f.distance.line, link.distance.line);
      assert.notEqual(f.distance, g.distance, 'each cut owns its metadata');
      assert.notEqual(f.distance.line[0], g.distance.line[0]);
      assert.equal(f.ceil, link.distance.ceil, 'the fragment ceiling is the passage ceiling');
    });
  }
  assert.ok(carried >= 1);

  // the world's mutable plan rooms get their own copy of the metadata
  const world = worldOf(42, 1, 1);
  let seen = 0;
  for (const [i, j] of cellsOf(1, 1)) {
    for (const o of world.plan(i, j).rooms) {
      const link = source.links.find((l) => l.id === o.spaceId);
      if (!link || !link.distance) { assert.ok(!('distance' in o)); continue; }
      seen++;
      assert.deepEqual(o.distance, link.distance);
      assert.ok(!Object.isFrozen(o.distance) && !Object.isFrozen(o.distance.line));
      o.distance.width = 99; o.distance.line[0][0] = -1;
    }
  }
  assert.ok(seen >= 1);
  assert.equal(JSON.stringify(world.districtPlan(1, 1)), JSON.stringify(source), 'editing a plan room touches neither the district nor the source');
});

test('link distance: 128 forced districts', () => {
  assert.equal(corpus.length, 128);
  let links = 0, direct = 0, passages = 0, short = 0, long = 0, maxGap = 0;
  const widths = new Set(), ceils = new Set();
  for (const c of corpus) {
    const plan = planOf(c.seed, c.a, c.b), roomOf = new Map(plan.rooms.map((o) => [o.spaceId, o])), tag = `${c.seed}:${c.a},${c.b}`;
    plan.links.forEach((l, k) => {
      links++;
      const gap = roomGap2(roomOf.get(l.from), roomOf.get(l.to));
      if (l.kind === 'shared-opening') {
        direct++;
        assert.ok(!('distance' in l), `${tag} link ${k}: an opening has no distance`);
      } else {
        passages++;
        const v = l.distance;
        assert.equal(classifyRoomLink2({ physicalGap: gap, sharedOpening: false, connectorEligible: false, connectorDraw: 0 }), 'short-passage', `${tag} link ${k}`);
        assert.ok(Math.abs(v.physicalGap - gap) <= 1e-9, `${tag} link ${k}: physical gap`);
        assert.ok(v.physicalGap <= 5 && v.measurementGap <= 6 && v.stretch <= 6, `${tag} link ${k}: ${v.physicalGap} ${v.measurementGap} ${v.stretch}`);
        assert.ok(v.measurementGap === v.routeLength && v.routeLength === v.stretch && v.stretch === lineGap(v.line), `${tag} link ${k}: lengths`);
        maxGap = Math.max(maxGap, v.physicalGap);
        widths.add(v.width); ceils.add(v.ceil);
      }
      if (gap <= 5) short++; else long++;
    });
  }
  assert.equal(links, 1813);
  assert.equal(direct, 1231);
  assert.equal(passages, 582);
  assert.equal(passages, links - direct);
  assert.equal(short, 1813);
  assert.equal(long, 0);
  assert.equal(short / links, 1);
  assert.equal(long / links, 0);
  assert.equal(maxGap, 5, 'the largest nonshared physical gap');
  assert.deepEqual([...widths].sort((p, q) => p - q), WIDTHS);
  assert.deepEqual([...ceils].sort((p, q) => p - q), CEILS);
});

// seeds for district (1, 1): [first variant, second variant, EE, SS, ET, TT]; variant 0 small rect, 1 small L, 2 medium rect, 3 medium L
const BRIDGE_SEEDS = [
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

test('link distance: 64 bridge variants and four reflections', () => {
  let cases = 0;
  for (const row of BRIDGE_SEEDS) {
    Object.keys(BRIDGE_CLASSES).forEach((cls, n) => {
      cases++;
      const seed = row[2 + n], tag = `${cls} seed ${seed} variants ${row[0]}/${row[1]}`, plan = planOf(seed, 1, 1), spec = specOf(plan);
      const drawn = drawnRooms(seed, 1, 1), [[c0, s0], [c1, s1]] = BRIDGE_CLASSES[cls], first = drawn[c0][s0], second = drawn[c1][s1];
      assert.ok(first && second, `${tag}: both endpoints exist`);
      assert.deepEqual([variantOf(first), variantOf(second)], [row[0], row[1]], `${tag}: the 7710 draws give these variants`);
      const iA = spec.findIndex((r) => r.cell === c0 && r.slot === s0), iB = spec.findIndex((r) => r.cell === c1 && r.slot === s1);
      const A = plan.rooms[iA], B = plan.rooms[iB], link = plan.links.find((l) => l.from === A.spaceId && l.to === B.spaceId);
      assert.ok(link && link.kind === 'passage' && link.rects.length === 1, `${tag}: one passage rectangle`);
      const k = plan.links.indexOf(link), o = passageOracle(plan, spec, iA, iB, k, seed), r = link.rects[0], w = o.width;
      assert.deepEqual(r, o.rect, tag);
      assert.ok([r.x0, r.x1, r.z0, r.z1].every(q2), `${tag}: Q2 edges`);
      assert.equal(link.distance.width, w, `${tag}: the 8820/8821 width`);
      assert.equal(o.axis === 'x' ? r.z1 - r.z0 : r.x1 - r.x0, w, `${tag}: ${w} m wide`);
      assert.deepEqual(link.grid, { ox: r.x0, oz: r.z0, step: 6 }, tag);
      assert.equal(unionOverlap(r, A), 0.5 * w, `${tag}: reaches the first room by 0.5 x ${w} m`);
      assert.equal(unionOverlap(r, B), 0.5 * w, `${tag}: reaches the second room by 0.5 x ${w} m`);
      // the line runs face to face on the lane centre, from the link's first room to its second
      assert.deepEqual(link.distance.line, lineOf(o, A, B), `${tag}: the line`);
      assert.equal(link.distance.routeLength, o.faces[1] - o.faces[0], `${tag}: the line length`);
      for (const room of plan.rooms) {
        if (room === A || room === B) continue;
        assert.equal(unionOverlap(r, room), 0, `${tag}: no overlap with ${room.spaceId}`);
        assert.ok(room.rects.every((q) => !touches(r, q)), `${tag}: no edge contact with ${room.spaceId}`);
      }
      for (const other of plan.links) if (other !== link) assert.ok(other.rects.every((q) => overlapArea(r, q) === 0 && !touches(r, q)), `${tag}: clear of ${other.id}`);
    });
  }
  assert.equal(cases, 64);

  // all four reflections of the E-T lane: the phase is added in the canonical frame and the whole rectangle is reflected once
  const seen = new Set(), odd = new Set();
  for (const c of corpus) {
    const plan = planOf(c.seed, c.a, c.b), spec = specOf(plan), index = (id) => plan.rooms.findIndex((o) => o.spaceId === id);
    plan.links.forEach((l, k) => {
      if (l.kind !== 'passage') return;
      const p = index(l.from), q = index(l.to);
      if (spec[p].cell !== spec[q].cell) return;
      const cell = spec[p].cell, o = passageOracle(plan, spec, p, q, k, c.seed), r = l.rects[0], fx = cell & 1;
      assert.deepEqual(r, o.rect, `${c.seed}:${c.a},${c.b} link ${k}`);
      assert.deepEqual(l.distance.line, lineOf(o, plan.rooms[p], plan.rooms[q]), `${c.seed}:${c.a},${c.b} link ${k}: the reflected line`);
      const lo = fx ? 128 - (r.x1 - 128 * c.a) : r.x0 - 128 * c.a;
      assert.equal(lo, 52.5 + (Number.isInteger(o.width) ? 0 : 0.25) - o.width / 2, `${c.seed}:${c.a},${c.b} link ${k}: canonical lane edge`);
      seen.add(cell);
      if (!Number.isInteger(o.width)) odd.add(cell);
    });
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3], 'E-T passages in every reflection');
  assert.deepEqual([...odd].sort(), [0, 1, 2, 3], 'an odd-half width in every reflection');
});

test('link distance: widths ceilings and independent RNG', () => {
  const random = Math.random; let drawn = 0;
  Math.random = () => { drawn++; return 0.5; };
  try {
    const pairs = new Set();
    for (const c of corpus) {
      const plan = planOf(c.seed, c.a, c.b);
      plan.links.forEach((l, k) => {
        if (l.kind === 'shared-opening') { assert.ok(!('distance' in l), 'no draw for a T4 opening'); return; }
        // the oracle redraws the stream from the public rng helpers: two draws, the width first and the ceiling second
        const r = mulberry32(hash2(hash2(c.seed >>> 0, c.a, c.b, 8820), k, Math.floor(k / 0x100000000), 8821));
        const widthDraw = r(), ceilDraw = r();
        const width = [1.5, 2, 2, 2.5, 3, 3.5][Math.floor(widthDraw * 6)], ceil = [2, 2.5, 3][Math.floor(ceilDraw * 3)];
        assert.deepEqual([l.distance.width, l.distance.ceil], [width, ceil], `${c.seed}:${c.a},${c.b} link ${k}`);
        assert.deepEqual(passageDraws(c.seed, c.a, c.b, k), { width, ceil });
        pairs.add(`${width}/${ceil}`);
      });
    }
    assert.ok(pairs.size >= 12, `${pairs.size} distinct width/ceiling pairs`);
    // the stream is keyed by the unsigned 32-bit seed, the district and the sorted link index alone
    const Y = yOf(42);
    assert.equal(JSON.stringify(buildClusterDistrict(42 + 4294967296, 1, 1, Y)), JSON.stringify(planOf(42, 1, 1)));
    assert.notEqual(JSON.stringify(buildClusterDistrict(43, 1, 1, Y)), JSON.stringify(planOf(42, 1, 1)));
  } finally { Math.random = random; }
  assert.equal(drawn, 0, 'no Math.random');
});

test('link distance: planning order FIFO and immutable sources', () => {
  const seed = 42, Y = yOf(seed), cells = cellsOf(1, 1);
  assert.deepEqual(cells, [[2, 2], [3, 2], [2, 3], [3, 3]]);
  const source = buildClusterDistrict(seed, 1, 1, Y), before = JSON.stringify(source);
  const forward = new World2(seed, { clusterShare: 0, cluster: (x, z) => (x === 1 && z === 1 ? source : null) });
  const reverse = new World2(seed, { clusterShare: 0, cluster: (x, z) => (x === 1 && z === 1 ? buildClusterDistrict(seed, x, z, Y) : null) });
  const fwd = cells.map(([i, j]) => JSON.stringify(forward.plan(i, j)));
  const back = [];
  for (const n of [3, 2, 1, 0]) back[n] = JSON.stringify(reverse.plan(...cells[n]));
  assert.deepEqual(back, fwd, 'the order of cell requests changes nothing');
  assert.equal(JSON.stringify(source), before, 'the caller-owned source is unchanged');
  const held = forward.districtPlan(1, 1);
  assert.ok(frozenDeep(held) && held !== source, 'the cached district is a frozen copy');
  let withDistance = 0;
  held.links.forEach((l, n) => {
    if (!l.distance) return;
    withDistance++;
    assert.deepEqual(l.distance, source.links[n].distance);
    assert.notEqual(l.distance, source.links[n].distance, 'no metadata object is shared with the caller');
    assert.notEqual(l.distance.line, source.links[n].distance.line);
  });
  assert.ok(withDistance >= 1);

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

const BODY_CASES = [[2, 1, 1], [0, 1, 1], [5, 1, 1], [1, 1, 1], [4, 1, 1], [42, -1, -1]];

test('link distance: six real body worlds', () => {
  let walked = 0;
  for (const [seed, a, b] of BODY_CASES) {
    const source = planOf(seed, a, b), world = worldOf(seed, a, b), OX = 128 * a, OZ = 128 * b, player = new Player(), tag = `${seed}:${a},${b}`;
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
    // every passage on its own: its centreline from 0.5 m inside the first room to 0.5 m inside the second, both ways
    for (const l of source.links.filter((o) => o.distance)) {
      const [[x0, z0], [x1, z1]] = l.distance.line, r = l.rects[0];
      // a zero-gap passage has identical points; its normal axis is the short side of the rectangle (1 m against a width of at least 1.5 m)
      const dir = x0 !== x1 ? [Math.sign(x1 - x0), 0] : z0 !== z1 ? [0, Math.sign(z1 - z0)] : r.x1 - r.x0 < r.z1 - r.z0 ? [1, 0] : [0, 1];
      const near = [x0 - 0.5 * dir[0], z0 - 0.5 * dir[1]], far = [x1 + 0.5 * dir[0], z1 + 0.5 * dir[1]];
      assert.equal(firstBlocked(world, player, [near, far]), null, `${tag} ${l.id}: forward`);
      assert.equal(firstBlocked(world, player, [far, near]), null, `${tag} ${l.id}: reverse`);
      walked++;
    }
  }
  assert.ok(walked >= 20, `${walked} passages walked`);
});

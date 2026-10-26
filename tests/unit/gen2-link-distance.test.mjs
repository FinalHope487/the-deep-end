// T6 link by distance. Slice 1: the two pure exports roomGap2 and classifyRoomLink2. The production, RNG and world tests join this file in later commits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRoomLink2, roomGap2 } from '../../js/gen2-district.js';

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

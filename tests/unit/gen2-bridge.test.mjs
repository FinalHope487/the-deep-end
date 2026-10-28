// S2 slice 2: the physical bridge compiler (js/gen2-bridge.js) on synthetic rooms. A refusal names its reason; a length is a walk, never made up
import test from 'node:test';
import assert from 'node:assert/strict';
import { flightWalk } from '../../js/gen2-routes.js';
import { FLIGHT_SLOPE, LANDING } from '../../js/gen2.js';
import { ZONING } from '../../js/gen2-zoning.js';
import { BRIDGE, flightRun, flightSlots, passageLines, passageRects, compileBridge } from '../../js/gen2-bridge.js';

const Y = { '-1': -6, 0: 0, 1: 6 };
const A = { x0: 0, x1: 30, z0: 0, z1: 30 }, B = { x0: 100, x1: 130, z0: 0, z1: 30 };
const anchors = { A: [15, 15], B: [115, 15] };
const ctxOf = ({ blockA = [], blockB = [], upper = { 1: [], '-1': [] } } = {}) => ({
  Y, anchor: (id) => anchors[id], rects: (id) => [id === 'A' ? A : B], blockers: (id) => (id === 'A' ? blockA : blockB), upper: (f) => upper[f],
});
// an S1 record shaped like buildZoningPlan's, with l1f chosen so the drawn ratio and the length target agree
const recordFor = (floor, ratio, physical) => ({
  id: 'db:x:0,0', floor, ratio, pair: { a: 'A', b: 'B' }, closedPorts: [{ connection: 'c0', edgeIds: ['e0'] }], closedNodes: ['k:connector'],
  lengthBudget: physical, verification: { l1f: ratio * physical, ratio },
});
// the plain bridge: the first target, scanning up, that the rooms can serve gives the shortest walk they allow (no jog needed)
const probe = (floor) => {
  for (let t = 100; t <= 260; t += 2) { const c = compileBridge(recordFor(floor, 3, t), ctxOf()); if (c.status === 'accepted') return c; }
  throw new Error('no plain bridge');
};

test('flightRun is the run of a hall flight over dy, landing included', () => {
  assert.equal(flightRun(6), 13);
  assert.equal(flightRun(-6), 13);
  assert.ok(flightRun(6) > 6 / FLIGHT_SLOPE);
  assert.ok(flightRun(0.6) >= LANDING);
});

test('flightSlots: the footprint and the entry area stay inside the room and clear of its blockers, best exit first', () => {
  const block = { x0: 10, x1: 20, z0: 10, z1: 20 };
  const slots = flightSlots([A], [block], 13, anchors.B, 0, 6);
  assert.ok(slots.length > 0 && slots.length <= BRIDGE.tries);
  for (const s of slots) {
    const f = s.flight, h = s.flight.hallEntry;
    for (const r of [f, h]) assert.ok(r.x0 >= A.x0 && r.x1 <= A.x1 && r.z0 >= A.z0 && r.z1 <= A.z1, 'inside');
    assert.ok(!(f.x0 - 1 < block.x1 && block.x0 < f.x1 + 1 && f.z0 - 1 < block.z1 && block.z0 < f.z1 + 1), 'clear of the blocker');
    assert.deepEqual(s.exit, flightWalk(f).exit);
  }
  for (let k = 1; k < slots.length; k++) assert.ok(slots[k].score >= slots[k - 1].score);
  assert.ok(slots[0].exit[0] > 15, 'the best exit faces the partner');
  assert.equal(new Set(slots.map((s) => s.exit.join(','))).size, slots.length);
});

test('flightSlots: a room with no room for a flight gives none', () => {
  assert.deepEqual(flightSlots([{ x0: 0, x1: 8, z0: 0, z1: 8 }], [], 13, [50, 50], 0, 6), []);
  assert.deepEqual(flightSlots([A], [{ x0: -5, x1: 35, z0: -5, z1: 35 }], 13, anchors.B, 0, 6), []);
});

test('passageLines run from P to Q in axis steps, and a jog adds twice its size', () => {
  const P = [30, 15], Q = [100, 15], lines = passageLines(P, Q);
  const len = (l) => l.reduce((t, p, k) => (k ? t + Math.abs(p[0] - l[k - 1][0]) + Math.abs(p[1] - l[k - 1][1]) : 0), 0);
  for (const l of lines) {
    assert.deepEqual(l[0], P);
    assert.deepEqual(l[l.length - 1], Q);
    for (let k = 1; k < l.length; k++) assert.ok(l[k][0] === l[k - 1][0] || l[k][1] === l[k - 1][1], 'axis steps');
  }
  const lengths = new Set(lines.map(len));
  assert.ok(lengths.has(70) && lengths.has(70 + 2 * 8));
  assert.equal(passageRects([P, Q]).length, 1);
  assert.deepEqual(passageRects([P, Q])[0], { x0: 28.5, x1: 101.5, z0: 13.5, z1: 16.5 });
});

test('a bridge on 2F and one on B1 compile; its length is the walk of its parts and lies in the ratio window', () => {
  for (const floor of [1, -1]) {
    const plain = probe(floor);
    assert.equal(plain.status, 'accepted', JSON.stringify(plain));
    const physical = plain.length.physical, rec = recordFor(floor, 3, physical), c = compileBridge(rec, ctxOf());
    assert.equal(c.status, 'accepted');
    assert.equal(c.floor, floor);
    assert.deepEqual(c.parts.map((p) => p.kind), ['entry-flight', 'upper-passage', 'exit-flight']);
    assert.deepEqual(c.closedConnectionIds, ['c0']);
    assert.deepEqual(c.removedConnectorIds, ['k:connector']);
    const [pa, pp, pb] = c.parts, man = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
    const walked = man(anchors.A, pa.entry) + man(pa.entry, flightWalk(pa.flight).from) + flightWalk(pa.flight).length
      + pp.line.reduce((t, p, k) => (k ? t + man(p, pp.line[k - 1]) : 0), 0)
      + flightWalk(pb.flight).length + man(pb.entry, flightWalk(pb.flight).from) + man(pb.entry, anchors.B);
    assert.ok(Math.abs(walked - c.length.physical) < 1e-9);
    assert.ok(c.length.physical >= c.length.window[0] - 1e-9 && c.length.physical <= c.length.window[1] + 1e-9);
    assert.deepEqual(pp.line[0], pa.exit);
    assert.deepEqual(pp.line[pp.line.length - 1], pb.exit);
    assert.equal(pa.flight.y1, Y[floor]);
  }
});

test('a passage that is too short is wound longer by a jog, and one that cannot be is refused as ratio-unbuildable', () => {
  const plain = probe(1).length.physical;
  const longer = compileBridge(recordFor(1, 3, plain + 24), ctxOf());
  assert.equal(longer.status, 'accepted');
  assert.ok(longer.length.physical > plain + 8, `${longer.length.physical} vs ${plain}`);
  assert.ok(longer.parts[1].line.length >= 4, 'wound by a jog');
  const tooShort = compileBridge(recordFor(1, 3, plain - 80), ctxOf());
  assert.equal(tooShort.status, 'refused');
  assert.equal(tooShort.reason, 'ratio-unbuildable');
  const tooLong = compileBridge(recordFor(1, 3, plain * 3), ctxOf());   // the jogs reach about plain + 80 m at most
  assert.equal(tooLong.status, 'refused');
  assert.equal(tooLong.reason, 'ratio-unbuildable');
});

test('geometry-conflict: no flight fits, or what stands on the other floor blocks every passage', () => {
  const full = compileBridge(recordFor(1, 3, 100), ctxOf({ blockA: [{ x0: -5, x1: 35, z0: -5, z1: 35 }] }));
  assert.equal(full.status, 'refused');
  assert.equal(full.reason, 'geometry-conflict');
  assert.match(full.detail, /room A/);
  const wall = { x0: 40, x1: 60, z0: -1000, z1: 1000 };
  const blocked = compileBridge(recordFor(1, 3, probe(1).length.physical), ctxOf({ upper: { 1: [wall], '-1': [] } }));
  assert.equal(blocked.status, 'refused');
  assert.equal(blocked.reason, 'geometry-conflict');
  // the same wall on the other floor does not matter
  assert.equal(compileBridge(recordFor(1, 3, probe(1).length.physical), ctxOf({ upper: { 1: [], '-1': [wall] } })).status, 'accepted');
  assert.equal(compileBridge({ ...recordFor(1, 3, 100), floor: 0 }, ctxOf()).reason, 'geometry-conflict');
});

test('the compiler is deterministic and does not change its inputs', () => {
  const rec = recordFor(1, 3, probe(1).length.physical), ctx = ctxOf({ blockA: [{ x0: 10, x1: 14, z0: 10, z1: 14 }] });
  const before = JSON.stringify([rec, A, B]);
  const one = JSON.stringify(compileBridge(rec, ctx)), two = JSON.stringify(compileBridge(rec, ctx));
  assert.equal(one, two);
  assert.equal(JSON.stringify([rec, A, B]), before);
  assert.ok(ZONING.tolerance > 0);
});

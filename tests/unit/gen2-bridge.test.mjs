// S2 slice 2: the physical bridge compiler (js/gen2-bridge.js) on synthetic rooms. A refusal names its reason; a length is a walk, never made up
import test from 'node:test';
import assert from 'node:assert/strict';
import { flightWalk } from '../../js/gen2-routes.js';
import { FLIGHT_SLOPE, LANDING, flightH } from '../../js/gen2.js';
import { ZONING } from '../../js/gen2-zoning.js';
import { BRIDGE, flightRun, flightSlots, passageLines, passageRects, passageHitsFlight, compileBridge } from '../../js/gen2-bridge.js';

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

test('a measured physical ground budget overrides only the optional compiler target',()=>{
  const built=probe(-1),record=recordFor(-1,3,1000),before=structuredClone(record),diag={};
  const result=compileBridge(record,ctxOf(),diag,{groundLength:built.length.physical*3});
  assert.equal(result.status,'accepted');
  assert.equal(diag.target,built.length.physical);
  assert.deepEqual(record,before);
  assert.equal(compileBridge(record,ctxOf()).status,'refused');
  assert.throws(()=>compileBridge(record,ctxOf(),null,{groundLength:NaN}),RangeError);
});

test('optional path constraints reject stair and passage centerlines without changing defaults',()=>{
  const built=probe(-1),r=recordFor(-1,3,built.length.target),ctx=ctxOf();
  assert.deepEqual(compileBridge(r,ctx,null,{keepPath:()=>true}),compileBridge(r,ctx));
  assert.equal(compileBridge(r,ctx,null,{keepPath:()=>false}).status,'refused');
});

test('flightSlots finds the only half-metre lane with full entry and clearance', () => {
  const room = { x0: 0, x1: 15, z0: 0, z1: 4.5 };
  const blockers = [{ x0: -2, x1: 17, z0: -2, z1: -0.5 }, { x0: -2, x1: 17, z0: 5, z1: 7 }];
  const slots = flightSlots([room], blockers, 13, [100, 2], 0, 6);
  assert.ok(slots.length > 0, 'the clear lane at z=0.5 must be searched');
  for (const { flight } of slots) { assert.equal(flight.z0, 0.5); assert.equal(flight.z1, 4); }
});

test('compileBridge searches beyond the nearest blocked upper-floor slots', () => {
  const upper = [{ x0: 15, x1: 31, z0: -1, z1: 31 }];
  const ctx = ctxOf({ upper: { 1: upper, '-1': [] } });
  const built = [120, 160, 200].map((length) => compileBridge(recordFor(1, 3, length), ctx)).filter((r) => r.status === 'accepted');
  assert.ok(built.length > 0, 'clear stairs in the far half of A must remain candidates');
  for (const r of built) {
    assert.ok(r.parts[0].flight.x1 <= 15);
    assert.ok(r.length.physical >= r.length.window[0] && r.length.physical <= r.length.window[1]);
    for (const rect of r.parts[1].rects) assert.ok(!upper.some((b) => rect.x0 - 1 < b.x1 && b.x0 - 1 < rect.x1 && rect.z0 - 1 < b.z1 && b.z0 - 1 < rect.z1));
  }
});

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
    assert.equal(pa.flight.y1, Math.max(Y[0], Y[floor]));
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
  const tooLong = compileBridge(recordFor(1, 3, 10000), ctxOf());   // beyond every walk in two 30 m rooms with at most a 40 m jog
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

// review F1 (2026-10-28): a descriptor must be a flight js/gen2.js flightH and js/mesh2.js can read: up, lo, hi, y0 = Y[lo], y1 = Y[hi]
test('a flight slot is a stair of the game: flightH gives the hall floor at the entry end, the far floor at the exit end, half way on the landing', () => {
  for (const floor of [1, -1]) {
    const slots = flightSlots([A], [], flightRun(Y[floor]), anchors.B, Y[0], Y[floor], BRIDGE.entryDepth, BRIDGE.clear, { fallback: true });
    assert.ok(slots.length > 0);
    const dirs = new Set();
    for (const s of slots) {
      const f = s.flight, w = flightWalk(f), at = (p) => flightH(f, p[0], p[1]);
      assert.equal(f.lo, floor > 0 ? 0 : -1);
      assert.equal(f.hi, floor > 0 ? 1 : 0);
      assert.equal(f.y0, Y[f.lo]);
      assert.equal(f.y1, Y[f.hi]);
      assert.ok(f.up === 1 || f.up === -1);
      assert.ok(Math.abs(at(w.from) - Y[0]) < 1e-9, `floor ${floor}: entry end ${at(w.from)}`);
      assert.ok(Math.abs(at(w.exit) - Y[floor]) < 1e-9, `floor ${floor}: exit end ${at(w.exit)}`);
      const ax = f.axis === 'x', a0 = ax ? f.x0 : f.z0, a1 = ax ? f.x1 : f.z1, c = (a0 + a1) / 2, p = ax ? [c, (f.z0 + f.z1) / 2] : [(f.x0 + f.x1) / 2, c];
      assert.ok(Math.abs(at(p) - (Y[0] + Y[floor]) / 2) < 1e-9, 'landing at half height');
      dirs.add(f.up);
    }
    assert.equal(dirs.size, 2, `floor ${floor}: both directions are produced`);
  }
});

// review F2: the stairs are bodies on the upper floor too, and a passage is tested along its length, not at its corners only
test('a stair that meets a room, flight or void of the upper floor is not built, even when the passage is clear', () => {
  const plain = probe(1), [pa, , pb] = plain.parts, rec = recordFor(1, 3, plain.length.physical);
  for (const part of [pa, pb]) {
    const f = part.flight, ax = f.axis === 'x';
    // a blocker over the near-entry quarter of the stair, far from the passage
    const q = ax ? { x0: f.x0 + 0.5, x1: f.x0 + 3, z0: f.z0, z1: f.z1 } : { x0: f.x0, x1: f.x1, z0: f.z0 + 0.5, z1: f.z0 + 3 };
    const c = compileBridge(rec, ctxOf({ upper: { 1: [q], '-1': [] } }));
    if (c.status !== 'accepted') continue;
    for (const p of [c.parts[0], c.parts[2]]) assert.ok(!(p.flight.x0 < q.x1 && q.x0 < p.flight.x1 && p.flight.z0 < q.z1 && q.z0 < p.flight.z1), 'a built stair overlaps the blocker');
  }
  const covered = compileBridge(rec, ctxOf({ upper: { 1: [{ x0: pa.flight.x0 + 0.5, x1: pa.flight.x0 + 3, z0: pa.flight.z0, z1: pa.flight.z1 }, { x0: pa.flight.x0, x1: pa.flight.x1, z0: pa.flight.z0 + 0.5, z1: pa.flight.z0 + 3 }], '-1': [] } }));
  assert.ok(covered.status === 'refused' || JSON.stringify(covered.parts[0].flight) !== JSON.stringify(pa.flight), 'the same stair is not built on a blocked footprint');
});

test('passageHitsFlight: a segment through a stair is a hit even when no corner is inside; leaving from its exit face is not', () => {
  const f = { x0: 4, x1: 17, z0: -2, z1: 2 };
  assert.equal(passageHitsFlight([[0, 0], [30, 0]], [f]), true, 'through, corners outside');
  assert.equal(passageHitsFlight([[17, 0], [40, 0], [40, 20]], [f]), false, 'away from the exit face');
  assert.equal(passageHitsFlight([[17, 0], [17, 20], [40, 20]], [f]), true, 'along the exit face over the stair end');
  assert.equal(passageHitsFlight([[17, 0], [10, 0], [10, 20]], [f]), true, 'back over the stair');
  assert.equal(passageHitsFlight([[30, 10], [30, 30]], [f]), false);
});

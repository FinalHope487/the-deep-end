// Floor and terrain audit of v2 plans: union areas per floor, walkable areas, and a corpus report that does not depend on
// the order cells are planned in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measurePlan, measureWorld, formatReport } from '../../js/gen2-measure.js';
import { World2 } from '../../js/gen2.js';

const Y = { '-1': -7, 0: 0, 1: 8 };
const room = (id, lv, x0, x1, z0, z1, kind = 'hall') => ({ id, lv, x0, x1, z0, z1, ceil: 4, kind, lamps: [] });
const plan = (extra) => ({ i: 0, j: 0, ox: 0, oz: 0, rooms: [], pools: [], flights: [], voids: [], columns: [], windows: [], ladders: [], ...extra });

test('overlapping rooms of one floor count their union once', () => {
  const m = measurePlan(plan({ rooms: [room(0, 0, 10, 20, 10, 20), room(1, 0, 15, 25, 10, 20, 'corridor')] }), Y);
  assert.equal(m.levels[0].footprint, 150);
  assert.equal(m.levels[0].overlap, 50);
  assert.equal(m.levels[1].footprint, 0);
  assert.equal(m.levels[-1].footprint, 0);
});

test('a void takes its own area off the floor it opens', () => {
  const rooms = [room(0, 0, 10, 40, 10, 40), room(1, 1, 10, 30, 10, 30, 'upper')];
  const before = measurePlan(plan({ rooms }), Y);
  const after = measurePlan(plan({ rooms, voids: [{ kind: 'atrium', lv: 0, x0: 15, x1: 19, z0: 15, z1: 19, under: 0, over: 1 }] }), Y);
  assert.equal(before.levels[1].footprint - after.levels[1].footprint, 16);
  assert.equal(after.levels[0].footprint, before.levels[0].footprint, 'the floor under an atrium keeps its floor');
});

test('room kinds are tallied apart, and a sealed showcase is architecture but not walkable', () => {
  const m = measurePlan(plan({ rooms: [room(0, 0, 10, 30, 10, 30), room(1, 0, 30, 40, 18, 22, 'corridor'), room(2, 0, 10, 20, 31, 35, 'showcase')] }), Y);
  const L = m.levels[0];
  assert.deepEqual(L.kinds, { hall: 400, corridor: 40, showcase: 40 });
  assert.equal(L.footprint, 480);
  assert.equal(L.sealed, 40);
  assert.equal(L.walkable, 440);
  assert.deepEqual(m.roomCounts[0], { hall: 1, corridor: 1, showcase: 1 });
});

test('deep water and flights are architecture that is not walked; a stair is counted apart from the floors', () => {
  const pool = { shape: { type: 'rect', cx: 20, cz: 20, hw: 4, hd: 2 }, axis: 'x', flip: false, d0: 2.4, d1: 2.4, water: -0.6, room: 0, lv: 0 };
  const flight = { x0: 30, x1: 33.5, z0: 12, z1: 24, axis: 'z', up: 1, lo: 0, hi: 1, y0: 0, y1: 8 };
  const m = measurePlan(plan({ rooms: [room(0, 0, 10, 40, 10, 40)], pools: [pool], flights: [flight] }), Y);
  const L = m.levels[0];
  assert.equal(m.stairArea, 42);
  assert.equal(L.footprint, 900 - 42);
  assert.equal(L.pool, 32);
  assert.equal(L.deep, 32);
  assert.equal(L.walkable, 900 - 42 - 32);
  assert.deepEqual(m.pools, [{ lv: 0, shape: 'rect', deep: true, area: 32 }]);
  assert.deepEqual(m.stairs, [{ type: 'straight', to: 1 }]);
});

test('a pool over an occupied lower floor is reported as a stacking case', () => {
  const pool = { shape: { type: 'rect', cx: 20, cz: 20, hw: 2, hd: 2 }, axis: 'x', flip: false, d0: 0.5, d1: 0.5, water: 7.95, room: 1, lv: 1 };
  const m = measurePlan(plan({ rooms: [room(0, 0, 10, 40, 10, 40), room(1, 1, 15, 25, 15, 25, 'upper')], pools: [pool] }), Y);
  assert.equal(m.stacked.poolOverFloor[1], 16);
  assert.equal(m.stacked.poolOverFloor[0], 0);
  assert.equal(m.levels[1].deep, 0);
  assert.equal(m.levels[1].walkable, 100);
});

test('a 1F room cut off from the hall and every cell edge is counted as leading nowhere; one that reaches either is not', () => {
  const hall = room(0, 0, 10, 30, 10, 30);
  assert.equal(measurePlan(plan({ rooms: [hall, room(1, 0, 40, 45, 18, 22, 'corridor')] }), Y).orphans, 1);
  assert.equal(measurePlan(plan({ rooms: [hall, room(1, 0, 29, 45, 18, 22, 'corridor'), room(2, 0, 44, 48, 18, 40, 'corridor')] }), Y).orphans, 0, 'through the corridor to the hall');
  assert.equal(measurePlan(plan({ rooms: [hall, room(1, 0, 40, 64, 18, 22, 'corridor')] }), Y).orphans, 0, 'out through the cell edge');
  assert.equal(measurePlan(plan({ rooms: [hall, room(1, 0, 10, 20, 31, 35, 'showcase')] }), Y).orphans, 0, 'a sealed showcase is apart on purpose');
});

const CELLS = [];
for (let j = -2; j <= 1; j++) for (let i = -2; i <= 1; i++) CELLS.push([i, j]);
const SEEDS = [1, 7];
const exact = (r) => { const { cost, ...rest } = r; return rest; };

test('the corpus report is the same whatever order the cells are planned in', () => {
  const fwd = measureWorld({ seeds: SEEDS, cells: CELLS });
  const rev = measureWorld({ seeds: [...SEEDS].reverse(), cells: [...CELLS].reverse() });
  const mixed = measureWorld({ seeds: SEEDS, cells: CELLS.map((c, k) => [c, (k * 7) % CELLS.length]).sort((a, b) => a[1] - b[1]).map((e) => e[0]) });
  assert.deepEqual(exact(rev), exact(fwd));
  assert.deepEqual(exact(mixed), exact(fwd));
});

test('the corpus report exposes floor shares and walkable areas, all finite, without asking for 2:1:1', () => {
  const r = measureWorld({ seeds: SEEDS, cells: CELLS });
  assert.equal(r.sample.cells, SEEDS.length * CELLS.length);
  const sum = r.shares[-1] + r.shares[0] + r.shares[1];
  assert.ok(Math.abs(sum - 1) < 1e-9, `shares sum ${sum}`);
  for (const lv of [-1, 0, 1]) {
    const L = r.levels[lv];
    assert.ok(L.walkable <= L.footprint, `level ${lv}: walkable ${L.walkable} > footprint ${L.footprint}`);
    assert.ok(L.footprint > 0, `level ${lv} has some floor`);
  }
  assert.ok(r.districts.list.length > 0 && r.corridors.count > 0);
  const walk = (v, path) => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${path} = ${v}`);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(r, 'report');
  assert.ok(Array.isArray(r.unmeasured) && r.unmeasured.length > 0, 'what is not measured is said');
  assert.match(formatReport(r), /1F/);
});

test('a space across a cell edge: each cell measures its own part, and the space counts as one room', () => {
  const part = (x0, x1) => ({ ...room(0, 0, x0, x1, 16, 32), spaceId: 'S', span: 'giant' });
  const a = measurePlan(plan({ i: 0, ox: 0, rooms: [part(48, 64)] }), Y), b = measurePlan(plan({ i: 1, ox: 64, rooms: [part(64, 80)] }), Y);
  assert.equal(a.levels[0].footprint, 256);
  assert.equal(b.levels[0].footprint, 256);
  assert.deepEqual(a.levels[0].kinds, { 'giant-hall': 256 });
  assert.deepEqual(a.spaces, [{ spaceId: 'S', lv: 0, kind: 'giant-hall' }]);
  assert.deepEqual(a.roomCounts[0], {}, 'a part of a space is not a room of its own');
});

test('an L hall over three cells: its area is the sum of its parts, it counts once, the same in any order', () => {
  let found = null;
  for (const s of [1, 2, 3, 7, 42, 99]) {
    const w = new World2(s);
    for (let b = -3; b <= 2 && !found; b++) for (let a = -3; a <= 2 && !found; a++) {
      const sp = w.spaceOf(2 * a, 2 * b) ?? w.spaceOf(2 * a + 1, 2 * b + 1);
      if (sp?.shape === 'L') found = { s, a, b, sp };
    }
    if (found) break;
  }
  assert.ok(found, 'no L hall in the sample');
  const { s, a, b, sp } = found, cells = [[2 * a, 2 * b], [2 * a + 1, 2 * b], [2 * a, 2 * b + 1], [2 * a + 1, 2 * b + 1]];
  const r = measureWorld({ seeds: [s], cells }), back = measureWorld({ seeds: [s], cells: [...cells].reverse() });
  assert.equal(r.roomTypes[0]['L-hall'], 1);
  assert.equal(r.fragments['L-hall'], 3);
  assert.equal(r.roomKinds[0]['L-hall'], sp.parts.reduce((t, p) => t + (p.x1 - p.x0) * (p.z1 - p.z0), 0), 'the parts, before flights and voids take their share');
  assert.deepEqual(exact(back), exact(r));
});

test('a connector room across a cell edge: it counts once, its area is its two parts (less the corridor ends inside), the same in any order', () => {
  let found = null;
  for (const s of [1, 2, 3, 7, 42, 99]) {
    const w = new World2(s);
    for (let j = -3; j <= 2 && !found; j++) for (let i = -3; i <= 2 && !found; i++) for (const axis of ['x', 'z']) {
      const c = w.connectionOf(i, j, axis);
      // the only connector room of both its cells
      if (!found && c.mode === 'connector-room' && c.parts.every((p) => w.plan(p.i, p.j).rooms.filter((o) => o.kind === 'connector-room').length === 1)) found = { s, w, c };
    }
    if (found) break;
  }
  assert.ok(found, 'no connector room in the sample');
  const { s, w, c } = found, cells = c.parts.map((p) => [p.i, p.j]);
  const r = measureWorld({ seeds: [s], cells }), back = measureWorld({ seeds: [s], cells: [...cells].reverse() });
  assert.equal(r.roomTypes[0]['connector-room'], 1);
  assert.equal(r.fragments['connector-room'], 2);
  // the first room over a spot owns it: the corridor (planned before the room) owns its last metre inside the room
  const area = (a) => Math.max(0, a.x1 - a.x0) * Math.max(0, a.z1 - a.z0), cut = (a, b) => ({ x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), z0: Math.max(a.z0, b.z0), z1: Math.min(a.z1, b.z1) });
  const own = c.parts.reduce((t, p) => t + area(p) - w.plan(p.i, p.j).rooms.filter((o) => o.kind === 'corridor').reduce((u, o) => u + area(cut(o, p)), 0), 0);
  assert.equal(r.roomKinds[0]['connector-room'], own);
  assert.equal(r.connections.convertedEdges, 1);
  assert.deepEqual(exact(back), exact(r));
});

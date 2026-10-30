// S3 slice 2: the rectangular sub-rooms of a hall as rooms of a World2 cell plan (js/gen2-s3-rect.js, World2 option s3Rects, off by default).
// A: floor ownership (the hall keeps its rectangle less s3Cuts, each cut is a room of its own).
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2, cellRaster, CELL2, Q2 } from '../../js/gen2.js';
import { applyS3Rects, s3RoomContains } from '../../js/gen2-s3-rect.js';
import { planSubdivision, validateSubdivision } from '../../js/gen2-s3-plan.js';

const SEEDS = [42, 7, 99];
const CELLS = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [2, 1], [-2, -1], [1, 2]];
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const area = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const rectOf = (r) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });

// a synthetic cell plan with one or more plain 1F halls: enough for applyS3Rects, which reads only rooms and the lists protectedRectsFor reads
const cellPlan = (halls) => ({
  i: 5, j: 5, ox: 320, oz: 320, primaryHallId: 0, mega: null, pools: [], flights: [], voids: [], ladders: [], columns: [], windows: [],
  rooms: halls.map((h, id) => ({ id, kind: 'hall', lv: 0, ceil: 4.5, lamps: [], ...h })),
});
const BIG = { x0: 320, x1: 360, z0: 320, z1: 360 };
const world = (seed = 42) => new World2(seed, { s3Rects: true });
// a space id whose planned sub-rooms include a flat rectangle, so a test has a child to look at
const cuttable = (w, hall = BIG, skip = 0) => {
  for (let k = 0, found = 0; k < 400; k++) {
    const spaceId = `fixture:hall:${k}`, plan = applyS3Rects(w, cellPlan([{ ...hall, spaceId }]));
    if (plan.rooms.some((o) => o.kind === 's3-room') && found++ >= skip) return spaceId;
  }
  throw new Error('no cuttable fixture hall');
};

test('S3-2A: s3RoomContains is the rectangle less the footprints given away', () => {
  const hall = { x0: 0, x1: 30, z0: 0, z1: 30 }, cut = { x0: 5, x1: 11, z0: 8, z1: 16 };
  assert.equal(s3RoomContains(hall, 8, 12), true);
  assert.equal(s3RoomContains({ ...hall, s3Cuts: [cut] }, 8, 12), false);
  assert.equal(s3RoomContains({ ...hall, s3Cuts: [cut] }, 4.99, 12), true);
  assert.equal(s3RoomContains({ ...hall, s3Cuts: [cut] }, 11, 12), true, 'x1 is outside the cut, as in a room');
  assert.equal(s3RoomContains({ ...hall, s3Cuts: [cut] }, 5, 8), false, 'x0, z0 are inside it');
  assert.equal(s3RoomContains({ ...hall, s3Cuts: [cut] }, 30, 12), false, 'outside the hall');
  assert.equal(s3RoomContains({ ...cut }, 8, 12), true);
});

test('S3-2A: the option accepts a boolean only, and off is the default', () => {
  for (const bad of [1, 0, 'true', null, {}]) assert.throws(() => new World2(42, { s3Rects: bad }), TypeError, String(bad));
  assert.equal(new World2(42).s3Rects, false);
  assert.equal(new World2(42, { s3Rects: true }).s3Rects, true);
});

test('S3-2A: with the option off, plans and the spawn are exactly what they were', () => {
  for (const seed of SEEDS) {
    const a = new World2(seed), b = new World2(seed, { s3Rects: false });
    assert.deepEqual(b.spawn, a.spawn);
    for (const [i, j] of CELLS) {
      const p = a.plan(i, j);
      assert.deepEqual(b.plan(i, j), p);
      assert.ok(!('s3Rejected' in p) && p.rooms.every((o) => o.kind !== 's3-room' && !o.s3Cuts), `${seed} ${i},${j}`);
    }
  }
});

test('S3-2A: the start cell is not skipped, and its spawn stays where it was', () => {
  let cut = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const on = new World2(seed, { s3Rects: true }), off = new World2(seed);
    assert.deepEqual(on.spawn, off.spawn, `seed ${seed}`);
    if (on.plan(0, 0).rooms.some((o) => o.kind === 's3-room')) cut++;
  }
  assert.ok(cut > 0, 'cell 0,0 has sub-rooms for some seed');
});

test('S3-2A: the hall gives away exactly the floor a child takes, and no point is owned twice or not at all', () => {
  const w = world(), spaceId = cuttable(w), before = cellPlan([{ ...BIG, spaceId }]), snapshot = JSON.stringify(before);
  const plan = applyS3Rects(w, before), hall = plan.rooms[0], kids = plan.rooms.filter((o) => o.kind === 's3-room');
  assert.equal(JSON.stringify(before), snapshot, 'the input plan is not touched');
  assert.ok(kids.length >= 1 && hall.s3Cuts.length === kids.length);
  assert.deepEqual(hall.s3Cuts, kids.map(rectOf));
  assert.equal(hall.s3Cuts.reduce((t, c) => t + area(c), 0), kids.reduce((t, k) => t + area(k), 0));
  for (const k of kids) {
    assert.equal(k.lv, 0); assert.equal(k.ceil, hall.ceil); assert.equal(k.elevation, undefined);
    assert.equal(k.parentSpaceId, spaceId); assert.equal(k.parentId, hall.id);
    assert.equal(k.s3Portal.type, 'door'); assert.deepEqual(k.lamps, []);
  }
  assert.equal(new Set(plan.rooms.map((o) => o.id)).size, plan.rooms.length, 'ids are unique');
  for (let x = BIG.x0 + Q2 / 2; x < BIG.x1; x += Q2) for (let z = BIG.z0 + Q2 / 2; z < BIG.z1; z += Q2) {
    const owners = plan.rooms.filter((o) => s3RoomContains(o, x, z));
    assert.equal(owners.length, 1, `${x},${z}`);
  }
});

test('S3-2A: World2 plans, queries and the raster agree on who owns a cell', () => {
  let cutHalls = 0;
  for (const seed of SEEDS) {
    const w = world(seed);
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j), R = cellRaster(w, i, j, 0, undefined);
      for (const hall of plan.rooms.filter((o) => o.s3Cuts)) {
        cutHalls++;
        for (const c of hall.s3Cuts) {
          const kid = plan.rooms.find((o) => o.kind === 's3-room' && o.x0 === c.x0 && o.z0 === c.z0);
          assert.ok(kid, `child of ${JSON.stringify(c)}`);
          const x = (c.x0 + c.x1) / 2, z = (c.z0 + c.z1) / 2, k = Math.floor((z - plan.oz) / Q2) * R.n + Math.floor((x - plan.ox) / Q2);
          assert.equal(R.inside[k], 1); assert.equal(R.room[k], kid.id, 'the raster hands the cell to the child');
          assert.equal(w.roomAt(0, x, z, undefined).id, kid.id);
          assert.equal(w.candidates(x, z).filter((q) => q.h === 0).length, 1, 'one floor at the hall height (a basement may lie below)');
          const gate = w.surfaceAt(x, z, 0);
          assert.equal(gate.h, 0);
        }
      }
      // every Q2 cell the S3-off world floors is still floored, by exactly one room
      const off = new World2(seed).plan(i, j), Roff = cellRaster(new World2(seed), i, j, 0, undefined);
      assert.deepEqual(Array.from(R.inside), Array.from(Roff.inside), `${seed} ${i},${j}: the floor outline does not move`);
      assert.deepEqual(Array.from(R.ceil), Array.from(Roff.ceil), `${seed} ${i},${j}: nor the ceilings`);
      assert.equal(off.rooms.length <= plan.rooms.length, true);
    }
  }
  assert.ok(cutHalls >= 3, `halls cut in the sample: ${cutHalls}`);
});

test('S3-2A: a hall whose planning fails keeps its floor, the others are still cut, and nothing is thrown', () => {
  const w = world(), HA = { x0: 320, x1: 350, z0: 320, z1: 350 }, HB = { x0: 352, x1: 384, z0: 352, z1: 384 }, A = { ...HA, spaceId: 'fixture:broken' }, B = { ...HB, spaceId: cuttable(w, HB) };
  const fixture = () => cellPlan([A, B]), baseline = JSON.stringify(fixture());
  const failing = (input) => { if (input.spaceId === 'fixture:broken') throw new Error('injected S3 failure'); return planSubdivision(input); };
  let plan;
  assert.doesNotThrow(() => { plan = applyS3Rects(w, fixture(), { planner: failing }); });
  assert.equal(plan.s3Rejected, 1);
  assert.equal(plan.rooms[0].s3Cuts, undefined);
  assert.ok(plan.rooms[1].s3Cuts.length >= 1, 'the other hall is cut');
  assert.ok(plan.rooms.every((o) => o.kind !== 's3-room' || o.parentId === 1), 'no child of the broken hall');
  const rejecting = applyS3Rects(w, fixture(), { validator: () => ['injected'] });
  assert.equal(rejecting.s3Rejected, 2); assert.ok(rejecting.rooms.every((o) => o.kind !== 's3-room' && !o.s3Cuts));
  const malformed = applyS3Rects(w, fixture(), { planner: (input) => { const p = planSubdivision(input); return { ...p, subrooms: p.subrooms.map((s) => (s.portals ? { ...s, portals: [{ type: 'door' }] } : s)) }; }, validator: () => [] });
  assert.ok(malformed.rooms.every((o) => !o.s3Cuts || o.s3Cuts.length === malformed.rooms.filter((q) => q.kind === 's3-room' && q.parentId === o.id).length), 'cuts and children come as pairs');
  assert.equal(JSON.stringify(fixture()), baseline);
});

test('S3-2A: a cell plan is the same whatever was planned before it, and after a cache clear', () => {
  const a = world(), b = world();
  const forward = CELLS.map(([i, j]) => a.plan(i, j));
  const backward = [...CELLS].reverse().map(([i, j]) => b.plan(i, j)).reverse();
  assert.deepEqual(forward, backward);
  b.plans.clear();
  assert.deepEqual(CELLS.map(([i, j]) => b.plan(i, j)), forward, 'a plan that fell out of the cache comes back the same');
  const neg = world(7);
  assert.deepEqual(neg.plan(-1, -1), world(7).plan(-1, -1));
});

test('S3-2A: S2 reservations, a neighbouring hall, and a seam stay clear of every child', () => {
  const w = world(), probe = (extra, hall = BIG, count = 80) => {
    const kids = [];
    for (let k = 0; k < count; k++) {
      const plan = applyS3Rects(w, cellPlan([{ ...hall, spaceId: `fixture:p:${k}` }, ...(extra.rooms ?? [])]), { reservations: extra.reservations ?? [] });
      kids.push(...plan.rooms.filter((o) => o.kind === 's3-room'));
    }
    return kids;
  };
  const free = probe({}), taken = { x0: 330, x1: 350, z0: 330, z1: 350 };
  assert.ok(free.some((k) => hit(k, taken)), 'without a reservation some child sits there');
  assert.ok(probe({ reservations: [taken] }).every((k) => !hit(k, taken)), 'a reservation keeps it clear');
  const next = { x0: 360, x1: 400, z0: 330, z1: 350, kind: 'hall', spaceId: 'fixture:next' }, strip = { x0: 357, x1: 360, z0: 330, z1: 350 };
  assert.ok(free.some((k) => hit(k, strip)), 'without the neighbour some child sits in the strip');
  assert.ok(probe({ rooms: [next] }).every((k) => !hit(k, strip)), 'a hall that shares the wall keeps a strip open');
  const seamed = (s) => ({ ...BIG, seams: s });
  const seam = { x0: 354, x1: 360, z0: 335, z1: 345 };
  assert.ok(probe({}, seamed({ px: { lo: 335, hi: 345 } })).every((k) => !hit(k, seam)), 'a seam keeps 6 m open');
});

test('S3-2A: only flat rectangles with one door become rooms; round and stepped rooms stay in the plan data', () => {
  const w = world();
  let planned = 0, made = 0, others = 0;
  for (let k = 0; k < 120; k++) {
    const spaceId = `fixture:mix:${k}`, hall = { ...BIG, spaceId }, sub = planSubdivision({ seed: w.seed, spaceId, parent: { ...BIG, lv: 0, ceil: 4.5, floorY: 0 }, protect: [], special: false });
    const plan = applyS3Rects(w, cellPlan([hall])), kids = plan.rooms.filter((o) => o.kind === 's3-room');
    if (validateSubdivision(sub, { parent: { ...BIG, lv: 0, ceil: 4.5, floorY: 0 }, protect: [] }).length) continue;
    const flat = sub.subrooms.filter((s) => s.shape.type === 'rect-union' && s.elevation === undefined);
    planned += flat.length; made += kids.length; others += sub.subrooms.length - flat.length;
    assert.ok(kids.every((o) => o.elevation === undefined && o.ceil === 4.5));
  }
  assert.ok(made > 0 && others > 0, `made ${made}, left in the data ${others}`);
  assert.equal(made, planned, 'every flat rectangle the planner kept became a room (the sample has no protected cells)');
});

test('S3-2A: special halls are never cut', () => {
  const w = world();
  for (const special of [{ span: 'L' }, { span: 'giant' }, { x0: 300, x1: 360, z0: 320, z1: 360 }]) {
    for (let k = 0; k < 60; k++) {
      const plan = applyS3Rects(w, cellPlan([{ ...BIG, ...special, spaceId: `fixture:sp:${k}` }]));
      assert.ok(plan.rooms.every((o) => !o.s3Cuts && o.kind !== 's3-room'), JSON.stringify(special));
    }
  }
  assert.ok(CELL2 === 64);
});

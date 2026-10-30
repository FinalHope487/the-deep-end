// S3 slice 2: the rectangular sub-rooms of a hall as rooms of a World2 cell plan (js/gen2-s3-rect.js, World2 option s3Rects, off by default).
// A: floor ownership (the hall keeps its rectangle less s3Cuts, each cut is a room of its own).
// B: inner walls (solid boxes with a doorway and a lintel) stop a real Player, also over cell borders and in a long step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2, cellRaster, CELL2, Q2, BODY_H2, BODY_R2 } from '../../js/gen2.js';
import { applyS3Rects, s3RoomContains, s3WallPieces, s3SolidAt, s3SweptWallHit, S3_DOOR_H } from '../../js/gen2-s3-rect.js';
import { Player } from '../../js/player.js';
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

// ---- B: inner walls ------------------------------------------------------------------------------------------------------------------------------
const T = 0.5;
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1 && a.y0 < b.y1 && b.y0 < a.y1;
const FIX = { x0: 5, x1: 11, z0: 8, z1: 16 }, PARENT = { x0: 0, x1: 30, z0: 0, z1: 30 };
const doorX0 = { type: 'door', side: 'x0', rect: { x0: 5, x1: 5.5, z0: 11, z1: 13 }, approach: { x0: 3, x1: 5, z0: 11, z1: 13 } };
const mid = (a, b) => (a + b) / 2;

// steer a Player at a point with the real update; false when it stops short
function walk(world, p, tx, tz, { dt = 1 / 60, run = false, max = 3000 } = {}) {
  for (let n = 0; n < max; n++) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.15) return true;
    p.yaw = Math.atan2(-dx, -dz);
    p.update(world, Math.min(dt, d / (run ? 6 : 3.3)), { x: 0, z: 1, run });
  }
  return false;
}

// a world whose cell 5,5 holds the fixture plan, and the children that match `pick`
const withKids = (pick, count = 1) => {
  const w = world(), found = [];
  for (let k = 0; k < 600 && found.length < count; k++) {
    const plan = applyS3Rects(w, cellPlan([{ ...BIG, spaceId: `fixture:wall:${k}` }]));
    for (const kid of plan.rooms.filter((o) => o.kind === 's3-room' && pick(o))) { found.push({ plan, kid }); break; }
  }
  if (found.length < count) throw new Error('no child');
  return found.map(({ plan, kid }) => { const wd = world(); wd.plans.set('5,5', plan); return { w: wd, plan, kid }; });
};
// a side of the child that is neither the door's nor on the hall's own wall
const closedSides = (kid) => ['x0', 'x1', 'z0', 'z1'].filter((s) => s !== kid.s3Portal.side && Math.abs(kid[s] - BIG[s]) > 1);

test('S3-2B: a doorway is open under 2.2 m and shut above it, with a wall on both sides and sealed corners', () => {
  const walls = s3WallPieces(FIX, doorX0, 0, 4.5, PARENT);
  assert.equal(S3_DOOR_H, 2.2);
  assert.equal(s3SolidAt(walls, 5.25, 10, 0, BODY_H2), true, 'wall before the door');
  assert.equal(s3SolidAt(walls, 5.25, 14, 0, BODY_H2), true, 'wall after it');
  assert.equal(s3SolidAt(walls, 5.25, 12, 0, BODY_H2), false, 'the doorway is open to a standing body');
  assert.equal(s3SolidAt(walls, 5.25, 12, 0.5, BODY_H2), true, 'a body on a 0.5 m higher floor meets the lintel (0.5 + 1.8 > 2.2)');
  assert.equal(s3SolidAt(walls, 5.25, 12, 0.4, BODY_H2), false, 'and clears it at 0.4 (0.4 + 1.8 = 2.2)');
  assert.equal(s3SolidAt(walls, 8, 12, 0, BODY_H2), false, 'inside the room is floor');
  assert.equal(s3SolidAt(walls, 4, 12, 0, BODY_H2), false, 'the approach is floor');
  for (const [x, z] of [[5.1, 8.1], [10.9, 8.1], [5.1, 15.9], [10.9, 15.9]]) assert.equal(s3SolidAt(walls, x, z, 0, BODY_H2), true, `corner ${x},${z}`);
  const lintel = walls.filter((w) => w.lintel);
  assert.equal(lintel.length, 1); assert.equal(lintel[0].y0, 2.2); assert.equal(lintel[0].y1, 4.5);
  assert.deepEqual([lintel[0].z0, lintel[0].z1], [11, 13]);
  for (let a = 0; a < walls.length; a++) for (let b = a + 1; b < walls.length; b++) assert.equal(overlap(walls[a], walls[b]), false, `${a} and ${b} overlap`);
  const ring = walls.filter((w) => !w.lintel).reduce((t, w) => t + (w.x1 - w.x0) * (w.z1 - w.z0), 0);
  assert.equal(ring, 6 * 8 - 5 * 7 - 2 * T, 'the ring of the footprint less its interior, less the door gap (2 m x 0.5)');
});

test('S3-2B: a side on the hall wall gets no second wall, and the sides that meet it run up to it', () => {
  const R = { x0: 0, x1: 6, z0: 8, z1: 16 }, door = { type: 'door', side: 'x1', rect: { x0: 5.5, x1: 6, z0: 11, z1: 13 }, approach: { x0: 6, x1: 8, z0: 11, z1: 13 } };
  const walls = s3WallPieces(R, door, 0, 4, PARENT);
  assert.ok(!walls.some((w) => w.side === 'x0'), 'no wall on the hall wall');
  assert.equal(walls.find((w) => w.side === 'z0').x0, 0, 'the z0 wall starts at the hall wall');
  assert.equal(s3SolidAt(walls, 0.1, 8.1, 0, BODY_H2), true, 'no 0.5 m gap in the corner');
});

test('S3-2B: each doorway orientation is walked through, in and out, by a real Player', () => {
  const doors = {}, kidsOf = {};
  const w0 = world();
  for (let k = 0; k < 800 && Object.keys(doors).length < 4; k++) {
    const plan = applyS3Rects(w0, cellPlan([{ ...BIG, spaceId: `fixture:walk:${k}` }]));
    for (const kid of plan.rooms.filter((o) => o.kind === 's3-room')) doors[kid.s3Portal.side] ??= { plan, kid };
  }
  assert.deepEqual(Object.keys(doors).sort(), ['x0', 'x1', 'z0', 'z1']);
  for (const [side, { plan, kid }] of Object.entries(doors)) {
    const w = world(); w.plans.set('5,5', plan);
    const d = kid.s3Portal.rect, A = kid.s3Portal.approach, inward = { x0: [1, 0], x1: [-1, 0], z0: [0, 1], z1: [0, -1] }[side];
    const door = [mid(d.x0, d.x1), mid(d.z0, d.z1)], front = [mid(A.x0, A.x1), mid(A.z0, A.z1)];
    const path = [front, door, [door[0] + inward[0] * 1.5, door[1] + inward[1] * 1.5], [mid(kid.x0, kid.x1), mid(kid.z0, kid.z1)]], p = new Player();
    p.reset(front[0], front[1], 0, 0);
    for (const [x, z] of path.slice(1)) assert.equal(walk(w, p, x, z), true, `${side}: in to ${x},${z}, stopped at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    for (const [x, z] of [...path].reverse().slice(1)) assert.equal(walk(w, p, x, z), true, `${side}: out to ${x},${z}, stopped at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    kidsOf[side] = kid;
  }
});

test('S3-2B: a Player walking or running at a closed wall of a child stays inside it', () => {
  let sides = 0;
  for (const { w, kid } of withKids((o) => closedSides(o).length >= 2, 4)) {
    const c = [mid(kid.x0, kid.x1), mid(kid.z0, kid.z1)];
    for (const side of closedSides(kid)) {
      const n = { x0: [-1, 0], x1: [1, 0], z0: [0, -1], z1: [0, 1] }[side], beyond = [c[0] + n[0] * (kid.x1 - kid.x0) / 2 + n[0] * 3, c[1] + n[1] * (kid.z1 - kid.z0) / 2 + n[1] * 3];
      for (const run of [false, true]) {
        const p = new Player(); p.reset(c[0], c[1], 0, 0);
        walk(w, p, side[0] === 'x' ? beyond[0] : c[0], side[0] === 'z' ? beyond[1] : c[1], { run, max: 700 });
        const held = { x1: p.x <= kid.x1 - T, x0: p.x >= kid.x0 + T, z1: p.z <= kid.z1 - T, z0: p.z >= kid.z0 + T }[side];
        assert.ok(held, `${side} run=${run}: stopped at ${p.x.toFixed(2)},${p.z.toFixed(2)} in ${JSON.stringify(rectOf(kid))}`);
      }
      sides++;
    }
  }
  assert.ok(sides >= 8, `sides tried ${sides}`);
});

test('S3-2B: a step longer than the wall is thick does not jump it', () => {
  const [{ w, kid }] = withKids((o) => closedSides(o).some((s) => s[0] === 'x'));
  const side = closedSides(kid).find((s) => s[0] === 'x'), sign = side === 'x1' ? 1 : -1, face = side === 'x1' ? kid.x1 - T : kid.x0 + T, z = mid(kid.z0, kid.z1);
  const p = new Player(); p.reset(face - sign * 0.6, z, 0, 0);
  p.yaw = sign > 0 ? -Math.PI / 2 : Math.PI / 2;   // forward is +x at yaw -pi/2
  p.update(w, 0.5, { x: 0, z: 1, run: true });      // 3 m in one step, past the wall's 0.5 m
  assert.ok(sign > 0 ? p.x < kid.x1 - T : p.x > kid.x0 + T, `landed at ${p.x.toFixed(2)}`);
  assert.equal(w.railHit(face + sign * 2.4, z, BODY_R2, 0, face - sign * 0.6, z), true);
});

test('S3-2B: the swept test looks in every cell the move touches, over a border and in negative cells', () => {
  const w = world(), wall = (x0, x1, z0, z1) => ({ x0, x1, z0, z1, y0: 0, y1: 4.5, side: 'x1', lintel: false, parentId: 0, childId: 1 });
  w.plan(0, 0).s3Walls.push(wall(63.2, 63.7, 8, 12));                  // in cell 0,0, 0.3 m from its +x border
  assert.equal(w.railHit(65, 10, BODY_R2, 0, 63, 10), true, 'starts in 0,0, ends in 1,0');
  assert.equal(w.railHit(63, 10, BODY_R2, 0, 65, 10), true, 'starts in 1,0, ends in 0,0');
  assert.equal(w.railHit(65, 30, BODY_R2, 0, 63, 30), false, 'beside the wall');
  assert.equal(w.railHit(65, 10, BODY_R2, w.Y[1], 63, 10), false, 'a body on 2F is above it');
  assert.equal(w.railHit(65, 10, BODY_R2, w.Y[-1], 63, 10), false, 'and one on B1 below');
  w.plan(-1, 0).s3Walls.push(wall(-0.7, -0.2, 3, 7));                  // in cell -1,0
  assert.equal(w.railHit(0.4, 5, BODY_R2, 0, -1.2, 5), true, 'across x = 0, from the positive side');
  assert.equal(w.railHit(-1.2, 5, BODY_R2, 0, 0.4, 5), true, 'and from the negative side');
  w.plan(0, -1).s3Walls.push(wall(4, 8, -0.7, -0.2));                  // in cell 0,-1
  assert.equal(w.railHit(6, 0.4, BODY_R2, 0, 6, -1.2), true, 'across z = 0');
  assert.equal(new World2(42).railHit(65, 10, BODY_R2, 0, 63, 10), false, 'with the option off it never hits');
  assert.equal(s3SweptWallHit([wall(10, 10.5, 0, 4)], 9.6, 2, 9.6, 3, BODY_R2, 0, BODY_H2), false, 'a body that only touches the face slides along it');
});

test('S3-2B: plans list walls that stay in their hall, off the doorways and approaches, and off each other', () => {
  let walls = 0, kids = 0;
  for (const seed of SEEDS) {
    const w = world(seed);
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j), list = plan.s3Walls;
      assert.ok(Array.isArray(list));
      for (const k of plan.rooms.filter((o) => o.kind === 's3-room')) {
        kids++;
        const hall = plan.rooms.find((o) => o.id === k.parentId), mine = list.filter((q) => q.childId === k.id), d = k.s3Portal.rect, A = k.s3Portal.approach;
        assert.ok(mine.length >= 4 && mine.some((q) => q.lintel), `${seed} ${i},${j}: pieces of child ${k.id}`);
        for (const q of mine) {
          walls++;
          assert.ok(q.x0 >= k.x0 && q.x1 <= k.x1 && q.z0 >= k.z0 && q.z1 <= k.z1, 'inside the child footprint');
          assert.equal(q.parentId, hall.id); assert.equal(q.y1, w.Y[0] + hall.ceil);
        }
        assert.equal(s3SolidAt(list, mid(d.x0, d.x1), mid(d.z0, d.z1), w.Y[0], BODY_H2), false, 'the doorway is open');
        assert.ok(!list.some((q) => q.x0 < A.x1 && A.x0 < q.x1 && q.z0 < A.z1 && A.z0 < q.z1), 'no wall on the approach');
      }
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) assert.equal(overlap(list[a], list[b]), false);
      if (!plan.rooms.some((o) => o.kind === 's3-room')) assert.deepEqual(list, []);
    }
  }
  assert.ok(kids >= 3 && walls >= 12, `kids ${kids}, walls ${walls}`);
});

test('S3-2B: blockedAt refuses a point inside a wall at the body height, and not in the doorway, on 2F or on B1', () => {
  const [{ w, kid }] = withKids(() => true), d = kid.s3Portal.rect, wall = w.plan(5, 5).s3Walls.find((q) => !q.lintel && q.childId === kid.id);
  const inWall = [mid(wall.x0, wall.x1), mid(wall.z0, wall.z1)];
  assert.equal(w.blockedAt(...inWall, 0), true, 'inside a wall');
  assert.equal(w.blockedAt(mid(d.x0, d.x1), mid(d.z0, d.z1), 0), false, 'the doorway is open');
  assert.equal(w.blockedAt(mid(kid.x0, kid.x1), mid(kid.z0, kid.z1), 0), false, 'and the room is floor');
  assert.equal(new World2(42).blockedAt(...inWall, 0), true, 'with the option off the point is outside every room, so blocked as before');
  const off = new World2(42), on = world(), cells = CELLS.map(([i, j]) => [i * CELL2 + 31.3, j * CELL2 + 17.7]);
  for (const [x, z] of cells) assert.equal(on.blockedAt(x, z, 0), off.blockedAt(x, z, 0) || on.plan(Math.floor(x / CELL2), Math.floor(z / CELL2)).s3Walls.some((q) => x >= q.x0 && x < q.x1 && z >= q.z0 && z < q.z1), `${x},${z}`);
});

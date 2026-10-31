// Inner layer: the round-pool hall (Poolcore phase A, docs/decisions/2026-10-31-poolcore-water-rooms.md): ordinary pools lose the random
// ellipse, and every default v2 world holds at least one big rectangular hall with a true circle pool at its exact middle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2, CELL2, shapeContains, shapeOutline, ROUND_POOL_R, ROUND_RING, ROUND_HALL_MIN, ROUND_CELLS } from '../../js/gen2.js';

const SEEDS = Array.from({ length: 256 }, (_, k) => k + 1);
const hallOf = (plan) => plan.rooms.find((o) => o.id === plan.primaryHallId);
const roundPool = (plan) => plan.pools.filter((p) => p.landmark);
const reserveOf = (lm) => { const m = ROUND_POOL_R + ROUND_RING; return { x0: lm.cx - m, x1: lm.cx + m, z0: lm.cz - m, z1: lm.cz + m }; };
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

test('ordinary pools are never ellipses; rect, rrect, blob and L all still appear', () => {
  const kinds = new Set();
  for (const s of [1, 2, 3, 7, 42, 99]) for (const clusterShare of [0, 0.5]) {
    const w = new World2(s, { clusterShare });
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) for (const p of w.plan(i, j).pools) {
      if (p.landmark) continue;
      kinds.add(p.shape.type);
      assert.notEqual(p.shape.type, 'ellipse', `seed ${s} cell ${i},${j}`);
      if (p.shape.type === 'rrect') assert.ok(!(p.shape.hw === p.shape.hd && p.shape.r >= p.shape.hw), 'rrect is a full circle');
    }
  }
  for (const t of ['rect', 'rrect', 'blob', 'L']) assert.ok(kinds.has(t), `no ${t} pool`);
});

test('every default world has a finished round-pool hall in the 16 candidate cells', () => {
  let natural = 0;
  for (const seed of SEEDS) {
    const w = new World2(seed), lm = w.roundHall();
    assert.ok(lm, `seed ${seed}: no round-pool hall`);
    assert.ok(ROUND_CELLS.some(([i, j]) => i === lm.i && j === lm.j), `seed ${seed}: cell ${lm.i},${lm.j} out of range`);
    if (!lm.fallback) natural++;
    const plan = w.plan(lm.i, lm.j), hall = hallOf(plan), pools = roundPool(plan);
    assert.equal(pools.length, 1, `seed ${seed}: ${pools.length} round pools`);
    const p = pools[0], s = p.shape;
    assert.equal(s.type, 'ellipse');
    assert.equal(s.hw, ROUND_POOL_R); assert.equal(s.hd, ROUND_POOL_R);
    assert.equal(s.cx, (hall.x0 + hall.x1) / 2, 'pool not at the hall middle (x)');
    assert.equal(s.cz, (hall.z0 + hall.z1) / 2, 'pool not at the hall middle (z)');
    assert.deepEqual([lm.cx, lm.cz], [s.cx, s.cz]);
    assert.ok(hall.x1 - hall.x0 >= ROUND_HALL_MIN && hall.z1 - hall.z0 >= ROUND_HALL_MIN, 'hall under the minimum');
    assert.equal(p.room, hall.id); assert.equal(p.lv, 0);
    assert.equal(plan.pools.filter((q) => q.room === hall.id).length, 1, 'another pool in the round-pool hall');
    // the hall is a plain own rectangle: not a shared hall, no cell border crossed
    assert.ok(!hall.span && hall.x0 >= plan.ox && hall.x1 <= plan.ox + CELL2 && hall.z0 >= plan.oz && hall.z1 <= plan.oz + CELL2);
  }
  assert.ok(natural >= 180, `only ${natural} of ${SEEDS.length} seeds find a natural hall`);
});

test('the pool and a 3 m ring round it are free of every other feature, and the ring is walkable floor', () => {
  for (const seed of SEEDS.slice(0, 96)) {
    const w = new World2(seed), lm = w.roundHall(), plan = w.plan(lm.i, lm.j), box = reserveOf(lm);
    for (const f of plan.flights) assert.ok(!hit(box, f) && !hit(box, f.hallEntry), `seed ${seed}: flight in the reserve`);
    for (const v of plan.voids) assert.ok(!hit(box, v), `seed ${seed}: void in the reserve`);
    for (const wn of plan.windows) assert.ok(!hit(box, wn.front), `seed ${seed}: window front in the reserve`);
    for (const l of plan.ladders) assert.ok(!(l.x > box.x0 - 1 && l.x < box.x1 + 1 && l.z > box.z0 - 1 && l.z < box.z1 + 1), `seed ${seed}: ladder in the reserve`);
    for (const c of plan.columns) if (c.lv === 0) assert.ok(!hit(box, { x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r }), `seed ${seed}: column in the reserve`);
    for (const o of plan.rooms) if (o.lv === 0 && o.id !== plan.primaryHallId) assert.ok(!hit(box, o), `seed ${seed}: ${o.kind} in the reserve`);
    // the ring: every sample from 0.5 m past the pool rim to 0.5 m short of the reserve edge is one clear floor
    for (let ring = ROUND_POOL_R + 0.5; ring <= ROUND_POOL_R + ROUND_RING - 0.5; ring += 0.5) {
      const n = Math.ceil((2 * Math.PI * ring) / 0.5);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 2 * Math.PI, x = lm.cx + Math.cos(a) * ring, z = lm.cz + Math.sin(a) * ring;
        assert.equal(shapeContains(plan.pools.find((p) => p.landmark).shape, x, z), false);
        assert.equal(w.candidates(x, z).filter((c) => !c.wall && Math.abs(c.h - w.Y[0]) < 1).length, 1, `seed ${seed}: ring at ${x},${z}`);   // a room over or under the hall adds its own floor
        assert.ok(!w.blockedAt(x, z, w.Y[0]));
      }
    }
    // the drawn rim is a closed curve of short pieces
    const poly = shapeOutline(plan.pools.find((p) => p.landmark).shape);
    assert.ok(poly.length >= 24);
  }
});

test('the guarantee holds when no natural hall qualifies: the fixed hall at cell (2,0), district (1,0) legacy', () => {
  for (const seed of [1, 2, 3, 7, 42, 99, 123, 200]) for (const clusterShare of [0, 1]) {
    const w = new World2(seed, { clusterShare, roundHallMin: 1000 }), lm = w.roundHall();
    assert.deepEqual([lm.i, lm.j, lm.fallback], [2, 0, true]);
    assert.equal(w.districtPlan(1, 0), null, 'the fallback district stays legacy');
    assert.equal(w.spaceOf(2, 0), null, 'the fallback cell holds no shared hall');
    assert.equal(w.megaOf(2, 0), null); assert.equal(w.lOf(1, 0), null);
    const plan = w.plan(2, 0), hall = hallOf(plan), p = roundPool(plan);
    assert.deepEqual([hall.x0, hall.x1, hall.z0, hall.z1], [144, 176, 16, 48]);
    assert.equal(p.length, 1);
    assert.deepEqual([p[0].shape.cx, p[0].shape.cz, p[0].shape.hw, p[0].shape.hd], [160, 32, ROUND_POOL_R, ROUND_POOL_R]);
    assert.deepEqual([w.hallOf(2, 0).x0, w.hallOf(2, 0).x1], [144, 176]);
    const box = reserveOf(lm);
    for (const f of plan.flights) assert.ok(!hit(box, f) && !hit(box, f.hallEntry));
    for (const c of plan.columns) if (c.lv === 0) assert.ok(!hit(box, { x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r }));
  }
});

test('the choice does not depend on the order cells are asked for, nor on a cleared cache', () => {
  for (const seed of [4, 5, 6, 77]) {
    const a = new World2(seed), lm = a.roundHall();
    const b = new World2(seed);
    for (const [i, j] of [[lm.i + 1, lm.j], [lm.i, lm.j + 1], [-3, 2], [lm.i, lm.j], [0, 0]]) b.plan(i, j);
    assert.deepEqual(b.roundHall(), lm);
    assert.equal(JSON.stringify(b.plan(lm.i, lm.j)), JSON.stringify(a.plan(lm.i, lm.j)));
    a.plans.clear(); a.districts.clear();
    assert.equal(JSON.stringify(a.plan(lm.i, lm.j)), JSON.stringify(b.plan(lm.i, lm.j)));
    assert.deepEqual(a.roundHall(), lm);
  }
});

test('S3 never cuts the round-pool hall and an S2 reservation never removes its pool', () => {
  for (const seed of [1, 2, 3, 7, 42, 99]) {
    const lm = new World2(seed).roundHall(), box = reserveOf(lm);
    const w3 = new World2(seed, { s3Rects: true }), plan3 = w3.plan(lm.i, lm.j);
    assert.ok(!plan3.rooms.some((o) => o.kind === 's3-room'), 'S3 cut the round-pool hall');
    assert.equal(roundPool(plan3).length, 1);
    const parts = new Map([[`${lm.i},${lm.j}`, { rooms: [], flights: [], reservations: [{ ...box }] }]]);
    const w2 = new World2(seed, { bridgeParts: parts }), plan2 = w2.plan(lm.i, lm.j);
    assert.equal(roundPool(plan2).length, 1, 'an S2 reservation removed the round pool');
  }
});

test('a cluster factory injected by the caller owns the districts: no round-pool hall is promised', () => {
  const w = new World2(1, { cluster: () => null });
  assert.equal(w.roundHall(), null);
});

test('injected S2 geometry that takes the reserve is refused with a named error; geometry beside it and above it is accepted', () => {
  const room = (box, lv) => ({ ...box, id: 'bridge:t:0', spaceId: 'bridge:t', bridgeId: 't', lv, kind: 'bridge', ceil: 3, lamps: [] });
  const flight = (box, hallEntry) => ({ ...box, axis: 'z', up: 1, lo: 0, hi: 1, y0: 0, y1: 3.5, hallEntry, bridgeId: 't', bridgeEnd: 'A', hallSpaceId: '', entry: [box.x0, box.z0], room: 'bridge:t:0' });
  // natural hall and fixed fallback hall both
  for (const opt of [{}, { roundHallMin: 1000 }]) for (const seed of [1, 2, 3, 42]) {
    const lm = new World2(seed, opt).roundHall(), box = reserveOf(lm), key = `${lm.i},${lm.j}`;
    const inside = { x0: lm.cx - 2, x1: lm.cx + 2, z0: lm.cz - 2, z1: lm.cz + 2 };
    const beside = { x0: box.x1 + 1, x1: box.x1 + 3, z0: lm.cz - 1, z1: lm.cz + 1 };
    const plan = (parts) => new World2(seed, { ...opt, bridgeParts: new Map([[key, parts]]) }).plan(lm.i, lm.j);
    const named = (e) => { assert.equal(e.name, 'RoundPoolReserveError'); return true; };
    assert.throws(() => plan({ rooms: [room(inside, 0)], flights: [] }), named, `seed ${seed}: ground-floor bridge room on the pool`);
    const hallSpaceId = new World2(seed, opt).plan(lm.i, lm.j).rooms.find((o) => o.id === new World2(seed, opt).plan(lm.i, lm.j).primaryHallId).spaceId;
    const fl = (box, he) => ({ ...flight(box, he), hallSpaceId, entry: [he.x0 + 0.1, he.z0 + 0.1] });
    assert.throws(() => plan({ rooms: [room(beside, 0)], flights: [fl(inside, beside)] }), named, `seed ${seed}: flight on the pool`);
    assert.throws(() => plan({ rooms: [room(beside, 0)], flights: [fl(beside, inside)] }), named, `seed ${seed}: flight entry on the pool`);
    // a bridge a floor above the hall passes over the pool, and a clear room beside the reserve is fine
    assert.doesNotThrow(() => plan({ rooms: [room(inside, 1)], flights: [] }));
    assert.doesNotThrow(() => plan({ rooms: [room(beside, 0)], flights: [] }));
    // a soft reservation (the walk line through the hall) never removes the pool and never throws
    assert.equal(roundPool(plan({ rooms: [], flights: [], reservations: [{ ...box }] })).length, 1);
  }
});

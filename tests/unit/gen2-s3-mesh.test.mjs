// S3 slice 2C: the rectangular sub-rooms are seen and lit. Walls are drawn from plan.s3Walls, the lamps follow their rooms,
// and the floor audit counts each cell once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../../js/gen2.js';
import { applyS3Rects } from '../../js/gen2-s3-rect.js';
import { doorOn, PART_WALL } from '../../js/gen2-s3-plan.js';
import { measurePlan } from '../../js/gen2-measure.js';
import { lightAt } from '../../js/lighting.js';
import { loadMesher } from './mesh-helper.mjs';
import { slow } from './slow.mjs';

const T = PART_WALL, EPS = 1e-6;
const BIG = { x0: 320, x1: 360, z0: 320, z1: 360 };
const R1 = { x0: 324, x1: 330, z0: 324, z1: 332 };   // a room with its door on z1, so the hall side of the room is the open floor
const lamp = (x, z, k = 0) => ({ x, z, w: 1.2, d: 1.2, k });
const hallPlan = (lamps) => ({
  i: 5, j: 5, ox: 320, oz: 320, primaryHallId: 0, mega: null, pools: [], flights: [], voids: [], ladders: [], columns: [], windows: [],
  rooms: [{ id: 0, kind: 'hall', lv: 0, ceil: 4.5, spaceId: 'h', lamps, ...BIG }],
});
// a planner that returns the given rooms, and a validator that accepts them: only the lamp rule is on trial
const fixed = (rooms) => ({
  planner: () => ({ parentSpaceId: 'h', mode: 'high', target: 0.1, share: 0.1, subrooms: rooms.map(([R, side, c], k) => ({ subspaceId: `h:s3:${k}`, parentSpaceId: 'h', nominalLevel: 0, ceil: 4.5, shape: { type: 'rect-union', rects: [R] }, portals: [doorOn(R, side, c)] })) }),
  validator: () => [],
});
const inner = (R) => ({ x0: R.x0 + T, x1: R.x1 - T, z0: R.z0 + T, z1: R.z1 - T });
const within = (l, r) => l.x >= r.x0 - EPS && l.x + l.w <= r.x1 + EPS && l.z >= r.z0 - EPS && l.z + l.d <= r.z1 + EPS;
const overlaps = (l, r) => l.x < r.x1 && r.x0 < l.x + l.w && l.z < r.z1 && r.z0 < l.z + l.d;

test('S3-2C: a lamp in a cut follows its room, a lamp on the wall or across the cut edge is dropped, and a bare room gets a lamp in the middle', () => {
  const inside = lamp(326.4, 327.4), across = lamp(323.4, 327), onWall = lamp(324.1, 327), outside = lamp(340, 340), touching = lamp(322.8, 327);
  const w = new World2(42, { s3Rects: true });
  const plan = hallPlan([inside, across, onWall, outside, touching]);
  const before = structuredClone(plan);
  const out = applyS3Rects(w, plan, fixed([[R1, 'z1', 327]]));
  assert.deepEqual(plan, before, 'the input plan is not changed');
  const hall = out.rooms.find((o) => o.id === 0), kid = out.rooms.find((o) => o.kind === 's3-room');
  assert.ok(kid, 'the room is built');
  assert.deepEqual(hall.lamps, [outside, touching], 'the hall keeps the lamps that are clear of the cut');
  assert.deepEqual(kid.lamps, [inside], 'the room takes the lamp that is wholly on its inner floor');
  const bare = applyS3Rects(w, hallPlan([outside]), fixed([[R1, 'z1', 327]])).rooms.find((o) => o.kind === 's3-room');
  assert.deepEqual(bare.lamps, [lamp(326.4, 327.4)], 'a room with no lamp gets one 1.2 m lamp in its middle');
});

test('S3-2C: on real halls every room is lit from inside, no lamp hangs across a cut, and no lamp is made or doubled', () => {
  let kids = 0, moved = 0;
  for (const seed of [42, 7, 99, 1]) {
    const on = new World2(seed, { s3Rects: true }), off = new World2(seed);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const p = on.plan(i, j), base = off.plan(i, j);
      for (const hall of p.rooms.filter((o) => o.s3Cuts)) {
        const was = base.rooms.find((o) => o.id === hall.id).lamps;
        const children = p.rooms.filter((o) => o.kind === 's3-room' && o.parentId === hall.id);
        for (const cut of hall.s3Cuts) assert.ok(!hall.lamps.some((l) => overlaps(l, cut)), `${seed} ${i},${j}: a hall lamp across a cut`);
        for (const l of hall.lamps) assert.ok(was.some((q) => q.x === l.x && q.z === l.z), 'the hall invents no lamp');
        for (const kid of children) {
          kids++;
          assert.ok(kid.lamps.length >= 1, `${seed} ${i},${j}: a dark room`);
          for (const l of kid.lamps) {
            assert.ok(within(l, inner(kid)), `${seed} ${i},${j}: a lamp outside the inner floor`);
            if (was.some((q) => q.x === l.x && q.z === l.z)) moved++;
          }
          const mid = lightAt(kid.lamps, (kid.x0 + kid.x1) / 2, (kid.z0 + kid.z1) / 2);
          assert.ok(mid > 0.5, `${seed} ${i},${j}: the middle of a room is lit (${mid})`);
        }
      }
    }
  }
  assert.ok(kids > 20 && moved > 0, `kids ${kids}, moved lamps ${moved}`);
});

test('S3-2C: the cell mesh draws every wall box: four outward faces, the underside of a lintel, all numbers finite', async () => {
  await loadMesher();
  const { buildCell2 } = await import('../../js/mesh2.js');
  let walls = 0, lintels = 0, cells = 0;
  for (const seed of [42, 7, 99]) {
    const w = new World2(seed, { s3Rects: true });
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [2, 1], [-2, -1]]) {
      const plan = w.plan(i, j);
      if (!plan.s3Walls?.length) continue;
      cells++;
      const it = buildCell2(w, i, j);
      let r = it.next();
      while (!r.done) r = it.next();
      const pos = r.value.static.attributes.position.array, col = r.value.static.attributes.color.array, idx = r.value.static.index.array;
      assert.ok(Array.from(pos).every(Number.isFinite) && Array.from(col).every(Number.isFinite), `${seed} ${i},${j}: finite mesh`);
      assert.ok(Array.from(col).every((c) => c >= 0 && c <= 1 + EPS), `${seed} ${i},${j}: colours in range`);
      const tris = [];
      for (let k = 0; k < idx.length; k += 3) {
        const p = [0, 1, 2].map((q) => [pos[idx[k + q] * 3], pos[idx[k + q] * 3 + 1], pos[idx[k + q] * 3 + 2]]);
        const u = p[1].map((v, q) => v - p[0][q]), v = p[2].map((x, q) => x - p[0][q]);
        tris.push({ p, n: [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]] });
      }
      for (const b of plan.s3Walls) {
        walls++;
        const c = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];
        const faces = [['x', b.x0, -1], ['x', b.x1, 1], ['z', b.z0, -1], ['z', b.z1, 1]];
        if (b.lintel) { lintels++; faces.push(['y', b.y0, -1]); }
        for (const [axis, at, sign] of faces) {
          const a = { x: 0, y: 1, z: 2 }[axis];
          const ok = tris.some((t) => t.p.every((q) => Math.abs(q[a] - at) < EPS && q[0] >= b.x0 - EPS && q[0] <= b.x1 + EPS && q[1] >= b.y0 - EPS && q[1] <= b.y1 + EPS && q[2] >= b.z0 - EPS && q[2] <= b.z1 + EPS)
            && t.n[a] * sign > EPS);
          assert.ok(ok, `${seed} ${i},${j}: no ${sign > 0 ? '+' : '-'}${axis} face on wall ${JSON.stringify(b)} (centre ${c})`);
        }
      }
    }
  }
  assert.ok(cells >= 5 && walls > 20 && lintels > 3, `cells ${cells}, walls ${walls}, lintels ${lintels}`);
});

test('S3-2C: the floor audit counts a cut cell once: footprint and overlap are what they are without S3', () => {
  let cut = 0;
  for (const seed of [42, 7, 99]) {
    const on = new World2(seed, { s3Rects: true }), off = new World2(seed);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const p = on.plan(i, j);
      if (!p.rooms.some((o) => o.s3Cuts)) continue;
      cut++;
      const a = measurePlan(p, on.Y).levels[0], b = measurePlan(off.plan(i, j), off.Y).levels[0];
      assert.equal(a.footprint, b.footprint, `${seed} ${i},${j}: footprint`);
      assert.equal(a.overlap, b.overlap, `${seed} ${i},${j}: overlap`);
    }
  }
  assert.ok(cut > 10, `${cut} cut cells`);
});

test('S3-2C: with S2 bridges in the world, S3 leaves every bridge room, flight and reservation as S2 made it', slow, async () => {
  const { planS2TileJob } = await import('../../js/gen2-s2-runtime.js');
  const { bridgeFragments } = await import('../../js/gen2-bridge-world.js');
  let bridgeCells = 0, kids = 0;
  for (const tile of ['zt:1,-1', 'zt:-1,0']) {
    const job = planS2TileJob(42, tile, { reserveSoftFeatures: true });
    let res;
    for (;;) { const n = job.next(); if (n.done) { res = n.value; break; } }
    const parts = bridgeFragments(res.snapshot.bridges);
    const on = new World2(42, { bridgeParts: parts, s3Rects: true }), off = new World2(42, { bridgeParts: parts });
    for (const key of parts.keys()) {
      const [i, j] = key.split(',').map(Number), p = on.plan(i, j), base = off.plan(i, j);
      bridgeCells++;
      assert.deepEqual(p.flights, base.flights, `${tile} ${key}: flights`);
      for (const o of base.rooms.filter((q) => q.kind !== 'hall')) assert.deepEqual(p.rooms.find((q) => q.id === o.id), o, `${tile} ${key}: room ${o.id}`);
      const keep = [...base.flights.flatMap((f) => [f, f.hallEntry]), ...base.rooms.filter((q) => q.kind !== 'hall')];
      for (const k of p.rooms.filter((q) => q.kind === 's3-room')) {
        kids++;
        assert.ok(!keep.some((q) => q && q.lv !== 1 && overlaps2(k, q)), `${tile} ${key}: a sub-room over a bridge part`);
      }
      assert.ok(!p.s3Walls.some((b) => keep.some((q) => q && overlaps2(b, q))), `${tile} ${key}: a wall over a bridge part`);
    }
  }
  assert.ok(bridgeCells > 0, 'the tiles hold bridge cells');
  console.log(`# S2 x S3: ${bridgeCells} bridge cells, ${kids} sub-rooms`);
});
const overlaps2 = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

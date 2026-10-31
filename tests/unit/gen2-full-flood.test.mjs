// Inner layer: the full-flood B1 room (Poolcore phase B, docs/decisions/2026-10-31-poolcore-water-rooms.md items 3 and 4). A basement room can be
// flooded edge to edge by one dedicated record on the room (`fullFlood`: depth, floor, water). The collision (candidates), the mesh and the
// measure all read that record; no pool object stands in for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2, WATER_DROP, FLOOD_SHARE, FLOOD_DEPTH, shapeOutline } from '../../js/gen2.js';
import { Player } from '../../js/player.js';
import { measurePlan } from '../../js/gen2-measure.js';
import { loadMesher } from './mesh-helper.mjs';

const DT = 1 / 60, EPS = 1e-6;
const CELLS = []; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) CELLS.push([i, j]);
const inside = (o, x, z) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1;
const shapeBox = (shape) => { const pts = shapeOutline(shape).map((q) => (Array.isArray(q) ? q : [q.x, q.z])); return { x0: Math.min(...pts.map((q) => q[0])), x1: Math.max(...pts.map((q) => q[0])), z0: Math.min(...pts.map((q) => q[1])), z1: Math.max(...pts.map((q) => q[1])) }; };
const touches = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const floodRooms = (plan) => plan.rooms.filter((o) => o.fullFlood);
const walk = (p, w, yaw, seconds) => { p.yaw = yaw; for (let t = 0; t < seconds; t += DT) p.update(w, DT, { x: 0, z: 1, run: false }); };
const flightCell = (plan, x, z) => plan.flights.some((f) => f.lo <= -1 && -1 <= f.hi && inside(f, x, z));

test('about a tenth of the basement rooms flood, each with one record: depth 0.35 to 0.55, no pool, no column, no pool of the maze inside', () => {
  let flooded = 0, basements = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const w = new World2(seed);
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j);
      basements += plan.rooms.filter((o) => o.kind === 'basement').length;
      const fl = floodRooms(plan);
      assert.deepEqual(plan.floods ?? [], fl.map((o) => o.id), 'plan.floods lists exactly the flooded rooms');
      for (const o of fl) {
        flooded++;
        assert.equal(o.kind, 'basement'); assert.equal(o.lv, -1);
        const { depth, floor, water } = o.fullFlood;
        assert.ok(depth >= FLOOD_DEPTH[0] - EPS && depth <= FLOOD_DEPTH[1] + EPS, `seed ${seed}: depth ${depth}`);
        assert.ok(Math.abs(water - (w.Y[-1] - WATER_DROP)) < EPS, 'water sits WATER_DROP under the room floor');
        assert.ok(Math.abs(floor - (water - depth)) < EPS);
        assert.ok(!plan.pools.some((p) => p.room === o.id || (p.lv === -1 && touches(o, shapeBox(p.shape)))), `seed ${seed}: a pool in the flooded room`);
        assert.ok(!plan.columns.some((c) => c.room === o.id), 'a column in the flooded room');
      }
    }
  }
  assert.ok(flooded >= 8, `only ${flooded} flooded rooms`);
  const share = flooded / basements;
  assert.ok(share > 0.04 && share < 0.2, `flooded share ${share.toFixed(3)} of ${basements} basements, want about ${FLOOD_SHARE}`);
});

test('floodShare 0 floods nothing and 1 floods every basement; the rest of the plan does not move', () => {
  const strip = (plan) => JSON.stringify({
    rooms: plan.rooms.map(({ fullFlood, ...o }) => o), flights: plan.flights, voids: plan.voids, lv0pools: plan.pools.filter((p) => p.lv === 0),
    lv0columns: plan.columns.filter((c) => c.lv === 0), windows: plan.windows,
  });
  let compared = 0, floodedAll = 0;
  for (const seed of [1, 2, 3, 7, 42]) {
    const none = new World2(seed, { floodShare: 0 }), all = new World2(seed, { floodShare: 1 });
    for (const [i, j] of CELLS) {
      const a = none.plan(i, j), b = all.plan(i, j);
      assert.deepEqual(floodRooms(a), []); assert.equal(a.floods, undefined);
      assert.equal(strip(a), strip(b), `seed ${seed} cell ${i},${j}: flooding moved another feature`);
      // a flood takes out only the B1 pools and columns that touch a flooded room (a pool of the maze that sticks out of it goes whole); every other one stays
      const fl = floodRooms(b), hits = (o, box) => fl.some((r) => touches(r, box));
      assert.deepEqual(b.pools.filter((p) => p.lv === -1), a.pools.filter((p) => p.lv === -1 && !hits(p, shapeBox(p.shape))), `seed ${seed} cell ${i},${j}: B1 pools`);
      assert.deepEqual(b.columns.filter((c) => c.lv === -1), a.columns.filter((c) => c.lv === -1 && !hits(c, { x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r })), `seed ${seed} cell ${i},${j}: B1 columns`);
      const bases = b.rooms.filter((o) => o.kind === 'basement');
      for (const o of bases) assert.ok(o.fullFlood, `seed ${seed} cell ${i},${j}: a basement stayed dry at share 1`);
      floodedAll += bases.length; compared++;
    }
  }
  assert.ok(compared > 100 && floodedAll > 20, `${compared} cells, ${floodedAll} basements`);
});

test('the same seed and options give the same plan, also after the cache is cleared', () => {
  for (const seed of [4, 5, 77]) {
    const a = new World2(seed, { floodShare: 0.5 }), b = new World2(seed, { floodShare: 0.5 });
    const first = CELLS.map(([i, j]) => JSON.stringify(a.plan(i, j)));
    b.plan(2, 2);
    a.plans.clear(); a.districts.clear();
    assert.deepEqual(CELLS.map(([i, j]) => JSON.stringify(b.plan(i, j))), first);
    assert.deepEqual(CELLS.map(([i, j]) => JSON.stringify(a.plan(i, j))), first);
  }
});

test('collision: every open floor sample of a flooded room is shallow water on the dedicated floor, and a body stands on it', () => {
  let rooms = 0, samples = 0;
  for (const seed of [1, 2, 3, 7, 42]) {
    const w = new World2(seed, { floodShare: 1 });
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j);
      for (const o of floodRooms(plan)) {
        rooms++;
        const { floor, water } = o.fullFlood;
        for (let x = o.x0 + 0.25; x < o.x1; x += 0.5) for (let z = o.z0 + 0.25; z < o.z1; z += 0.5) {
          if (flightCell(plan, x, z)) continue;
          const s = w.surfaceNear(x, z, floor);
          assert.ok(s, `seed ${seed}: no floor at ${x},${z}`);
          assert.ok(Math.abs(s.h - floor) < EPS && Math.abs(s.wl - water) < EPS, `seed ${seed}: floor ${s.h} water ${s.wl} at ${x},${z}`);
          assert.equal(w.floodAt(x, z)?.floor, floor);
          // no dry candidate beside it: a body cannot stand on the room floor height there
          assert.ok(!w.candidates(x, z).some((c) => !c.wall && Math.abs(c.h - w.Y[-1]) < 0.1), `seed ${seed}: dry floor at ${x},${z}`);
          samples++;
        }
        const mx = (o.x0 + o.x1) / 2, mz = (o.z0 + o.z1) / 2;
        if (!flightCell(plan, mx, mz)) assert.ok(new Player().canStand(w, mx, mz, floor), `seed ${seed}: cannot stand in the middle`);
      }
    }
  }
  assert.ok(rooms >= 10 && samples > 2000, `${rooms} rooms, ${samples} samples`);
});

test('the real body walks a straight flight down into a flooded room and back up to 1F', () => {
  let walked = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const w = new World2(seed, { floodShare: 1, clusterShare: 0 });
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j);
      for (const f of plan.flights.filter((q) => !q.turn && q.lo === -1)) {
        const room = plan.rooms.find((o) => o.id === f.room);
        if (!room.fullFlood) continue;
        const e = f.hallEntry, mid = [(e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2];
        const fx = (f.x0 + f.x1) / 2, fz = (f.z0 + f.z1) / 2, dx = fx - mid[0], dz = fz - mid[1];
        const yaw = Math.atan2(-Math.sign(f.axis === 'x' ? dx : 0), -Math.sign(f.axis === 'z' ? dz : 0));
        const p = new Player();
        p.reset(mid[0], mid[1], yaw, 0);
        p.settle(w, 0);
        const len = f.axis === 'x' ? f.x1 - f.x0 : f.z1 - f.z0;
        walk(p, w, yaw, (len + 2.5) / 3.3);
        assert.ok(Math.abs(p.floorH - room.fullFlood.floor) < 0.02, `seed ${seed} cell ${i},${j}: reached ${p.floorH}, want ${room.fullFlood.floor}`);
        assert.ok(p.inWater, 'wading');
        walk(p, w, yaw + Math.PI, (len + 2.5) / 3.3 + 0.6);
        assert.ok(Math.abs(p.floorH) < 0.01, `seed ${seed} cell ${i},${j}: back at ${p.floorH}`);
        walked++;
      }
    }
  }
  assert.ok(walked >= 5, `${walked} flights walked`);
});

// the triangles of one geometry: { p: [[x,y,z]*3], up }
function trisOf(geo) {
  if (!geo) return [];
  const pos = geo.attributes.position.array, idx = geo.index.array, out = [];
  for (let k = 0; k < idx.length; k += 3) {
    const p = [0, 1, 2].map((q) => [pos[idx[k + q] * 3], pos[idx[k + q] * 3 + 1], pos[idx[k + q] * 3 + 2]]);
    const u = p[1].map((v, q) => v - p[0][q]), v = p[2].map((x, q) => x - p[0][q]);
    out.push({ p, n: [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]] });
  }
  return out;
}
const hitsXZ = (t, x, z) => {   // the point (x, z) lies in the triangle's footprint
  const [a, b, c] = t.p, d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(d) < 1e-12) return false;
  const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
  return l1 >= -1e-9 && l2 >= -1e-9 && 1 - l1 - l2 >= -1e-9;
};

test('mesh: a flooded room has a floor at the dedicated height and water over all of it, no dry floor, and a riser where it meets a dry floor', async () => {
  await loadMesher();
  const { buildCell2 } = await import('../../js/mesh2.js');
  const { cellRaster, Q2 } = await import('../../js/gen2.js');
  let rooms = 0, risers = 0;
  for (const seed of [1, 2, 3, 7]) {
    const w = new World2(seed, { floodShare: 1 });
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j), fl = floodRooms(plan);
      if (!fl.length) continue;
      const it = buildCell2(w, i, j); let r = it.next(); while (!r.done) r = it.next();
      const st = trisOf(r.value.static), wt = trisOf(r.value.water), Y = w.Y[-1];
      const up = st.filter((t) => t.n[1] > 0), floorTris = (y) => up.filter((t) => t.p.every((q) => Math.abs(q[1] - y) < 1e-4));
      for (const o of fl) {
        rooms++;
        const { floor, water } = o.fullFlood;
        const dry = floorTris(Y).filter((t) => inside({ x0: o.x0 + 0.3, x1: o.x1 - 0.3, z0: o.z0 + 0.3, z1: o.z1 - 0.3 }, (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3));
        assert.equal(dry.length, 0, `seed ${seed} cell ${i},${j}: ${dry.length} dry floor triangles inside the flooded room`);
        const low = floorTris(floor), wet = wt.filter((t) => t.n[1] > 0 && t.p.every((q) => Math.abs(q[1] - water) < 1e-4));
        for (let x = o.x0 + 0.5; x < o.x1; x += 1) for (let z = o.z0 + 0.5; z < o.z1; z += 1) {
          if (flightCell(plan, x, z)) continue;
          assert.ok(low.some((t) => hitsXZ(t, x, z)), `seed ${seed} cell ${i},${j}: no floor at ${x},${z}`);
          assert.ok(wet.some((t) => hitsXZ(t, x, z)), `seed ${seed} cell ${i},${j}: no water at ${x},${z}`);
        }
      }
      // the raster edge between a flooded cell and a dry open cell (not a flight): a vertical face up to the dry floor, facing into the flooded cell
      const R = cellRaster(w, i, j, -1), n = R.n, flooded = (k) => !!w.floodAt(R.ox + ((k % n) + 0.5) * Q2, R.oz + (Math.floor(k / n) + 0.5) * Q2);
      for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
        const k = b * n + a;
        if (!R.inside[k] || R.flight[k]) continue;
        for (const [da, db] of [[1, 0], [0, 1]]) {
          if (a + da >= n || b + db >= n) continue;
          const m = (b + db) * n + a + da;
          if (!R.inside[m] || R.flight[m] || flooded(k) === flooded(m)) continue;
          const lowK = flooded(k), plane = da ? R.ox + (a + 1) * Q2 : R.oz + (b + 1) * Q2, along = da ? R.oz + (b + 0.5) * Q2 : R.ox + (a + 0.5) * Q2;
          const o = fl[0], y = Y + (o.fullFlood.floor - Y) / 2, ax = da ? 0 : 2, ac = da ? 2 : 0, toward = lowK ? -1 : 1;   // k lies at the smaller coordinate: a face into the flooded cell looks along -axis when that cell is k
          const hit = st.filter((t) => t.p.every((q) => Math.abs(q[ax] - plane) < 1e-6) && Math.min(...t.p.map((q) => q[1])) <= y && Math.max(...t.p.map((q) => q[1])) >= y
            && Math.min(...t.p.map((q) => q[ac])) <= along && Math.max(...t.p.map((q) => q[ac])) >= along);
          assert.ok(hit.some((t) => Math.sign(t.n[ax]) === toward), `seed ${seed} cell ${i},${j}: no riser at edge ${a},${b}`);
          risers++;
        }
      }
    }
  }
  assert.ok(rooms >= 5 && risers > 0, `${rooms} rooms, ${risers} risers`);
});

test('measure: a flooded room counts as wading water over its open floor, shape "flood"', () => {
  let rooms = 0;
  for (const seed of [1, 2, 3, 7]) {
    const w = new World2(seed, { floodShare: 1 });
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j), fl = floodRooms(plan);
      if (fl.length !== 1) continue;   // one flooded room in the cell
      const o = fl[0], m = measurePlan(plan, w.Y);
      let open = 0;
      for (let x = o.x0 + 0.25; x < o.x1; x += 0.5) for (let z = o.z0 + 0.25; z < o.z1; z += 0.5) if (!plan.flights.some((f) => f.lo <= -1 && -1 <= f.hi && x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1)) open++;
      const entry = m.pools.find((p) => p.shape === 'flood');
      assert.ok(entry && entry.lv === -1 && entry.deep === false, 'no flood entry in the pool list');
      assert.ok(Math.abs(entry.area - open * 0.25) < 1e-6, `seed ${seed} cell ${i},${j}: flood area ${entry.area}, want ${open * 0.25}`);
      assert.ok(m.levels[-1].pool >= entry.area - 1e-6, 'the level total holds the flood');
      rooms++;
    }
  }
  assert.ok(rooms >= 3, `${rooms} rooms measured`);
});

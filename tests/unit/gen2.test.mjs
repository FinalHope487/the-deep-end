// Inner layer: generator v2 prototype — whole pool shapes, stacked floors joined by flights, walking with the real Player.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2, CELL2, SWITCH_W, switchH, switchWall, Q2, GIANT_ARM, cellRaster, CURVE_SEG, WADE_MAX, POOL_MARGIN, shapeContains, shapeOutline, poolDepth, poolBands, lineCrossings, STEP_RISE, COL_CLEAR, EXIT_DEPTH, flightH, DEEP_MIN, DEEP_DROP, WATER_DROP, STEP2, PARAPET, WIN_WALL, RAMP_SLOPE, primaryHall } from '../../js/gen2.js';
import { Player } from '../../js/player.js';
import { reachSet } from './reach.mjs';

const SEEDS = [1, 2, 3, 7, 42, 99];
const CELLS = [];
for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) CELLS.push([i, j]);

function pip(poly, x, z) {
  let inside = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, za] = poly[a], [xb, zb] = poly[b];
    if ((za > z) !== (zb > z) && x < ((xb - xa) * (z - za)) / (zb - za) + xa) inside = !inside;
  }
  return inside;
}
function distToPoly(poly, x, z) {
  let d = Infinity;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, za] = poly[a], [xb, zb] = poly[b], ex = xb - xa, ez = zb - za;
    const t = Math.max(0, Math.min(1, ((x - xa) * ex + (z - za) * ez) / (ex * ex + ez * ez)));
    d = Math.min(d, Math.hypot(x - xa - ex * t, z - za - ez * t));
  }
  return d;
}
const allPools = () => SEEDS.flatMap((s) => { const w = new World2(s); return CELLS.flatMap(([i, j]) => w.plan(i, j).pools.map((p) => ({ w, p, plan: w.plan(i, j) }))); });

test('same seed, same plan; different seeds differ', () => {
  const a = new World2(5), b = new World2(5), c = new World2(6);
  assert.deepEqual(JSON.stringify(a.plan(1, -2)), JSON.stringify(b.plan(1, -2)));
  assert.deepEqual(a.Y, b.Y);
  assert.notEqual(JSON.stringify(a.plan(1, -2)), JSON.stringify(c.plan(1, -2)));
});

test('far-apart cells never share a cached plan, whichever is planned first', () => {
  // (0, 65536) and (1, 0) once packed to the same number key
  for (const order of [[[0, 65536], [1, 0]], [[1, 0], [0, 65536]]]) {
    const w = new World2(3);
    for (const [i, j] of order) w.plan(i, j);
    for (const [i, j] of order) {
      const p = w.plan(i, j);
      assert.deepEqual([p.i, p.j], [i, j]);
      assert.equal(JSON.stringify(p), JSON.stringify(new World2(3).plan(i, j)));
    }
  }
});

test('floors stack 6–11.5 m apart', () => {
  for (const s of SEEDS) {
    const w = new World2(s);
    assert.ok(w.Y[1] >= 6 && w.Y[1] <= 11.5, `2F ${w.Y[1]}`);
    assert.ok(-w.Y[-1] >= 6 && -w.Y[-1] <= 11.5, `B1 ${w.Y[-1]}`);
  }
});

test('every kind of pool shape is made, and curved rims are drawn smooth and match collision', () => {
  const kinds = new Set();
  let checked = 0;
  for (const { p } of allPools()) {
    const s = p.shape, poly = shapeOutline(s);
    kinds.add(s.type);
    // every drawn edge hugs the true rim: 1 cm either side of its middle is inside / outside (no pixel steps, no flat facets)
    for (let a = 0; a < poly.length; a++) {
      const b = poly[(a + 1) % poly.length], ex = b[0] - poly[a][0], ez = b[1] - poly[a][1], l = Math.hypot(ex, ez);
      if (s.type === 'ellipse' || s.type === 'blob') assert.ok(l <= CURVE_SEG + 1e-9, 'curve segment too long');
      const mx = poly[a][0] + ex / 2, mz = poly[a][1] + ez / 2, nx = -ez / l * 0.01, nz = ex / l * 0.01;
      assert.notEqual(shapeContains(s, mx + nx, mz + nz), shapeContains(s, mx - nx, mz - nz), `${s.type} edge off the rim`);
    }
    // drawn rim and collision agree everywhere but a 2 cm band along the rim
    for (let k = 0; k < 400; k++) {
      const x = s.cx + (((k * 37) % 41) / 40 - 0.5) * 2.4 * s.hw, z = s.cz + (((k * 53) % 43) / 42 - 0.5) * 2.4 * s.hd;
      if (distToPoly(poly, x, z) < 0.02) continue;
      assert.equal(shapeContains(s, x, z), pip(poly, x, z), `${s.type} at ${x},${z}`);
      checked++;
    }
  }
  for (const t of ['rect', 'rrect', 'ellipse', 'L', 'blob']) assert.ok(kinds.has(t), `no ${t} pool`);
  assert.ok(checked > 10000);
});

test('deep water lies DEEP_DROP under the floor and reaches DEEP_MIN; wading water stays just under the rim; one step in', () => {
  let deep = 0, wade = 0;
  for (const { w, p } of allPools()) {
    const y = w.Y[p.lv], hi = Math.max(p.d0, p.d1), lo = Math.min(p.d0, p.d1);
    if (hi > WADE_MAX) { deep++; assert.ok(Math.abs(y - DEEP_DROP - p.water) < 1e-9, 'deep water too near the floor'); assert.ok(hi >= DEEP_MIN, 'deep water under 2 m'); }
    else { wade++; assert.ok(Math.abs(y - WATER_DROP - p.water) < 1e-9, 'wading water not at the rim'); }
    // a pool that can be waded at all has its shallowest bottom one body step under the rim: the way in and out
    if (lo <= WADE_MAX) assert.ok(y - (p.water - lo) < STEP2 - 1e-6, `rim to bottom ${(y - p.water + lo).toFixed(2)} m`);
  }
  assert.ok(deep > 20 && wade > 20, `deep ${deep}, wading ${wade}`);
});

test('pool floors are flat or slope one way: never deeper in the middle than at both ends', () => {
  let slopes = 0;
  for (const { p } of allPools()) {
    const s = p.shape;
    // wading pools read as pools (0.3 m and more); a deep pool's shallow end may be ankle deep, its water being low
    assert.ok(Math.min(p.d0, p.d1) >= (Math.max(p.d0, p.d1) > WADE_MAX ? 0.1 : 0.3), 'too shallow to read as a pool');
    if (p.d0 !== p.d1) slopes++;
    // across the slope the depth is constant; along it, it changes monotonically
    const across = p.axis === 'x' ? [[s.cx, s.cz - s.hd * 0.9], [s.cx, s.cz + s.hd * 0.9]] : [[s.cx - s.hw * 0.9, s.cz], [s.cx + s.hw * 0.9, s.cz]];
    assert.equal(poolDepth(p, ...across[0]), poolDepth(p, ...across[1]));
    const line = [-0.9, -0.45, 0, 0.45, 0.9].map((t) => (p.axis === 'x' ? poolDepth(p, s.cx + t * s.hw, s.cz) : poolDepth(p, s.cx, s.cz + t * s.hd)));
    const up = line.every((d, k) => k === 0 || d >= line[k - 1] - 1e-9), down = line.every((d, k) => k === 0 || d <= line[k - 1] + 1e-9);
    assert.ok(up || down, 'depth goes up and down');
  }
  assert.ok(slopes > 5);
});

const area = (poly) => Math.abs(poly.reduce((s, [x, z], k) => { const [x2, z2] = poly[(k + 1) % poly.length]; return s + x * z2 - x2 * z; }, 0)) / 2;

test('a few pools step down: 3–5 flat steps, every riser low enough to climb, drawn as bands that tile the pool', () => {
  let stepped = 0;
  for (const { p } of allPools()) {
    const bands = poolBands(p);
    // the bands cover the pool exactly once, whatever its floor
    const rim = area(shapeOutline(p.shape)), sum = bands.reduce((s, b) => s + b.polys.reduce((t, q) => t + area(q), 0), 0);
    assert.ok(Math.abs(sum - rim) < 1e-6 * Math.max(1, rim), `bands cover ${sum} of ${rim} m²`);
    if (!p.steps) continue;
    stepped++;
    assert.ok(p.steps >= 3 && p.steps <= 5, `${p.steps} steps`);
    assert.equal(bands.length, p.steps);
    // every riser can be climbed: walk the floor along its axis in 1 cm steps, no jump over STEP_RISE
    const s = p.shape, lo = p.axis === 'x' ? s.cx - s.hw : s.cz - s.hd, span = 2 * (p.axis === 'x' ? s.hw : s.hd);
    let prev = null;
    for (let a = lo; a <= lo + span; a += 0.01) {
      const d = p.axis === 'x' ? poolDepth(p, a, s.cz) : poolDepth(p, s.cx, a);
      if (prev !== null) assert.ok(Math.abs(d - prev) <= STEP_RISE + 1e-9, 'a riser too high to climb');
      prev = d;
    }
    // inside a band the floor is level: the depth there is the band's
    for (const b of bands) for (const q of b.polys) {
      const cx = q.reduce((s, v) => s + v[0], 0) / q.length, cz = q.reduce((s, v) => s + v[1], 0) / q.length;
      if (shapeContains(p.shape, cx, cz) && pip(q, cx, cz)) assert.ok(Math.abs(poolDepth(p, cx, cz) - b.depth) < 1e-9);
    }
  }
  assert.ok(stepped > 3, `${stepped} stepped pools`);
});

// 2026-10-24 review: a rim corner lying exactly on a step's cut line lost that step's riser (strict crossing test)
test('a cut line crosses a rim in pairs, also through a corner lying on it', () => {
  const diamond = [[0, 2], [2, 0], [0, -2], [-2, 0]];
  assert.deepEqual(lineCrossings(diamond, 0, 0), [-2, 2]);      // through two corners
  assert.deepEqual(lineCrossings(diamond, 0, 1), [-1, 1]);
  const L = [[4, 4], [4, 0], [2, 0], [2, 2], [0, 2], [0, 4]];   // a notch edge lying along z = 2
  assert.equal(lineCrossings(L, 1, 2).length % 2, 0);
  assert.deepEqual(lineCrossings(L, 1, 3), [0, 4]);
  assert.equal(lineCrossings([[0, 0], [1, 0], [1, 1]], 0, 5).length, 0);
});

test('pools keep a dry walkway to every wall, clear of flights and of each other', () => {
  for (const { p, plan } of allPools()) {
    const room = plan.rooms.find((o) => o.id === p.room), s = p.shape;
    const m = room.kind === 'showcase' ? 1 : room.lv < 0 ? 1.5 : POOL_MARGIN;   // B1 rooms keep a narrower walkway; a sealed showcase needs none
    if (!p.flooded) assert.ok(s.cx - s.hw >= room.x0 + m - 1e-9 && s.cx + s.hw <= room.x1 - m + 1e-9 && s.cz - s.hd >= room.z0 + m - 1e-9 && s.cz + s.hd <= room.z1 - m + 1e-9);
    for (const f of plan.flights) assert.ok(s.cx + s.hw <= f.x0 || s.cx - s.hw >= f.x1 || s.cz + s.hd <= f.z0 || s.cz - s.hd >= f.z1 || p.lv !== 0, 'pool over a flight');
    for (const q of plan.pools) if (q !== p && q.lv === p.lv) {
      const t = q.shape;
      assert.ok(s.cx + s.hw <= t.cx - t.hw || t.cx + t.hw <= s.cx - s.hw || s.cz + s.hd <= t.cz - t.hd || t.cz + t.hd <= s.cz - s.hd, 'pools overlap');
    }
  }
});

test('columns are few, one form per room, clear of walls, pools, flights and each other, and solid where drawn', () => {
  let rooms = 0, withCols = 0, cols = 0;
  for (const s of SEEDS) {
    const w = new World2(s);
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j);
      for (const o of plan.rooms) {
        if (o.kind === 'corridor' || o.kind === 'b1corridor' || o.kind === 'shaft') continue;
        // a connector room is a way through: nothing stands in it
        if (o.kind === 'connector-room') { assert.equal(plan.columns.filter((c) => c.room === o.id).length, 0, 'column in a connector room'); continue; }
        rooms++;
        const cs = plan.columns.filter((c) => c.room === o.id);
        if (!cs.length) continue;
        withCols++;
        cols += cs.length;
        assert.ok(cs.length <= 6, `${cs.length} columns in one room`);
        assert.equal(new Set(cs.map((c) => c.form + c.r)).size, 1, 'mixed column forms in one room');
        for (const c of cs) {
          assert.ok(c.x - c.r >= o.x0 + COL_CLEAR - 1e-9 && c.x + c.r <= o.x1 - COL_CLEAR + 1e-9 && c.z - c.r >= o.z0 + COL_CLEAR - 1e-9 && c.z + c.r <= o.z1 - COL_CLEAR + 1e-9, 'column against a wall');
          const box = { x0: c.x - c.r - COL_CLEAR, x1: c.x + c.r + COL_CLEAR, z0: c.z - c.r - COL_CLEAR, z1: c.z + c.r + COL_CLEAR };
          const hit = (b) => box.x0 < b.x1 && b.x0 < box.x1 && box.z0 < b.z1 && b.z0 < box.z1;
          for (const p of plan.pools) if (p.lv === c.lv) assert.ok(!hit({ x0: p.shape.cx - p.shape.hw, x1: p.shape.cx + p.shape.hw, z0: p.shape.cz - p.shape.hd, z1: p.shape.cz + p.shape.hd }), 'column at a pool');
          for (const f of plan.flights) assert.ok(!hit(f) && !hit(f.hallEntry), 'column at a flight');
          for (const d of cs) if (d !== c) assert.ok(Math.hypot(d.x - c.x, d.z - c.z) >= 2 * c.r + COL_CLEAR - 1e-9, 'columns too close');
          // drawn solid: nobody stands in it, at its floor's height
          assert.equal(w.surfaceAt(c.x, c.z, w.Y[c.lv]), null);
          assert.ok(w.blockedAt(c.x + c.r * 0.6, c.z, w.Y[c.lv]));
        }
      }
    }
  }
  // voids, splits and windows take floor a column would need, so a little under a fifth may be all that get them
  assert.ok(withCols > rooms * 0.15 && withCols < rooms * 0.8, `${withCols} of ${rooms} rooms have columns`);
  assert.ok(cols / withCols <= 6);
});

test('stacked rooms never intersect: a ceiling stays under the floor above it', () => {
  let stacked = 0;
  for (const s of SEEDS) {
    const w = new World2(s);
    for (const [i, j] of CELLS) {
      const rooms = w.plan(i, j).rooms;
      for (const a of rooms) for (const b of rooms) {
        if (a.lv >= b.lv || a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0) continue;
        if (a.kind === 'shaft') continue;   // open to the floor above by design (a split)
        stacked++;
        assert.ok(w.Y[a.lv] + a.ceil + 0.5 <= w.Y[b.lv], `${a.kind} ceiling into ${b.kind}`);
      }
      for (const o of rooms) {
        assert.ok(o.x0 >= i * CELL2 && o.x1 <= (i + 1) * CELL2 && o.z0 >= j * CELL2 && o.z1 <= (j + 1) * CELL2, 'room leaves its cell');
        if (o.kind !== 'shaft') assert.ok(o.ceil >= (o.kind === 'corridor' ? 2 : 2.2) && o.ceil <= 6, `ceiling ${o.ceil}`);   // 1F corridors are 2–3 m low
      }
    }
  }
  assert.ok(stacked > 10, 'true stacking happens');
});

test('2F and B1 both appear, in fewer cells than 1F', () => {
  let up = 0, down = 0, n = 0;
  for (const s of SEEDS) { const w = new World2(s); for (const [i, j] of CELLS) { n++; const p = w.plan(i, j); up += p.rooms.some((o) => o.lv === 1); down += p.rooms.some((o) => o.lv === -1); } }
  assert.ok(up > n * 0.15 && up < n, `2F in ${up}/${n}`);
  assert.ok(down > n * 0.15 && down < n, `B1 in ${down}/${n}`);
});

test('the start stands on dry floor', () => {
  for (const s of SEEDS) {
    const w = new World2(s), p = new Player();
    p.reset(w.spawn.x, w.spawn.z, w.spawn.yaw, 0);
    p.settle(w, 0);
    assert.ok(p.canStand(w, p.x, p.z, p.floorH));
    assert.equal(p.floorH, 0);
    assert.equal(p.inWater, false);
  }
});

const DT = 1 / 60;
function walk(p, w, yaw, seconds) { p.yaw = yaw; for (let t = 0; t < seconds; t += DT) p.update(w, DT, { x: 0, z: 1, run: false }); }

test('every flight walks up (or down) to its room and back again', () => {
  let flights = 0;
  for (const s of SEEDS) {
    const w = new World2(s);
    for (const [i, j] of CELLS) for (const f of w.plan(i, j).flights.filter((q) => !q.turn)) {   // straight flights; switchbacks have their own test below
      flights++;
      const e = f.hallEntry, mid = [(e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2];
      const fx = (f.x0 + f.x1) / 2, fz = (f.z0 + f.z1) / 2, dx = fx - mid[0], dz = fz - mid[1];
      const inYaw = Math.atan2(-Math.sign(f.axis === 'x' ? dx : 0), -Math.sign(f.axis === 'z' ? dz : 0));
      const p = new Player();
      p.reset(mid[0], mid[1], inYaw, 0);
      p.settle(w, 0);
      assert.equal(p.floorH, 0, 'hall entry is on 1F');
      const len = f.axis === 'x' ? f.x1 - f.x0 : f.z1 - f.z0;
      walk(p, w, inYaw, (len + 2.5) / 3.3);   // 1.5 m into the room: short of any pool there
      const far = f.hi === 0 ? f.lo : f.hi;
      // on the room's floor, or wading in a B1 flood that reaches the foot of the flight
      assert.ok(p.floorH <= w.Y[far] + 0.01 && p.floorH >= w.Y[far] - WADE_MAX, `seed ${s} cell ${i},${j}: reached ${p.floorH}, want ${w.Y[far]}`);
      walk(p, w, inYaw + Math.PI, (len + 2.5) / 3.3);
      assert.ok(Math.abs(p.floorH) < 0.01, `seed ${s} cell ${i},${j}: back at ${p.floorH}`);
    }
  }
  assert.ok(flights > 20, `${flights} flights`);
});

test('from the hall every room of its cell is reachable, and the hall from every room', () => {
  for (const s of [1, 42]) {
    const w = new World2(s);
    for (const [i, j] of [[0, 0], [1, 0], [-1, 1], [2, -1], [0, 2]]) {
      const plan = w.plan(i, j), ox = i * CELL2, oz = j * CELL2, hall = plan.rooms[0];
      const box = [ox + 0.25, oz + 0.25, ox + CELL2 - 0.25, oz + CELL2 - 0.25];
      const start = [hall.x0 + 1.25, (hall.z0 + hall.z1) / 2 - ((hall.z0 + hall.z1) / 2) % 0.5 + 0.25, 0];
      const set = reachSet(w, ...box, w.surfaceAt(start[0], start[1], 0) ? start : [hall.x1 - 1.25, start[1], 0]);
      // the diagonal's pieces that run on from the hall through touching pieces are checked; the ones that only pass the corner are not
      const diagPart = (o) => o.diagId || o.spaceId?.startsWith('v2:space:diag:');
      const touch = (a, b) => a.x0 < b.x1 + 1e-9 && b.x0 < a.x1 + 1e-9 && a.z0 < b.z1 + 1e-9 && b.z0 < a.z1 + 1e-9;
      const chained = new Set(), queue = [hall];
      for (let k = 0; k < queue.length; k++) for (const q of plan.rooms) if (diagPart(q) && !chained.has(q) && touch(queue[k], q)) { chained.add(q); queue.push(q); }
      for (const o of plan.rooms) {
        const y = w.Y[o.lv];
        // a diagonal passing through the cell's corner (its corridor and its middle room) meets a hall only in other cells: walked in gen2-detour-walk
        if (diagPart(o) && !chained.has(o)) continue;
        if (o.kind === 'showcase') { assert.ok(!set.some(([x, z, h]) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && Math.abs(h - y) < WADE_MAX + 0.1), `seed ${s} cell ${i},${j}: walked into a showcase`); continue; }
        assert.ok(set.some(([x, z, h]) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && Math.abs(h - y) < WADE_MAX + 0.1), `seed ${s} cell ${i},${j}: ${o.kind} unreachable`);
        const at = set.find(([x, z, h]) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && h === y);
        const back = reachSet(w, ...box, at);
        assert.ok(back.some(([x, z, h]) => x > hall.x0 && x < hall.x1 && z > hall.z0 && z < hall.z1 && h === 0), `seed ${s} cell ${i},${j}: no way back from ${o.kind}`);
      }
      // the corridors reach the cell edge on all four sides (but where the district closed that edge)
      for (const [side, edge] of [[[ox + 0.25, null], [i - 1, j, 'x']], [[ox + CELL2 - 0.25, null], [i, j, 'x']], [[null, oz + 0.25], [i, j - 1, 'z']], [[null, oz + CELL2 - 0.25], [i, j, 'z']]]) {
        if (w.connectionOf(...edge).mode === 'closed') continue;
        assert.ok(set.some(([x, z]) => (side[0] === null || x === side[0]) && (side[1] === null || z === side[1])), `seed ${s} cell ${i},${j}: an edge is shut`);
      }
    }
  }
});

test('B1 is a small dark maze: low corridors, some flooded wall to wall but wadeable, a reservoir now and then, all reachable and back', () => {
  let mazes = 0, flooded = 0, reservoirs = 0;
  for (const s of [1, 2, 3, 42]) {
    const w = new World2(s);
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j), base = plan.rooms.find((o) => o.kind === 'basement');
      const halls = plan.rooms.filter((o) => o.kind === 'b1corridor');
      if (!base || !halls.length) continue;
      mazes++;
      for (const o of halls) assert.ok(o.ceil >= 2.2 && o.ceil <= 3 && o.dark, 'B1 corridors are low and dark');
      for (const p of plan.pools.filter((q) => q.flooded)) { flooded++; assert.ok(p.d0 === p.d1 && p.d0 <= EXIT_DEPTH, 'a flooded corridor too deep to wade out of'); }
      for (const o of plan.rooms.filter((q) => q.kind === 'reservoir')) { reservoirs++; assert.ok(plan.pools.some((p) => p.room === o.id), 'a reservoir without water'); }
      // every B1 space is reachable from the foot of the stair, and the stair from every one
      const ox = i * CELL2, oz = j * CELL2, box = [ox + 0.25, oz + 0.25, ox + CELL2 - 0.25, oz + CELL2 - 0.25], y = w.Y[-1];
      const pick = (o) => { for (let z = o.z0 + 0.75; z < o.z1; z += 0.5) for (let x = o.x0 + 0.75; x < o.x1; x += 0.5) if (w.surfaceAt(x, z, y) && w.surfaceAt(x, z, y).h >= y - WADE_MAX - DEEP_DROP && !w.blockedAt(x - 0.3, z - 0.3, y) && !w.blockedAt(x + 0.3, z + 0.3, y)) return [x, z, y]; return null; };
      const set = reachSet(w, ...box, pick(base));
      for (const o of plan.rooms.filter((q) => q.lv === -1 && q.kind !== 'shaft')) {   // a split's shaft is reached by its ladders
        assert.ok(set.some(([x, z, h]) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && h <= y + 0.01 && h >= y - WADE_MAX - DEEP_DROP), `seed ${s} cell ${i},${j}: ${o.kind} unreachable`);   // dry or wading
        const at = pick(o);
        assert.ok(at, `seed ${s} cell ${i},${j}: nowhere to stand in a ${o.kind}`);
        assert.ok(reachSet(w, ...box, at).some(([x, z, h]) => x > base.x0 && x < base.x1 && z > base.z0 && z < base.z1 && h === y), `seed ${s} cell ${i},${j}: no way back from ${o.kind}`);
      }
    }
  }
  assert.ok(mazes >= 5 && flooded >= 3 && reservoirs >= 1, `${mazes} mazes, ${flooded} flooded corridors, ${reservoirs} reservoirs`);
});

test('whoever wades in can always climb back out onto dry floor', () => {
  let pools = 0;
  for (const { w, p, plan } of allPools().filter((_, k) => k % 3 === 0)) {
    const s = p.shape, y = w.Y[p.lv];
    // the shallowest wading point of the pool
    const pts = [[s.cx, s.cz], [s.cx - s.hw * 0.85, s.cz], [s.cx + s.hw * 0.85, s.cz], [s.cx, s.cz - s.hd * 0.85], [s.cx, s.cz + s.hd * 0.85]]
      .filter(([x, z]) => shapeContains(s, x, z) && poolDepth(p, x, z) <= WADE_MAX).map(([x, z]) => [Math.round(x * 2) / 2, Math.round(z * 2) / 2]);
    const start = pts.find(([x, z]) => shapeContains(s, x, z) && w.surfaceAt(x, z, p.water - poolDepth(p, x, z)));
    if (!start) continue;
    pools++;
    const set = reachSet(w, s.cx - s.hw - 3, s.cz - s.hd - 3, s.cx + s.hw + 3, s.cz + s.hd + 3, [start[0], start[1], w.surfaceAt(start[0], start[1], p.water - poolDepth(p, ...start)).h]);
    assert.ok(set.some(([, , h]) => h === y), `seed ${w.seed} cell ${plan.i},${plan.j}: trapped in a ${p.shape.type} pool ${p.d0}/${p.d1}`);
  }
  assert.ok(pools > 10, `${pools} pools`);
});

test('deep water cannot be walked; shallow water can', () => {
  let deep = 0, wade = 0;
  for (const { w, p } of allPools()) {
    if (p.lv !== 0) continue;
    const s = p.shape;
    for (const [x, z] of [[s.cx, s.cz], [s.cx - s.hw * 0.8, s.cz], [s.cx + s.hw * 0.8, s.cz], [s.cx, s.cz - s.hd * 0.8], [s.cx, s.cz + s.hd * 0.8]]) {
      if (!shapeContains(s, x, z)) continue;
      const d = poolDepth(p, x, z), bottom = p.water - d;
      if (d > WADE_MAX) { deep++; assert.ok(!w.surfaceAt(x, z, bottom) && w.blockedAt(x, z, 0), 'deep water has a floor to stand on'); }
      else { wade++; const surf = w.surfaceAt(x, z, bottom); assert.ok(surf && Math.abs(surf.h - bottom) < 1e-9 && surf.wl === p.water); }
    }
  }
  assert.ok(deep > 10 && wade > 10);
});

test('flight treads rise steadily with a level landing half way', () => {
  const f = { x0: 0, x1: 16, z0: 0, z1: 3.5, axis: 'x', up: 1, y0: 0, y1: 8 };
  assert.equal(flightH(f, 0, 1), 0);
  assert.equal(flightH(f, 16, 1), 8);
  assert.equal(flightH(f, 7, 1), 4);
  assert.equal(flightH(f, 9, 1), 4);
  assert.equal(flightH({ ...f, up: -1 }, 0, 1), 8);
});

test('voids: an atrium or a pit opens a floor over the room under it, ringed by a parapet nobody walks through', () => {
  const kinds = { atrium: 0, pit: 0 };
  for (const s of SEEDS) {
    const w = new World2(s);
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j);
      for (const v of plan.voids) {
        kinds[v.kind]++;
        const yUp = w.Y[v.lv + 1], yDown = w.Y[v.lv], mx = (v.x0 + v.x1) / 2, mz = (v.z0 + v.z1) / 2;
        // open: nothing to stand on at the open floor, inside the void or on its parapet
        for (const [x, z] of [[mx, mz], [v.x0 + 0.1, mz], [v.x0 - PARAPET + 0.05, mz], [mx, v.z1 + PARAPET - 0.05]]) {
          assert.equal(w.surfaceAt(x, z, yUp), null, `seed ${s} ${v.kind}: floor at ${x},${z}`);
          assert.ok(w.blockedAt(x, z, yUp), `seed ${s} ${v.kind}: not blocked at ${x},${z}`);
        }
        // the floor under it is still there (dry, or a wading pool)
        const under = w.surfaceAt(mx, mz, yDown);
        if (!plan.pools.some((p) => p.lv === v.lv && shapeContains(p.shape, mx, mz))) assert.equal(under?.h, yDown, `seed ${s} ${v.kind}: no floor under`);
        // a pit has a walkway all round it on the hall floor, beyond the parapet
        if (v.kind === "pit") for (const [x, z] of [[v.x0 - 1.5, mz], [v.x1 + 1.5, mz], [mx, v.z0 - 1.5], [mx, v.z1 + 1.5]]) assert.equal(w.surfaceAt(x, z, yUp)?.h, yUp, `seed ${s} ${v.kind}: no walkway at ${x},${z}`);
        // nothing stands in it: no column and no lamp of the room under it
        assert.ok(!plan.columns.some((c) => (c.lv === v.lv || c.lv === v.lv + 1) && c.x > v.x0 - 1 && c.x < v.x1 + 1 && c.z > v.z0 - 1 && c.z < v.z1 + 1), 'a column in a void');
        const lamps = plan.rooms.filter((o) => o.lv === v.lv).flatMap((o) => o.lamps);
        assert.ok(!lamps.some((l) => l.x < v.x1 && l.x + l.w > v.x0 && l.z < v.z1 && l.z + l.d > v.z0), 'a lamp hanging in a void');
      }
    }
  }
  assert.ok(kinds.atrium >= 6 && kinds.pit >= 5, JSON.stringify(kinds));
});

test('windows: a showcase is seen through a hall wall and never walked into', () => {
  let n = 0;
  for (const s of SEEDS) {
    const w = new World2(s);
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j);
      for (const wn of plan.windows) {
        n++;
        const hall = plan.rooms.find((o) => o.id === wn.hall), far = plan.rooms.find((o) => o.id === wn.room), y = w.Y[wn.lv];
        assert.equal(far.kind, 'showcase');
        assert.ok(wn.sill > 0.5 && wn.head - wn.sill >= 1 && wn.head < hall.ceil && wn.head < far.ceil, 'window out of its walls');
        const P = (s2, f) => (wn.run === 'x' ? [s2, f] : [f, s2]), mid = (wn.s0 + wn.s1) / 2;
        // the wall's thickness has nothing to stand on; both rooms do, right at their faces
        assert.ok(w.blockedAt(...P(mid, wn.c + wn.out * WIN_WALL / 2), y), 'no wall in the window');
        assert.equal(w.surfaceNear(...P(mid, wn.c - wn.out * 0.25), y)?.h === y || plan.pools.some((p) => p.room === hall.id), true);
        assert.ok(w.surfaceNear(...P(mid, wn.c + wn.out * (WIN_WALL + 0.25)), y), 'no showcase floor behind the window');
        // no other 1F room within a metre of the showcase, and the hall floor in front of the window is clear
        assert.ok(!plan.rooms.some((o) => o.lv === 0 && o !== far && o !== hall && o.x0 - 1 < far.x1 && far.x0 - 1 < o.x1 && o.z0 - 1 < far.z1 && far.z0 - 1 < o.z1), 'a room touches the showcase');
        for (const t of [0.5, 1, 1.5]) assert.ok(!w.blockedAt(...P(mid, wn.c - wn.out * t), y), 'the hall floor in front of a window is blocked');
      }
    }
  }
  assert.ok(n >= 30, `${n} windows`);
});

test('sloping corridors: a gentle dip or rise with no vertical step, level where they meet the hall and the next cell', () => {
  let sloped = 0, all = 0;
  for (const s of SEEDS) {
    const w = new World2(s);
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j), hall = plan.rooms[0];
      for (const o of plan.rooms.filter((q) => q.kind === 'corridor')) {
        all++;
        if (!o.slope) continue;
        sloped++;
        const sl = o.slope, ax = sl.axis === 'x', mid = ax ? (o.z0 + o.z1) / 2 : (o.x0 + o.x1) / 2;
        assert.ok(Math.abs(sl.d) >= 0.4 && Math.abs(sl.d) <= 1.5, `rise ${sl.d}`);
        const lo = ax ? o.x0 : o.z0, hi = ax ? o.x1 : o.z1;
        let prev = null;
        for (let t = lo + 0.05; t < hi; t += 0.1) {
          const [x, z] = ax ? [t, mid] : [mid, t], h = w.surfaceNear(x, z, sl.d / 2)?.h;
          assert.ok(Number.isFinite(h), `nothing to stand on at ${x},${z}`);
          if (prev !== null) assert.ok(Math.abs(h - prev) <= RAMP_SLOPE * 0.1 + 1e-9, `a step of ${(h - prev).toFixed(3)} m at ${x},${z}`);
          prev = h;
          // level within 2 m of the hall wall and of the cell edge
          const toHall = ax ? Math.min(Math.abs(t - hall.x0), Math.abs(t - hall.x1)) : Math.min(Math.abs(t - hall.z0), Math.abs(t - hall.z1));
          const toEdge = ax ? Math.min(t - i * CELL2, (i + 1) * CELL2 - t) : Math.min(t - j * CELL2, (j + 1) * CELL2 - t);
          if (toHall < 2 || toEdge < 2) assert.equal(h, 0, `not level at ${x},${z}`);
        }
      }
    }
  }
  assert.ok(sloped >= all * 0.2, `${sloped} of ${all} corridors slope`);
});

test('a split cuts the hall in two; a body crosses it down one ladder, over the shaft floor and up the other', () => {
  let splits = 0;
  for (const s of SEEDS) {
    const w = new World2(s);
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j);
      for (const v of plan.voids.filter((q) => q.kind === 'split')) {
        splits++;
        const hall = plan.rooms.find((o) => o.id === v.over), ax = v.run === 'x', g = (v.gap[0] + v.gap[1]) / 2;
        // wall to wall: no 1F floor anywhere across it
        const c0 = ax ? v.z0 : v.x0, c1 = ax ? v.z1 : v.x1;
        for (let t = (ax ? hall.x0 : hall.z0) + 0.25; t < (ax ? hall.x1 : hall.z1); t += 0.5) {
          const [x, z] = ax ? [t, (c0 + c1) / 2] : [(c0 + c1) / 2, t];
          assert.equal(w.surfaceAt(x, z, 0), null, `seed ${s}: hall floor across the split at ${x},${z}`);
        }
        // walk it: stand 1 m before the first ladder's top, push forward until up on the far side
        const P = (cc) => (ax ? [g, cc] : [cc, g]), yaw = ax ? Math.PI : -Math.PI / 2;   // facing +z or +x, across the split
        const p = new Player();
        p.reset(...P(c0 - 1), yaw, 0);
        let climbed = 0;
        for (let t = 0; t < 40 && !(p.floorH === 0 && (ax ? p.z : p.x) > c1 + 0.3); t += 1 / 30) {
          p.update(w, 1 / 30, { x: 0, z: 1, run: false });
          if (p.climbing) climbed++;
        }
        assert.ok(climbed > 0 && p.floorH === 0 && (ax ? p.z : p.x) > c1, `seed ${s} cell ${i},${j}: stuck at ${p.x.toFixed(2)},${p.z.toFixed(2)} h ${p.floorH.toFixed(2)}`);
      }
    }
  }
  assert.ok(splits >= 5, `${splits} splits`);
});

// giant halls: two neighbouring cells (2m, 2m+1 in a row) sometimes hold one hall, 60–100 m long, that runs on over the cell edge
const GIANTS = [];
for (const s of SEEDS) for (let j = -3; j <= 3; j++) for (let m = -4; m <= 3; m++) GIANTS.push([s, 2 * m, j]);

test('giant halls: one open hall across the cell edge, 60–100 m, the same whichever cell is planned first', () => {
  let pairs = 0;
  for (const [s, i, j] of GIANTS) {
    const w = new World2(s), v = new World2(s);
    const A = w.plan(i, j), B = w.plan(i + 1, j);
    assert.equal(!!A.mega, !!B.mega, `seed ${s} cell ${i},${j}: only one of the two cells is giant`);
    if (!A.mega) continue;
    pairs++;
    const ha = A.rooms[0], hb = B.rooms[0], seam = (i + 1) * CELL2;
    assert.equal(ha.x1, seam); assert.equal(hb.x0, seam);
    assert.equal(ha.z0, hb.z0); assert.equal(ha.z1, hb.z1); assert.equal(ha.ceil, hb.ceil);
    const len = hb.x1 - ha.x0;
    assert.ok(len >= 2 * GIANT_ARM[0] && len >= 60 && len <= 100, `seed ${s} cell ${i},${j}: ${len} m long`);
    assert.ok(ha.x0 >= i * CELL2 + 2 && hb.x1 <= (i + 2) * CELL2 - 2, 'a hall leaves 2 m to the far cell edges');
    for (const p of [A, B]) assert.ok(!p.rooms.some((o) => o.kind === 'corridor' && o.x0 <= seam && o.x1 >= seam), 'a corridor runs through the open seam');
    // built the other way round, or after the cache dropped it: the same plan
    assert.equal(JSON.stringify(v.plan(i + 1, j)), JSON.stringify(B));
    assert.equal(JSON.stringify(v.plan(i, j)), JSON.stringify(A));
  }
  assert.ok(pairs >= 8, `${pairs} giant halls`);
});

// every giant hall (each half: its 1F hall) holds at least one pool, always clear of the seam
test('giant halls: every half holds a pool, and no pool reaches the seam', () => {
  let halves = 0;
  for (const [s, i, j] of GIANTS) {
    const w = new World2(s), A = w.plan(i, j);
    if (!A.mega) continue;
    const seam = (i + 1) * CELL2;
    for (const plan of [A, w.plan(i + 1, j)]) {
      const hall = plan.rooms[0], pools = plan.pools.filter((p) => p.lv === 0 && p.room === hall.id);
      halves++;
      assert.ok(pools.length >= 1, `seed ${s} cell ${plan.i},${plan.j}: a giant hall without a pool`);
      for (const p of pools) assert.ok(Math.abs(p.shape.cx - seam) - p.shape.hw >= POOL_MARGIN - 1e-9, `seed ${s} cell ${plan.i},${plan.j}: a pool reaches the seam`);
    }
  }
  assert.ok(halves >= 16, `${halves} giant halves`);
});

// a fixed, reproducible sample: the first giant halls of each kind (negative cells, with a flight, a void, a window, a pool at the stair)
function giantSample() {
  const kinds = {
    plain: (A, B) => true,
    negative: (A) => A.i < 0,
    flight: (A, B) => A.flights.length + B.flights.length > 0,
    voids: (A, B) => A.voids.length + B.voids.length > 0,
    window: (A, B) => A.windows.length + B.windows.length > 0,
  }, out = [], taken = new Map();
  for (const [s, i, j] of GIANTS) {
    const w = new World2(s), A = w.plan(i, j), B = w.plan(i + 1, j);
    if (!A.mega) continue;
    for (const [k, f] of Object.entries(kinds)) if ((taken.get(k) || 0) < 2 && f(A, B)) { taken.set(k, (taken.get(k) || 0) + 1); out.push([s, i, j, k]); break; }
  }
  return { out, taken };
}

test('giant halls: a body walks the whole length and back, and in and out of the corridors on every side', () => {
  const { out, taken } = giantSample();
  for (const k of ['plain', 'negative', 'flight', 'voids', 'window']) assert.ok(taken.get(k) >= 1, `no giant hall of kind ${k} in the sample`);
  for (const [s, i, j, kind] of out) {
    const w = new World2(s), A = w.plan(i, j), B = w.plan(i + 1, j), ha = A.rooms[0], hb = B.rooms[0], seam = (i + 1) * CELL2, oz = j * CELL2;
    const box = [i * CELL2 + 0.25, oz + 0.25, (i + 2) * CELL2 - 0.25, oz + CELL2 - 0.25];
    const at = (set, f) => set.find(([x, z, h]) => f(x, z) && h === 0);
    // from the middle of the west half's seam end: the far end, both seam sides, and every corridor mouth at the cell edges
    const start = [seam - 1.25, Math.round((ha.z0 + ha.z1) / 2) + 0.25, 0];
    const set = reachSet(w, ...box, w.surfaceAt(start[0], start[1], 0) ? start : [seam + 1.25, start[1], 0]);
    const tag = `seed ${s} cell ${i},${j} (${kind})`;
    assert.ok(at(set, (x) => x > hb.x1 - 2.5), `${tag}: the east end is out of reach`);
    assert.ok(at(set, (x) => x < ha.x0 + 2.5), `${tag}: the west end is out of reach`);
    assert.ok(at(set, (x) => x > seam + 0.5 && x < seam + 1.5) && at(set, (x) => x < seam - 0.5 && x > seam - 1.5), `${tag}: a side of the seam is out of reach`);
    assert.ok(at(set, (x) => x === box[0]), `${tag}: the west edge is shut`);
    assert.ok(at(set, (x) => x === box[2]), `${tag}: the east edge is shut`);
    for (const [name, f, dj] of [['north', (x, z) => z === box[1], -1], ['south', (x, z) => z === box[3], 0]]) {
      // an edge its district closed has no corridor
      if (w.connectionOf(i, j + dj, 'z').mode !== 'closed') assert.ok(at(set, (x, z) => f(x, z) && x < seam), `${tag}: the ${name} corridor of the west cell is shut`);
      if (w.connectionOf(i + 1, j + dj, 'z').mode !== 'closed') assert.ok(at(set, (x, z) => f(x, z) && x > seam), `${tag}: the ${name} corridor of the east cell is shut`);
    }
    // and back from the far end
    const far = at(set, (x) => x > hb.x1 - 2.5), back = reachSet(w, ...box, far);
    assert.ok(at(back, (x) => x < ha.x0 + 2.5), `${tag}: no way back`);
  }
});

test('giant halls: the same plan after the cache has dropped it', () => {
  let checked = 0;
  for (const [s, i, j] of GIANTS) {
    const w = new World2(s), A = w.plan(i, j);
    if (!A.mega || checked >= 3) continue;
    const first = JSON.stringify([A, w.plan(i + 1, j)]);
    for (let k = 0; k < 450; k++) w.plan(100 + k, 40);   // more than the cache holds
    assert.equal(w.plans.has(i + ',' + j), false, 'the plan is still cached');
    assert.equal(JSON.stringify([w.plan(i, j), w.plan(i + 1, j)]), first, `seed ${s} cell ${i},${j}: rebuilt plan differs`);
    checked++;
  }
  assert.equal(checked, 3);
});

test('giant halls: every corridor opens into its half, and the two halves are one floor, one ceiling across the cell edge', () => {
  let pairs = 0;
  for (const [s, i, j] of GIANTS) {
    const w = new World2(s), A = w.plan(i, j), B = w.plan(i + 1, j);
    if (!A.mega) continue;
    pairs++;
    for (const plan of [A, B]) {
      const h = plan.rooms[0];
      for (const c of plan.rooms.filter((o) => o.kind === 'corridor')) {
        const ovx = Math.min(c.x1, h.x1) - Math.max(c.x0, h.x0), ovz = Math.min(c.z1, h.z1) - Math.max(c.z0, h.z0);
        const alongX = c.x1 - c.x0 > c.z1 - c.z0;
        if ((c.routeId || c.diagId) && (ovx <= 0 || ovz <= 0)) continue;   // a turning or diagonal corridor's pieces away from the hall
        assert.ok(alongX ? ovx >= 0.99 && ovz >= c.z1 - c.z0 - 1e-9 : ovz >= 0.99 && ovx >= c.x1 - c.x0 - 1e-9, `seed ${s} cell ${plan.i},${plan.j}: a corridor does not open into the giant hall`);
      }
    }
    // the raster of each cell, which the walls and ceilings are drawn from: no wall and no ceiling step on the seam
    const RA = cellRaster(w, i, j, 0), RB = cellRaster(w, i + 1, j, 0), n = RA.n, ha = A.rooms[0];
    for (let b = 0; b < n; b++) {
      const z = RA.oz + (b + 0.5) * Q2;
      if (z < ha.z0 || z >= ha.z1) continue;
      assert.equal(RA.inside[b * n + n - 1], 1); assert.equal(RB.inside[b * n], 1);
      assert.equal(RA.ceil[b * n + n - 1], RB.ceil[b * n], `seed ${s} cell ${i},${j}: a ceiling step on the seam`);
    }
  }
  assert.ok(pairs >= 8);
});

test('giant halls: the lamps run on one grid across the seam, none missing next to it', () => {
  let checked = 0;
  for (const [s, i, j] of GIANTS) {
    const w = new World2(s), A = w.plan(i, j), B = w.plan(i + 1, j);
    if (!A.mega) continue;
    const m = A.mega, own = (cx) => (cx < m.seam ? A : B).rooms[0].lamps;
    for (let cx = m.x0 + m.step / 2; cx < m.x1; cx += m.step) {
      if (Math.abs(cx - m.seam) > 3) continue;
      for (let cz = m.z0 + m.step / 2; cz < m.z1 - 0.6; cz += m.step) {
        checked++;
        assert.ok(own(cx).some((l) => Math.abs(l.x + 0.6 - cx) < 1e-6 && Math.abs(l.z + 0.6 - cz) < 1e-6), `seed ${s} cell ${i},${j}: no lamp at ${cx},${cz}`);
      }
    }
  }
  assert.ok(checked >= 20, `${checked} lamps checked`);
});

// ---------- shared spaces: one hall owned once, drawn and walked in every cell it covers ----------
// a giant hall's two halves and an L hall's three parts are pieces of one space: the same id, owner and ceiling from every cell

test('shared spaces: a giant hall is one space with one owner, the same whichever cell is planned first', () => {
  let pairs = 0;
  for (const [s, i, j] of GIANTS) {
    const w = new World2(s), v = new World2(s), A = w.plan(i, j);
    if (!A.mega) continue;
    pairs++;
    const B = w.plan(i + 1, j), ha = primaryHall(A), hb = primaryHall(B);
    assert.ok(ha.spaceId && ha.spaceId === hb.spaceId, `seed ${s} cell ${i},${j}: halves ${ha.spaceId} / ${hb.spaceId}`);
    const sp = w.spaceOf(i, j);
    assert.deepEqual(sp.owner, { i, j }, 'the west cell owns a giant hall');
    assert.equal(sp.shape, 'rect');
    assert.equal(JSON.stringify(v.spaceOf(i + 1, j)), JSON.stringify(sp), 'the east cell sees the same space');
    assert.deepEqual(sp.parts.map((p) => [p.x0, p.x1, p.z0, p.z1]), [[ha.x0, ha.x1, ha.z0, ha.z1], [hb.x0, hb.x1, hb.z0, hb.z1]]);
  }
  assert.ok(pairs >= 8, `${pairs} giant halls`);
});

test('shared spaces: every cell has one primary hall found by id, not by its place in the room list', () => {
  for (const s of SEEDS) {
    const w = new World2(s);
    for (const [i, j] of CELLS) {
      const plan = w.plan(i, j), h = primaryHall(plan);
      assert.ok(h && h.kind === 'hall' && h.lv === 0 && h.id === plan.primaryHallId, `seed ${s} cell ${i},${j}`);
      assert.ok(h.spaceId, `seed ${s} cell ${i},${j}: a hall without a space id`);
    }
  }
});

// every L hall over the districts of the sample: the space, its three cells and the fourth
const LS = [];
for (const s of SEEDS) {
  const w = new World2(s);
  for (let b = -3; b <= 2; b++) for (let a = -3; a <= 2; a++) {
    const sp = w.spaceOf?.(2 * a, 2 * b) ?? w.spaceOf?.(2 * a + 1, 2 * b + 1);
    if (sp?.shape === 'L') LS.push({ s, a, b, sp });
  }
}
// the openings between the parts of a space: where two parts in edge-neighbouring cells meet on their shared cell edge
function openings(sp) {
  const out = [];
  for (const P of sp.parts) for (const Q of sp.parts) {
    if (Q.i === P.i + 1 && Q.j === P.j && P.x1 === Q.x0) out.push({ axis: 'x', at: P.x1, lo: Math.max(P.z0, Q.z0), hi: Math.min(P.z1, Q.z1), P, Q });
    if (Q.j === P.j + 1 && Q.i === P.i && P.z1 === Q.z0) out.push({ axis: 'z', at: P.z1, lo: Math.max(P.x0, Q.x0), hi: Math.min(P.x1, Q.x1), P, Q });
  }
  return out;
}

test('L halls: some districts hold one L-shaped hall over three of their four cells, open across both inner cell edges', () => {
  assert.ok(LS.length >= 6, `${LS.length} L halls`);
  for (const { s, a, b, sp } of LS) {
    const w = new World2(s), tag = `seed ${s} district ${a},${b}`;
    assert.equal(sp.cells.length, 3, tag);
    assert.deepEqual(sp.owner, { i: 2 * a, j: 2 * b }, `${tag}: the district's anchor cell owns it`);
    const cells = sp.cells.map((c) => c.i + ',' + c.j);
    for (const c of sp.cells) {
      assert.ok(Math.floor(c.i / 2) === a && Math.floor(c.j / 2) === b, `${tag}: cell ${c.i},${c.j} is outside the district`);
      const h = primaryHall(w.plan(c.i, c.j)), part = sp.parts.find((p) => p.i === c.i && p.j === c.j);
      assert.equal(h.spaceId, sp.spaceId, `${tag}: cell ${c.i},${c.j}`);
      assert.deepEqual([h.x0, h.x1, h.z0, h.z1], [part.x0, part.x1, part.z0, part.z1], `${tag}: cell ${c.i},${c.j} holds its own part`);
      assert.ok(h.x0 >= c.i * CELL2 && h.x1 <= (c.i + 1) * CELL2 && h.z0 >= c.j * CELL2 && h.z1 <= (c.j + 1) * CELL2, `${tag}: a part leaves its cell`);
      assert.equal(h.ceil, sp.ceil, `${tag}: one ceiling`);
      assert.equal(JSON.stringify(new World2(s).spaceOf(c.i, c.j)), JSON.stringify(sp), `${tag}: cell ${c.i},${c.j} sees another space`);
    }
    // the fourth cell keeps a hall of its own
    const [fi, fj] = [[2 * a, 2 * b], [2 * a + 1, 2 * b], [2 * a, 2 * b + 1], [2 * a + 1, 2 * b + 1]].find(([i, j]) => !cells.includes(i + ',' + j));
    assert.notEqual(primaryHall(w.plan(fi, fj)).spaceId, sp.spaceId, `${tag}: the fourth cell is in the L`);
    assert.equal(w.spaceOf(fi, fj), null, `${tag}: the fourth cell has a shared space`);
    // two openings, each wide enough to walk through side by side, and no corridor through either
    const ops = openings(sp);
    assert.equal(ops.length, 2, `${tag}: ${ops.length} openings`);
    for (const o of ops) {
      assert.ok(o.hi - o.lo >= 16, `${tag}: an opening only ${o.hi - o.lo} m wide`);
      for (const c of sp.cells) for (const r of w.plan(c.i, c.j).rooms) {
        if (r.kind !== 'corridor') continue;
        const crosses = o.axis === 'x' ? r.x0 <= o.at && r.x1 >= o.at && r.z1 > o.lo && r.z0 < o.hi : r.z0 <= o.at && r.z1 >= o.at && r.x1 > o.lo && r.x0 < o.hi;
        assert.ok(!crosses, `${tag}: a corridor runs through an opening`);
      }
    }
  }
});

test('L halls: no wall and no ceiling step across an opening; the cells next to an opening keep it clear of flights, pools, voids, windows and columns', () => {
  for (const { s, a, b, sp } of LS) {
    const w = new World2(s), tag = `seed ${s} district ${a},${b}`;
    for (const o of openings(sp)) {
      const RP = cellRaster(w, o.P.i, o.P.j, 0), RQ = cellRaster(w, o.Q.i, o.Q.j, 0), n = RP.n;
      for (let t = 0; t < n; t++) {
        const c = (o.axis === 'x' ? RP.oz : RP.ox) + (t + 0.5) * Q2;
        if (c < o.lo || c >= o.hi) continue;
        const kp = o.axis === 'x' ? t * n + n - 1 : (n - 1) * n + t, kq = o.axis === 'x' ? t * n : t;
        assert.equal(RP.inside[kp] && RQ.inside[kq], 1, `${tag}: a wall across the opening at ${c}`);
        assert.equal(RP.ceil[kp], RQ.ceil[kq], `${tag}: a ceiling step across the opening at ${c}`);
      }
      // the 2 m either side of the opening is open floor
      const strip = o.axis === 'x' ? { x0: o.at - 2, x1: o.at + 2, z0: o.lo, z1: o.hi } : { z0: o.at - 2, z1: o.at + 2, x0: o.lo, x1: o.hi };
      const hit = (r) => r.x0 < strip.x1 && strip.x0 < r.x1 && r.z0 < strip.z1 && strip.z0 < r.z1;
      for (const plan of [w.plan(o.P.i, o.P.j), w.plan(o.Q.i, o.Q.j)]) {
        assert.ok(!plan.flights.some((f) => hit(f) || hit(f.hallEntry)), `${tag}: a flight at an opening`);
        assert.ok(!plan.pools.some((p) => p.lv === 0 && hit({ x0: p.shape.cx - p.shape.hw, x1: p.shape.cx + p.shape.hw, z0: p.shape.cz - p.shape.hd, z1: p.shape.cz + p.shape.hd })), `${tag}: a pool at an opening`);
        assert.ok(!plan.voids.some((v) => v.lv === -1 && hit({ x0: v.x0 - PARAPET, x1: v.x1 + PARAPET, z0: v.z0 - PARAPET, z1: v.z1 + PARAPET })), `${tag}: a void at an opening`);
        assert.ok(!plan.windows.some((wn) => hit(wn.front)), `${tag}: a window at an opening`);
        assert.ok(!plan.columns.some((c) => c.lv === 0 && hit({ x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r })), `${tag}: a column at an opening`);
      }
    }
  }
});

test('L halls: every lamp hangs under the hall: inside its part, or across an opening into the next part, never over a wall', () => {
  let lamps = 0;
  for (const { s, a, b, sp } of LS) {
    const w = new World2(s);
    for (const c of sp.cells) for (const l of primaryHall(w.plan(c.i, c.j)).lamps) {
      lamps++;
      for (const [x, z] of [[l.x + 1e-3, l.z + 1e-3], [l.x + l.w - 1e-3, l.z + 1e-3], [l.x + 1e-3, l.z + l.d - 1e-3], [l.x + l.w - 1e-3, l.z + l.d - 1e-3]]) {
        assert.equal(w.roomAt(0, x, z)?.spaceId, sp.spaceId, `seed ${s} district ${a},${b} cell ${c.i},${c.j}: a lamp corner at ${x},${z} is outside the hall`);
      }
    }
  }
  assert.ok(lamps >= 500, `${lamps} lamps`);
});

test('L halls: a body walks from one arm through the corner to the other arm and back', () => {
  for (const { s, a, b, sp } of LS.filter((l, k) => k % 4 === 0)) {   // every fourth: a walk is slow
    const w = new World2(s), tag = `seed ${s} district ${a},${b}`, X = 2 * a * CELL2, Z = 2 * b * CELL2;
    const box = [X + 0.25, Z + 0.25, X + 2 * CELL2 - 0.25, Z + 2 * CELL2 - 0.25];
    const ops = openings(sp), corner = sp.parts.find((p) => ops.every((o) => o.P === p || o.Q === p));
    const arms = sp.parts.filter((p) => p !== corner);
    // a dry standing point well inside each arm, as far from the corner as it reaches
    const inArm = (p) => {
      const far = (o) => (o.P === p ? -1 : 1), o = ops.find((q) => q.P === p || q.Q === p);
      for (let d = 30; d >= 3; d -= 0.5) for (let t = 0.25; t < o.hi - o.lo; t += 0.5) {
        const along = o.at + far(o) * d, across = o.lo + t, [x, z] = o.axis === 'x' ? [along, across] : [across, along];
        if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1 && new Player().canStand(w, x, z, 0) && w.surfaceAt(x, z, 0)?.h === 0) return [x, z, 0];
      }
      return null;
    };
    const [p0, p1] = arms.map(inArm);
    assert.ok(p0 && p1, `${tag}: no dry floor in an arm`);
    const snapTo = (pt, st) => [st[0] + Math.round((pt[0] - st[0]) / 0.5) * 0.5, st[1] + Math.round((pt[1] - st[1]) / 0.5) * 0.5];
    const there = reachSet(w, ...box, p0), [qx, qz] = snapTo(p1, p0);
    assert.ok([...there.values()].some(([x, z, h]) => x === qx && z === qz && h === 0), `${tag}: the second arm is out of reach`);
    const back = reachSet(w, ...box, [qx, qz, 0]);
    assert.ok([...back.values()].some(([x, z, h]) => x === p0[0] && z === p0[1] && h === 0), `${tag}: no way back`);
  }
});

test('L halls: a body walks in from an ordinary corridor at the edge of the district, through both openings, and back out', () => {
  const lat = (v) => Math.floor(v * 2) / 2 + 0.25;   // the walk's lattice: 0.25 off the half metres, like the box edges
  for (const { s, a, b, sp } of LS.filter((l, k) => k % 4 === 2 || (l.s === 42 && l.a === 2 && l.b === -1))) {
    const w = new World2(s), tag = `seed ${s} district ${a},${b}`, X = 2 * a * CELL2, Z = 2 * b * CELL2;
    const box = [X + 0.25, Z + 0.25, X + 2 * CELL2 - 0.25, Z + 2 * CELL2 - 0.25];
    // where the hall's cells' ordinary corridors run out through the edge of the district (two per cell)
    const ends = [];
    for (const c of sp.cells) for (const r of w.plan(c.i, c.j).rooms) {
      if (r.kind !== 'corridor' && r.kind !== 'connector-room' || r.lv !== 0) continue;   // a connector room takes a corridor's end
      const cx = lat((r.x0 + r.x1) / 2), cz = lat((r.z0 + r.z1) / 2);
      if (r.x0 === X) ends.push([box[0], cz]);
      if (r.x1 === X + 2 * CELL2) ends.push([box[2], cz]);
      if (r.z0 === Z) ends.push([cx, box[1]]);
      if (r.z1 === Z + 2 * CELL2) ends.push([cx, box[3]]);
    }
    assert.equal(ends.length, 6, `${tag}: ${ends.length} corridors out of the district`);
    const start = [...ends[0], w.surfaceAt(...ends[0], 0).h], set = reachSet(w, ...box, start);
    const inPart = (p) => ([x, z, h]) => h === 0 && x > p.x0 + 1 && x < p.x1 - 1 && z > p.z0 + 1 && z < p.z1 - 1 && w.roomAt(0, x, z)?.spaceId === sp.spaceId;
    for (const p of sp.parts) assert.ok(set.some(inPart(p)), `${tag}: the part in cell ${p.i},${p.j} is out of reach from the corridor at ${ends[0]}`);
    for (const e of ends) assert.ok(set.some(([x, z]) => x === e[0] && z === e[1]), `${tag}: the corridor at ${e} is shut`);
    // and back out from the part farthest from the way in
    const far = sp.parts.map((p) => [Math.hypot((p.x0 + p.x1) / 2 - start[0], (p.z0 + p.z1) / 2 - start[1]), p]).sort((u, v) => v[0] - u[0])[0][1];
    const back = reachSet(w, ...box, set.find(inPart(far)));
    assert.ok(back.some(([x, z]) => x === start[0] && z === start[1]), `${tag}: no way back out to the corridor at ${ends[0]}`);
  }
});

test('connector rooms: a body walks from one hall down the short corridor, through the room across the edge, into the next hall and back', () => {
  let walked = 0;
  for (const s of SEEDS) {
    const w = new World2(s);
    let c = null;
    for (let j = -3; j <= 2 && !c; j++) for (let i = -3; i <= 2 && !c; i++) for (const axis of ['x', 'z']) {
      if (!c && w.connectionOf(i, j, axis).mode === 'connector-room') c = w.connectionOf(i, j, axis);
    }
    if (!c) continue;
    const X = c.axis === 'x', [A, B] = c.parts, tag = `seed ${s} ${c.id}`;
    const hA = primaryHall(w.plan(A.i, A.j)), hB = primaryHall(w.plan(B.i, B.j)), mid = (X ? A.z0 + A.z1 : A.x0 + A.x1) / 2 + 0.25;
    const box = [A.i * CELL2 + 0.25, A.j * CELL2 + 0.25, (B.i + 1) * CELL2 - 0.25, (B.j + 1) * CELL2 - 0.25];
    // just inside each hall, on the corridors' middle line
    const p0 = X ? [hA.x1 - 1.25, mid, 0] : [mid, hA.z1 - 1.25, 0], p1 = X ? [hB.x0 + 1.25, mid] : [mid, hB.z0 + 1.25];
    const there = reachSet(w, ...box, p0);
    assert.ok(there.some(([x, z, h]) => x === p1[0] && z === p1[1] && h === 0), `${tag}: the next hall is out of reach`);
    const back = reachSet(w, ...box, [...p1, 0]);
    assert.ok(back.some(([x, z, h]) => x === p0[0] && z === p0[1] && h === 0), `${tag}: no way back`);
    walked++;
  }
  assert.ok(walked >= 5, `${walked} walks`);
});

test('L halls: the same space and plans after the cache has dropped them, negative districts included', () => {
  const neg = LS.find((l) => l.a < 0 && l.b < 0) ?? LS.find((l) => l.a < 0 || l.b < 0);
  assert.ok(neg, 'no L hall in a negative district');
  const w = new World2(neg.s), cells = neg.sp.cells, first = JSON.stringify([w.spaceOf(cells[0].i, cells[0].j), ...cells.map((c) => w.plan(c.i, c.j))]);
  for (let k = 0; k < 450; k++) w.plan(100 + k, 40);
  for (const c of cells) assert.equal(w.plans.has(c.i + ',' + c.j), false, 'the plan is still cached');
  assert.equal(JSON.stringify([w.spaceOf(cells[0].i, cells[0].j), ...cells.map((c) => w.plan(c.i, c.j))]), first);
});

// ---------- switchbacks: two legs side by side, a landing across both, a way in and out at the same end ----------
const SWITCHES = SEEDS.flatMap((s) => { const w = new World2(s); return CELLS.flatMap(([i, j]) => w.plan(i, j).flights.filter((f) => f.turn).map((f) => ({ s, w, i, j, f }))); });
const swAxis = (f, d) => { const a0 = f.axis === 'x' ? f.x0 : f.z0, a1 = f.axis === 'x' ? f.x1 : f.z1; return f.dir > 0 ? a0 + d : a1 - d; };   // distance from the entry end → axis position
const swXZ = (f, a, c) => (f.axis === 'x' ? [a, c] : [c, a]);
const swLanes = (f) => { const c0 = f.axis === 'x' ? f.z0 : f.x0; return { cA: c0 + 0.25 + 1.5, cB: c0 + SWITCH_W - 0.25 - 1.5, mid: c0 + SWITCH_W / 2 }; };

test('switchbacks: made in both directions, two legs each climbing half the way, a flat landing, a wall between the legs', () => {
  assert.ok(SWITCHES.length >= 20, `${SWITCHES.length} switchbacks`);
  assert.ok(SWITCHES.some(({ f }) => f.hi > 0) && SWITCHES.some(({ f }) => f.lo < 0), 'both up and down');
  for (const { s, i, j, f } of SWITCHES) {
    const tag = `seed ${s} cell ${i},${j}`, { cA, cB, mid } = swLanes(f), half = (f.yF - f.yE) / 2, len = (f.axis === 'x' ? f.x1 - f.x0 : f.z1 - f.z0);
    assert.equal(f.axis === 'x' ? f.z1 - f.z0 : f.x1 - f.x0, SWITCH_W);
    assert.ok(Math.abs(half) / f.Lg >= 0.5 && Math.abs(half) / f.Lg <= 0.7, `${tag}: slope ${Math.abs(half) / f.Lg}`);
    const h = (d, c) => switchH(f, ...swXZ(f, swAxis(f, d), c));
    assert.ok(Math.abs(h(0.01, cA) - f.yE) < 0.05 && Math.abs(h(0.01, cB) - f.yF) < 0.05, `${tag}: the entry end's two floors`);
    let a = h(0, cA), b = h(f.Lg, cB);
    for (let d = 0.25; d <= f.Lg; d += 0.25) {   // leg A away from the entry, leg B back towards it: each only ever moves one way
      const na = h(d, cA), nb = h(f.Lg - d, cB);
      assert.ok((na - a) * half >= -1e-9 && (nb - b) * half >= -1e-9, `${tag}: a leg turns back`);
      a = na; b = nb;
    }
    for (let d = f.Lg; d < len; d += 0.25) for (const c of [cA, mid, cB]) assert.ok(Math.abs(h(d, c) - (f.yE + half)) < 1e-9, `${tag}: the landing is not level`);
    for (let d = 0.25; d < f.Lg - 0.25; d += 0.5) assert.ok(switchWall(f, ...swXZ(f, swAxis(f, d), mid)), `${tag}: no wall between the legs at ${d}`);
    for (let d = f.Lg + 0.25; d < len; d += 0.5) assert.ok(!switchWall(f, ...swXZ(f, swAxis(f, d), mid)), `${tag}: a wall across the landing`);
  }
});

test('switchbacks: a body goes in at the hall, round the landing, out into the far room, and back; it cannot cut through the wall', () => {
  let walked = 0;
  const steer = (p, w, targets) => {
    for (const [tx, tz] of targets) for (let t = 0; t < 10 && Math.hypot(tx - p.x, tz - p.z) > 0.35; t += DT) {
      p.yaw = Math.atan2(-(tx - p.x), -(tz - p.z));
      p.update(w, DT, { x: 0, z: 1, run: false });
    }
  };
  const seen = new Set();
  for (const { s, i, j, f, w } of SWITCHES) {
    const key = `${f.lo < 0 ? 'down' : 'up'}${f.dir}${f.axis}`;
    if (seen.has(key) && walked >= 8) continue;
    seen.add(key);
    const { cA, cB } = swLanes(f), pt = (d, c) => swXZ(f, swAxis(f, d), c), tag = `seed ${s} cell ${i},${j} (${key})`;
    const there = [pt(-1, cA), pt(f.Lg + 1, cA), pt(f.Lg + 1, cB), pt(1, cB), pt(-1.5, cB)], back = there.slice(0, -1).reverse().concat([pt(-1, cA)]);
    const p = new Player();
    p.reset(...there[0], 0, 0);
    p.settle(w, 0);
    assert.equal(p.floorH, 0, `${tag}: the way in is on 1F`);
    steer(p, w, there.slice(1));
    const far = f.hi === 0 ? f.lo : f.hi;
    assert.ok(p.floorH <= w.Y[far] + 0.01 && p.floorH >= w.Y[far] - WADE_MAX, `${tag}: reached ${p.floorH}, want ${w.Y[far]}`);
    steer(p, w, back);
    assert.ok(Math.abs(p.floorH) < 0.01, `${tag}: back at ${p.floorH}`);
    // from leg A 0.6 m short of the landing straight across to leg B (the two floors differ by less than a step there: only the wall stops it)
    const q = new Player();
    q.reset(...pt(f.Lg - 0.6, cA), 0, 0);
    q.settle(w, 0);
    const h0 = q.floorH;
    steer(q, w, [pt(f.Lg - 0.6, cB)]);
    assert.ok(Math.abs((f.axis === 'x' ? q.z : q.x) - cB) > 1.5 && Math.abs(q.floorH - h0) < 0.5, `${tag}: walked through the wall between the legs`);
    walked++;
  }
  assert.ok(walked >= 8, `${walked} switchbacks walked`);
});

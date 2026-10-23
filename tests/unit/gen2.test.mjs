// Inner layer: generator v2 prototype — whole pool shapes, stacked floors joined by flights, walking with the real Player.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2, CELL2, CURVE_SEG, WADE_MAX, POOL_MARGIN, shapeContains, shapeOutline, poolDepth, poolBands, STEP_RISE, COL_CLEAR, flightH } from '../../js/gen2.js';
import { Player } from '../../js/player.js';

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

test('pool floors are flat or slope one way: never deeper in the middle than at both ends', () => {
  let slopes = 0;
  for (const { p } of allPools()) {
    const s = p.shape;
    assert.ok(Math.min(p.d0, p.d1) >= 0.3, 'too shallow to read as a pool');
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
    for (let k = 1; k < bands.length; k++) assert.ok(Math.abs(bands[k].depth - bands[k - 1].depth) <= STEP_RISE + 1e-9, 'a riser too high to climb');
    // inside a band the floor is level: the depth there is the band's
    for (const b of bands) for (const q of b.polys) {
      const cx = q.reduce((s, v) => s + v[0], 0) / q.length, cz = q.reduce((s, v) => s + v[1], 0) / q.length;
      if (shapeContains(p.shape, cx, cz) && pip(q, cx, cz)) assert.ok(Math.abs(poolDepth(p, cx, cz) - b.depth) < 1e-9);
    }
  }
  assert.ok(stepped > 3, `${stepped} stepped pools`);
});

test('pools keep a dry walkway to every wall, clear of flights and of each other', () => {
  for (const { p, plan } of allPools()) {
    const room = plan.rooms.find((o) => o.id === p.room), s = p.shape;
    const m = room.kind === 'basement' ? 1.5 : POOL_MARGIN;
    assert.ok(s.cx - s.hw >= room.x0 + m - 1e-9 && s.cx + s.hw <= room.x1 - m + 1e-9 && s.cz - s.hd >= room.z0 + m - 1e-9 && s.cz + s.hd <= room.z1 - m + 1e-9);
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
        if (o.kind === 'corridor') continue;
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
  assert.ok(withCols > rooms * 0.2 && withCols < rooms * 0.8, `${withCols} of ${rooms} rooms have columns`);
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
        stacked++;
        assert.ok(w.Y[a.lv] + a.ceil + 0.5 <= w.Y[b.lv], `${a.kind} ceiling into ${b.kind}`);
      }
      for (const o of rooms) {
        assert.ok(o.x0 >= i * CELL2 && o.x1 <= (i + 1) * CELL2 && o.z0 >= j * CELL2 && o.z1 <= (j + 1) * CELL2, 'room leaves its cell');
        assert.ok(o.ceil >= 2.2 && o.ceil <= 6, `ceiling ${o.ceil}`);
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
    for (const [i, j] of CELLS) for (const f of w.plan(i, j).flights) {
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

// lattice reach with the real body: (x, z, floor height) states 0.5 m apart, a move allowed when the Player could stand there
function reachSet(w, x0, z0, x1, z1, start) {
  const p = new Player(), seen = new Map(), q = [start];
  const key = (x, z, h) => `${x},${z},${Math.round(h * 4)}`;
  seen.set(key(...start), start);
  while (q.length) {
    const [x, z, h] = q.pop();
    for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < x0 || nz < z0 || nx > x1 || nz > z1) continue;
      p.x = x; p.z = z;
      if (!p.canStand(w, nx, nz, h)) continue;
      const nh = w.surfaceAt(nx, nz, h).h, k = key(nx, nz, nh);
      if (seen.has(k)) continue;
      const st = [nx, nz, nh];
      seen.set(k, st);
      q.push(st);
    }
  }
  return [...seen.values()];
}

test('from the hall every room of its cell is reachable, and the hall from every room', () => {
  for (const s of [1, 42]) {
    const w = new World2(s);
    for (const [i, j] of [[0, 0], [1, 0], [-1, 1], [2, -1], [0, 2]]) {
      const plan = w.plan(i, j), ox = i * CELL2, oz = j * CELL2, hall = plan.rooms[0];
      const box = [ox + 0.25, oz + 0.25, ox + CELL2 - 0.25, oz + CELL2 - 0.25];
      const start = [hall.x0 + 1.25, (hall.z0 + hall.z1) / 2 - ((hall.z0 + hall.z1) / 2) % 0.5 + 0.25, 0];
      const set = reachSet(w, ...box, w.surfaceAt(start[0], start[1], 0) ? start : [hall.x1 - 1.25, start[1], 0]);
      for (const o of plan.rooms) {
        const y = w.Y[o.lv];
        assert.ok(set.some(([x, z, h]) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && Math.abs(h - y) < WADE_MAX + 0.1), `seed ${s} cell ${i},${j}: ${o.kind} unreachable`);
        const at = set.find(([x, z, h]) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && h === y);
        const back = reachSet(w, ...box, at);
        assert.ok(back.some(([x, z, h]) => x > hall.x0 && x < hall.x1 && z > hall.z0 && z < hall.z1 && h === 0), `seed ${s} cell ${i},${j}: no way back from ${o.kind}`);
      }
      // the corridors reach the cell edge on all four sides
      for (const side of [[ox + 0.25, null], [ox + CELL2 - 0.25, null], [null, oz + 0.25], [null, oz + CELL2 - 0.25]]) {
        assert.ok(set.some(([x, z]) => (side[0] === null || x === side[0]) && (side[1] === null || z === side[1])), `seed ${s} cell ${i},${j}: an edge is shut`);
      }
    }
  }
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

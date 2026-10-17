// Inner layer: world generation invariants. Run: node --test tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, SPAWN, layoutHash } from '../../js/world.js';
import { CHUNK, FLOOR, WALL, SHALLOW, DEEP, walkable } from '../../js/tiles.js';

const SEEDS = [1, 2, 3, 42, 1234, 99999, 0xdeadbeef, 777, 31337, 2026];

test('same seed + same chunk → identical layout; different seed differs', () => {
  for (const seed of SEEDS) {
    const a = new World(seed), b = new World(seed);
    for (const [cx, cz] of [[0, 0], [3, -2], [-7, 5], [20, 20]]) {
      assert.equal(layoutHash(a.layout(cx, cz)), layoutHash(b.layout(cx, cz)));
    }
  }
  const a = new World(1), b = new World(2);
  let diff = 0;
  for (let i = 2; i < 12; i++) if (layoutHash(a.layout(i, i)) !== layoutHash(b.layout(i, i))) diff++;
  assert.ok(diff >= 5, `only ${diff}/10 chunks differ between seeds`);
});

test('zones and exit sit at the spec distances (after snapping to the chunk grid)', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const w = new World(seed);
    const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    let prev = SPAWN;
    w.zones.forEach((z, k) => {
      const dist = d(prev, z);
      const [lo, hi] = k === 0 ? [60, 90] : [120, 160];
      assert.ok(dist >= lo && dist <= hi, `seed ${seed} zone ${k} at ${dist.toFixed(1)} m`);
      prev = z;
    });
    const ex = d(prev, w.exit);
    assert.ok(ex >= 50 && ex <= 70, `seed ${seed} exit at ${ex.toFixed(1)} m`);
    assert.equal(w.items.length, 12);
  }
});

// (tile, level) reachability with the step rules applied at shared tile edges (stairs, upper floors, rails)
function bfsReach(w, fromX, fromZ, x0, z0, x1, z1) {
  const ok = w.reachFrom([[Math.floor(fromX), Math.floor(fromZ), 0]], x0, z0, x1, z1);
  return (x, z, lv) => (lv === undefined ? ok(Math.floor(x), Math.floor(z), 0) || ok(Math.floor(x), Math.floor(z), 1) : ok(Math.floor(x), Math.floor(z), lv));
}

test('every zone, item and the exit is reachable on foot from spawn', () => {
  for (const seed of SEEDS) {
    const w = new World(seed);
    const pts = [SPAWN, ...w.zones, w.exit, ...w.items];
    const x0 = Math.min(...pts.map((p) => p.x)) - 64, x1 = Math.max(...pts.map((p) => p.x)) + 64;
    const z0 = Math.min(...pts.map((p) => p.z)) - 64, z1 = Math.max(...pts.map((p) => p.z)) + 64;
    const reached = bfsReach(w, SPAWN.x, SPAWN.z, Math.floor(x0), Math.floor(z0), Math.ceil(x1), Math.ceil(z1));
    for (const it of w.items) assert.ok(reached(it.x, it.z), `seed ${seed} item ${it.id} unreachable`);
    assert.ok(reached(w.exit.x, w.exit.z), `seed ${seed} exit unreachable`);
    for (const z of w.zones) {
      let any = false;
      for (let dz = -16; dz < 16 && !any; dz++) for (let dx = -16; dx < 16 && !any; dx++) any = reached(z.x + dx, z.z + dz);
      assert.ok(any, `seed ${seed} zone ${z.index} unreachable`);
    }
  }
});

test('spawn can walk straight north 15 m (start area spine stays dry and open)', () => {
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (let z = SPAWN.z; z > SPAWN.z - 16; z--) {
      for (const x of [7, 8]) assert.equal(w.typeAt(x, Math.floor(z - 0.01)), FLOOR, `seed ${seed} blocked at ${x},${z}`);
    }
  }
});

test('items lie on dry floor inside their zone (ground or the upper floor)', () => {
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const it of w.items) {
      const tx = Math.floor(it.x), tz = Math.floor(it.z);
      assert.equal(it.up ? w.upTypeAt(tx, tz) : w.typeAt(tx, tz), FLOOR);
      assert.equal(it.h, it.up ? w.upHAt(tx, tz) : w.hAt(tx, tz));
      const z = w.zones[it.zone];
      assert.ok(it.x >= z.cx0 * CHUNK && it.x < (z.cx0 + 2) * CHUNK && it.z >= z.cz0 * CHUNK && it.z < (z.cz0 + 2) * CHUNK);
    }
  }
});

test('shallow water exists near spawn and deep water blocks walking', () => {
  const w = new World(5);
  assert.ok(w.findTile(SHALLOW, SPAWN.x, SPAWN.z, 12));
  assert.ok(!walkable(DEEP) && !walkable(WALL));
});

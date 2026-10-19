// Inner layer: body collision against real generated chunks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { FLOOR, CHUNK } from '../../js/tiles.js';
import { Player } from '../../js/player.js';

const DT = 1 / 60;
const run = (p, w, move, seconds) => { for (let t = 0; t < seconds; t += DT) p.update(w, DT, move); };

// every place where a flat floor tile drops 0.5–0.7 m (too high to climb, low enough to step off) to a flat floor
// tile with no rail between them
function dropEdges(w, cx0, cz0, n) {
  const out = [];
  for (let tz = cz0 * CHUNK; tz < (cz0 + n) * CHUNK; tz++) for (let tx = cx0 * CHUNK; tx < (cx0 + n) * CHUNK; tx++) {
    if (w.typeAt(tx, tz) !== FLOOR) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const drop = w.hAt(tx, tz) - w.hAt(tx + dx, tz + dz);
      if (w.typeAt(tx + dx, tz + dz) !== FLOOR || drop < 0.5 || drop > 0.7) continue;
      if (w.railHit(tx + 0.5 + dx * 0.5, tz + 0.5 + dz * 0.5, 0.05, w.hAt(tx, tz))) continue;
      out.push({ tx, tz, dx, dz, h: w.hAt(tx, tz), low: w.hAt(tx + dx, tz + dz) });
    }
  }
  return out;
}

test('stepping off a 0.5–0.7 m ledge never leaves the player stuck', () => {
  let checked = 0;
  for (const seed of [1, 2, 3, 7, 42]) {
    const w = new World(seed);
    const edges = dropEdges(w, -6, -6, 12);
    for (const e of edges.slice(0, 40)) {
      const p = new Player();
      const yaw = Math.atan2(-e.dx, -e.dz);   // face the lower tile
      p.reset(e.tx + 0.5, e.tz + 0.5, yaw, e.h);
      p.settle(w, 0);
      run(p, w, { x: 0, z: 1, run: false }, 1.5);
      const sx = p.x, sz = p.z, sy = p.yaw, sh = p.floorH;
      let free = false;
      for (let a = 0; a < 8 && !free; a++) {
        Object.assign(p, { x: sx, z: sz, yaw: sy + (a * Math.PI) / 4, floorH: sh });
        run(p, w, { x: 0, z: 1, run: false }, 0.5);
        free = Math.hypot(p.x - sx, p.z - sz) > 0.3;
      }
      assert.ok(free, `seed ${seed}: stuck after stepping off platform at ${e.tx},${e.tz} toward ${e.dx},${e.dz} (now ${sx.toFixed(2)},${sz.toFixed(2)} h=${sh})`);
      checked++;
    }
  }
  assert.ok(checked >= 20, `only ${checked} platform edges sampled`);
});

test('a 0.5–0.7 m ledge still cannot be walked up from the floor below', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const w = new World(seed);
    for (const e of dropEdges(w, -6, -6, 12).slice(0, 20)) {
      const p = new Player();
      p.reset(e.tx + e.dx + 0.5, e.tz + e.dz + 0.5, Math.atan2(e.dx, e.dz), e.low);   // below, facing the ledge
      p.settle(w, 0);
      run(p, w, { x: 0, z: 1, run: false }, 1);
      assert.ok(p.floorH < e.low + 0.3, `seed ${seed}: climbed onto the ledge at ${e.tx},${e.tz}`);
    }
  }
});

test('random walkers never get pinned anywhere (60 walkers × 3 min)', async () => {
  const { mulberry32 } = await import('../../js/rng.js');
  let stuck = 0, metres = 0;
  for (let b = 0; b < 60; b++) {
    const w = new World(100 + (b % 6));
    const r = mulberry32(b + 1);
    const p = new Player();
    p.reset(8, 8, r() * 6.28);
    p.settle(w, 0);
    let move = { x: 0, z: 1, run: false };
    for (let t = 0; t < 180; t += DT) {
      if (r() < 0.02) { p.yaw += (r() - 0.5) * 3; move = { x: (r() - 0.5) * 0.6, z: 1, run: r() < 0.4 }; }
      p.update(w, DT, move);
    }
    metres += p.distance;
    const sx = p.x, sz = p.z, sy = p.yaw, sh = p.floorH;
    let free = false;
    for (let a = 0; a < 8 && !free; a++) {
      Object.assign(p, { x: sx, z: sz, yaw: sy + (a * Math.PI) / 4, floorH: sh });
      run(p, w, { x: 0, z: 1, run: false }, 0.5);
      free = Math.hypot(p.x - sx, p.z - sz) > 0.3;
    }
    if (!free) stuck++;
  }
  assert.equal(stuck, 0, `${stuck}/60 walkers pinned`);
  assert.ok(metres / 60 > 150, `walkers only covered ${(metres / 60).toFixed(0)} m on average`);
});

test('the body never overlaps a wall, deep water, bars or a drop, even running at 10 fps', async () => {
  const { mulberry32 } = await import('../../js/rng.js');
  const { WALL, DEEP, BARS, COLS, SPIRAL } = await import('../../js/tiles.js');
  const R = 0.3, dt = 0.1;
  let frames = 0;
  for (let b = 0; b < 40; b++) {
    const w = new World(500 + (b % 8));
    const r = mulberry32(b + 77);
    const p = new Player();
    // start inside a landmark zone half the time: deep pools, pillars, maze walls
    const z = w.zones[b % 4];
    const start = b % 2 ? w.findTile(FLOOR, z.x, z.z, 20) : { x: 8, z: 8 };
    p.reset(start.x, start.z, r() * 6.28);
    p.settle(w, 0);
    for (let t = 0; t < 120; t += dt) {
      if (r() < 0.05) p.yaw += (r() - 0.5) * 3;
      p.update(w, dt, { x: (r() - 0.5) * 0.4, z: 1, run: true });
      frames++;
      if (p.riding) continue;   // a slide ride flies the body along its tube, over the drop it was built for
      for (const [cx, cz] of [[p.x - R, p.z - R], [p.x + R, p.z - R], [p.x - R, p.z + R], [p.x + R, p.z + R], [p.x, p.z]]) {
        const tx = Math.floor(cx), tz = Math.floor(cz), t2 = w.typeAt(tx, tz);
        // on the ground the tile must be open; up on a floor or stair there must be floor within a metre of the feet
        // the rounded-off corner of a deep pool is floor; over a spiral stair the floor is the tread there
        const cut = t2 === DEEP || t2 === SPIRAL ? w.surfaceNear(cx, cz, p.floorH)?.h : undefined;
        const groundOk = t2 !== WALL && (t2 !== DEEP || cut !== undefined) && t2 !== BARS && t2 !== COLS && Math.abs((cut ?? w.floorAt(cx, cz) ?? -99) - p.floorH) <= 1;
        const upOk = w.upTypeAt(tx, tz) !== undefined && [0, 2].includes(w.upTypeAt(tx, tz)) && Math.abs(w.upHAt(tx, tz) - p.floorH) <= 1;
        assert.ok(groundOk || upOk, `walker ${b} overlaps ${t2 === WALL ? 'a wall' : t2 === DEEP ? 'deep water' : 'a drop/bars'} at ${cx.toFixed(2)},${cz.toFixed(2)} h=${p.floorH.toFixed(2)}`);
      }
    }
  }
  assert.ok(frames > 40000);
});

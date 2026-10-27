// Inner layer: stairs, stacked floors, dark corridors, sealed rooms, slides, signs, water seam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slow } from './slow.mjs';
import { World, SPAWN } from '../../js/world.js';
import { Player } from '../../js/player.js';
import { CHUNK, FLOOR, WALL, SHALLOW, DEEP, RAMP, SPIRAL, BARS, COLS, VOID, UP_H, SHALLOW_FLOOR, DEEP_WATER, spiralH, TAU } from '../../js/tiles.js';
import { SIGN, TUBE_R, SLIDE_OUT } from '../../js/levels.js';

const SEEDS = [1, 2, 3, 42, 7];
const DT = 1 / 60;
const B = 6;   // chunks around the origin scanned per seed

function* chunks(w, b = B) {
  for (let cx = -b + 1; cx < b - 1; cx++) for (let cz = -b + 1; cz < b - 1; cz++) yield w.layout(cx, cz);
}

const reachAll = (w) => w.reachFrom([[SPAWN.x, SPAWN.z, 0]], -B * CHUNK, -B * CHUNK, B * CHUNK, B * CHUNK);

test('stair rooms stack two floors and every upper floor is reachable from spawn by its stairs', () => {
  const seen = { spiral: 0, straight: 0, uturn: 0 };
  for (const seed of SEEDS) {
    const w = new World(seed);
    const ok = reachAll(w);
    for (const L of chunks(w)) {
      if (L.kind !== 'stairs') continue;
      seen[L.variant]++;
      let up = 0, under = 0;
      for (let i = 0; i < 256; i++) {
        const x = L.ox + (i % 16), z = L.oz + (i >> 4);
        if (ok(x, z, 1)) up++;
        // ground you can stand on with the upper floor right above it: you can walk under the second floor
        if (L.up.tiles[i] === FLOOR && L.tiles[i] === FLOOR && ok(x, z, 0)) under++;
      }
      assert.ok(up >= 40, `seed ${seed} ${L.variant} stair room at ${L.cx},${L.cz}: only ${up} upper tiles reachable`);
      assert.ok(under >= 20, `seed ${seed} ${L.variant} stair room at ${L.cx},${L.cz}: only ${under} walkable tiles under the upper floor`);
    }
  }
  for (const k of Object.keys(seen)) assert.ok(seen[k] >= 3, `only ${seen[k]} ${k} stair rooms sampled`);
});

test('both floors have rooms: walls on the ground under the slab and walls on the upper floor', () => {
  for (const seed of SEEDS) {
    for (const L of chunks(new World(seed))) {
      if (L.kind !== 'stairs') continue;
      let groundWalls = 0, upWalls = 0;
      for (let z = 1; z < 15; z++) for (let x = 1; x < 15; x++) {
        const i = z * 16 + x;
        if (L.up.tiles[i] !== VOID && L.tiles[i] === WALL) groundWalls++;
        if (L.up.tiles[i] === WALL) upWalls++;
      }
      assert.ok(groundWalls >= 4 && upWalls >= 4, `seed ${seed} ${L.variant}: ground walls ${groundWalls}, upper walls ${upWalls}`);
    }
  }
});

// steer a body: a target point per frame; returns the body
function steer(w, p, seconds, target) {
  for (let t = 0; t < seconds; t += DT) {
    const [tx, tz] = target(p);
    p.yaw = Math.atan2(-(tx - p.x), -(tz - p.z));
    p.update(w, DT, { x: 0, z: 1, run: false });
  }
  return p;
}

test('a walker climbs a round spiral stair from the ground onto the upper floor and back down', () => {
  let climbed = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const L of chunks(w)) {
      const s = L.spirals.find((q) => q.own);
      if (!s || L.kind !== 'stairs') continue;
      // the entry quadrant is at angles just below 0 (in the spiral's own sense): start on the ground there
      const at = (th, r) => { const a = s.a0 + s.sense * th; return [s.x + Math.cos(a) * r, s.z + Math.sin(a) * r]; };
      const [sx, sz] = at(-0.5, 1.2);
      const p = new Player();
      p.reset(sx, sz, 0, 0);
      p.settle(w, 0);
      steer(w, p, 12, (b) => {
        const th = ((Math.atan2(b.z - s.z, b.x - s.x) - s.a0) * s.sense + Math.PI * 4) % (Math.PI * 2);
        const ahead = th > s.sweep ? (th > s.sweep + 0.6 ? 0.25 : s.sweep + 0.5) : th + 0.35;
        return at(ahead, 1.2);
      });
      assert.ok(Math.abs(p.floorH - UP_H) < 0.05, `seed ${seed}: spiral at ${s.x},${s.z} ended at h=${p.floorH.toFixed(2)}`);
      assert.equal(w.upTypeAt(Math.floor(p.x), Math.floor(p.z)), FLOOR);
      climbed++;
      if (climbed >= 6) return;
    }
  }
  assert.ok(climbed >= 3, `only ${climbed} spirals climbed`);
});

// 2026-10-24: region 2's sealed room was laid over its atrium spiral's outer tiles, so a walker on the treads stuck at 70-85 %
test('a walker climbs region 2\'s atrium spiral from the pool floor onto the gallery', () => {
  let climbed = 0;
  for (const seed of SEEDS) {
    const w = new World(seed), zone = w.zones[1];
    const s = w.layout(zone.cx0, zone.cz0).spirals.concat(w.layout(zone.cx0 + 1, zone.cz0).spirals,
      w.layout(zone.cx0, zone.cz0 + 1).spirals, w.layout(zone.cx0 + 1, zone.cz0 + 1).spirals).find((q) => q.own);
    assert.ok(s, `seed ${seed}: region 2 has its spiral`);
    const at = (th, r) => { const a = s.a0 + s.sense * th; return [s.x + Math.cos(a) * r, s.z + Math.sin(a) * r]; };
    const [sx, sz] = at(-0.5, 1.2);
    const p = new Player();
    p.reset(sx, sz, 0, s.h0);
    p.settle(w, s.h0);
    steer(w, p, 12, (b) => {
      const th = ((Math.atan2(b.z - s.z, b.x - s.x) - s.a0) * s.sense + Math.PI * 4) % (Math.PI * 2);
      const ahead = th > s.sweep ? (th > s.sweep + 0.6 ? 0.25 : s.sweep + 0.5) : th + 0.35;
      return at(ahead, 1.2);
    });
    assert.ok(Math.abs(p.floorH - s.h1) < 0.05, `seed ${seed}: region 2 spiral at ${s.x},${s.z} ended at h=${p.floorH.toFixed(2)}`);
    climbed++;
  }
  assert.equal(climbed, SEEDS.length);
});

test('spiral treads rise smoothly through three quarters of a turn', () => {
  const s = { x: 0, z: 0, rIn: 0.32, rOut: 1.95, h0: 0, h1: 3, a0: 0, sense: 1, sweep: Math.PI * 1.5 };
  let prev = 0;
  for (let k = 0; k <= 30; k++) {
    const th = (s.sweep * k) / 30;
    const h = spiralH(s, Math.cos(th) * 1.2, Math.sin(th) * 1.2);
    assert.ok(h >= prev - 1e-6 && h - prev <= 0.2, `θ=${th.toFixed(2)}: ${h}`);
    prev = h;
  }
  assert.equal(spiralH(s, 0.1, 0.1), null);   // the column
  assert.equal(spiralH(s, 2.5, 0.2), null);   // outside the treads
});

// shortest (tile, level) route by breadth-first search, then walk its tile centres
function route(w, from, goal) {
  const key = (x, z, l) => `${x},${z},${l}`;
  const prev = new Map([[key(...from), null]]);
  const q = [from];
  const ok = w.reachFrom([from], from[0] - 24, from[1] - 24, from[0] + 24, from[1] + 24);
  while (q.length) {
    const [x, z, l] = q.shift();
    if (goal(x, z, l)) {
      const path = [];
      for (let k = key(x, z, l); k; k = prev.get(k)) path.unshift(k.split(',').map(Number));
      return path;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const nl of [0, 1]) {
      const n = [x + dx, z + dz, nl], k = key(...n);
      if (prev.has(k) || !ok(...n)) continue;
      // only direct moves: reach confined to the two tiles involved
      const one = w.reachFrom([[x, z, l]], Math.min(x, n[0]), Math.min(z, n[1]), Math.max(x, n[0]) + 1, Math.max(z, n[1]) + 1);
      if (!one(...n)) continue;
      prev.set(k, key(x, z, l));
      q.push(n);
    }
  }
  return null;
}

test('a walker climbs straight and U-turn stairs (with their landing) onto the upper floor', () => {
  const done = { straight: 0, uturn: 0 };
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const L of chunks(w)) {
      if (L.kind !== 'stairs' || L.variant === 'spiral' || done[L.variant] >= 2) continue;
      // start at the foot of the flight (lowest ramp tile), aim for an upper-floor tile
      let foot = null;
      for (let i = 0; i < 256; i++) if (L.tiles[i] === RAMP && (!foot || L.h[i] < L.h[foot])) foot = i;
      const fx = L.ox + (foot % 16), fz = L.oz + (foot >> 4);
      const path = route(w, [fx, fz, 0], (x, z, l) => l === 1);
      assert.ok(path, `seed ${seed} ${L.variant}: no route to the upper floor`);
      const p = new Player();
      p.reset(fx + 0.5, fz + 0.5, 0, w.floorAt(fx + 0.5, fz + 0.5));
      p.settle(w, 0);
      let k = 0;
      steer(w, p, 20, (b) => {
        while (k < path.length - 1 && Math.hypot(b.x - path[k][0] - 0.5, b.z - path[k][1] - 0.5) < 0.3) k++;
        return [path[k][0] + 0.5, path[k][1] + 0.5];
      });
      assert.ok(Math.abs(p.floorH - UP_H) < 0.05, `seed ${seed} ${L.variant}: walker ended at h=${p.floorH.toFixed(2)} (${p.x.toFixed(1)},${p.z.toFixed(1)})`);
      done[L.variant]++;
    }
  }
  assert.ok(done.straight >= 1 && done.uturn >= 1, JSON.stringify(done));
});

test('every slide you can reach the mouth of is rideable to the end and drops you in walkable shallow water', () => {
  let rides = 0, deco = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    const ok = reachAll(w);
    for (const L of chunks(w)) {
      for (const s of L.slides) {
        if (!s.entry) {   // decorative: no mouth anywhere you can stand at its top
          deco++;
          const [x, , z] = s.pts[0];
          assert.ok(s.pts[0][1] > 6, 'a decorative tube starts in the ceiling');
          assert.equal(w.slideAt(x, z, s.pts[0][1] - 0.5, 0, 1), null);
          continue;
        }
        const ex = Math.floor(s.entry.x - s.entry.nx * 0.5), ez = Math.floor(s.entry.z - s.entry.nz * 0.5);
        if (!ok(ex, ez, 1)) continue;
        const lx = Math.floor(s.land.x), lz = Math.floor(s.land.z);
        assert.equal(w.typeAt(lx, lz), SHALLOW, `seed ${seed}: slide lands on tile type ${w.typeAt(lx, lz)}`);
        assert.ok(ok(lx, lz, 0), `seed ${seed}: landing at ${lx},${lz} is cut off`);
        // ride it: push into the mouth
        const p = new Player();
        p.reset(s.entry.x - s.entry.nx * 0.4, s.entry.z - s.entry.nz * 0.4, Math.atan2(s.entry.nx, s.entry.nz) + Math.PI, s.entry.h);
        p.settle(w, 0);
        let started = false;
        for (let t = 0; t < 8; t += DT) {
          p.update(w, DT, { x: 0, z: p.riding ? 0 : 1, run: false });
          started ||= p.riding;
          if (started && !p.riding) break;
        }
        assert.ok(started, `seed ${seed}: pushing into the mouth did not start the ride`);
        assert.ok(!p.riding && p.inWater, `seed ${seed}: ride ended riding=${p.riding} wet=${p.inWater}`);
        assert.ok(Math.abs(p.floorH - SHALLOW_FLOOR) < 0.05);
        // and walk out of the pool afterwards
        const x0 = p.x, z0 = p.z;
        for (let a = 0; a < 8 && Math.hypot(p.x - x0, p.z - z0) < 0.5; a++) { p.yaw = (a * Math.PI) / 4; for (let t = 0; t < 0.5; t += DT) p.update(w, DT, { x: 0, z: 1, run: false }); }
        assert.ok(Math.hypot(p.x - x0, p.z - z0) >= 0.5, `seed ${seed}: stuck after landing`);
        rides++;
      }
    }
  }
  assert.ok(rides >= 5, `only ${rides} slides ridden`);
});

test('connected shallow and deep water share one surface (no seam), deep floors fade in', () => {
  let pairs = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const L of chunks(w)) for (let z = 1; z < 15; z++) for (let x = 1; x < 15; x++) {
      const i = z * 16 + x;
      if (L.tiles[i] !== SHALLOW || Math.abs(L.h[i] - SHALLOW_FLOOR) > 1e-6) continue;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const j = (z + dz) * 16 + x + dx;
        if (L.tiles[j] !== DEEP) continue;
        assert.equal(w.waterAt(L.ox + x, L.oz + z), w.waterAt(L.ox + x + dx, L.oz + z + dz));
        pairs++;
      }
    }
  }
  assert.ok(pairs > 50, `only ${pairs} shallow/deep borders`);
});

// batch 6: on region floor a sealed room is walled in with barred openings, or three walls and a barred side, or a
// 5 × 5 box with two walls and two barred sides; 2F rooms keep the old all-bars rooms
test('sealed rooms: closed all round by walls and bars or pillars, seen through bars, never entered', () => {
  let sealed = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    const ok = reachAll(w);
    for (const L of chunks(w)) {
      if (L.kind === 'zone') continue;
      for (const s of L.sealed) {
        sealed++;
        let bars = 0, wall = 0, inside = 0;
        for (let z = s.z; z < s.z + s.d; z++) for (let x = s.x; x < s.x + s.w; x++) {
          const t = w.typeAt(x, z), edge = x === s.x || z === s.z || x === s.x + s.w - 1 || z === s.z + s.d - 1;
          if (edge) {
            assert.ok(t === BARS || t === COLS || t === WALL, `seed ${seed}: sealed room ring tile ${x},${z} is open`);
            if (t === WALL) wall++; else bars++;
            continue;
          }
          inside++;
          assert.ok(!ok(x, z, 0), `seed ${seed}: sealed room tile ${x},${z} is reachable`);
          assert.notEqual(t, WALL);
        }
        assert.ok(bars >= 2 && inside >= 4, `${bars} barred ring tiles, ${inside} inside`);
      }
    }
  }
  assert.ok(sealed > 0, "sealed rooms sampled");
});

test('zones 2 and 3 each have a sealed room; zone 2 keeps a small discovery upstairs', () => {
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const k of [1, 2]) assert.ok(w.zoneGrid(k).sealed.length >= 1, `seed ${seed} zone ${k + 1}`);
    assert.ok(w.items.some((it) => it.zone === 1 && it.up), `seed ${seed}: no upper-floor item in zone 2`);
  }
});

test('floating toys have valid kinds and stand over water', () => {
  let toys = 0;
  for (const seed of SEEDS) {
    for (const L of chunks(new World(seed), 9)) {
      if (L.kind === 'zone' || L.kind === 'start' || L.sealed.length) continue;
      let water = false;
      for (let i = 0; i < 256 && !water; i++) water = L.tiles[i] === SHALLOW || L.tiles[i] === DEEP;
      if (!water) continue;
      if (L.floaters.length) {
        toys++;
        for (const f of L.floaters) {
          const t = L.tiles[(Math.floor(f.z) - L.oz) * 16 + Math.floor(f.x) - L.ox];
          assert.ok(t === SHALLOW || t === DEEP, 'toys float on water');
          assert.ok(['ring', 'swim', 'board', 'ball'].includes(f.kind), `a toy of a known kind: ${f.kind}`);   // which one: toys.test.mjs
        }
      }
    }
  }
  assert.ok(toys > 0, "toys sampled");
});

test('wall signs fit what is around them', () => {
  let n = 0;
  const near = (w, s, types, r = 2) => {
    const fx = Math.floor(s.x + s.nx * 0.5), fz = Math.floor(s.z + s.nz * 0.5);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (types.includes(w.typeAt(fx + dx, fz + dz))) return true;
    return false;
  };
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const L of chunks(w)) for (const s of L.signs) {
      n++;
      const back = w.typeAt(Math.floor(s.x - s.nx * 0.5), Math.floor(s.z - s.nz * 0.5));
      if (back !== WALL) assert.equal(w.upTypeAt(Math.floor(s.x - s.nx * 0.5), Math.floor(s.z - s.nz * 0.5)), WALL, 'signs hang on walls');
      if (s.cell === SIGN.DEPTH) assert.ok(near(w, s, [SHALLOW]), 'depth sign by shallow water');
      if (s.cell === SIGN.DEEP || s.cell === SIGN.P_NODIVE) assert.ok(near(w, s, [DEEP]) || L.zone === 1, 'deep sign by deep water');
      if (s.cell === SIGN.UP2F) assert.ok(near(w, s, [RAMP, SPIRAL]), '2F sign by stairs');
      if ([SIGN.G_SMILE, SIGN.G_DUCK, SIGN.G_HANDS, SIGN.G_PRINT, SIGN.CHALK_TEXT].includes(s.cell) && back === WALL) {
        const fx = Math.floor(s.x + s.nx * 0.5), fz = Math.floor(s.z + s.nz * 0.5);
        const [M, i] = w.cellOf(fx, fz);
        assert.ok(M.dark[i] || s.minT > 0 || s.y - M.h[i] < 1.4, 'chalk lives in dark corners, low on the wall');
      }
    }
  }
  assert.ok(n > 0, `only ${n} signs`);
});

// A2: walking along a stair's rail and into the rail's end used to pin the body (it only slid along axes).
// Oracle: the same walk with rails switched off makes progress, so any stall is the rail's doing.
test('a walker heading into the end of a rail slides round it instead of sticking (zone 2 stairs and balconies)', () => {
  const realHit = World.prototype.railHit, realPush = World.prototype.railPush;
  const norail = (on) => { World.prototype.railHit = on ? () => false : realHit; World.prototype.railPush = on ? () => null : realPush; };
  let runs = 0;
  const stalls = [];
  try {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const w = new World(seed);
      const z = w.zones[1];
      for (let cz = z.cz0 - 1; cz < z.cz0 + 3; cz++) for (let cx = z.cx0 - 1; cx < z.cx0 + 3; cx++) w.layout(cx, cz);
      for (let cz = z.cz0; cz < z.cz0 + 2; cz++) for (let cx = z.cx0; cx < z.cx0 + 2; cx++) {
        for (const rl of w.layout(cx, cz).rails) {
          const ex = rl.x1 - rl.x0, ez = rl.z1 - rl.z0, el = Math.hypot(ex, ez);
          for (const endSign of [1, -1]) for (const lat of [-0.28, -0.2, 0.2, 0.28]) {
            const dx = (ex / el) * endSign, dz = (ez / el) * endSign;
            const px = endSign > 0 ? rl.x1 : rl.x0, pz = endSign > 0 ? rl.z1 : rl.z0, y = endSign > 0 ? rl.y1 : rl.y0;
            const bx = px + dx - dz * lat, bz = pz + dz + dx * lat;   // a metre beyond the end, a little to one side
            const walk = (off) => {
              norail(off);
              const h = w.floorAt(bx, bz);
              if (h === null || Math.abs(h - y) > 0.5) return null;
              const p = new Player();
              p.reset(bx, bz, Math.atan2(dx, dz), h);
              p.settle(w, 0);
              if (!p.canStand(w, p.x, p.z, p.floorH)) return null;
              for (let t = 0; t < 2.5; t += DT) p.update(w, DT, { x: 0, z: 1, run: false });
              return -((p.x - bx) * dx + (p.z - bz) * dz);
            };
            const free = walk(true), railed = walk(false);
            norail(false);
            if (free === null || railed === null) continue;
            runs++;
            if (free > 1.3 && railed < 1.3) stalls.push(`seed ${seed} rail ${rl.x0},${rl.z0}-${rl.x1},${rl.z1} end ${endSign} lat ${lat}`);
          }
        }
      }
    }
  } finally { norail(false); }
  assert.ok(runs >= 100, `only ${runs} walks sampled`);
  assert.deepEqual(stalls, []);
});

// every rideable slide of a few worlds: the stair rooms near the origin plus zone 2
function* rideable(seeds, range = 6) {
  for (const seed of seeds) {
    const w = new World(seed);
    const layouts = [...chunks(w, range)];
    for (const z of w.zones) for (let cz = z.cz0; cz < z.cz0 + 2; cz++) for (let cx = z.cx0; cx < z.cx0 + 2; cx++) layouts.push(w.layout(cx, cz));
    for (const L of layouts) for (const s of L.slides) if (s.entry) yield [seed, w, s];
  }
}

// A3: the mouth used to stop 0.7 m after the bend, with its lower half sunk into the floor
test('a slide ends in a level run-out of at least 1.5 m over water and is never buried in a floor', () => {
  let n = 0;
  for (const [seed, w, s] of rideable([1, 2, 3, 42, 7, 11, 12])) {
    n++;
    const last = s.pts[s.pts.length - 1];
    let flat = 0;
    for (let k = s.pts.length - 1; k > 0 && Math.abs(s.pts[k - 1][1] - last[1]) < 1e-6; k--) flat += Math.hypot(s.pts[k][0] - s.pts[k - 1][0], s.pts[k][2] - s.pts[k - 1][2]);
    assert.ok(flat >= 1.5 - 1e-6 && flat >= SLIDE_OUT - 1e-6, `seed ${seed}: only ${flat.toFixed(2)} m of level tube at the mouth`);
    const under = w.typeAt(Math.floor(last[0]), Math.floor(last[2]));
    assert.ok(under === SHALLOW || under === DEEP, `seed ${seed}: the mouth is over tile type ${under}, not water`);
    for (const [x, y, z] of s.pts) {
      if (Math.hypot(x - s.entry.x, z - s.entry.z) < 0.9) continue;   // the mouth rests on the upper floor edge
      for (const [ox, oz] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
        const f = w.floorAt(x + ox, z + oz);
        assert.ok(f === null ? false : y - TUBE_R >= f - 0.03, `seed ${seed}: tube at ${x.toFixed(1)},${z.toFixed(1)} y=${y.toFixed(2)} sinks into floor ${f}`);
      }
    }
  }
  assert.ok(n >= 15, `only ${n} slides checked`);
});

// B: slide kinds and coil geometry
// the slides of stair rooms and zones (a tower's slide on region floor is straight or bent: facilities.test.mjs)
test('M7 straight, bent and coiled slides exist, and a coil wraps its column', slow, () => {
  let straight = 0, bent = 0, coil = 0;
  for (const [, w, s] of rideable(Array.from({ length: 24 }, (_, i) => i + 1))) {
    if (w.cellOf(Math.floor(s.entry.x), Math.floor(s.entry.z))[0].kind === 'region') continue;
    if (s.coil) {
      coil++;
      let a = 0;
      for (let k = 1; k < s.pts.length; k++) a += Math.atan2(Math.sin(Math.atan2(s.pts[k][2] - s.core.z, s.pts[k][0] - s.core.x) - Math.atan2(s.pts[k - 1][2] - s.core.z, s.pts[k - 1][0] - s.core.x)), Math.cos(Math.atan2(s.pts[k][2] - s.core.z, s.pts[k][0] - s.core.x) - Math.atan2(s.pts[k - 1][2] - s.core.z, s.pts[k - 1][0] - s.core.x)));
      assert.ok(Math.abs(a) > TAU * 0.95 && Math.abs(a) < TAU * 1.7, `${(Math.abs(a) / TAU).toFixed(2)} turns`);
    } else if (s.straight) straight++; else bent++;
  }
  assert.ok(straight > 0 && bent > 0 && coil > 0, `slide kinds: ${straight}, ${bent}, ${coil}`);
});

test('M7 side-by-side slides share a platform, direction and landing pool', () => {
  let multi = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (const L of chunks(w, 10)) {
      const mine = L.slides.filter((s) => s.entry && s.land);
      if (!mine.length || L.kind === 'region') continue;   // a tower carries one slide
      if (mine.length >= 2) {
        multi++;
        assert.ok(mine.length <= 3);
        const e = mine[0].entry;
        for (const s of mine) {
          assert.equal(s.entry.h, e.h, 'one platform');
          assert.ok(s.entry.nx === e.nx && s.entry.nz === e.nz, 'same way out');
          assert.ok(Math.hypot(s.land.x - mine[0].land.x, s.land.z - mine[0].land.z) < 9, 'the same pool');
        }
      }
    }
  }
  assert.ok(multi > 0, "multi-slide rooms sampled");
});

// E: sunlight comes only through openings you can see: a skylight in a ceiling with nothing above it, or a framed
// window in a solid outer wall that faces into the room. (Rotated rooms used to keep the window's old facing, so its
// beam stuck out of a bare wall.)
test('every sunbeam starts at a skylight over open air or a window in a wall facing the room', () => {
  let sky = 0, windows = 0;
  for (const seed of [1, 2, 3, 42, 7, 11, 12, 13]) {
    const w = new World(seed);
    const layouts = [...chunks(w, 6)];
    for (const z of w.zones) for (let cz = z.cz0; cz < z.cz0 + 2; cz++) for (let cx = z.cx0; cx < z.cx0 + 2; cx++) layouts.push(w.layout(cx, cz));
    for (const L of layouts) for (const s of L.suns) {
      if (s.sky) {
        sky++;
        assert.ok(w.upTypeAt(Math.floor(s.wx), Math.floor(s.wz)) === VOID, `seed ${seed}: skylight at ${s.wx},${s.wz} sits under an upper floor`);
        assert.notEqual(w.typeAt(Math.floor(s.wx), Math.floor(s.wz)), WALL, 'a skylight over a wall');
      } else {
        windows++;
        const behind = w.typeAt(Math.floor(s.wx - s.nx * 0.5), Math.floor(s.wz - s.nz * 0.5));
        const front = w.typeAt(Math.floor(s.wx + s.nx * 0.5), Math.floor(s.wz + s.nz * 0.5));
        assert.equal(behind, WALL, `seed ${seed}: window at ${s.wx},${s.wz} facing ${s.nx},${s.nz} is not set in a wall`);
        assert.notEqual(front, WALL, `seed ${seed}: window at ${s.wx},${s.wz} looks into a wall`);
      }
    }
  }
  assert.ok(sky >= 8 && windows >= 6, `${sky} skylights, ${windows} windows sampled`);
});

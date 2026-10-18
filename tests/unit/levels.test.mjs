// Inner layer: stairs, stacked floors, dark corridors, sealed rooms, slides, signs, water seam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, SPAWN } from '../../js/world.js';
import { Player } from '../../js/player.js';
import { CHUNK, FLOOR, WALL, SHALLOW, DEEP, RAMP, SPIRAL, BARS, COLS, VOID, UP_H, SHALLOW_FLOOR, DEEP_WATER, spiralH } from '../../js/tiles.js';
import { SIGN } from '../../js/levels.js';

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
  assert.equal(DEEP_WATER, SHALLOW_FLOOR + 0.38);
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

test('narrow corridors are 1 m wide, dark, low, change level, and sit next to bright rooms', () => {
  let corridors = 0, raised = 0;
  for (const seed of SEEDS) {
    for (const L of chunks(new World(seed))) {
      if (L.kind !== 'corridor') continue;
      corridors++;
      let dark = 0, wide = 0, lit = 0;
      const heights = new Set();
      for (let z = 1; z < 15; z++) for (let x = 1; x < 15; x++) {
        const i = z * 16 + x;
        if (L.dark[i] && L.tiles[i] !== WALL) {
          dark++;
          assert.ok(L.low[i], 'dark corridors have a low ceiling');
          heights.add(Math.round(L.h[i] * 10));
          // a 2×2 block of dark floor would be a room, not a corridor
          if (L.dark[i + 1] && L.dark[i + 16] && L.dark[i + 17] && L.tiles[i + 1] !== WALL && L.tiles[i + 16] !== WALL && L.tiles[i + 17] !== WALL) wide++;
        } else if (L.tiles[i] === FLOOR) lit++;
      }
      assert.ok(dark >= 20, `corridor room at ${L.cx},${L.cz} has only ${dark} dark tiles`);
      assert.ok(wide <= dark * 0.25, `corridor room at ${L.cx},${L.cz}: ${wide} wide spots`);
      if (heights.size > 1) raised++;
      assert.ok(lit >= 0);
    }
  }
  assert.ok(corridors >= 10, `only ${corridors} corridor rooms`);
  assert.ok(raised >= corridors * 0.5, `only ${raised}/${corridors} corridor rooms change level`);
});

test('rooms are less open than before: few open halls, and most rooms have level changes or partitions', () => {
  const count = {};
  let total = 0, varied = 0;
  for (const seed of SEEDS) {
    for (const L of chunks(new World(seed))) {
      if (L.kind === 'zone' || L.kind === 'start' || L.kind === 'exit' || (Math.abs(L.cx) <= 1 && Math.abs(L.cz) <= 1)) continue;
      count[L.kind] = (count[L.kind] || 0) + 1;
      total++;
      const hs = new Set();
      for (let i = 0; i < 256; i++) if (L.tiles[i] !== WALL) hs.add(Math.round(L.h[i] * 10));
      if (hs.size >= 3) varied++;
    }
  }
  assert.ok((count.hall || 0) / total <= 0.2, `halls are ${(count.hall / total * 100).toFixed(0)}%`);
  assert.ok(varied / total >= 0.5, `only ${varied}/${total} rooms have 3+ floor levels`);
});

test('sealed rooms: about 1 in 10 chunks, seen through bars or pillars, never entered', () => {
  let chunksN = 0, sealed = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    const ok = reachAll(w);
    for (const L of chunks(w)) {
      if (L.kind === 'zone') continue;
      chunksN++;
      for (const s of L.sealed) {
        sealed++;
        let ring = 0, inside = 0;
        for (let z = s.z; z < s.z + s.d; z++) for (let x = s.x; x < s.x + s.w; x++) {
          const t = w.typeAt(x, z), edge = x === s.x || z === s.z || x === s.x + s.w - 1 || z === s.z + s.d - 1;
          if (edge) { if (t === BARS || t === COLS) ring++; continue; }
          inside++;
          assert.ok(!ok(x, z, 0), `seed ${seed}: sealed room tile ${x},${z} is reachable`);
          assert.notEqual(t, WALL);
        }
        assert.ok(ring >= (s.w + s.d) * 2 - 6 && inside >= 4);
      }
    }
  }
  const share = sealed / chunksN;
  assert.ok(share >= 0.05 && share <= 0.16, `sealed rooms in ${(share * 100).toFixed(1)}% of chunks`);
});

test('zones 2 and 3 each have a sealed room; zone 2 keeps a small discovery upstairs', () => {
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const k of [1, 2]) assert.ok(w.zoneGrid(k).sealed.length >= 1, `seed ${seed} zone ${k + 1}`);
    assert.ok(w.items.some((it) => it.zone === 1 && it.up), `seed ${seed}: no upper-floor item in zone 2`);
  }
});

test('floating toys on about 8% of chunks that have water', () => {
  let wet = 0, toys = 0;
  for (const seed of SEEDS) {
    for (const L of chunks(new World(seed), 9)) {
      if (L.kind === 'zone' || L.kind === 'start' || L.sealed.length) continue;
      let water = false;
      for (let i = 0; i < 256 && !water; i++) water = L.tiles[i] === SHALLOW || L.tiles[i] === DEEP;
      if (!water) continue;
      wet++;
      if (L.floaters.length) {
        toys++;
        for (const f of L.floaters) {
          const t = L.tiles[(Math.floor(f.z) - L.oz) * 16 + Math.floor(f.x) - L.ox];
          assert.ok(t === SHALLOW || t === DEEP, 'toys float on water');
        }
      }
    }
  }
  const share = toys / wet;
  assert.ok(share >= 0.04 && share <= 0.13, `${(share * 100).toFixed(1)}% of wet chunks have toys`);
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
        assert.ok(M.dark[i] || s.minT > 0 || s.y < 1.4, 'chalk lives in dark corners, low on the wall');
      }
    }
  }
  assert.ok(n > 100, `only ${n} signs`);
});

test('old saves without a standing height load on the ground; a bad height is rejected', async () => {
  const { loadGame } = await import('../../js/save.js');
  const base = { v: 1, seed: 1, x: 8, z: 8, yaw: 0, elapsed: 1, distance: 1, visited: [false, false, false, false], found: [] };
  globalThis.localStorage = { getItem: () => JSON.stringify(base) };
  assert.equal(loadGame().h, 0);
  globalThis.localStorage = { getItem: () => JSON.stringify({ ...base, h: 3 }) };
  assert.equal(loadGame().h, 3);
  globalThis.localStorage = { getItem: () => JSON.stringify({ ...base, h: 'up' }) };
  assert.equal(loadGame(), null);
});

// A2: walking along a stair's rail and into the rail's end used to pin the body (it only slid along axes).
// Oracle: the same walk with rails switched off makes progress, so any stall is the rail's doing.
test('a walker heading into the end of a rail slides round it instead of sticking (zone 2 stairs and balconies)', () => {
  const realHit = World.prototype.railHit, realPush = World.prototype.railPush;
  const norail = (on) => { World.prototype.railHit = on ? () => false : realHit; World.prototype.railPush = on ? () => null : realPush; };
  let runs = 0;
  const stalls = [];
  try {
    for (const seed of [1, 2, 3]) {
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

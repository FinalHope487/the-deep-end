// Inner layer: three floors (B1 -3 m, 1F, 2F +3 m): the level map, stair chunks, sealed doorways, zone floors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, SPAWN } from '../../js/world.js';
import { CHUNK, DIRS, FLOOR, RAMP, LEVEL_H, walkable } from '../../js/tiles.js';
import { Player } from '../../js/player.js';
import { patchOf, PATCH } from '../../js/levelmap.js';

const SEEDS = [1, 2, 3, 42, 7];
const DT = 1 / 60;

function findStairs(w, R = 14) {
  const out = [];
  for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) { const s = w.lm.stairOf(cx, cz); if (s) out.push({ cx, cz, ...s }); }
  return out;
}

// walk a body along the lane of a stair chunk (st.dir = direction of its high end) from `from` metres past the chunk
// centre, towards the high end or back; returns where it started and ended
function walkLane(w, st, from, forward) {
  const [dx, dz] = DIRS[st.dir], ox = st.cx * CHUNK + 8, oz = st.cz * CHUNK + 8;
  const perp = dx ? [0, 0.5] : [0.5, 0];
  const sx = ox + dx * from + perp[0], sz = oz + dz * from + perp[1];
  const p = new Player();
  const h0 = w.floorAt(sx, sz);
  p.reset(sx, sz, 0, h0);
  p.settle(w, 0);
  const sign = forward ? 1 : -1;
  p.yaw = Math.atan2(-dx * sign, -dz * sign);
  const goal = forward ? 7.3 : -3.5;   // stop on the landing / in the plaza, before walking on into the next chunk
  for (let t = 0; t < 14; t += DT) {
    p.update(w, DT, { x: 0, z: 1, run: false });
    if (((p.x - ox) * dx + (p.z - oz) * dz) * 1 * (forward ? 1 : -1) >= (forward ? goal : -goal)) break;
  }
  return { h0, h1: p.floorH };
}

test('G1 a body walks up the stairs to 2F (+3 m) and down the stairs to B1 (-3 m), and back', () => {
  let up = 0, down = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const st of findStairs(w)) {
      if (st.level > 0 ? up >= 4 : down >= 4) continue;
      const a = walkLane(w, st, -3.5, true);
      assert.ok(Math.abs(a.h0) < 0.05, `seed ${seed} stair ${st.cx},${st.cz} starts on 1F (${a.h0})`);
      assert.ok(Math.abs(a.h1 - st.level * LEVEL_H) < 0.1, `seed ${seed} stair ${st.cx},${st.cz} level ${st.level}: ended at ${a.h1.toFixed(2)}`);
      const b = walkLane(w, st, 7.5, false);
      assert.ok(Math.abs(b.h0 - st.level * LEVEL_H) < 0.1 && Math.abs(b.h1) < 0.1, `seed ${seed} stair ${st.cx},${st.cz} back: ${b.h0} to ${b.h1.toFixed(2)}`);
      if (st.level > 0) up++; else down++;
    }
  }
  assert.ok(up >= 4 && down >= 4, `${up} up and ${down} down stairs walked`);
});

test('G1 chunks on B1 and 2F stand on a floor 3 m below / above 1F', () => {
  let b1 = 0, f2 = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (let cz = -12; cz <= 12; cz++) for (let cx = -12; cx <= 12; cx++) {
      const L = w.layout(cx, cz), lv = w.lm.levelOf(cx, cz);
      if (w.lm.stairOf(cx, cz)) { assert.equal(L.baseY, 0); continue; }
      assert.equal(L.baseY, lv * LEVEL_H);
      if (!lv) continue;
      lv < 0 ? b1++ : f2++;
      for (let i = 0; i < 256; i++) if (walkable(L.tiles[i]) && L.tiles[i] !== RAMP) assert.ok(L.h[i] >= L.baseY - 2.5 && L.h[i] <= L.baseY + 2.5, `floor ${L.h[i]} on a level ${lv} chunk`);
      assert.equal(L.cold, lv < 0);
    }
  }
  assert.ok(b1 >= 20 && f2 >= 20, `${b1} B1 and ${f2} 2F chunks sampled`);
});

test('G2 every sampled chunk is reachable on foot from spawn across floors; about 30% of plain 1F doorways are sealed', () => {
  let sealed = 0, plain = 0, sampled = 0;
  for (const seed of SEEDS) {
    const w = new World(seed), R = 12;
    for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
      for (const dir of [0, 1]) {
        if (w.lm.isPlain(dir ? cx : cx - 1, dir ? cz - 1 : cz) && w.lm.isPlain(cx, cz)) { plain++; if (!w.lm.edge(cx, cz, dir).open) sealed++; }
      }
    }
    const ok = w.reachFrom([[Math.floor(SPAWN.x), Math.floor(SPAWN.z), 0]], -R * CHUNK, -R * CHUNK, (R + 1) * CHUNK, (R + 1) * CHUNK);
    for (let cz = -R + 3; cz <= R - 3; cz++) for (let cx = -R + 3; cx <= R - 3; cx++) {
      let any = false;
      for (let z = 0; z < 16 && !any; z++) for (let x = 0; x < 16 && !any; x++) any = ok(cx * CHUNK + x, cz * CHUNK + z, 0) || ok(cx * CHUNK + x, cz * CHUNK + z, 1);
      sampled++;
      assert.ok(any, `seed ${seed} chunk ${cx},${cz} (level ${w.lm.levelOf(cx, cz)}, ${w.layout(cx, cz).kind}) cannot be reached`);
    }
  }
  const share = sealed / plain;
  assert.ok(share > 0.2 && share < 0.34, `${(share * 100).toFixed(1)}% of ${plain} plain doorways sealed`);
  assert.ok(sampled >= 1500);
});

test('G2 a sealed doorway always has a way round that cannot be sealed', () => {
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (let cz = -10; cz <= 10; cz++) for (let cx = -10; cx <= 10; cx++) for (const dir of [0, 1]) {
      const ax = dir ? cx : cx - 1, az = dir ? cz - 1 : cz;
      if (!w.lm.candidate(ax, az, cx, cz) || w.lm.edge(cx, cz, dir).open) continue;
      assert.ok(w.lm.bypass(ax, az, cx, cz), `seed ${seed} sealed doorway ${cx},${cz},${dir} has no bypass`);
    }
  }
});

test('G2 floors only meet at stairs: B1 and 2F patches have 1F on all four sides and a stair in the middle of each side', () => {
  let patches = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (let pj = -8; pj <= 8; pj++) for (let pi = -8; pi <= 8; pi++) {
      const lv = w.lm.patchLevel(pi, pj);
      if (!lv) continue;
      patches++;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz], d) => {
        assert.equal(w.lm.patchLevel(pi + dx, pj + dz), 0, `seed ${seed} patch ${pi},${pj} touches another floor`);
        // the stair chunk sits in the neighbouring patch, middle of the side facing this patch
        const cx = (pi + dx) * PATCH + 1 - dx, cz = (pj + dz) * PATCH + 1 - dz;
        const s = w.lm.stairOf(cx, cz);
        assert.ok(s && s.level === lv && s.dir === (dx === 1 ? 1 : dx === -1 ? 0 : dz === 1 ? 3 : 2) , `seed ${seed} patch ${pi},${pj} side ${d}: stair chunk ${cx},${cz} is ${JSON.stringify(s)}`);
      });
    }
  }
  assert.ok(patches >= 30, `${patches} patches checked`);
});

test('G4 zones 1-2 are on 1F, zone 3 whole on 2F, zone 4 whole on B1 and the exit on 2F; items follow', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const w = new World(seed);
    assert.deepEqual(w.zones.map((z) => w.lm.levelOf(z.cx0, z.cz0)), [0, 0, 1, -1]);
    assert.equal(w.lm.levelOf(w.exit.cx, w.exit.cz), 1);
    assert.equal(w.hAt(Math.floor(w.exit.x), Math.floor(w.exit.z)), LEVEL_H);
    for (const z of w.zones) {
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
        const L = w.layout(z.cx0 + dx, z.cz0 + dz);
        assert.equal(L.baseY, z.level * LEVEL_H, `seed ${seed} zone ${z.index} chunk ${dx},${dz}`);
        assert.equal(L.zone, z.index);
      }
    }
    for (const it of w.items) {
      const z = w.zones[it.zone];
      assert.ok(Math.abs(it.h - (z.level * LEVEL_H + (it.up ? LEVEL_H : 0))) < 2.7, `seed ${seed} item ${it.id} at height ${it.h} in a level ${z.level} zone`);
      if (z.level) assert.ok(z.level > 0 ? it.h > 1.5 : it.h < -1.5);
    }
  }
});

test('G4 a zone on another floor can only be entered from that floor: its rim is at its floor height and 1F joins it by stairs only', () => {
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const z of w.zones.filter((q) => q.level)) {
      const x0 = z.cx0 * CHUNK, z0 = z.cz0 * CHUNK;
      for (let i = 0; i < 32; i++) for (const [x, zz] of [[i, 0], [i, 31], [0, i], [31, i]]) {
        const tx = x0 + x, tz = z0 + zz;
        if (w.typeAt(tx, tz) === FLOOR) assert.ok(Math.abs(w.hAt(tx, tz) - z.level * LEVEL_H) < 0.01, `seed ${seed} zone ${z.index} rim tile ${x},${zz} at ${w.hAt(tx, tz)}`);
      }
      // every doorway between the zone's patch and the chunks outside it is a stair of this zone's level
      for (let cz = z.pj * PATCH; cz < (z.pj + 1) * PATCH; cz++) for (let cx = z.pi * PATCH; cx < (z.pi + 1) * PATCH; cx++) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, nz = cz + dz;
          if (patchOf(nx) === z.pi && patchOf(nz) === z.pj) continue;
          const [bx, bz] = dx + dz > 0 ? [nx, nz] : [cx, cz];
          if (!w.lm.edge(bx, bz, dx ? 0 : 1).open) continue;
          const s = w.lm.stairOf(nx, nz);
          assert.ok(s && s.level === z.level, `seed ${seed} zone ${z.index}: open doorway to ${nx},${nz} which is not its stair`);
        }
      }
    }
  }
});

test('old saves (no h, h = 0, h = 3) still load, a B1 save (h = -3) loads, and a nonsense h is still refused', async () => {
  const { loadGame } = await import('../../js/save.js');
  const base = { v: 1, seed: 7, x: 1, z: 2, yaw: 0, elapsed: 5, distance: 3, visited: [false, false, false, false], found: [] };
  const withH = (h) => { globalThis.localStorage = { getItem: () => JSON.stringify(h === undefined ? base : { ...base, h }) }; return loadGame(); };
  assert.equal(withH(undefined).h, 0);
  assert.equal(withH(0).h, 0);
  assert.equal(withH(3).h, 3);
  assert.equal(withH(-3).h, -3);
  assert.equal(withH(-3.4).h, -3.4);
  assert.equal(withH(900), null);
  assert.equal(withH('up'), null);
});

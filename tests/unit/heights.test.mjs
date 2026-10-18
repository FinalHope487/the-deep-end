// Inner layer, batch 4 L5: floors 4.5 m apart, taller rooms, steeper stairs, old saves still stand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { stairRoom } from '../../js/levels.js';
import { rngFor } from '../../js/rng.js';
import { CHUNK, DIRS, RAMP, LEVEL_H, UP_H, SLAB, walkable, SPIRAL } from '../../js/tiles.js';
import { Player } from '../../js/player.js';
import { loadAtmosphere } from './mesh-helper.mjs';

const SEEDS = [1, 2, 3, 42, 7];

test('L5 floors are 4.5 m apart: B1 at -4.5, 2F at +4.5, 4.2 m clear under a slab', () => {
  assert.equal(LEVEL_H, 4.5);
  assert.equal(UP_H, 4.5);
  assert.ok(Math.abs(UP_H - SLAB - 4.2) < 1e-9);
  const seen = new Set();
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (let cz = -12; cz <= 12; cz++) for (let cx = -12; cx <= 12; cx++) {
      const L = w.layout(cx, cz);
      if (L.stair) continue;
      assert.equal(L.baseY, L.lv * 4.5, `chunk ${cx},${cz}`);
      seen.add(L.lv);
    }
  }
  assert.deepEqual([...seen].sort(), [-1, 0, 1]);
});

test('L5 single-floor ceilings are 6 m relaxed and 3.5 m at the most tense', async () => {
  const { Atmosphere, CEIL_RELAXED, CEIL_TENSE } = await loadAtmosphere();
  assert.equal(CEIL_RELAXED, 6);
  assert.equal(CEIL_TENSE, 3.5);
  assert.equal(Atmosphere.prototype.ceiling.call({ T: 0 }), 6);
  assert.equal(Atmosphere.prototype.ceiling.call({ T: 1 }), 3.5);
});

test('L5 the stair chunk climbs 4.5 m at about 37 degrees (0.75 m a tile)', () => {
  let n = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (let cz = -12; cz <= 12; cz++) for (let cx = -12; cx <= 12; cx++) {
      const st = w.lm.stairOf(cx, cz);
      if (!st) continue;
      const L = w.layout(cx, cz);
      let lo = Infinity, hi = -Infinity, tiles = 0;
      for (let i = 0; i < 256; i++) if (L.tiles[i] === RAMP) {
        tiles++;
        assert.ok(L.rise[i] >= 0.7 && L.rise[i] <= 0.85, `stair ${cx},${cz}: ${L.rise[i]} m a tile`);
        lo = Math.min(lo, L.h[i]); hi = Math.max(hi, L.h[i] + L.rise[i]);
      }
      assert.ok(Math.abs(hi - lo - 4.5) < 1e-6, `stair ${cx},${cz} climbs ${hi - lo}`);
      assert.equal(tiles, 12);
      n++;
    }
  }
  assert.ok(n >= 10, `${n} stair chunks`);
});

test('L5 stair rooms: straight and u-turn flights are 0.6-0.9 m a tile, every flight tops out at the upper floor', () => {
  const kinds = new Set();
  for (let s = 0; s < 80; s++) {
    const g = stairRoom(rngFor(1, s, 0, 9));
    kinds.add(g.variant);
    if (g.variant === 'spiral') {
      const sp = g.spirals[0];
      assert.equal(sp.h1 - sp.h0, 4.5);
      continue;
    }
    let top = -Infinity;
    for (let i = 0; i < g.n * g.n; i++) if (g.tiles[i] === RAMP) {
      assert.ok(g.rise[i] >= 0.6 && g.rise[i] <= 0.9, `${g.variant}: ${g.rise[i]} m a tile`);
      top = Math.max(top, g.h[i] + g.rise[i]);
    }
    assert.ok(Math.abs(top - 4.5) < 1e-6, `${g.variant} tops out at ${top}`);
  }
  assert.deepEqual([...kinds].sort(), ['spiral', 'straight', 'uturn']);
});

test('L5 an old save (h = 3 or -3) is read into the new world and lands on a floor that can be stood on', () => {
  let tried = 0, moved = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (let k = 0; k < 400; k++) {
      const x = ((k * 37) % 120) - 60 + 0.5, z = ((k * 53) % 120) - 60 + 0.5;
      for (const h of [3, -3]) {
        const p = new Player();
        p.reset(x, z, 0, h);
        p.teleport(w, x, z, 0, h);
        const t = w.typeAt(Math.floor(x), Math.floor(z));
        if (!walkable(t) || t === SPIRAL || w.cellOf(Math.floor(x), Math.floor(z))[0].block[w.cellOf(Math.floor(x), Math.floor(z))[1]]) continue;   // a spiral's centre is its column
        tried++;
        assert.ok(p.canStand(w, p.x, p.z, p.floorH), `seed ${seed} ${x},${z} h ${h} → ${p.floorH}`);
        assert.ok(Math.abs(p.floorH - w.floorAt(x, z)) < 5, 'landed on some floor of this column');
        if (Math.abs(p.floorH - h) > 0.01) moved++;
      }
    }
  }
  assert.ok(tried > 500, `${tried} saves tried`);
  assert.ok(moved > 0, 'some old heights had to move');
});

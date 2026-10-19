// Inner layer, batch 4 L10: deeper shallow pools — share by tension, stepped floors, eye height and pace, fences that never wall anyone in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { Player } from '../../js/player.js';
import { SHALLOW, FLOOR, FORM_DEEPER, STEP_UP, STEP_DOWN, walkable } from '../../js/tiles.js';
import { gridReach, walkTop } from '../../js/levels.js';

// a layout seen as a grid in chunk-local coordinates, as the reach checks in levels.js read it
const asGrid = (L, rails) => ({ ...L, ox: 0, oz: 0, rails: rails.map((r) => ({ ...r, x0: r.x0 - L.ox, x1: r.x1 - L.ox, z0: r.z0 - L.oz, z1: r.z1 - L.oz })) });
const chunks = function* (w, R) { for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) yield [cx, cz]; };
// since batch 6 a pool's depth is its region's: the regions with pools of their own (not the pillar pools or sunken walkways)
const regionsIn = (w, R) => {
  const out = new Map();
  for (let bz = -R * 4; bz < R * 4; bz += 2) for (let bx = -R * 4; bx < R * 4; bx += 2) {
    const id = w.regions.blockId(bx, bz);
    if (!out.has(id)) out.set(id, w.regions.region(id));
  }
  return [...out.values()].filter((P) => !P.arche);
};
const depthAt = (w, x, z) => w.regions.depthOf(w.regions.region(w.regions.tileId(x, z)));
// a sealed room's inside is shut off by design
const sealedAt = (w, x, z) => { const S = w.regions.region(w.regions.tileId(x, z)).sealed; return !!S && x >= S.x && z >= S.z && x < S.x + S.w && z < S.z + S.d; };

test('L10 chosen depths persist; pools have climbable steps and exits', () => {
  const chosen = new World(5);
  const region = regionsIn(chosen, 4)[0];
  assert.ok(region, 'region sampled');
  const first = chosen.regions.depthOf(region);
  chosen.tension = 1;
  chosen.regions.params.clear();
  assert.equal(chosen.regions.depthOf(chosen.regions.region(region.id)), first, 'chosen depth survives tension changes');
  let pools = 0;
  const deepest = { 0.9: 0, 1.4: 0 };
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    w.tension = 1;
    for (const [cx, cz] of chunks(w, 10)) {
      if (!w.isRegion(cx, cz) || w.lm.levelOf(cx, cz) < 0) continue;   // B1's channels: basement.test.mjs
      const L = w.layout(cx, cz);
      let low = -1;
      for (let i = 0; i < 256; i++) {
        if (L.tiles[i] !== SHALLOW) continue;
        const x = i % 16, z = (i / 16) | 0, depth = depthAt(w, L.ox + x, L.oz + z);
        for (const [dx, dz] of [[1, 0], [0, 1]]) {
          const a = x + dx, b = z + dz;
          if (a > 15 || b > 15 || L.tiles[b * 16 + a] !== SHALLOW) continue;
          assert.ok(Math.abs(L.h[i] - L.h[b * 16 + a]) <= 0.42 + 1e-6, 'a step under water is at most 0.42 m');
        }
        if (L.form[i] & FORM_DEEPER) {
          assert.ok(L.h[i] >= L.baseY - depth - 0.021, `floor ${L.h[i]} deeper than ${depth}`);
          deepest[depth] = Math.min(deepest[depth] ?? 0, L.h[i] - L.baseY);
          if ((low < 0 || L.h[i] < L.h[low]) && !sealedAt(w, L.ox + x, L.oz + z) && !L.block[i]) low = i;   // not under a slide's tube
        }
      }
      if (low < 0) continue;
      pools++;
      // from the deepest tile there is a way out onto the rim (0.4 m down), from where the region's floor takes over
      const x = L.ox + (low % 16), z = L.oz + ((low / 16) | 0);
      const ok = w.reachFrom([[x, z, 0]], x - 24, z - 24, x + 24, z + 24);
      let out = false;
      for (let b = z - 24; b < z + 24 && !out; b++) for (let a = x - 24; a < x + 24; a++) {
        if (w.typeAt(a, b) === SHALLOW && w.hAt(a, b) >= L.baseY - 0.401 && ok(a, b, 0)) { out = true; break; }
      }
      assert.ok(out, `chunk ${cx},${cz}: the deepest tile cannot climb to the rim`);
    }
  }
  assert.ok(pools > 50, `${pools} chunks with a dug pool`);
  assert.ok(deepest[0.9] <= -0.9 && deepest[1.4] <= -1.4, `deepest ${JSON.stringify(deepest)}`);
});

// stand a player in the deepest water of a region pool of the given depth
function wader(depth) {
  for (const seed of [1, 2, 3, 4]) {
    const w = new World(seed);
    w.tension = 1;
    for (const [cx, cz] of chunks(w, 10)) {
      if (!w.isRegion(cx, cz) || w.lm.levelOf(cx, cz) !== 0) continue;
      const L = w.layout(cx, cz);
      let best = -1;
      for (let i = 0; i < 256; i++) {
        if (L.tiles[i] !== SHALLOW || !(L.form[i] & FORM_DEEPER) || depthAt(w, L.ox + (i % 16), L.oz + ((i / 16) | 0)) !== depth) continue;
        if (best < 0 || L.h[i] < L.h[best]) best = i;
      }
      if (best < 0 || L.h[best] > -depth + 0.05) continue;
      const p = new Player();
      p.reset(L.ox + (best % 16) + 0.5, L.oz + ((best / 16) | 0) + 0.5, 0, L.h[best]);
      p.settle(w, 0);
      return { w, p };
    }
  }
  throw new Error('no pool');
}

test('L10 deeper water slows movement without stopping it', () => {
  const { w, p } = wader(1.4);
  assert.ok(p.inWater && p.waterDepth > 1.35);
  const mid = wader(0.9);
  // pace: one free step forward covers less ground in 1.4 m of water than in 0.9 m
  const dt = 0.05;
  const step = (q, w2) => { const x0 = q.x, z0 = q.z; for (let k = 0; k < 10; k++) q.update(w2, dt, { x: 0, z: 1, run: false }); return Math.hypot(q.x - x0, q.z - z0); };
  const deepStep = step(p, w), midStep = step(mid.p, mid.w);
  assert.ok(deepStep > 0 && deepStep < midStep, `1.4 m moved ${deepStep.toFixed(3)}, 0.9 m moved ${midStep.toFixed(3)}`);
});


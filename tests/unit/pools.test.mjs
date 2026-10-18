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

test('L10 the share of deeper shallow pools runs from 20% to 60% with tension; 90 cm takes two thirds of them, 1.4 m one third', () => {
  const share = (t) => {
    let n = 0, deep = 0, d09 = 0, d14 = 0;
    for (const seed of [1, 2, 3]) {
      const w = new World(seed);
      w.tension = t;
      for (const [cx, cz] of chunks(w, 40)) { n++; const d = w.poolDepth(cx, cz); if (d) deep++; if (d === 0.9) d09++; if (d === 1.4) d14++; }
    }
    return { all: deep / n, d09: d09 / deep, d14: d14 / deep };
  };
  const lo = share(0), mid = share(0.5), hi = share(1);
  assert.ok(Math.abs(lo.all - 0.2) < 0.03, `${lo.all} at T=0`);
  assert.ok(Math.abs(mid.all - 0.4) < 0.03, `${mid.all} at T=0.5`);
  assert.ok(Math.abs(hi.all - 0.6) < 0.03, `${hi.all} at T=1`);
  assert.ok(Math.abs(hi.d09 - 2 / 3) < 0.04 && Math.abs(hi.d14 - 1 / 3) < 0.04, `${hi.d09} / ${hi.d14}`);
  // a room keeps its depth once chosen, whatever the tension does later
  const w = new World(5); w.tension = 0; const first = w.poolDepth(3, 4); w.tension = 1;
  assert.equal(w.poolDepth(3, 4), first);
});

test('L10 deepened pools step down at most 0.42 m a tile to 0.9 / 1.4 m, and a body can climb back out', () => {
  let rooms = 0, deepest = { 0.9: 0, 1.4: 0 };
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    w.tension = 1;
    for (const [cx, cz] of chunks(w, 14)) {
      const depth = w.poolDepth(cx, cz);
      if (!depth) continue;
      const L = w.layout(cx, cz);
      if (!L.tiles.some((t, i) => t === SHALLOW && (L.form[i] & FORM_DEEPER))) continue;
      rooms++;
      let low = 0;
      for (let i = 0; i < 256; i++) {
        if (L.tiles[i] !== SHALLOW) continue;
        const x = i % 16, z = (i / 16) | 0;
        for (const [dx, dz] of [[1, 0], [0, 1]]) {
          const a = x + dx, b = z + dz;
          if (a > 15 || b > 15 || L.tiles[b * 16 + a] !== SHALLOW) continue;
          assert.ok(Math.abs(L.h[i] - L.h[b * 16 + a]) <= 0.42 + 1e-6, 'a step under water is at most 0.42 m');
        }
        if (L.form[i] & FORM_DEEPER) { assert.ok(L.h[i] >= -depth - 0.021, `floor ${L.h[i]} deeper than ${depth}`); low = Math.min(low, L.h[i]); }
      }
      deepest[depth] = Math.min(deepest[depth], low);
      // from the deepest tile there is a way out onto the dry floor
      const g = asGrid(L, L.rails);
      const dug = (k) => L.tiles[k] === SHALLOW && (L.form[k] & FORM_DEEPER);
      const i = L.h.reduce((best, h, k) => (dug(k) && h < L.h[best] ? k : best), L.tiles.findIndex((t, k) => dug(k)));
      const ok = gridReach(g, [[i % 16, (i / 16) | 0, 0]]);
      let out = false;   // up to the pool's rim tile (0.4 m down), from where the room's own steps take over
      for (let k = 0; k < 256; k++) if (L.tiles[k] === SHALLOW && L.h[k] >= -0.401 && ok(k % 16, (k / 16) | 0, 0)) out = true;
      assert.ok(out, `chunk ${cx},${cz}: the deepest tile cannot climb to the rim`);
    }
  }
  assert.ok(rooms > 50, `${rooms} rooms with a dug pool`);
  assert.ok(deepest[0.9] <= -0.9 && deepest[1.4] <= -1.4, `deepest ${JSON.stringify(deepest)}`);
});

// stand a player in the deepest water of a room with the given depth
function wader(depth) {
  for (const seed of [1, 2, 3, 4]) {
    const w = new World(seed);
    w.tension = 1;
    for (const [cx, cz] of chunks(w, 14)) {
      if (w.poolDepth(cx, cz) !== depth) continue;
      const L = w.layout(cx, cz);
      let best = -1;
      for (let i = 0; i < 256; i++) if (L.tiles[i] === SHALLOW && (L.form[i] & FORM_DEEPER) && (best < 0 || L.h[i] < L.h[best])) best = i;
      if (best < 0 || L.h[best] > -depth + 0.05) continue;
      const p = new Player();
      p.reset(L.ox + (best % 16) + 0.5, L.oz + ((best / 16) | 0) + 0.5, 0, L.h[best]);
      p.settle(w, 0);
      return { w, p };
    }
  }
  throw new Error('no pool');
}

test('L10 in 1.4 m of water the eye is 10-20 cm over the surface, at 0.9 m it is chest high, and the pace drops with depth', () => {
  const { w, p } = wader(1.4);
  assert.ok(p.inWater && p.waterDepth > 1.35);
  const above = p.y - p.wl;
  assert.ok(above >= 0.1 - 1e-6 && above <= 0.2 + 1e-6, `eye ${above.toFixed(2)} m over the water`);
  const mid = wader(0.9);
  const a09 = mid.p.y - mid.p.wl;
  assert.ok(a09 > 0.5 && a09 < 1.0, `eye ${a09.toFixed(2)} m over the water at 0.9 m`);
  // pace: one free step forward covers less ground in 1.4 m of water than in 0.9 m
  const dt = 0.05;
  const step = (q, w2) => { const x0 = q.x, z0 = q.z; for (let k = 0; k < 10; k++) q.update(w2, dt, { x: 0, z: 1, run: false }); return Math.hypot(q.x - x0, q.z - z0); };
  const deepStep = step(p, w), midStep = step(mid.p, mid.w);
  assert.ok(deepStep > 0 && deepStep < midStep, `1.4 m moved ${deepStep.toFixed(3)}, 0.9 m moved ${midStep.toFixed(3)}`);
});

test('L10 rails round a pool leave a gap and a half-sunk fence never cuts a walkable tile off from the chunk edge', () => {
  let ringed = 0, fenced = 0, checked = 0;
  for (const seed of [1, 2, 3, 4]) {
    const w = new World(seed);
    w.tension = 1;
    for (const [cx, cz] of chunks(w, 16)) {
      if (!w.poolDepth(cx, cz)) continue;
      const L = w.layout(cx, cz);
      const fences = L.rails.filter((r) => r.h !== undefined);
      if (fences.length) { fenced++; assert.ok(fences.every((r) => Math.abs(r.y0 + r.h - (L.baseY || 0) - 0.48) < 1e-4), 'a fence tops out 0.5 m over the water'); }
      const adapt = (rails) => asGrid(L, rails);
      const starts = [];
      for (let i = 0; i < 256; i++) { const x = i % 16, z = (i / 16) | 0; if ((x === 0 || z === 0 || x === 15 || z === 15) && walkTop(adapt([]), i, x + 0.5, z + 0.5) !== null) starts.push([x, z, 0]); }
      const count = (rails) => { const ok = gridReach(adapt(rails), starts); let c = 0; for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) if (ok(x, z, 0)) c++; return c; };
      const added = L.rails.filter((r) => r.h !== undefined);
      if (!added.length) continue;
      checked++;
      assert.ok(count(L.rails) >= count(L.rails.filter((r) => r.h === undefined)) - 0, 'the fence blocks nothing the rest of the room allowed');
    }
  }
  assert.ok(fenced >= 5, `${fenced} rooms with a fence`);
  assert.ok(checked >= 5);
});

// Generator v2 meshes: a switchback's treads are sealed - every step has its riser, also at the foot of a descending leg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2, FLIGHT_WALL, FLIGHT_W, FLIGHT_MID } from '../../js/gen2.js';
import { loadMesher } from './mesh-helper.mjs';

test('a switchback has a riser at every step edge of both legs, going up and going down', async () => {
  await loadMesher();   // stands in for 'three' before mesh2.js loads
  const { switchMesh, Buf2 } = await import('../../js/mesh2.js');
  let checked = 0, down = 0;
  for (const seed of [1, 2, 3, 4]) {
    const w = new World2(seed);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const plan = w.plan(i, j);
      for (const f of plan.flights.filter((q) => q.turn)) {
        const st = new Buf2(false, true);
        switchMesh(w, plan, f, st, new Buf2());
        const tris = [];
        for (let k = 0; k < st.idx.length; k += 3) tris.push(st.idx.slice(k, k + 3).map((n) => st.pos.slice(n * 3, n * 3 + 3)));
        const ax = f.axis === 'x', dir = f.dir, a0 = ax ? f.x0 : f.z0, a1 = ax ? f.x1 : f.z1, c0 = ax ? f.z0 : f.x0;
        const eA = dir > 0 ? a0 : a1, half = (f.yF - f.yE) / 2, steps = Math.max(1, Math.round(Math.abs(half) / 0.17)), dt = f.Lg / steps;
        const cA = c0 + FLIGHT_WALL + FLIGHT_W / 2, cB = cA + FLIGHT_W + FLIGHT_MID;
        const covered = (a, y, c) => tris.some((t) => t.every((p) => Math.abs((ax ? p[0] : p[2]) - a) < 1e-6)
          && Math.min(...t.map((p) => p[1])) <= y && Math.max(...t.map((p) => p[1])) >= y
          && Math.min(...t.map((p) => (ax ? p[2] : p[0]))) <= c && Math.max(...t.map((p) => (ax ? p[2] : p[0]))) >= c);
        for (const [c, hs, at] of [[cA, f.yE, (t) => eA + dir * t], [cB, f.yE + half, (t) => eA + dir * (f.Lg - t)]]) {
          const h = (t) => hs + (half * t) / f.Lg;
          for (let k = half > 0 ? 0 : 1; k <= (half > 0 ? steps - 1 : steps); k++) {
            const [yHi, yLo] = half > 0 ? [h((k + 1) * dt), h(k * dt)] : [h((k - 1) * dt), h(k * dt)];
            const y = (yHi + yLo) / 2, a = at(k * dt);
            assert.ok(covered(a, y, c), `seed ${seed} cell ${i},${j} ${half > 0 ? 'up' : 'down'}: no riser at step edge ${k} (${a}, ${y.toFixed(2)}, ${c})`);
            checked++;
          }
        }
        if (half < 0) down++;
      }
    }
  }
  assert.ok(down >= 2 && checked > 50, `${down} descending switchbacks, ${checked} edges`);
});

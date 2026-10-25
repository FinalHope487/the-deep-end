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
    const w = new World2(seed, { clusterShare: 0 });
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

// where a low ceiling (a corridor) meets a higher one (a hall), the strip of wall above the low ceiling belongs to the higher
// room: its front must look into the higher room, or the hall sees a hole there (the face is culled from behind)
test('a ceiling step is walled from the higher room: no hole above a corridor mouth', async () => {
  await loadMesher();
  const { buildCell2 } = await import('../../js/mesh2.js');
  const { cellRaster, Q2 } = await import('../../js/gen2.js');
  let checked = 0, bad = 0;
  const first = [];
  for (const seed of [1, 8, 42]) {
    const w = new World2(seed, { clusterShare: 0 });
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [-1, 0], [2, 2]]) {
      const it = buildCell2(w, i, j);
      let r = it.next();
      while (!r.done) r = it.next();
      const geo = r.value.static, pos = geo.attributes.position.array, idx = geo.index.array;
      const tris = [];
      for (let k = 0; k < idx.length; k += 3) {
        const p = [0, 1, 2].map((q) => [pos[idx[k + q] * 3], pos[idx[k + q] * 3 + 1], pos[idx[k + q] * 3 + 2]]);
        const u = p[1].map((v, q) => v - p[0][q]), v = p[2].map((x, q) => x - p[0][q]);
        tris.push({ p, n: [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]] });
      }
      const R = cellRaster(w, i, j, 0), n = R.n, Y = w.Y[0];
      for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
        const k = b * n + a;
        if (!R.inside[k] || R.flight[k]) continue;
        for (const [da, db] of [[1, 0], [0, 1]]) {
          if (a + da >= n || b + db >= n) continue;
          const m = (b + db) * n + a + da;
          if (!R.inside[m] || R.flight[m] || R.ceil[m] === R.ceil[k]) continue;
          const toward = (R.ceil[k] < R.ceil[m] ? 1 : -1);   // +1: the higher room is the one at larger x / z
          const plane = da ? R.ox + (a + 1) * Q2 : R.oz + (b + 1) * Q2, along = da ? R.oz + (b + 0.5) * Q2 : R.ox + (a + 0.5) * Q2;
          const y = Y + (R.ceil[k] + R.ceil[m]) / 2, ax = da ? 0 : 2, ac = da ? 2 : 0;
          const hit = tris.filter((t) => t.p.every((q) => Math.abs(q[ax] - plane) < 1e-6)
            && Math.min(...t.p.map((q) => q[1])) <= y && Math.max(...t.p.map((q) => q[1])) >= y
            && Math.min(...t.p.map((q) => q[ac])) <= along && Math.max(...t.p.map((q) => q[ac])) >= along);
          checked++;
          if (!hit.some((t) => Math.sign(t.n[ax]) === toward)) { bad++; if (first.length < 3) first.push(`seed ${seed} cell ${i},${j} edge ${a},${b} ${da ? 'x' : 'z'}: ${hit.length} faces, none looking into the higher room`); }
        }
      }
    }
  }
  assert.ok(checked > 100, `${checked} ceiling steps`);
  assert.equal(bad, 0, `${bad} of ${checked} steps have no face into the higher room: ${first.join('; ')}`);
});

// the wall strip above the lower ceiling continues the higher room's wall: that room's lamps at the foot, 0.82 of it at the
// top (the same dimming as every other wall), the basement tint on B1; a flat grey shows as a pale patch in a dim hall
test("a ceiling step uses the higher room's wall lighting and vertical shade", async () => {
  await loadMesher();
  const { buildCell2 } = await import('../../js/mesh2.js');
  const { cellRaster, Q2, floorRise2 } = await import('../../js/gen2.js');
  const { lightAt } = await import('../../js/lighting.js');
  const WALL = [0.93, 0.935, 0.93], B1_TINT = [0.36, 0.52, 0.6], EPS = 1e-5;
  const seen = { 0: 0, '-1': 0 };
  let bad = 0, checked = 0, sloped = 0;
  const first = [];
  for (const seed of [1, 8, 42]) {
    const w = new World2(seed, { clusterShare: 0 });
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [-1, 0], [2, 2]]) {
      const it = buildCell2(w, i, j);
      let r = it.next();
      while (!r.done) r = it.next();
      const geo = r.value.static, pos = geo.attributes.position.array, col = geo.attributes.color.array, idx = geo.index.array;
      const plan = w.plan(i, j), roomOf = new Map(plan.rooms.map((o) => [o.id, o]));
      for (const lv of [0, -1]) {
        const R = cellRaster(w, i, j, lv), n = R.n, Y = w.Y[lv], tint = lv < 0 ? B1_TINT : [1, 1, 1];
        for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
          const k = b * n + a;
          if (!R.inside[k] || R.flight[k]) continue;
          for (const [da, db] of [[1, 0], [0, 1]]) {
            if (a + da >= n || b + db >= n) continue;
            const m = (b + db) * n + a + da;
            if (!R.inside[m] || R.flight[m] || R.ceil[m] === R.ceil[k]) continue;
            const high = R.ceil[k] > R.ceil[m] ? k : m, room = roomOf.get(R.room[high]);
            const lo = Y + Math.min(R.ceil[k], R.ceil[m]), hi = Y + Math.max(R.ceil[k], R.ceil[m]);
            const plane = da ? R.ox + (a + 1) * Q2 : R.oz + (b + 1) * Q2, ax = da ? 0 : 2, ac = da ? 2 : 0;
            const c0 = da ? R.oz + b * Q2 : R.ox + a * Q2;
            const near = (p, q) => Math.abs(p - q) < 1e-6;
            let found = 0;
            for (let t = 0; t < idx.length; t += 3) {
              const vs = [0, 1, 2].map((q) => idx[t + q]);
              if (!vs.every((v) => near(pos[v * 3 + ax], plane) && pos[v * 3 + ac] > c0 - 1e-6 && pos[v * 3 + ac] < c0 + Q2 + 1e-6)) continue;
              const ys = vs.map((v) => pos[v * 3 + 1]);
              if (!near(Math.min(...ys), lo) || !near(Math.max(...ys), hi)) continue;
              found++;
              for (const v of vs) {
                const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
                const rise = floorRise2(room, x, z), tt = Math.max(0, Math.min(1, (y - Y - rise) / R.ceil[high]));
                const lit = lightAt(room.lamps, x, z) * (1 - 0.18 * tt);
                if (room.slope) sloped++;
                const want = WALL.map((c, q) => c * lit * tint[q]);
                for (let q = 0; q < 3; q++) if (Math.abs(col[v * 3 + q] - want[q]) > EPS) { bad++; if (first.length < 3) first.push(`seed ${seed} cell ${i},${j} lv ${lv} (${x},${y.toFixed(2)},${z}): got ${col[v * 3 + q].toFixed(4)} want ${want[q].toFixed(4)}`); break; }
                checked++;
              }
            }
            if (found) seen[lv]++;
          }
        }
      }
    }
  }
  assert.ok(seen[0] > 50 && seen[-1] > 5, `steps found: 1F ${seen[0]}, B1 ${seen[-1]}`);
  assert.ok(checked > 300, `${checked} vertices`);
  assert.equal(bad, 0, `${bad} of ${checked} step vertices have the wrong colour: ${first.join('; ')} (${sloped} on sloped rooms)`);
});

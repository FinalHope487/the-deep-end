// Inner layer, batch 6 step 3: facilities on region floor. A tower is a raised platform reached by a ladder or a spiral
// stair, with a slide down off one side. Some stand where the land asks for them (every pillar pool gets towers with a
// caged ladder, pools get slides landing in them), the rest are scattered, more of them as the tension rises. None clips
// a wall or shuts a walker in; the platform's drops are railed, as is every other drop of 0.7 m and more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, SPAWN } from '../../js/world.js';
import { FLOOR, WALL, SHALLOW, SPIRAL, CHUNK, DIRS } from '../../js/tiles.js';
import { Player } from '../../js/player.js';

// every tower of the region chunks in a box, with the chunk holding it
function* towers(w, R) {
  for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
    if (!w.isRegion(cx, cz)) continue;
    const L = w.layout(cx, cz);
    for (const t of L.towers || []) yield { L, t };
  }
}
const regionAt = (w, x, z) => { const R = w.regionsOf(w.lm.levelOf(Math.floor(x / CHUNK), Math.floor(z / CHUNK))); return R.region(R.tileId(x, z)); };

test('F1 towers stand on region floor, reached by a ladder or a spiral stair, most with a slide; more of them as the tension rises', () => {
  const count = (tension) => {
    const n = { towers: 0, ladder: 0, spiral: 0, slide: 0, chunks: 0 };
    for (const seed of [1, 2, 3]) {
      const w = new World(seed);
      w.tension = tension;
      for (let cz = -14; cz <= 14; cz++) for (let cx = -14; cx <= 14; cx++) if (w.isRegion(cx, cz)) n.chunks++;
      for (const { L, t } of towers(w, 14)) {
        n.towers++;
        n[t.access]++;
        if (L.slides.some((s) => s.entry && Math.abs(s.entry.h - (L.baseY + t.h)) < 1e-6)) n.slide++;
      }
    }
    return n;
  };
  const calm = count(0), tense = count(1);
  assert.ok(calm.towers > 40, `${calm.towers} towers in ${calm.chunks} region chunks at tension 0`);
  assert.ok(calm.ladder > 10 && calm.spiral > 10, `${calm.ladder} by ladder, ${calm.spiral} by spiral`);
  assert.ok(calm.slide / calm.towers > 0.5, `${calm.slide} of ${calm.towers} with a slide`);
  assert.ok(tense.towers > 1.4 * calm.towers, `${calm.towers} towers at tension 0, ${tense.towers} at tension 1`);
});

test('F2 pillar pools carry towers with caged ladders standing in their water; ladders elsewhere are open', () => {
  let caged = 0, pools = 0;
  const pillarPools = new Set();
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (let cz = -14; cz <= 14; cz++) for (let cx = -14; cx <= 14; cx++) {
      if (!w.isRegion(cx, cz) || w.lm.levelOf(cx, cz) < 0) continue;
      const L = w.layout(cx, cz);
      for (let i = 0; i < 256; i += 17) { const P = regionAt(w, L.ox + (i % 16), L.oz + (i >> 4)); if (P.arche === 'pillarpool') pillarPools.add(seed + ':' + P.id); }
    }
    for (const { L } of towers(w, 14)) for (const l of L.ladders) {
      const fx = Math.floor(l.x + l.nx * 0.5), fz = Math.floor(l.z + l.nz * 0.5), P = regionAt(w, fx, fz);
      if (P.arche === 'pillarpool') { assert.ok(l.cage, `the ladder at ${l.x},${l.z} in a pillar pool is caged`); assert.equal(w.typeAt(fx, fz), SHALLOW, 'its foot stands in the water'); caged++; pools++; }
      else assert.ok(!l.cage, `the ladder at ${l.x},${l.z} outside a pillar pool is open`);
    }
  }
  assert.ok(pillarPools.size > 10 && caged > 8, `${caged} caged ladders in ${pillarPools.size} pillar pools`);
});

test('F3 nothing clips: a tower and its access stand on what was open floor, with 2 m of headroom on top, inside its chunk', () => {
  let n = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (const { L, t } of towers(w, 14)) {
      n++;
      const ceilAt = (x, z) => { const [M, j] = w.cellOf(x, z); return M.ceilT[j]; };
      for (let z = t.z0; z <= t.z1; z++) for (let x = t.x0; x <= t.x1; x++) {
        assert.equal(w.typeAt(x, z), FLOOR, `tower tile ${x},${z}`);
        assert.ok(Math.abs(w.hAt(x, z) - L.baseY - t.h) < 1e-6, `tower tile ${x},${z} at the platform's height`);
        assert.ok(ceilAt(x, z) - t.h >= 2 - 1e-6, `headroom over ${x},${z}: ${ceilAt(x, z) - t.h}`);
      }
      assert.ok(t.x0 >= L.ox + 1 && t.z0 >= L.oz + 1 && t.x1 <= L.ox + 14 && t.z1 <= L.oz + 14, 'inside its chunk');
      if (t.access === 'spiral') {
        const s = L.spirals.find((q) => Math.abs(q.h1 - L.baseY - t.h) < 1e-6);
        assert.ok(s, 'its spiral is listed');
        for (let z = Math.floor(s.z) - 2; z < Math.floor(s.z) + 2; z++) for (let x = Math.floor(s.x) - 2; x < Math.floor(s.x) + 2; x++) {
          const ty = w.typeAt(x, z);
          assert.ok(ty === SPIRAL || ty === FLOOR, `spiral tile ${x},${z} is ${ty}`);
          assert.ok(ceilAt(x, z) - t.h >= 2 - 1e-6, `headroom over the spiral at ${x},${z}`);
        }
      } else {
        const l = L.ladders.find((q) => Math.abs(q.h1 - L.baseY - t.h) < 1e-6);
        assert.ok(l, 'its ladder is listed');
        const fx = Math.floor(l.x + l.nx * 0.5), fz = Math.floor(l.z + l.nz * 0.5), [M, j] = w.cellOf(fx, fz);
        assert.ok(M.tiles[j] === FLOOR || M.tiles[j] === SHALLOW, `the ladder's foot ${fx},${fz} stands on floor`);
        assert.ok(!M.block[j], 'nothing blocks its foot');
        assert.ok(Math.abs(M.h[j] - l.h0) < 1e-6, 'the ladder starts on its foot tile');
      }
    }
  }
  assert.ok(n > 40, `${n} towers`);
});

test('F4 no walker is shut in or out: every platform and every tile round a tower can be reached from spawn, by ladders too', () => {
  for (const seed of [1, 2]) {
    const w = new World(seed), R = 12;
    const ok = w.reachFrom([[Math.floor(SPAWN.x), Math.floor(SPAWN.z), 0]], -R * CHUNK, -R * CHUNK, (R + 1) * CHUNK, (R + 1) * CHUNK);
    let n = 0;
    const sealed = [];   // the inside of a sealed room is never reached, by design (listed by the chunk holding its middle)
    for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) sealed.push(...w.layout(cx, cz).sealed);
    const shut = (x, z) => sealed.some((q) => x >= q.x && z >= q.z && x < q.x + q.w && z < q.z + q.d);
    for (const { L, t } of towers(w, R - 2)) {
      n++;
      for (let z = t.z0 - 2; z <= t.z1 + 2; z++) for (let x = t.x0 - 2; x <= t.x1 + 2; x++) {
        const [M, j] = w.cellOf(x, z);
        if ((M.tiles[j] !== FLOOR && M.tiles[j] !== SHALLOW) || M.block[j] || shut(x, z)) continue;
        assert.ok(ok(x, z, 0) || ok(x, z, 1), `seed ${seed}: ${x},${z} by the tower at ${t.x0},${t.z0} (${t.access}) cannot be reached`);
      }
    }
    assert.ok(n > 5, `${n} towers near spawn`);
  }
});

test('F5 every drop of 0.7 m and more between floor tiles of region floor is railed, but where a ladder or a slide leaves it; smaller drops are not, but round small pools', () => {
  let drops = 0, open = 0;
  const bad = [];
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (let cz = -12; cz <= 12; cz++) for (let cx = -12; cx <= 12; cx++) {
      if (!w.isRegion(cx, cz)) continue;
      const L = w.layout(cx, cz);
      const railed = new Set(L.rails.map((r) => `${Math.min(r.x0, r.x1)},${Math.min(r.z0, r.z1)},${r.x0 === r.x1 ? 1 : 0}`));
      const exits = new Set();
      for (const l of L.ladders) exits.add(`${Math.round(l.x * 2)},${Math.round(l.z * 2)}`);
      for (const s of L.slides) if (s.entry) exits.add(`${Math.round(s.entry.x * 2)},${Math.round(s.entry.z * 2)}`);
      for (let z = 1; z < 15; z++) for (let x = 1; x < 15; x++) {
        const i = z * 16 + x;
        if (L.tiles[i] !== FLOOR && L.tiles[i] !== SHALLOW) continue;
        DIRS.forEach(([dx, dz]) => {
          const j = (z + dz) * 16 + x + dx;
          if (L.tiles[j] !== FLOOR && L.tiles[j] !== SHALLOW) return;
          const drop = L.h[i] - L.h[j], X = L.ox + x, Z = L.oz + z;
          const ex = X + 0.5 + dx * 0.5, ez = Z + 0.5 + dz * 0.5, key = dx ? `${X + (dx > 0 ? 1 : 0)},${Z},1` : `${X},${Z + (dz > 0 ? 1 : 0)},0`;
          if (exits.has(`${Math.round(ex * 2)},${Math.round(ez * 2)}`)) { open++; return; }
          if (drop >= 0.7 - 1e-6) { drops++; if (!railed.has(key)) bad.push(`seed ${seed} ${X},${Z} → ${dx},${dz}: ${drop.toFixed(2)} m unrailed`); }
          else if (drop > -1e-6 && railed.has(key) && L.tiles[j] !== SHALLOW) bad.push(`seed ${seed} ${X},${Z} → ${dx},${dz}: a rail on a ${drop.toFixed(2)} m step`);
        });
      }
    }
  }
  assert.ok(drops > 200 && open > 40, `${drops} railed drops, ${open} ladder and slide exits`);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} wrong`);
});

test('F6 a body climbs a ladder: pushing towards it from its foot takes it up onto the platform, turning round at the top takes it back down', () => {
  const w = new World(1);
  let found = null;
  for (const { L } of towers(w, 14)) { const l = L.ladders[0]; if (l) { found = l; break; } }
  assert.ok(found, 'a ladder');
  const l = found, p = new Player(), forward = { x: 0, z: 1, run: false };
  const face = (nx, nz) => Math.atan2(nx, nz);   // forward is (-sin yaw, -cos yaw)
  p.teleport(w, l.x + l.nx * 0.7, l.z + l.nz * 0.7, face(l.nx, l.nz), l.h0);
  for (let k = 0; k < 300 && Math.abs(p.floorH - l.h1) > 1e-3; k++) p.update(w, 1 / 30, forward);
  assert.ok(Math.abs(p.floorH - l.h1) < 1e-3, `on top at ${p.floorH} (ladder ${l.h0} → ${l.h1})`);
  for (let k = 0; k < 15; k++) p.update(w, 1 / 30, forward);
  assert.ok(!p.climbing, 'stepped off onto the platform');
  const s = w.surfaceAt(p.x, p.z, p.floorH);
  assert.ok(s && Math.abs(s.h - l.h1) < 1e-3, 'standing on the platform');
  // back down: face the ladder's side and walk into it
  p.yaw = face(-l.nx, -l.nz);
  for (let k = 0; k < 400 && !(Math.abs(p.floorH - l.h0) < 1e-3 && !p.climbing); k++) p.update(w, 1 / 30, forward);
  assert.ok(Math.abs(p.floorH - l.h0) < 1e-3 && !p.climbing, `back at the foot: ${p.floorH}, climbing ${p.climbing}`);
});

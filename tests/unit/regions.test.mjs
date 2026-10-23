// Inner layer, batch 6 step 1: the ground floor is continuous region floor cut into chunks only for loading. Regions are
// 10-60 m, built from layers with several algorithms each; pillar pools and winding sunken walkways always turn up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, canStep, layoutHash, SPAWN } from '../../js/world.js';
import { FLOOR, WALL, SHALLOW, DEEP, SPIRAL, FORM_CYL, CHUNK, walkable } from '../../js/tiles.js';
import { walkTop } from '../../js/levels.js';
import { BLOCK, LEDGE_H } from '../../js/regions.js';

// the regions whose every block lies in 1F / 2F region chunks of a box of chunks round the origin (B1 has its own
// generator, basement.test.mjs)
const above = (w, cx, cz) => w.isRegion(cx, cz) && w.lm.levelOf(cx, cz) >= 0;
function sample(w, R) {
  const seen = new Map();
  for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
    if (!above(w, cx, cz)) continue;
    for (let bz = cz * 4; bz < cz * 4 + 4; bz++) for (let bx = cx * 4; bx < cx * 4 + 4; bx++) {
      const id = w.regions.blockId(bx, bz);
      if (!seen.has(id)) seen.set(id, w.regions.region(id));
    }
  }
  const whole = (P) => P.blocks.every(([bx, bz]) => above(w, Math.floor(bx / 4), Math.floor(bz / 4)) && Math.abs(Math.floor(bx / 4)) <= R + 3 && Math.abs(Math.floor(bz / 4)) <= R + 3);
  return [...seen.values()].filter(whole);
}
// a tile of a tower's platform (facilities.test.mjs checks those: railed, reached by ladder or spiral)
const onTower = (w, x, z) => w.cellOf(x, z)[0].towers.some((t) => x >= t.x0 && x <= t.x1 && z >= t.z0 && z <= t.z1);
const tilesOf = (P) => P.blocks.flatMap(([bx, bz]) => { const out = []; for (let z = 0; z < BLOCK; z++) for (let x = 0; x < BLOCK; x++) out.push([bx * BLOCK + x, bz * BLOCK + z]); return out; });

test('R1 region floor comes out the same whichever chunk is generated first', () => {
  let seam = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) {
      if (!w.isRegion(cx, cz)) continue;
      w.layout(cx, cz);
      if (w.joinsRegion(cx, cz, cx - 1, cz)) for (let z = 0; z < 16; z++) seam++;
      if (w.joinsRegion(cx, cz, cx, cz - 1)) for (let x = 0; x < 16; x++) seam++;
    }
    const v = new World(seed);
    for (let cz = 8; cz >= -8; cz--) for (let cx = 8; cx >= -8; cx--) assert.equal(layoutHash(v.layout(cx, cz)), layoutHash(w.layout(cx, cz)), `seed ${seed} chunk ${cx},${cz}`);
  }
  assert.ok(seam > 3000, `${seam} seam tiles`);
});

test('R3 the layered generator gives over a thousand different terrains in 2000 regions (tiles and heights only)', () => {
  const prints = new Set();
  let n = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const w = new World(seed);
    for (const P of sample(w, 12)) {
      if (n >= 2000) break;
      let h = 2166136261;
      const mix = (v) => { h ^= v & 0xff; h = Math.imul(h, 16777619); };
      for (const [x, z] of tilesOf(P)) { mix(x - P.x0); mix(z - P.z0); mix(w.typeAt(x, z)); mix(Math.round(w.hAt(x, z) * 10)); }
      prints.add(h >>> 0);
      n++;
    }
  }
  assert.ok(n >= 2000, `${n} regions sampled`);
  assert.ok(prints.size >= 1000, `${prints.size} different terrains`);
});

test('R4 pillar pools: big regions under water all over, round columns on a grid with some missing, depth differs from pool to pool', () => {
  let n = 0, missing = 0;
  const depths = new Set();
  for (const seed of [1, 2, 3, 4]) {
    const w = new World(seed);
    for (const P of sample(w, 14)) {
      if (P.arche !== 'pillarpool') continue;
      n++;
      const C = P.pillars;
      let deepest = 0;
      for (const [x, z] of tilesOf(P)) {
        const t = w.typeAt(x, z), [L, i] = w.cellOf(x, z);
        const lattice = (((x - C.ox) % C.sx) + C.sx) % C.sx === 0 && (((z - C.oz) % C.sz) + C.sz) % C.sz === 0;
        const rim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.regions.tileId(x + dx, z + dz) !== P.id);   // a boundary wall may stand there
        if (t === WALL) { if (lattice && !rim) assert.ok(L.form[i] & FORM_CYL, 'a round column'); continue; }
        if (lattice) missing++;
        if (t === SHALLOW) deepest = Math.min(deepest, w.hAt(x, z));
      }
      depths.add(Math.round(-deepest * 10));
    }
  }
  assert.ok(n >= 4, `${n} pillar pools`);
  assert.ok(missing > 0, 'some columns are missing');
  assert.ok(depths.size >= 2, `depths ${[...depths]}`);
});

test('R5 sunken walkways: deep water crossed by walkways that turn (never one straight line), every walkway tile reachable from the region edge', () => {
  let n = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const w = new World(seed);
    for (const P of sample(w, 14)) {
      if (P.arche !== 'sunk') continue;
      n++;
      assert.ok(!P.straight, `region ${P.id} has a straight walkway`);
      const T = tilesOf(P);
      const walk = T.filter(([x, z]) => w.typeAt(x, z) === SHALLOW);
      // the walkway rows and columns: a turning path covers more than one row and more than one column inside the rim
      const inner = walk.filter(([x, z]) => x > P.x0 + 2 && x < P.x1 - 2 && z > P.z0 + 2 && z < P.z1 - 2);
      assert.ok(new Set(inner.map(([, z]) => z)).size > 2 && new Set(inner.map(([x]) => x)).size > 2, `region ${P.id}: the walkway does not turn`);
      const edge = T.filter(([x, z]) => walkable(w.typeAt(x, z)) && (x === P.x0 || z === P.z0 || x === P.x1 || z === P.z1)).map(([x, z]) => [x, z, 0]);
      const ok = w.reachFrom(edge, P.x0 - 1, P.z0 - 1, P.x1 + 2, P.z1 + 2);
      for (const [x, z] of walk) assert.ok(ok(x, z, 0), `region ${P.id}: walkway ${x},${z} cut off`);
    }
  }
  assert.ok(n >= 3, `${n} sunken-walkway regions`);
});

test('R6 neighbouring standable tiles of region floor are a step apart both ways or a 0.55 m ledge between dry floors, and all of it is reachable from spawn', () => {
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    const R = 5, x0 = -R * CHUNK, x1 = (R + 1) * CHUNK;
    let ledges = 0;
    const top = (x, z) => { const [L, i] = w.cellOf(x, z); return walkTop(L, i, x + 0.5, z + 0.5); };
    for (let z = x0; z < x1; z++) for (let x = x0; x < x1; x++) {
      if (!w.isRegion(Math.floor(x / 16), Math.floor(z / 16))) continue;
      const a = top(x, z);
      if (a === null) continue;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        if (!w.joinsRegion(Math.floor(x / 16), Math.floor(z / 16), Math.floor((x + dx) / 16), Math.floor((z + dz) / 16))) continue;
        if (onTower(w, x, z) || onTower(w, x + dx, z + dz) || w.typeAt(x, z) === SPIRAL || w.typeAt(x + dx, z + dz) === SPIRAL) continue;
        const b = top(x + dx, z + dz);
        if (b === null) continue;
        const ledge = Math.abs(Math.abs(a - b) - LEDGE_H) < 1e-3 && w.typeAt(x, z) === FLOOR && w.typeAt(x + dx, z + dz) === FLOOR;
        assert.ok((canStep(a, b) && canStep(b, a)) || ledge, `seed ${seed}: ${x},${z} (${a}) → ${x + dx},${z + dz} (${b})`);
        if (ledge) ledges++;
      }
    }
    const ok = w.reachFrom([[SPAWN.x, SPAWN.z, 0]], x0 - 32, x0 - 32, x1 + 32, x1 + 32);
    const sealed = [];   // the inside of a sealed room is never reached, by design
    for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) for (const q of w.layout(cx, cz).sealed) sealed.push(q);
    const shut = (x, z) => sealed.some((q) => x >= q.x && z >= q.z && x < q.x + q.w && z < q.z + q.d);
    let lost = 0, all = 0;
    for (let z = x0 + 16; z < x1 - 16; z++) for (let x = x0 + 16; x < x1 - 16; x++) {
      if (!w.isRegion(Math.floor(x / 16), Math.floor(z / 16)) || top(x, z) === null || shut(x, z)) continue;
      all++;
      if (!ok(x, z, 0)) lost++;
    }
    assert.ok(all > 10000, `${all} tiles`);
    assert.equal(lost, 0, `seed ${seed}: ${lost} of ${all} region tiles cut off from spawn`);
    assert.ok(ledges > 10, `seed ${seed}: ${ledges} ledge edges`);
  }
});

test('R7 lamps do not overlap or touch walls and columns', () => {
  let lamps = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    const all = new Map();
    for (let cz = -7; cz <= 7; cz++) for (let cx = -7; cx <= 7; cx++) {
      if (!above(w, cx, cz)) continue;   // B1's narrow corridors hang their lamps against the wall
      for (const l of w.layout(cx, cz).lamps) {
        const f = l.full, x = cx * 16 + f.x, z = cz * 16 + f.z;
        all.set(`${x},${z},${f.w},${f.d}`, { x, z, w: f.w, d: f.d });
      }
    }
    const list = [...all.values()];
    lamps += list.length;
    for (const l of list) {
      for (let z = Math.floor(l.z - 0.5); z < Math.ceil(l.z + l.d + 0.5); z++) for (let x = Math.floor(l.x - 0.5); x < Math.ceil(l.x + l.w + 0.5); x++) {
        assert.notEqual(w.typeAt(x, z), WALL, `seed ${seed}: lamp at ${l.x},${l.z} (${l.w}×${l.d}) touches a wall at ${x},${z}`);
      }
      for (const m of list) {
        if (m === l) continue;
        const apart = l.x + l.w + 0.5 <= m.x || m.x + m.w + 0.5 <= l.x || l.z + l.d + 0.5 <= m.z || m.z + m.d + 0.5 <= l.z;
        assert.ok(apart, `seed ${seed}: lamps at ${l.x},${l.z} and ${m.x},${m.z} overlap`);
      }
    }
  }
  assert.ok(lamps > 500, `${lamps} lamps`);
});

test('R8 ankle-deep regions: their floor sinks 0.2-0.4 m under the shared water surface and stays walkable', () => {
  let tiles = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (const P of sample(w, 10)) {
      if (P.arche) continue;
      if (P.water !== 'ankle') continue;
      assert.ok(P.ankle >= 0.2 && P.ankle <= 0.4, `sink ${P.ankle}`);
      for (const [x, z] of tilesOf(P)) {
        const [L, i] = w.cellOf(x, z);
        if (L.tiles[i] !== FLOOR || !L.wet[i]) continue;
        tiles++;
        const surface = w.waterAt(x, z);
        assert.ok(Math.abs(surface + 0.02) < 1e-4, 'water on the shared surface');
        assert.ok(surface - L.h[i] >= 0.17 && surface - L.h[i] <= 0.4, `depth ${surface - L.h[i]}`);
      }
    }
  }
  assert.ok(tiles > 500, `${tiles} ankle-deep tiles`);
});

test('R9 rails only round pools of regions that ask for them, between their dry floor and their water, always leaving a gap', () => {
  let rails = 0, railed = 0, pools = 0, checked = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) {
      if (!w.isRegion(cx, cz)) continue;
      for (const rl of w.layout(cx, cz).rails) {
        if (onTower(w, rl.ax, rl.az)) continue;   // a platform's edge (F5)
        rails++;
        const P = w.regions.region(w.regions.tileId(rl.ax, rl.az));
        assert.ok(P.rail, `a rail at ${rl.ax},${rl.az} outside a railed pool`);
        assert.equal(w.typeAt(rl.ax, rl.az), FLOOR, 'a rail stands on dry floor');
        const across = rl.x0 === rl.x1 ? [rl.x0 === rl.ax ? rl.ax - 1 : rl.ax + 1, rl.az] : [rl.ax, rl.z0 === rl.az ? rl.az - 1 : rl.az + 1];
        assert.equal(w.typeAt(...across), SHALLOW, 'with the pool on its other side');
      }
    }
    for (const P of sample(w, 8)) {
      if (P.water !== 'pools' || P.poolTiles < 4) continue;
      pools++;
      if (!P.rail) continue;
      railed++;
      // the railed water can still be walked into: through the gap, from dry floor of the region off the pool
      const T = tilesOf(P).filter(([x, z]) => w.typeAt(x, z) === FLOOR && !w.cellOf(x, z)[0].railTiles.has(w.cellOf(x, z)[1]));
      const ok = w.reachFrom(T.map(([x, z]) => [x, z, 0]), P.x0 - 2, P.z0 - 2, P.x1 + 3, P.z1 + 3);
      for (const [x, z] of tilesOf(P)) {
        if (w.typeAt(x, z) !== SHALLOW || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.layout(Math.floor((x + dx) / 16), Math.floor((z + dz) / 16)).railTiles.has(((z + dz) - Math.floor((z + dz) / 16) * 16) * 16 + (x + dx) - Math.floor((x + dx) / 16) * 16))) continue;
        assert.ok(ok(x, z, 0), `region ${P.id}: railed water ${x},${z} cannot be walked into`);
        checked++;
      }
    }
  }
  assert.ok(rails > 100, `${rails} rails`);
  assert.ok(pools > 0 && railed > 0, `${railed} of ${pools} pools railed`);
  assert.ok(checked > 50, `${checked} railed water tiles checked`);
});

test('R10 ceiling tubes stand over level dry floor', () => {
  const share = (T) => {
    let n = 0, tubes = 0;
    for (const seed of [1, 2, 3]) {
      const w = new World(seed);
      w.tension = T;
      for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) {
        if (!w.isRegion(cx, cz)) continue;
        const L = w.layout(cx, cz);
        n++;
        if (!L.slides.some((s) => !s.entry)) continue;
        tubes++;
        if (L.towers.length) continue;   // a tower's slide blocks the water it hangs over too
        for (let i = 0; i < 256; i++) if (L.block[i]) { assert.equal(L.tiles[i], FLOOR); assert.ok(Math.abs(L.h[i] - L.baseY) < 1e-6, 'level floor under a tube'); }
      }
    }
    return tubes / n;
  };
  assert.ok(share(0) > 0 && share(1) > 0, "tubes sampled at both tensions");
});

test('R11 2F patches are region floor too, walled off from 1F except at their stairs', () => {
  let n = 0, edges = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (let cz = -14; cz <= 14; cz++) for (let cx = -14; cx <= 14; cx++) {
      if (w.lm.levelOf(cx, cz) !== 1 || w.lm.stairOf(cx, cz) || w.zoneAtChunk(cx, cz) || (w.exit && w.exit.cx === cx && w.exit.cz === cz)) continue;
      assert.ok(w.isRegion(cx, cz), `2F chunk ${cx},${cz} is region floor`);
      n++;
      const L = w.layout(cx, cz);
      for (const [dx, dz] of [[-1, 0], [0, -1]]) {
        const nb = [cx + dx, cz + dz];
        if (w.lm.levelOf(...nb) === 1 || w.lm.stairOf(...nb)) continue;
        for (let t = 0; t < 16; t++) { edges++; assert.equal(L.tiles[dx ? t * 16 : t], WALL, `chunk ${cx},${cz} edge tile ${t} towards ${nb}`); }
      }
    }
  }
  assert.ok(n > 30 && edges > 100, `${n} 2F chunks, ${edges} edge tiles`);
});

test('R12 stair rooms join plain dry region floor', () => {
  let apron = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (let cz = -14; cz <= 14; cz++) for (let cx = -14; cx <= 14; cx++) {
      if (!w.lm.isPlain(cx, cz)) continue;
      if (!w.stairRoomAt(cx, cz)) continue;
      assert.equal(w.layout(cx, cz).kind, 'stairs');
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!w.isRegion(cx + dx, cz + dz) || w.lm.levelOf(cx + dx, cz + dz) !== 0) continue;
        for (let t = 0; t < 16; t++) for (const k of [0, 1]) {
          const x = dx > 0 ? (cx + 1) * 16 + k : dx < 0 ? cx * 16 - k - 1 : cx * 16 + t, z = dz > 0 ? (cz + 1) * 16 + k : dz < 0 ? cz * 16 - k - 1 : cz * 16 + t;
          apron++;
          const ty = w.typeAt(x, z);   // the edge column itself is the wall with the doorway in it
          assert.ok(ty === WALL || (ty === FLOOR && Math.abs(w.hAt(x, z)) < 1e-6 && !w.cellOf(x, z)[0].wet[w.cellOf(x, z)[1]]), `${x},${z} beside stair room ${cx},${cz}`);
        }
      }
    }
  }
  assert.ok(apron > 1000, `${apron} apron tiles`);
});

test('R13 sealed rooms sit 2 tiles inside their region, in all three kinds, with an empty pool, shallow water or deep water inside', () => {
  const kinds = {}, inner = {};
  for (const seed of [1, 2, 3, 4]) {
    const w = new World(seed);
    for (const P of sample(w, 10)) {
      const S = P.sealed;
      if (!S) continue;
      kinds[S.kind] = (kinds[S.kind] || 0) + 1;
      inner[S.inner] = (inner[S.inner] || 0) + 1;
      for (let z = S.z - 2; z < S.z + S.d + 2; z++) for (let x = S.x - 2; x < S.x + S.w + 2; x++) {
        assert.equal(w.regions.tileId(x, z), P.id, `sealed room of ${P.id} reaches ${x},${z}`);
        assert.ok(!w.keepClear(x, z), `sealed room of ${P.id} sits on clear floor at ${x},${z}`);
      }
      const mid = [Math.floor(S.x + S.w / 2), Math.floor(S.z + S.d / 2)], t = w.typeAt(...mid);
      if (S.inner === 'deep') assert.equal(t, DEEP);
      if (S.inner === 'shallow') assert.equal(t, SHALLOW);
      if (S.inner === 'empty') assert.ok(t === FLOOR && w.hAt(...mid) < -1);
    }
  }
  for (const k of ['windows', 'open3', 'corner']) assert.ok(kinds[k] > 0, `${k}: ${JSON.stringify(kinds)}`);
  for (const k of ['empty', 'shallow', 'deep']) assert.ok(inner[k] > 0, `${k}: ${JSON.stringify(inner)}`);
});

test('R14 round columns are 0.8 m across, still a whole tile for collision', async () => {
  const { loadMesher, quadsOf } = await import('./mesh-helper.mjs');
  const { buildChunkGeometry } = await loadMesher();
  const w = new World(1);
  let n = 0;
  for (let cz = -6; cz <= 6 && n < 6; cz++) for (let cx = -6; cx <= 6 && n < 6; cx++) {
    if (!w.isRegion(cx, cz)) continue;
    const L = w.layout(cx, cz), i = [...L.form].findIndex((f, k) => (f & FORM_CYL) && L.tiles[k] === WALL);
    if (i < 0) continue;
    const x = L.ox + (i % 16) + 0.5, z = L.oz + ((i / 16) | 0) + 0.5;
    const g = buildChunkGeometry(w, L, { ceil: 6, T: 0, guide: null });
    const walls = quadsOf(g.static).filter((q) => q.some((v) => Math.abs(v[1] - q[0][1]) > 0.5) && q.every((v) => Math.hypot(v[0] - x, v[2] - z) < 0.45));
    assert.ok(walls.length >= 12, `chunk ${cx},${cz}: ${walls.length} column faces`);
    for (const q of walls) for (const v of q) assert.ok(Math.abs(Math.hypot(v[0] - x, v[2] - z) - 0.4) < 0.01, 'a column face 0.4 m from the column axis');
    assert.ok(w.blockedAt(x + 0.45, z, 0) && w.blockedAt(x, z - 0.45, 0), 'the whole tile still blocks');
    n++;
  }
  assert.ok(n >= 6, `${n} columns checked`);
});

test('R15 the loader works a region chunk out a stage per frame: the result matches one built at once, other chunks built in between leave it alone', () => {
  const grid = (g) => JSON.stringify([[...g.tiles], [...g.h], [...g.form], [...g.wet], g.lamps, g.glow, g.rails]);
  let chunks = 0;
  for (const seed of [1, 2]) {
    const once = new World(seed), staged = new World(seed);
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
      if (!once.isRegion(cx, cz)) continue;
      while (staged.regions.prepare(cx, cz));
      while (staged.regions.step(cx, cz)) { staged.regions.chunk(cx + 5, cz + 5); }   // a body steps onto a far tile mid-job
      assert.equal(grid(staged.regions.chunk(cx, cz)), grid(once.regions.chunk(cx, cz)), `seed ${seed} chunk ${cx},${cz}`);
      chunks++;
    }
  }
  assert.ok(chunks > 20, `${chunks} chunks`);
});

test('R16 some regions are lit by skylights instead of lamps: their patches reach the next chunk, and one chunk draws each', () => {
  let drawn = 0, shared = 0;
  for (const seed of [1, 2]) {
    const w = new World(seed);
    for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) {
      if (!w.isRegion(cx, cz)) continue;
      const L = w.layout(cx, cz);
      for (const s of L.suns.filter((q) => q.sky)) {
        const P = w.regions.region(w.regions.tileId(Math.floor(s.x), Math.floor(s.z)));
        assert.equal(P.lamps.algo, 'sky', `a skylight at ${s.x},${s.z} in a region lit by ${P.lamps.algo}`);
        if (s.own) drawn++; else shared++;
      }
    }
  }
  assert.ok(drawn > 20 && shared > 5, `${drawn} skylights drawn, ${shared} patches lent to the next chunk`);
});

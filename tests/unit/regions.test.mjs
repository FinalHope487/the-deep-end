// Inner layer, batch 6 step 1: the ground floor is continuous region floor cut into chunks only for loading. Regions are
// 10-60 m, built from layers with several algorithms each; pillar pools and winding sunken walkways always turn up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, canStep, layoutHash, SPAWN } from '../../js/world.js';
import { FLOOR, WALL, SHALLOW, DEEP, FORM_CYL, CHUNK, walkable } from '../../js/tiles.js';
import { walkTop } from '../../js/levels.js';
import { BLOCK, LEDGE_H } from '../../js/regions.js';

// the regions whose every block lies in region chunks of a box of chunks round the origin
function sample(w, R) {
  const seen = new Map();
  for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
    if (!w.isRegion(cx, cz)) continue;
    for (let bz = cz * 4; bz < cz * 4 + 4; bz++) for (let bx = cx * 4; bx < cx * 4 + 4; bx++) {
      const id = w.regions.blockId(bx, bz);
      if (!seen.has(id)) seen.set(id, w.regions.region(id));
    }
  }
  const whole = (P) => P.blocks.every(([bx, bz]) => w.isRegion(Math.floor(bx / 4), Math.floor(bz / 4)) && Math.abs(Math.floor(bx / 4)) <= R + 3 && Math.abs(Math.floor(bz / 4)) <= R + 3);
  return [...seen.values()].filter(whole);
}
const tilesOf = (P) => P.blocks.flatMap(([bx, bz]) => { const out = []; for (let z = 0; z < BLOCK; z++) for (let x = 0; x < BLOCK; x++) out.push([bx * BLOCK + x, bz * BLOCK + z]); return out; });

test('R1 region chunks join without walls: most of the tiles along a seam between two region chunks are open, and the floor comes out the same whichever chunk is generated first', () => {
  let seam = 0, walls = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) {
      if (!w.isRegion(cx, cz)) continue;
      const L = w.layout(cx, cz);
      if (w.joinsRegion(cx, cz, cx - 1, cz)) for (let z = 0; z < 16; z++) { seam++; if (L.tiles[z * 16] === WALL) walls++; }
      if (w.joinsRegion(cx, cz, cx, cz - 1)) for (let x = 0; x < 16; x++) { seam++; if (L.tiles[x] === WALL) walls++; }
    }
    const v = new World(seed);
    for (let cz = 8; cz >= -8; cz--) for (let cx = 8; cx >= -8; cx--) assert.equal(layoutHash(v.layout(cx, cz)), layoutHash(w.layout(cx, cz)), `seed ${seed} chunk ${cx},${cz}`);
  }
  assert.ok(seam > 3000, `${seam} seam tiles`);
  assert.ok(walls / seam < 0.25, `${walls} of ${seam} seam tiles are wall`);
});

test('R2 regions are 8-72 m across (10-60 m give or take a block), about 40% of the floor in regions of 30 m and more', () => {
  let n = 0, tiles = 0, inBig = 0;
  for (const seed of [1, 2]) {
    const w = new World(seed);
    for (const P of sample(w, 14)) {
      const span = Math.max(P.x1 - P.x0 + 1, P.z1 - P.z0 + 1);
      assert.ok(span >= 8 && span <= 72, `region ${P.id} spans ${span} m`);
      n++;
    }
    // the share of floor tiles (region chunks) that belong to a region spanning 30 m or more
    for (let z = -14 * 16; z < 15 * 16; z += 2) for (let x = -14 * 16; x < 15 * 16; x += 2) {
      if (!w.isRegion(Math.floor(x / 16), Math.floor(z / 16))) continue;
      const P = w.regions.region(w.regions.tileId(x, z));
      tiles++;
      if (Math.max(P.x1 - P.x0 + 1, P.z1 - P.z0 + 1) >= 30) inBig++;
    }
  }
  assert.ok(n > 150, `${n} regions`);
  assert.ok(inBig / tiles > 0.3 && inBig / tiles < 0.55, `big share ${(inBig / tiles).toFixed(2)}`);
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

test('R4 pillar pools: big regions under water all over, round columns 6-9 m apart in a grid with some missing, depth differs from pool to pool', () => {
  let n = 0, missing = 0;
  const depths = new Set();
  for (const seed of [1, 2, 3, 4]) {
    const w = new World(seed);
    for (const P of sample(w, 14)) {
      if (P.arche !== 'pillarpool') continue;
      n++;
      const C = P.pillars;
      assert.ok(C.sx >= 6 && C.sx <= 9 && C.sz >= 6 && C.sz <= 9, `spacing ${C.sx} × ${C.sz}`);
      let water = 0, dry = 0, deepest = 0;
      for (const [x, z] of tilesOf(P)) {
        const t = w.typeAt(x, z), [L, i] = w.cellOf(x, z);
        const lattice = (((x - C.ox) % C.sx) + C.sx) % C.sx === 0 && (((z - C.oz) % C.sz) + C.sz) % C.sz === 0;
        const rim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.regions.tileId(x + dx, z + dz) !== P.id);   // a boundary wall may stand there
        if (t === WALL) { if (lattice && !rim) assert.ok(L.form[i] & FORM_CYL, 'a round column'); continue; }
        if (lattice) missing++;
        if (t === SHALLOW) { water++; deepest = Math.min(deepest, w.hAt(x, z)); } else dry++;
      }
      assert.ok(water / (water + dry) > 0.85, `pool ${P.id}: ${water} of ${water + dry} tiles under water`);
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
      const deep = T.filter(([x, z]) => w.typeAt(x, z) === DEEP);
      const walk = T.filter(([x, z]) => w.typeAt(x, z) === SHALLOW);
      assert.ok(deep.length > walk.length * 0.3, `region ${P.id}: ${deep.length} deep, ${walk.length} walkway`);
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

test('R7 lamps: no two overlap, each keeps 0.5 m clear of walls and columns, and both regular and scattered layouts turn up', () => {
  const algos = {};
  let lamps = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    const all = new Map();
    for (let cz = -7; cz <= 7; cz++) for (let cx = -7; cx <= 7; cx++) {
      if (!w.isRegion(cx, cz)) continue;
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
    for (const P of sample(w, 7)) algos[P.lamps.algo] = (algos[P.lamps.algo] || 0) + 1;
  }
  assert.ok(lamps > 500, `${lamps} lamps`);
  const total = Object.values(algos).reduce((s, v) => s + v, 0), regular = (algos.grid || 0) + (algos.strip || 0);
  assert.ok(regular / total > 0.2 && regular / total < 0.65, `regular share ${(regular / total).toFixed(2)} of ${JSON.stringify(algos)}`);
  for (const a of ['grid', 'scatter', 'cluster', 'dark']) assert.ok(algos[a] > 0, `no ${a} lamps`);
});

test('R8 ankle-deep regions (about one in seven of the plain ones): their floor sinks 0.2-0.4 m under the shared water surface and stays walkable', () => {
  let plain = 0, ankle = 0, tiles = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (const P of sample(w, 10)) {
      if (P.arche) continue;
      plain++;
      if (P.water !== 'ankle') continue;
      ankle++;
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
  assert.ok(ankle / plain > 0.08 && ankle / plain < 0.22, `${ankle} of ${plain} plain regions are ankle-deep`);
  assert.ok(tiles > 500, `${tiles} ankle-deep tiles`);
});

test('R9 rails only round small pools (40 tiles at most, 7 in 10 of them), between their dry floor and their water, always leaving a gap', () => {
  let rails = 0, railed = 0, small = 0, checked = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) {
      if (!w.isRegion(cx, cz)) continue;
      for (const rl of w.layout(cx, cz).rails) {
        rails++;
        const P = w.regions.region(w.regions.tileId(rl.ax, rl.az));
        assert.ok(P.rail && P.poolTiles <= 40, `a rail at ${rl.ax},${rl.az} outside a small pool`);
        assert.equal(w.typeAt(rl.ax, rl.az), FLOOR, 'a rail stands on dry floor');
        const across = rl.x0 === rl.x1 ? [rl.x0 === rl.ax ? rl.ax - 1 : rl.ax + 1, rl.az] : [rl.ax, rl.z0 === rl.az ? rl.az - 1 : rl.az + 1];
        assert.equal(w.typeAt(...across), SHALLOW, 'with the pool on its other side');
      }
    }
    for (const P of sample(w, 8)) {
      if (P.water !== 'pools' || !(P.poolTiles >= 4 && P.poolTiles <= 40)) continue;
      small++;
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
  assert.ok(small > 10 && railed / small > 0.5 && railed / small < 0.9, `${railed} of ${small} small pools railed`);
  assert.ok(checked > 50, `${checked} railed water tiles checked`);
});

test('R10 a tube coils down out of the ceiling in about 4% of region chunks at tension 0 and 14% at tension 1, always over level dry floor', () => {
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
        for (let i = 0; i < 256; i++) if (L.block[i]) { assert.equal(L.tiles[i], FLOOR); assert.ok(Math.abs(L.h[i] - L.baseY) < 1e-6, 'level floor under a tube'); }
      }
    }
    return tubes / n;
  };
  const lo = share(0), hi = share(1);
  assert.ok(lo > 0.015 && lo < 0.07, `${(lo * 100).toFixed(1)}% at tension 0`);
  assert.ok(hi > 0.09 && hi < 0.2, `${(hi * 100).toFixed(1)}% at tension 1`);
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

test('R12 stair rooms stand among the regions in about one plain 1F chunk in seven, and the region floor beside them is plain dry floor', () => {
  let plain = 0, rooms = 0, apron = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (let cz = -14; cz <= 14; cz++) for (let cx = -14; cx <= 14; cx++) {
      if (!w.lm.isPlain(cx, cz)) continue;
      plain++;
      if (!w.stairRoomAt(cx, cz)) continue;
      rooms++;
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
  assert.ok(rooms / plain > 0.1 && rooms / plain < 0.18, `${rooms} of ${plain}`);
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
  for (const k of ['windows', 'open3', 'corner']) assert.ok(kinds[k] >= 2, `${k}: ${JSON.stringify(kinds)}`);
  for (const k of ['empty', 'shallow', 'deep']) assert.ok(inner[k] >= 2, `${k}: ${JSON.stringify(inner)}`);
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

test('R15 the loader works a region chunk out a stage per frame: the result matches one built at once, other chunks built in between leave it alone, and no stage is a whole chunk', () => {
  const grid = (g) => JSON.stringify([[...g.tiles], [...g.h], [...g.form], [...g.wet], g.lamps, g.glow, g.rails]);
  let chunks = 0, stages = 0;
  for (const seed of [1, 2]) {
    const once = new World(seed), staged = new World(seed);
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
      if (!once.isRegion(cx, cz)) continue;
      while (staged.regions.prepare(cx, cz));
      let n = 0;
      while (staged.regions.step(cx, cz)) { n++; staged.regions.chunk(cx + 5, cz + 5); }   // a body steps onto a far tile mid-job
      assert.equal(grid(staged.regions.chunk(cx, cz)), grid(once.regions.chunk(cx, cz)), `seed ${seed} chunk ${cx},${cz}`);
      chunks++; stages += n + 1;
    }
  }
  assert.ok(chunks > 20, `${chunks} chunks`);
  assert.ok(stages / chunks >= 5, `${(stages / chunks).toFixed(1)} stages a chunk`);
  // and the loader's prepare() leaves the layout itself cheap: everything it reads is worked out
  const w = new World(3);
  for (const [cx, cz] of [[2, 1], [-3, 2], [1, -4]]) {
    while (w.prepare(cx, cz));
    for (const [dx, dz] of [[0, 0], [-1, 0], [0, -1], [1, 0], [0, 1]]) if (w.isSingle(cx + dx, cz + dz)) assert.ok(w.rooms.has((cx + dx + 32768) * 65536 + (cz + dz + 32768)), `room ${cx + dx},${cz + dz} ready`);
  }
});

test('R16 some regions are lit by skylights instead of lamps: their patches reach the next chunk, and one chunk draws each', () => {
  let skyRegions = 0, regions = 0, drawn = 0, shared = 0;
  for (const seed of [1, 2]) {
    const w = new World(seed);
    const seen = new Set();
    for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) {
      if (!w.isRegion(cx, cz)) continue;
      const L = w.layout(cx, cz);
      for (const s of L.suns.filter((q) => q.sky)) {
        const P = w.regions.region(w.regions.tileId(Math.floor(s.x), Math.floor(s.z)));
        assert.equal(P.lamps.algo, 'sky', `a skylight at ${s.x},${s.z} in a region lit by ${P.lamps.algo}`);
        if (s.own) drawn++; else shared++;
      }
      for (let i = 0; i < 256; i += 17) {
        const id = w.regions.tileId(L.ox + (i % 16), L.oz + (i >> 4));
        if (seen.has(id)) continue;
        seen.add(id); regions++;
        if (w.regions.region(id).lamps.algo === 'sky') skyRegions++;
      }
    }
  }
  assert.ok(skyRegions / regions > 0.04 && skyRegions / regions < 0.2, `${skyRegions} of ${regions} regions under skylights`);
  assert.ok(drawn > 20 && shared > 5, `${drawn} skylights drawn, ${shared} patches lent to the next chunk`);
});

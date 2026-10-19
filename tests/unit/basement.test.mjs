// Inner layer, batch 6 step 2: B1 is region floor too, drawn by its own generator: low ceilings (2.2-3 m), narrow corridors
// laid out like a maze, water that follows the lie of the land (winding channels, shallow ditches, basins), 60% darker.
// Ceilings of 1F and 2F follow their region: 3-8 m, higher in big regions, lower as the tension rises.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, layoutHash, SPAWN } from '../../js/world.js';
import { FLOOR, WALL, SHALLOW, CHUNK } from '../../js/tiles.js';
import { loadMesher } from './mesh-helper.mjs';

const plainB1 = (w, cx, cz) => w.lm.levelOf(cx, cz) < 0 && !w.lm.stairOf(cx, cz) && !w.zoneAtChunk(cx, cz) && !w.lm.megaChunk(cx, cz);
function* b1Chunks(w, R) {
  for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) if (plainB1(w, cx, cz)) yield [cx, cz];
}
const standable = (t) => t === FLOOR || t === SHALLOW;

test('B1-1 plain B1 chunks are region floor: neighbours on B1 join without an edge, and a chunk comes out the same whichever is generated first', () => {
  let n = 0, joined = 0;
  for (const seed of [1, 2]) {
    const w = new World(seed), v = new World(seed), list = [...b1Chunks(w, 16)];
    for (const [cx, cz] of list) {
      assert.ok(w.isRegion(cx, cz), `seed ${seed} B1 chunk ${cx},${cz} is region floor`);
      assert.equal(w.layout(cx, cz).kind, 'region');
      n++;
      if (w.joinsRegion(cx, cz, cx - 1, cz)) joined++;
    }
    for (const [cx, cz] of list.reverse()) assert.equal(layoutHash(v.layout(cx, cz)), layoutHash(w.layout(cx, cz)), `seed ${seed} chunk ${cx},${cz}`);
  }
  assert.ok(n > 60 && joined > 20, `${n} B1 chunks, ${joined} joined westwards`);
});

test('B1-2 ceilings: 2.2-3 m over B1, 3-8 m over 1F and 2F region floor, at least 2.2 m over every floor; big regions higher, tension lowers them', () => {
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const at = (tension) => {
    const w = new World(1);
    w.tension = tension;
    const small = [], big = [];
    for (let cz = -10; cz <= 10; cz++) for (let cx = -10; cx <= 10; cx++) {
      if (!w.isRegion(cx, cz)) continue;
      const L = w.layout(cx, cz), lv = w.lm.levelOf(cx, cz);
      assert.ok(L.ceilT, `chunk ${cx},${cz} has a ceiling per tile`);
      for (let i = 0; i < 256; i++) {
        const c = L.ceilT[i];
        if (lv < 0) assert.ok(c >= 2.2 - 1e-6 && c <= 3 + 1e-6, `B1 ${cx},${cz} tile ${i}: ${c} m`);
        else assert.ok(c >= 3 - 1e-6 && c <= 8 + 1e-6, `${cx},${cz} tile ${i}: ${c} m`);
        if (standable(L.tiles[i])) assert.ok(c - (L.h[i] - L.baseY) >= 2.2 - 1e-6, `${cx},${cz} tile ${i}: ${c} m over a floor at ${L.h[i] - L.baseY}`);
        if (lv !== 0 || i % 7) continue;
        const P = w.regions.region(w.regions.tileId(L.ox + (i % 16), L.oz + (i >> 4))), span = Math.max(P.x1 - P.x0, P.z1 - P.z0) + 1;
        if (span >= 30) big.push(c); else if (span < 20) small.push(c);
      }
    }
    return { small: mean(small), big: mean(big), all: mean(small.concat(big)) };
  };
  const calm = at(0), tense = at(1);
  assert.ok(calm.big > calm.small + 1, `regions of 30 m and more ${calm.big.toFixed(2)} m, under 20 m ${calm.small.toFixed(2)} m`);
  assert.ok(tense.all < calm.all - 0.8, `mean ceiling ${calm.all.toFixed(2)} m at tension 0, ${tense.all.toFixed(2)} m at tension 1`);
});

test('B1-3 B1 is laid out as narrow corridors: maze partitions in most of its regions, and most of its floor within a step of a wall', () => {
  const narrowShare = (w, pick) => {
    let narrow = 0, all = 0;
    for (let cz = -24; cz <= 24; cz++) for (let cx = -24; cx <= 24; cx++) {
      if (!w.isRegion(cx, cz) || !pick(w.lm.levelOf(cx, cz))) continue;
      const L = w.layout(cx, cz);
      for (let i = 0; i < 256; i++) {
        if (!standable(L.tiles[i])) continue;
        const x = L.ox + (i % 16), z = L.oz + (i >> 4);
        all++;
        let wall = false;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.typeAt(x + dx, z + dz) === WALL) wall = true;
        if (wall) narrow++;
      }
    }
    return narrow / all;
  };
  let maze = 0, regions = 0;
  for (const seed of [1, 2]) {
    const w = new World(seed), seen = new Set();
    for (const [cx, cz] of b1Chunks(w, 24)) {
      const R = w.regionsOf(-1);
      for (let b = 0; b < 16; b += 4) for (let a = 0; a < 16; a += 4) {
        const id = R.tileId(cx * CHUNK + a, cz * CHUNK + b);
        if (seen.has(id)) continue;
        seen.add(id); regions++;
        if (R.region(id).part?.algo === 'maze') maze++;
      }
    }
    const b1 = narrowShare(w, (lv) => lv < 0), f1 = narrowShare(w, (lv) => lv === 0);
    assert.ok(b1 > 0.6 && b1 > 1.5 * f1, `seed ${seed}: ${(b1 * 100).toFixed(0)}% of B1 floor beside a wall, ${(f1 * 100).toFixed(0)}% of 1F`);
  }
  assert.ok(regions > 100 && maze / regions >= 0.6, `${maze} of ${regions} B1 regions are mazes`);
});

test('B1-4 B1 water follows the land: channels that wind across region boundaries, ankle-deep ditches, 8-45% of the floor wet', () => {
  let wet = 0, all = 0, ditch = 0, across = 0, turns = 0;
  for (const seed of [1, 2]) {
    const w = new World(seed), R = w.regionsOf(-1);
    for (const [cx, cz] of b1Chunks(w, 24)) {
      const L = w.layout(cx, cz);
      for (let i = 0; i < 256; i++) {
        if (!standable(L.tiles[i])) continue;
        all++;
        const x = L.ox + (i % 16), z = L.oz + (i >> 4);
        if (L.tiles[i] === FLOOR && L.wet[i] && L.h[i] < L.baseY - 0.1) ditch++;
        if (L.tiles[i] !== SHALLOW) continue;
        wet++;
        for (const [dx, dz] of [[1, 0], [0, 1]]) if (w.typeAt(x + dx, z + dz) === SHALLOW && R.tileId(x + dx, z + dz) !== R.tileId(x, z)) across++;
        // a bend: water both along x and along z from this tile
        if ((w.typeAt(x + 1, z) === SHALLOW || w.typeAt(x - 1, z) === SHALLOW) && (w.typeAt(x, z + 1) === SHALLOW || w.typeAt(x, z - 1) === SHALLOW)) turns++;
      }
    }
  }
  assert.ok(wet / all > 0.08 && wet / all < 0.45, `${(wet / all * 100).toFixed(1)}% of ${all} B1 tiles under water`);
  assert.ok(across > 100, `${across} water edges cross a region boundary`);
  assert.ok(turns / wet > 0.3, `${turns} of ${wet} water tiles turn`);
  assert.ok(ditch > 200, `${ditch} ditch tiles`);
});

test('B1-5 every standable tile of B1 region floor near spawn is reachable on foot from spawn, down the stairs', () => {
  for (const seed of [1, 2]) {
    const w = new World(seed), R = 20;
    const ok = w.reachFrom([[Math.floor(SPAWN.x), Math.floor(SPAWN.z), 0]], -R * CHUNK, -R * CHUNK, (R + 1) * CHUNK, (R + 1) * CHUNK);
    let lost = 0, all = 0;
    const sample = [], sealed = [];   // the inside of a sealed room is never reached, by design (listed by the chunk holding its middle)
    for (const [cx, cz] of b1Chunks(w, R)) sealed.push(...w.layout(cx, cz).sealed);
    const shut = (x, z) => sealed.some((q) => x >= q.x && z >= q.z && x < q.x + q.w && z < q.z + q.d);
    for (const [cx, cz] of b1Chunks(w, R - 2)) {
      const L = w.layout(cx, cz);
      for (let i = 0; i < 256; i++) {
        const x = L.ox + (i % 16), z = L.oz + (i >> 4);
        const coil = [-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => { const [M, j] = w.cellOf(x + dx, z + dz); return M.block[j]; }));   // inside a tube's coil
        if (!standable(L.tiles[i]) || shut(x, z) || coil) continue;
        all++;
        if (!ok(x, z, 0)) { lost++; if (sample.length < 4) sample.push(`${x},${z}`); }
      }
    }
    assert.ok(all > 800, `${all} B1 tiles`);
    assert.equal(lost, 0, `seed ${seed}: ${lost} of ${all} B1 tiles cut off (${sample.join(' ')})`);
  }
});

test('B1-6 B1 is drawn 60% darker: its floor colours are under 0.45 of the same chunk drawn as a 1F one', async () => {
  const { buildChunkGeometry } = await loadMesher();
  const w = new World(1);
  const [cx, cz] = b1Chunks(w, 10).next().value, L = w.layout(cx, cz);
  const floorLight = (M) => {
    const g = buildChunkGeometry(w, M, { ceil: 3, T: 0, guide: null }).static, p = g.attributes.position.array, c = g.attributes.color.array;
    let s = 0;
    for (let k = 0; k < p.length / 3; k++) if (Math.abs(p[k * 3 + 1] - L.baseY) < 1e-4) s += c[k * 3] + c[k * 3 + 1] + c[k * 3 + 2];
    return s;
  };
  const ratio = floorLight(L) / floorLight({ ...L, cold: false });
  assert.ok(ratio < 0.45 && ratio > 0.3, `B1 floor at ${(ratio * 100).toFixed(0)}% of the light`);
});

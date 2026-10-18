// Inner layer: the visual changes C1–C9 can only be checked as "generated" and "wired" (no pixel comparison).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World } from '../../js/world.js';
import { loadMesher } from './mesh-helper.mjs';
import { DEEP, VOID } from '../../js/tiles.js';

const SEEDS = [1, 2, 3, 42, 7];
const src = (f) => readFileSync(new URL(`../../js/${f}`, import.meta.url), 'utf8');

async function* builtChunks() {
  const { buildChunkGeometry } = await loadMesher();
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (let cz = -8; cz < 8; cz++) for (let cx = -8; cx < 8; cx++) {
      const L = w.layout(cx, cz);
      yield { L, g: buildChunkGeometry(w, L, { ceil: L.ceilFixed || 4.5, T: 0, guide: null }) };
    }
  }
}

// C1: caustics are drawn on the pool floor tiles (static mesh carries the water depth), the water surface is a
// per-vertex RGBA layer that gets more opaque with depth
test('C1 floor tiles carry wetDepth for the caustics, water is RGBA and deeper means more opaque', async () => {
  let wetTiles = 0, waterChunks = 0, deepMore = 0, checked = 0;
  for await (const { g } of builtChunks()) {
    if (g.static && g.static.attributes.wetDepth) wetTiles++;
    if (!g.water) continue;
    waterChunks++;
    const col = g.water.attributes.color;
    assert.equal(col.itemSize, 4, 'water colours have an alpha channel');
    const a = []; for (let i = 3; i < col.array.length; i += 4) a.push(col.array[i]);
    checked++;
    if (Math.max(...a) > Math.min(...a)) deepMore++;
  }
  assert.ok(wetTiles > 100 && waterChunks > 50, `${wetTiles} static meshes with wetDepth, ${waterChunks} water meshes`);
  assert.ok(deepMore / checked > 0.5, `${deepMore}/${checked} water meshes vary in opacity with depth`);
  const main = src('main.js');
  assert.match(main, /withCaustics\(/, 'the static material gets the caustics shader');
});

// C2: lamps only in large deep pools, 1–4 of them, each set in the pool wall
test('C2 underwater pool lamps only appear in deep pools of at least 6 × 6 tiles', async () => {
  let withLamps = 0, bigPools = 0;
  for await (const { L, g } of builtChunks()) {
    let deep = 0;
    for (let i = 0; i < 256; i++) if (L.tiles[i] === DEEP) deep++;   // an abyss pool has no lamps; a pool-lit room (L9) lets small pools have some
    if (deep < (L.poolLit ? 4 : 36)) assert.equal(g.poolLamps.length, 0, `chunk ${L.cx},${L.cz} has ${deep} deep tiles but pool lamps`);
    else { bigPools++; if (g.poolLamps.length) withLamps++; assert.ok(g.poolLamps.length <= (L.poolLit ? 6 : 4)); }
  }
  assert.ok(withLamps >= 3, `only ${withLamps} chunks with pool lamps (${bigPools} big pools)`);
});

// C9: the wet lens is one full-screen pass after the scene; nothing else renders the scene or touches light materials
test('C9 the wet lens is the last full-screen pass and leaves lamp, beam and glow brightness alone', () => {
  const main = src('main.js'), wet = src('wet.js');
  assert.equal((main.match(/wet\.render\(/g) || []).length, 1, 'one wet.render call per frame');
  assert.equal((main.match(/renderer\.render\(/g) || []).length, 0, 'main.js never renders the scene behind the lens');
  for (const word of ['mats', 'lamp', 'beam', 'glow']) assert.ok(!new RegExp(String.raw`\b${word}`, 'i').test(wet.replace(/\/\/.*$/gm, '')), `wet.js does not touch ${word}`);
});

test('C2 shrinking a big pool below 6 × 6 removes its lamps', async () => {
  const { buildChunkGeometry } = await loadMesher();
  const w = new World(42);
  let L = null;
  for (let cz = -8; cz < 8 && !L; cz++) for (let cx = -8; cx < 8 && !L; cx++) {
    const c = w.layout(cx, cz);
    if (c.tiles.filter((t) => t === DEEP).length >= 64 && buildChunkGeometry(w, c, { ceil: 4.5, T: 0, guide: null }).poolLamps.length) L = c;
  }
  assert.ok(L, 'a lit big pool exists');
  const small = Object.create(L);
  small.tiles = Uint8Array.from(L.tiles, (t) => (t === DEEP ? 2 : t));
  let kept = 0;
  for (let i = 0; i < 256 && kept < 25; i++) if (L.tiles[i] === DEEP) { small.tiles[i] = DEEP; kept++; }
  assert.equal(buildChunkGeometry(w, small, { ceil: 4.5, T: 0, guide: null }).poolLamps.length, 0, '25 deep tiles get no lamps');
});

// K1: materials that carry decals (signs, windows, wall lamps; wet patches, pool halos) win the depth test over the base surface
test('K1 the lamp and water materials use polygonOffset so decals beat the surface under them', () => {
  const main = src('main.js');
  for (const name of ['lamp', 'water']) {
    const line = main.split('\n').find((l) => new RegExp(`^  ${name}: `).test(l));
    assert.ok(line && /polygonOffset: true, polygonOffsetFactor: -1/.test(line), `${name} material has polygonOffset`);
  }
});

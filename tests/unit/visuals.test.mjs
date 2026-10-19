// Inner layer: underwater pool lamps only where the pool is big and deep enough (C2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { loadMesher } from './mesh-helper.mjs';
import { DEEP, VOID } from '../../js/tiles.js';

const SEEDS = [1, 2, 3, 42, 7];

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

test('C2 underwater pool lamps only appear in deep pools of at least 6 × 6 tiles', async () => {
  let withLamps = 0, bigPools = 0;
  for await (const { L, g } of builtChunks()) {
    let deep = 0;
    for (let i = 0; i < 256; i++) if (L.tiles[i] === DEEP) deep++;   // an abyss pool has no lamps; a pool-lit room (L9) lets small pools have some
    if (deep < (L.poolLit ? 4 : 36)) assert.equal(g.poolLamps.length, 0, `chunk ${L.cx},${L.cz} has ${deep} deep tiles but pool lamps`);
    else { bigPools++; if (g.poolLamps.length) withLamps++; assert.ok(g.poolLamps.length <= (L.poolLit ? 6 : 4)); }
  }
  assert.ok(withLamps > 0, `only ${withLamps} chunks with pool lamps (${bigPools} big pools)`);
});

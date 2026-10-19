// Inner layer: every doorway between two chunks that are not one region floor can be walked through (batch 5 M10 moved
// doorways between ordinary rooms; batch 6 replaced those rooms with region floor, which has no doorways inside it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, canStep } from '../../js/world.js';
import { WALL, walkable } from '../../js/tiles.js';

const R = 14;

// the doorways on each sampled chunk's west and north edge: runs of open tiles along column 0 / row 0
function* doorways(seeds = [1, 2, 3]) {
  for (const seed of seeds) {
    const w = new World(seed);
    for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
      const B = w.layout(cx, cz);
      for (const dir of [0, 1]) {
        const A = w.layout(dir ? cx : cx - 1, dir ? cz - 1 : cz);
        if (B.kind === 'zone' || B.kind === 'mega' || A.kind === 'zone' || A.kind === 'mega') continue;
        if (A.kind === 'region' && B.kind === 'region') continue;   // region floor has no doorways between its chunks
        const at = (t) => (dir ? t : t * 16);
        let lo = -1;
        for (let t = 1; t <= 16; t++) {
          const open = t < 16 && B.tiles[at(t)] !== WALL;
          if (open && lo < 0) lo = t;
          if (!open && lo >= 0) { yield { w, A, B, dir, lo, hi: t - 1 }; lo = -1; }
        }
      }
    }
  }
}

test('every doorway between chunks can be walked through on at least one tile', () => {
  let n = 0;
  for (const { A, B, dir, lo, hi } of doorways()) {
    let ok = 0;
    for (let t = lo; t <= hi; t++) {
      const d = dir ? t : t * 16, inB = dir ? 16 + t : t * 16 + 1, inA = dir ? 15 * 16 + t : t * 16 + 15;
      const h = B.h[d];
      if ([[A, inA], [B, inB]].every(([L, i]) => walkable(L.tiles[i]) && canStep(h, L.h[i]) && canStep(L.h[i], h))) ok++;
      n++;
    }
    assert.ok(ok > 0, `doorway ${lo}-${hi} (dir ${dir}, chunk ${B.cx},${B.cz}, ${A.kind} → ${B.kind}) can be walked through`);
  }
  assert.ok(n > 2000, `${n} doorway tiles`);
});

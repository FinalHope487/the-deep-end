// Inner layer, batch 5 M10: a doorway between two ordinary rooms sits anywhere from tile 3 to 12 along the edge (by the
// edge's hash), with a straight passage cut in on each side to the room's floor; where that cannot be cut it stays centred.
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

const PLAIN = new Set(['hall', 'pool', 'colonnade', 'rise', 'flood']);

test('M10 doorways between ordinary rooms are spread over tiles 3-12, not all in the middle', () => {
  let n = 0, off = 0;
  const seen = new Set();
  for (const { A, B, lo, hi } of doorways()) {
    if (hi - lo + 1 > 4) continue;   // a fully open edge
    assert.ok(lo >= 3 && hi <= 12, `door ${lo}-${hi} lies within tiles 3-12`);
    if (!PLAIN.has(A.kind) || !PLAIN.has(B.kind)) continue;
    n++;
    seen.add(lo);
    if (!((lo === 6 && hi === 9) || (lo === 7 && hi === 8))) off++;
  }
  assert.ok(n >= 150, `${n} doorways between ordinary rooms`);
  assert.ok(off / n > 0.4, `${off} of ${n} off the middle`);
  assert.ok(seen.size >= 8, `doors start at ${seen.size} different tiles`);
});

// a doorway left in the middle may be partly against a wall (a corridor's 2-tile lane, a barred room): one tile is enough
test('M10 a doorway moved off the middle has floor a step away on both sides of every tile; any doorway on at least one', () => {
  let n = 0;
  for (const { A, B, dir, lo, hi } of doorways()) {
    const mid = (lo === 6 && hi === 9) || (lo === 7 && hi === 8);
    const plain = PLAIN.has(A.kind) && PLAIN.has(B.kind) && hi - lo + 1 <= 4 && !mid;   // a doorway moved off the middle
    let ok = 0;
    for (let t = lo; t <= hi; t++) {
      const d = dir ? t : t * 16, inB = dir ? 16 + t : t * 16 + 1, inA = dir ? 15 * 16 + t : t * 16 + 15;
      const h = B.h[d];
      const fine = [[A, inA], [B, inB]].every(([L, i]) => walkable(L.tiles[i]) && canStep(h, L.h[i]) && canStep(L.h[i], h));
      if (plain) assert.ok(fine, `door tile ${t} (dir ${dir}, chunk ${B.cx},${B.cz}, ${A.kind} → ${B.kind}) has floor a step away on both sides`);
      if (fine) ok++;
      n++;
    }
    assert.ok(ok > 0, `doorway ${lo}-${hi} (dir ${dir}, chunk ${B.cx},${B.cz}, ${A.kind} → ${B.kind}) can be walked through`);
  }
  assert.ok(n > 2000, `${n} doorway tiles`);
});

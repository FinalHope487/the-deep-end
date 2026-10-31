import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { SHALLOW, FORM_DEEPER } from '../../js/tiles.js';

// Layer: fast unit.
// N16: a wading pool has a traversable route back to its rim.

const chunks = function* (R) {
  for (let cz = -R; cz <= R; cz++) {
    for (let cx = -R; cx <= R; cx++) {
      yield [cx, cz];
    }
  }
};

function sealedAt(w, x, z) {
  const R = w.regions.region(w.regions.tileId(x, z));
  const S = R.sealed;

  return !!S &&
    x >= S.x &&
    z >= S.z &&
    x < S.x + S.w &&
    z < S.z + S.d;
}

test('N16: a deep wading-pool floor has a usable route to the shallow rim', () => {
  const w = new World(1);
  w.tension = 1;

  for (const [cx, cz] of chunks(10)) {
    if (!w.isRegion(cx, cz)) continue;
    if (w.lm.levelOf(cx, cz) < 0) continue;

    const L = w.layout(cx, cz);
    let low = -1;

    for (let i = 0; i < 256; i++) {
      if (
        L.tiles[i] !== SHALLOW ||
        !(L.form[i] & FORM_DEEPER)
      ) {
        continue;
      }

      const x = L.ox + (i % 16);
      const z = L.oz + (i >> 4);

      if (sealedAt(w, x, z) || L.block[i]) continue;

      if (low < 0 || L.h[i] < L.h[low]) {
        low = i;
      }
    }

    if (low < 0) continue;

    const x = L.ox + (low % 16);
    const z = L.oz + (low >> 4);

    const reachable = w.reachFrom(
      [[x, z, 0]],
      x - 24,
      z - 24,
      x + 24,
      z + 24
    );

    let escaped = false;

    for (let b = z - 24; b < z + 24 && !escaped; b++) {
      for (let a = x - 24; a < x + 24; a++) {
        if (
          w.typeAt(a, b) === SHALLOW &&
          w.hAt(a, b) >= L.baseY - 0.401 &&
          reachable(a, b, 0)
        ) {
          escaped = true;
          break;
        }
      }
    }

    assert.ok(
      escaped,
      `seed 1 pool ${cx},${cz}: no climbable route to rim`
    );

    return;
  }

  assert.fail('no qualifying wading pool was examined');
});

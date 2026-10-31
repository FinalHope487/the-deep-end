import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, SPAWN } from '../../js/world.js';
import { FLOOR, SHALLOW, CHUNK } from '../../js/tiles.js';

// Layer: fast unit.
// N08: accessible B1 floors remain connected to spawn.
// N15: those floors retain sufficient body clearance.

const standable = t => t === FLOOR || t === SHALLOW;

const plainB1 = (w, cx, cz) =>
  w.lm.levelOf(cx, cz) < 0 &&
  !w.lm.stairOf(cx, cz) &&
  !w.zoneAtChunk(cx, cz) &&
  !w.lm.megaChunk(cx, cz);

function* b1Chunks(w, R) {
  for (let cz = -R; cz <= R; cz++) {
    for (let cx = -R; cx <= R; cx++) {
      if (plainB1(w, cx, cz)) yield [cx, cz];
    }
  }
}

test('N08/N15: reachable basement floor has headroom and a route from spawn', () => {
  const seed = 1;
  const w = new World(seed);
  const R = 20;

  const ok = w.reachFrom(
    [[Math.floor(SPAWN.x), Math.floor(SPAWN.z), 0]],
    -R * CHUNK,
    -R * CHUNK,
    (R + 1) * CHUNK,
    (R + 1) * CHUNK
  );

  const sealed = [];

  for (const [cx, cz] of b1Chunks(w, R)) {
    sealed.push(...w.layout(cx, cz).sealed);
  }

  const shut = (x, z) =>
    sealed.some(q =>
      x >= q.x &&
      z >= q.z &&
      x < q.x + q.w &&
      z < q.z + q.d
    );

  let checked = 0;
  const failures = [];

  for (const [cx, cz] of b1Chunks(w, R - 2)) {
    const L = w.layout(cx, cz);

    assert.ok(L.ceilT, `B1 ${cx},${cz} has no ceiling`);

    for (let i = 0; i < 256; i++) {
      if (!standable(L.tiles[i])) continue;

      const x = L.ox + (i % 16);
      const z = L.oz + (i >> 4);

      const coil = [-1, 0, 1].some(dz =>
        [-1, 0, 1].some(dx => {
          const [M, j] = w.cellOf(x + dx, z + dz);
          return M.block[j];
        })
      );

      if (shut(x, z) || coil) continue;

      checked++;

      const headroom = L.ceilT[i] - (L.h[i] - L.baseY);

      assert.ok(
        headroom >= 2.2 - 1e-6,
        `seed ${seed} B1 ${x},${z}: headroom ${headroom}`
      );

      if (!ok(x, z, 0) && failures.length < 4) {
        failures.push(`${x},${z}`);
      }
    }
  }

  assert.ok(
    checked > 800,
    `only ${checked} basement floor tiles examined`
  );

  assert.deepEqual(
    failures,
    [],
    `seed ${seed}: unreachable B1 floor tiles`
  );
});

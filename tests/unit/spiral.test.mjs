import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { Player } from '../../js/player.js';
import { SPIRAL } from '../../js/tiles.js';
import { SPIRAL_CLEAR } from '../../js/levels.js';
import { loadMesher, quadsOf } from './mesh-helper.mjs';

// Fast unit. N15/N17.
// Spiral treads must not remove usable ground below them,
// and low treads must not grant impossible clearance.

function spirals() {
  const out = [];

  for (const seed of [1, 2, 3]) {
    const world = new World(seed);

    for (let cz = -14; cz <= 0; cz++) {
      for (let cx = -14; cx <= 14; cx++) {
        const L = world.layout(cx, cz);

        for (const s of L.spirals) {
          if (!s.own) continue;

          if (!out.some(q =>
            q.world === world &&
            q.s.x === s.x &&
            q.s.z === s.z
          )) {
            out.push({ world, L, s });
          }
        }
      }
    }
  }

  return out;
}

const treadHeight = (s, a) =>
  s.h0 + (s.h1 - s.h0) * a / s.sweep;

test('N15/N17: spiral clearance, upper tread and underlying floor mesh agree', async () => {
  const found = spirals();
  assert.ok(found.length >= 4, 'no spiral geometry sampled');

  let high = 0;
  let low = 0;
  let columns = 0;

  for (const { world, s } of found) {
    for (let k = 0; k < 40; k++) {
      const a = k * s.sweep / 40;
      const angle = s.a0 + s.sense * a;

      const x = s.x + Math.cos(angle) * 1.2;
      const z = s.z + Math.sin(angle) * 1.2;
      const h = treadHeight(s, a);

      if (world.typeAt(Math.floor(x), Math.floor(z)) !== SPIRAL) {
        continue;
      }

      const ground = world.surfaceAt(x, z, s.h0);

      if (h - s.h0 >= SPIRAL_CLEAR + 0.02) {
        high++;

        assert.ok(
          ground && Math.abs(ground.h - s.h0) < 1e-6,
          `high tread ${h}: ground is not standable`
        );
      } else if (
        h - s.h0 <= SPIRAL_CLEAR - 0.02 &&
        h - s.h0 > 0.46
      ) {
        low++;

        assert.equal(
          ground,
          null,
          `low tread ${h}: body passes through low ceiling`
        );
      }
    }

    const angle = s.a0 + s.sense * s.sweep / 2;
    const cx = s.x + Math.cos(angle) * 0.15;
    const cz = s.z + Math.sin(angle) * 0.15;

    assert.equal(world.surfaceAt(cx, cz, s.h0), null);
    assert.equal(world.surfaceAt(cx, cz, s.h1), null);
    columns++;
  }

  assert.ok(high > 0, 'no high-clearance tread checked');
  assert.ok(low > 0, 'no low-clearance tread checked');
  assert.ok(columns > 0, 'no solid column checked');

  // A high stair-room tread and its ground below must
  // both be real standing surfaces.
  const stair = found.find(q => q.L.kind === 'stairs');
  assert.ok(stair, 'no stair-room spiral found');

  const { world, s } = stair;
  const a = s.sweep * 0.8;
  const angle = s.a0 + s.sense * a;
  const x = s.x + Math.cos(angle) * 1.2;
  const z = s.z + Math.sin(angle) * 1.2;
  const h = treadHeight(s, a);

  const upper = world.surfaceAt(x, z, h);
  const p = new Player();

  assert.ok(
    upper && Math.abs(upper.h - h) < 0.05 && upper.up,
    'upper tread is not a separate standing surface'
  );
  assert.ok(p.canStand(world, x, z, h));
  assert.ok(p.canStand(world, x, z, s.h0));

  // The floor underneath must also exist in rendered geometry.
  // Reuse the known mesh witness from the original test.
  const { buildChunkGeometry } = await loadMesher();
  const meshWitness = found[0];
  const { world: mw, L, s: ms } = meshWitness;

  const geometry = buildChunkGeometry(
    mw, L, { ceil: 7.7, T: 0, guide: null }
  );

  const ma = ms.sweep * 0.85;
  const mang = ms.a0 + ms.sense * ma;
  const mx = ms.x + Math.cos(mang) * 1.2;
  const mz = ms.z + Math.sin(mang) * 1.2;

  const hasFloor = quadsOf(geometry.static).some(q =>
    q.every(v => Math.abs(v[1] - ms.h0) < 1e-4) &&
    mx >= Math.min(...q.map(v => v[0])) &&
    mx <= Math.max(...q.map(v => v[0])) &&
    mz >= Math.min(...q.map(v => v[2])) &&
    mz <= Math.max(...q.map(v => v[2]))
  );

  assert.ok(
    hasFloor,
    'floor mesh missing underneath the spiral tread'
  );
});

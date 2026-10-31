import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { Player } from '../../js/player.js';
import { FLOOR } from '../../js/tiles.js';

// Fast unit. N09/N15.
// A usable platform must have safe floor and headroom.
// Its ladder must carry the body up and back down.

function findLadderTower(world) {
  const R = 14;

  for (let cz = -R; cz <= R; cz++) {
    for (let cx = -R; cx <= R; cx++) {
      if (!world.isRegion(cx, cz)) continue;

      const L = world.layout(cx, cz);

      for (const ladder of L.ladders || []) {
        const tower = (L.towers || []).find(t =>
          Math.abs(ladder.h1 - L.baseY - t.h) < 1e-6
        );

        if (tower) return { L, ladder, tower };
      }
    }
  }

  return null;
}

test('N09/N15: a safe tower platform has a usable ladder in both directions', () => {
  const world = new World(1);
  const selected = findLadderTower(world);

  assert.ok(selected, 'no ladder-access platform was found');

  const { tower, ladder: l } = selected;

  // The actual destination floor must have enough headroom.
  for (let z = tower.z0; z <= tower.z1; z++) {
    for (let x = tower.x0; x <= tower.x1; x++) {
      const [L, i] = world.cellOf(x, z);

      assert.equal(
        world.typeAt(x, z),
        FLOOR,
        `platform tile ${x},${z} is not floor`
      );

      assert.ok(
        Math.abs(world.hAt(x, z) - l.h1) < 1e-6,
        `platform ${x},${z} has incorrect height`
      );

      const headroom =
        L.ceilT[i] - (world.hAt(x, z) - L.baseY);

      assert.ok(
        headroom >= 2 - 1e-6,
        `platform ${x},${z} lacks headroom: ${headroom}`
      );
    }
  }

  assert.ok(l.h1 > l.h0, 'ladder has no climb');

  const p = new Player();
  const forward = { x: 0, z: 1, run: false };
  const face = (nx, nz) => Math.atan2(nx, nz);
  const dt = 1 / 30;

  p.teleport(
    world,
    l.x + l.nx * 0.7,
    l.z + l.nz * 0.7,
    face(l.nx, l.nz),
    l.h0
  );

  for (
    let k = 0;
    k < 300 && Math.abs(p.floorH - l.h1) > 1e-3;
    k++
  ) {
    p.update(world, dt, forward);
  }

  assert.ok(
    Math.abs(p.floorH - l.h1) < 1e-3,
    `failed to climb: ${p.floorH} vs ${l.h1}`
  );

  for (let k = 0; k < 15; k++) {
    p.update(world, dt, forward);
  }

  assert.ok(!p.climbing, 'body did not leave the ladder');

  const top = world.surfaceAt(p.x, p.z, p.floorH);
  assert.ok(
    top && Math.abs(top.h - l.h1) < 1e-3,
    'body cannot stand on the platform'
  );

  // Face the ladder from the platform and descend.
  p.yaw = face(-l.nx, -l.nz);

  for (
    let k = 0;
    k < 400 &&
      !(Math.abs(p.floorH - l.h0) < 1e-3 && !p.climbing);
    k++
  ) {
    p.update(world, dt, forward);
  }

  assert.ok(
    Math.abs(p.floorH - l.h0) < 1e-3 &&
      !p.climbing,
    `failed to descend: ${p.floorH}`
  );
});

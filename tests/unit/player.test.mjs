import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { World2, primaryHall } from '../../js/gen2.js';
import { Player } from '../../js/player.js';
import { FLOOR, WALL } from '../../js/tiles.js';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function findV1Boundary(world) {
  const player = new Player();

  for (let z = -8; z <= 24; z++) {
    for (let x = -8; x <= 24; x++) {
      if (world.typeAt(x, z) !== FLOOR) continue;

      const sx = x + 0.5;
      const sz = z + 0.5;
      const h = world.hAt(x, z);

      if (!Number.isFinite(h)) continue;

      player.reset(sx, sz, 0, h);

      if (!player.canStand(world, sx, sz, h)) {
        continue;
      }

      for (const [dx, dz] of DIRS) {
        const tx = x + dx + 0.5;
        const tz = z + dz + 0.5;

        if (
          world.typeAt(x + dx, z + dz) !== WALL
        ) {
          continue;
        }

        if (!world.blockedAt(tx, tz, h)) {
          continue;
        }

        if (!player.canStand(world, sx + 0.1, sz, h)) {
          continue;
        }

        return {
          sx,
          sz,
          h,
          tx,
          tz,
          safeX: sx + 0.1,
          safeZ: sz,
        };
      }
    }
  }

  return null;
}

function findV2Boundary(world) {
  const plan = world.plan(0, 0);
  const hall = primaryHall(plan);
  assert.ok(hall, 'default v2 start cell has no hall');

  const player = new Player();

  const candidates = [];

  // Search around the real hall wall, not an invented tile type.
  for (let z = hall.z0 + 2; z <= hall.z1 - 2; z++) {
    candidates.push({
      sx: hall.x0 + 1.5,
      sz: z,
      tx: hall.x0 - 0.5,
      tz: z,
      safeX: hall.x0 + 1.65,
      safeZ: z,
    });

    candidates.push({
      sx: hall.x1 - 1.5,
      sz: z,
      tx: hall.x1 + 0.5,
      tz: z,
      safeX: hall.x1 - 1.65,
      safeZ: z,
    });
  }

  for (let x = hall.x0 + 2; x <= hall.x1 - 2; x++) {
    candidates.push({
      sx: x,
      sz: hall.z0 + 1.5,
      tx: x,
      tz: hall.z0 - 0.5,
      safeX: x,
      safeZ: hall.z0 + 1.65,
    });

    candidates.push({
      sx: x,
      sz: hall.z1 - 1.5,
      tx: x,
      tz: hall.z1 + 0.5,
      safeX: x,
      safeZ: hall.z1 - 1.65,
    });
  }

  const h = world.levelY(0);

  for (const candidate of candidates) {
    const { sx, sz, tx, tz, safeX, safeZ } = candidate;

    player.reset(sx, sz, 0, h);

    if (!player.canStand(world, sx, sz, h)) {
      continue;
    }

    if (!world.blockedAt(tx, tz, h)) {
      continue;
    }

    if (player.canStand(world, tx, tz, h)) {
      continue;
    }

    if (!player.canStand(world, safeX, safeZ, h)) {
      continue;
    }

    return {
      ...candidate,
      h,
    };
  }

  return null;
}

function checkBoundary(world, boundary, name) {
  assert.ok(
    boundary,
    `${name}: no real solid boundary was found`
  );

  const {
    sx,
    sz,
    h,
    tx,
    tz,
    safeX,
    safeZ,
  } = boundary;

  const player = new Player();

  player.reset(sx, sz, 0, h);
  player.settle(world, 0);

  assert.ok(
    player.canStand(world, sx, sz, h),
    `${name}: starting floor is not standable`
  );

  assert.ok(
    world.blockedAt(tx, tz, h),
    `${name}: target is not solid`
  );

  // Positive control: movement on valid floor must succeed.
  player.tryMove(world, safeX, safeZ, false);

  assert.ok(
    Math.hypot(player.x - sx, player.z - sz) > 0.07,
    `${name}: valid movement was blocked`
  );

  assert.ok(
    player.canStand(
      world,
      player.x,
      player.z,
      player.floorH
    ),
    `${name}: valid movement left the floor`
  );

  // Restore a legal start before the negative control.
  player.reset(sx, sz, 0, h);
  player.settle(world, 0);

  // Negative control: a direct move into solid geometry must fail.
  player.tryMove(world, tx, tz, false);

  assert.ok(
    Math.hypot(player.x - tx, player.z - tz) > 0.2,
    `${name}: player entered solid geometry`
  );

  assert.ok(
    player.canStand(
      world,
      player.x,
      player.z,
      player.floorH
    ),
    `${name}: player ended without a valid floor`
  );
}

test('guard: v1 and v2 bodies cannot enter solid geometry', () => {
  const v1 = new World(42);

  checkBoundary(
    v1,
    findV1Boundary(v1),
    'v1 collision'
  );

  // Production defaults: clusterShare = 0.5.
  const v2 = new World2(42);

  checkBoundary(
    v2,
    findV2Boundary(v2),
    'v2 collision'
  );
});
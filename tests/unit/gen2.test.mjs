import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2, CLUSTER_SHARE } from '../../js/gen2.js';
import { Player } from '../../js/player.js';

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

test('guard: default v2 world is deterministic and spawn can escape', () => {
  // Use production defaults. Do not disable district clusters.
  assert.equal(CLUSTER_SHARE, 0.5);

  const seed = 42;
  const first = new World2(seed);
  const second = new World2(seed);
  const cells = [
    [0, 0],
    [1, 0],
    [-1, 0],
  ];

  assert.equal(first.clusterShare, CLUSTER_SHARE);
  assert.equal(second.clusterShare, CLUSTER_SHARE);

  const forward = cells.map(([i, j]) =>
    JSON.stringify(first.plan(i, j))
  );

  const reversed = [...cells].reverse()
    .map(([i, j]) => JSON.stringify(second.plan(i, j)))
    .reverse();

  assert.deepEqual(
    forward,
    reversed,
    'default v2 plans change with query order'
  );

  assert.deepEqual(
    first.spawn,
    second.spawn,
    'same seed has different spawn points'
  );

  const world = first;
  const { x, z, h } = world.spawn;

  assert.ok(
    [x, z, h].every(Number.isFinite),
    'spawn contains a non-finite coordinate'
  );

  const initial = world.surfaceAt(x, z, h);

  assert.ok(initial, 'spawn has no standing surface');
  assert.ok(
    Math.abs(initial.h - h) < 1e-6,
    'spawn height differs from its floor'
  );
  assert.ok(
    Number.isNaN(initial.wl),
    'spawn is not on dry floor'
  );

  const player = new Player();
  player.reset(x, z, world.spawn.yaw, h);
  player.settle(world, 0);

  assert.ok(
    player.canStand(world, x, z, h),
    'spawn cannot hold the player body'
  );

  let escaped = false;

  for (const [dx, dz] of DIRECTIONS) {
    const yaw = Math.atan2(-dx, -dz);

    player.reset(x, z, yaw, h);
    player.settle(world, 0);

    for (let frame = 0; frame < 12; frame++) {
      player.update(world, 1 / 30, {
        x: 0,
        z: 1,
        run: false,
      });
    }

    const distance = Math.hypot(
      player.x - x,
      player.z - z
    );

    if (
      distance > 0.25 &&
      player.canStand(
        world,
        player.x,
        player.z,
        player.floorH
      )
    ) {
      escaped = true;
      break;
    }
  }

  assert.ok(
    escaped,
    'default v2 player cannot leave the spawn point'
  );
});
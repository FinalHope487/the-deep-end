import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, SPAWN, layoutHash } from '../../js/world.js';
import { FLOOR } from '../../js/tiles.js';

// Layer: fast unit.
// N03: deterministic generation, independent of query order.
// N07/N08/N21: necessary objectives remain physically reachable.

test('N03: v1 world generation is independent of query order', () => {
  const cells = [
    [0, 0],
    [3, -2],
    [-7, 5],
    [20, 20],
  ];

  const first = new World(42);
  const second = new World(42);

  const forward = cells.map(
    ([cx, cz]) => layoutHash(first.layout(cx, cz))
  );

  const reversed = [...cells].reverse().map(
    ([cx, cz]) => layoutHash(second.layout(cx, cz))
  ).reverse();

  assert.deepEqual(forward, reversed);

  const other = new World(43);
  assert.ok(
    cells.some(([cx, cz], i) =>
      layoutHash(other.layout(cx, cz)) !== forward[i]
    ),
    'different seeds produced identical sampled worlds'
  );
});

test('N07/N08/N21: required v1 objectives are reachable from spawn', () => {
  const world = new World(42);

  const points = [
    SPAWN,
    ...world.zones,
    world.exit,
    ...world.items,
  ];

  assert.ok(world.zones.length > 0);
  assert.ok(world.items.length > 0);

  const x0 = Math.floor(
    Math.min(...points.map(p => p.x)) - 64
  );
  const x1 = Math.ceil(
    Math.max(...points.map(p => p.x)) + 64
  );
  const z0 = Math.floor(
    Math.min(...points.map(p => p.z)) - 64
  );
  const z1 = Math.ceil(
    Math.max(...points.map(p => p.z)) + 64
  );

  const ok = world.reachFrom(
    [[Math.floor(SPAWN.x), Math.floor(SPAWN.z), 0]],
    x0, z0, x1, z1
  );

  const reachable = (x, z, lv) => {
    const tx = Math.floor(x);
    const tz = Math.floor(z);

    if (lv !== undefined) return ok(tx, tz, lv);
    return ok(tx, tz, 0) || ok(tx, tz, 1);
  };

  for (const item of world.items) {
    const tx = Math.floor(item.x);
    const tz = Math.floor(item.z);

    const tile = item.up
      ? world.upTypeAt(tx, tz)
      : world.typeAt(tx, tz);

    const height = item.up
      ? world.upHAt(tx, tz)
      : world.hAt(tx, tz);

    assert.equal(
      tile,
      FLOOR,
      `item ${item.id} does not stand on dry floor`
    );

    assert.equal(
      item.h,
      height,
      `item ${item.id} has the wrong floor height`
    );

    assert.ok(
      reachable(item.x, item.z),
      `item ${item.id} unreachable from spawn`
    );
  }

  for (const zone of world.zones) {
    let entered = false;

    for (let dz = -16; dz < 16 && !entered; dz++) {
      for (let dx = -16; dx < 16 && !entered; dx++) {
        entered = reachable(zone.x + dx, zone.z + dz);
      }
    }

    assert.ok(
      entered,
      `zone ${zone.index} unreachable from spawn`
    );
  }

  assert.ok(
    reachable(world.exit.x, world.exit.z),
    'exit unreachable from spawn'
  );
});

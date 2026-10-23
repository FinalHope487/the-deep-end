import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World2, CELL2, STEP2, BODY_R2 } from '../../js/gen2.js';

const GRID = 0.5;
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function reachableHalls(world) {
  const targets = [];
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    targets.push({ i, j, room: world.plan(i, j).rooms[0], reached: false,
      closest: null, distance: Infinity });
  }
  // Include an extra ring for detours. A failure reports this finite search
  // boundary rather than claiming to prove disconnection in an infinite world.
  const min = -2 * CELL2, max = 3 * CELL2;
  const { x: sx, z: sz, h: sh } = world.spawn;
  const clear = (x, z, h) => [-BODY_R2, BODY_R2].every(dx =>
    [-BODY_R2, BODY_R2].every(dz => !world.blockedAt(x + dx, z + dz, h)));
  const initial = world.surfaceAt(sx, sz, sh);
  assert.ok(initial && clear(sx, sz, sh), `seed ${world.seed} cell (0,0): blocked spawn (${sx},${sz},${sh})`);
  const queue = [[0, 0, initial.h]];
  const key = (ix, iz, h) => `${ix},${iz},${h}`;
  const seen = new Set([key(...queue[0])]);
  let remaining = targets.length;
  for (let head = 0; head < queue.length && remaining; head++) {
    const [ix, iz, h] = queue[head], x = sx + ix * GRID, z = sz + iz * GRID;
    for (const target of targets) {
      if (target.reached) continue;
      const r = target.room;
      const distance = Math.hypot(Math.max(r.x0 - x, 0, x - r.x1),
        Math.max(r.z0 - z, 0, z - r.z1), h - world.levelY(0));
      if (distance < target.distance) {
        target.distance = distance;
        target.closest = { x, z, h };
      }
      // Reach dry 1F floor inside the hall, with the whole body inside it.
      if (h === world.levelY(0) && x - BODY_R2 > r.x0 && x + BODY_R2 < r.x1
          && z - BODY_R2 > r.z0 && z + BODY_R2 < r.z1) {
        target.reached = true;
        remaining--;
      }
    }
    for (const [dx, dz] of DIRECTIONS) {
      const nx = ix + dx, nz = iz + dz, x = sx + nx * GRID, z = sz + nz * GRID;
      if (x < min || x >= max || z < min || z >= max) continue;
      const surface = world.surfaceAt(x, z, h);
      if (!surface) continue;
      // Copy before another query: World2 reuses its surface result object.
      const nh = surface.h;
      if (Math.abs(nh - h) > STEP2 || !clear(x, z, h)) continue;
      const id = key(nx, nz, nh);
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push([nx, nz, nh]);
    }
  }
  return { targets, visited: seen.size, min, max };
}

for (const seed of [1, 2, 3, 42, 7]) {
  test(`seed ${seed}: spawn can walk to all nine nearby 1F halls`, () => {
    const { targets, visited, min, max } = reachableHalls(new World2(seed));
    const failures = targets.filter(t => !t.reached).map(t =>
      `seed ${seed} cell (${t.i},${t.j}): unreachable; closest reachable position ${JSON.stringify(t.closest)}, distance ${t.distance.toFixed(3)} m`);
    assert.equal(failures.length, 0,
      `${failures.join('\n')}\nvisited ${visited} states; search x,z in [${min},${max}) m`);
  });
}

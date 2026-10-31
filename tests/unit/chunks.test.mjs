import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { loadChunkManager } from './mesh-helper.mjs';

// Layer: fast unit.
// N06/N23: bounded incremental loading completes.

const CTX = { ceil: 4.5, T: 0, guide: null };

const sceneStub = () => ({
  n: 0,
  add() { this.n++; },
  remove() { this.n--; },
});

const mats = {
  static: {},
  lamp: {},
  abyss: {},
  water: {},
  sun: {},
  prop: {},
};

function plainSpot(w) {
  for (let r = 0; r < 30; r++) {
    for (let cz = -r; cz <= r; cz++) {
      for (let cx = -r; cx <= r; cx++) {
        if (Math.max(Math.abs(cx), Math.abs(cz)) !== r) {
          continue;
        }

        let ok = true;

        for (let dz = -1; dz <= 1 && ok; dz++) {
          for (let dx = -1; dx <= 1 && ok; dx++) {
            ok = w.layout(cx + dx, cz + dz)
              .floaters.length === 0;
          }
        }

        if (ok) {
          return {
            x: cx * 16 + 8,
            z: cz * 16 + 8,
          };
        }
      }
    }
  }

  throw new Error('no plain loading location');
}

test('N06/N23: queued chunks finish under a tiny frame budget', async () => {
  const ChunkManager = await loadChunkManager();

  const world = new World(42);
  const at = plainSpot(world);

  const manager = new ChunkManager(
    sceneStub(),
    mats,
    () => ({ ...CTX })
  );

  manager.setWorld(world);

  let frames = 0;
  const limit = 5000;

  while (
    (manager.pending() || manager.job || !frames) &&
    frames < limit
  ) {
    // Force incremental construction.
    manager.update(at.x, at.z, 1, 1e-6);
    frames++;
  }

  assert.ok(frames > 0 && frames < limit);
  assert.equal(
    manager.count,
    9,
    'not all required nearby chunks loaded'
  );
  assert.equal(
    manager.pending(),
    0,
    'chunk loading never completed'
  );
  assert.equal(manager.job, null);
});

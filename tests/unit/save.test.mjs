import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSave, loadGame, saveGame } from '../../js/save.js';

// Layer: fast unit.
// N22: preserve valid progress, reject invalid positions,
// recover malformed fields and reject foreign-generator positions.

const GOOD = {
  v: 1,
  seed: 42,
  x: 10.5,
  z: -3.25,
  h: 4.5,
  yaw: 1.2,
  visited: [true, true, false, false],
  found: [0, 4, 11],
  elapsed: 120,
  distance: 300,
  last: 1,
  gen: 1,
};

function withStorage(fn) {
  const store = new Map();

  globalThis.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };

  try {
    fn(store);
  } finally {
    delete globalThis.localStorage;
  }
}

test('N22: save recovery preserves valid progress without trusting invalid positions', () => {
  // Valid save.
  const valid = parseSave(GOOD);

  assert.ok(valid);
  assert.equal(valid.seed, GOOD.seed);
  assert.deepEqual(valid.visited, GOOD.visited);
  assert.deepEqual(valid.found, GOOD.found);
  assert.equal(valid.elapsed, GOOD.elapsed);
  assert.equal(valid.distance, GOOD.distance);
  assert.equal(valid.last, GOOD.last);
  assert.equal(valid.gen, GOOD.gen);
  assert.deepEqual(valid.pos, {
    x: GOOD.x,
    z: GOOD.z,
    h: GOOD.h,
    yaw: GOOD.yaw,
  });

  // A damaged position and a damaged progress field must
  // not discard the independent valid progress.
  const damaged = parseSave({
    ...GOOD,
    x: 600000,
    elapsed: -1,
  });

  assert.ok(damaged);
  assert.equal(damaged.pos, null);
  assert.equal(damaged.elapsed, 0);
  assert.ok(damaged.damaged.includes('pos'));
  assert.ok(damaged.damaged.includes('elapsed'));
  assert.deepEqual(damaged.visited, GOOD.visited);
  assert.deepEqual(damaged.found, GOOD.found);
  assert.equal(damaged.distance, GOOD.distance);
  assert.equal(damaged.last, GOOD.last);

  // Legacy saves without a height or generator remain usable.
  const legacy = parseSave({
    ...GOOD,
    h: undefined,
    gen: undefined,
  });

  assert.equal(legacy.pos.h, 0);
  assert.equal(legacy.gen, 1);

  // Nothing reliable remains without a valid save identity.
  assert.equal(parseSave({ ...GOOD, seed: NaN }), null);

  withStorage(store => {
    // Actual serialization and load.
    saveGame(GOOD);

    const loaded = loadGame(1);
    assert.ok(loaded);
    assert.deepEqual(loaded.pos, valid.pos);
    assert.deepEqual(loaded.visited, GOOD.visited);
    assert.deepEqual(loaded.found, GOOD.found);

    // Another generator cannot reuse the old map position.
    const foreign = loadGame(2);
    assert.ok(foreign);
    assert.equal(foreign.pos, null);
    assert.deepEqual(foreign.visited, GOOD.visited);
    assert.deepEqual(foreign.found, GOOD.found);

    // Unparseable storage must not activate a corrupted save.
    store.set('deepend.save.v1', '{"v":1,"seed":42');
    assert.equal(loadGame(1), null);
  });
});

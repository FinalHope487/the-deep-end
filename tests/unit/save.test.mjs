// Inner layer: what a damaged save still gives back, and where a lost position is recovered to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSave, loadGame, saveGame } from '../../js/save.js';
import { World } from '../../js/world.js';
import { Player } from '../../js/player.js';
import { LEVEL_H } from '../../js/tiles.js';

const GOOD = {
  v: 1, seed: 42, x: 10.5, z: -3.25, h: 4.5, yaw: 1.2, visited: [true, true, false, false], found: [0, 4, 11],
  elapsed: 120, distance: 300, last: 1, gen: 1,
};
const with_ = (patch) => ({ ...GOOD, ...patch });

test('a whole save reads back unchanged', () => {
  const s = parseSave(GOOD);
  assert.deepEqual(s, {
    seed: 42, visited: [true, true, false, false], found: [0, 4, 11], elapsed: 120, distance: 300, last: 1, gen: 1,
    pos: { x: 10.5, z: -3.25, h: 4.5, yaw: 1.2 }, damaged: [],
  });
});

test('nothing reliable: not an object, wrong version or no usable seed', () => {
  for (const raw of [null, undefined, 3, 'save', [], {}, with_({ v: 2 }), with_({ seed: NaN }), with_({ seed: '42' }), with_({ seed: undefined })]) {
    assert.equal(parseSave(raw), null, JSON.stringify(raw));
  }
});

test('a broken position is dropped, the progress stays', () => {
  for (const patch of [{ x: NaN }, { z: Infinity }, { yaw: null }, { x: 600000 }, { z: -600000 }, { h: 21 }, { h: -25 }, { h: 'up' }, { x: undefined }]) {
    const s = parseSave(with_(patch));
    assert.equal(s.pos, null, JSON.stringify(patch));
    assert.deepEqual(s.damaged, ['pos']);
    assert.deepEqual(s.visited, GOOD.visited);
    assert.deepEqual(s.found, GOOD.found);
    assert.equal(s.elapsed, 120);
    assert.equal(s.distance, 300);
    assert.equal(s.last, 1);
  }
});

test('a save from before standing heights stands on the ground', () => {
  assert.deepEqual(parseSave(with_({ h: undefined })).pos, { x: 10.5, z: -3.25, h: 0, yaw: 1.2 });
});

test('each broken progress field falls back on its own and is named', () => {
  let s = parseSave(with_({ visited: [true, false] }));
  assert.deepEqual(s.visited, [false, false, false, false]);
  assert.deepEqual(s.damaged, ['visited']);
  assert.equal(s.last, -1, 'no landmark is known visited any more');
  s = parseSave(with_({ visited: [1, 0, 0, 0] }));
  assert.deepEqual(s.visited, [false, false, false, false]);
  s = parseSave(with_({ found: 'all' }));
  assert.deepEqual(s.found, []);
  assert.deepEqual(s.damaged, ['found']);
  s = parseSave(with_({ found: [1, -1, 12, 2.5, '3', 5] }));
  assert.deepEqual(s.found, [1, 5]);
  s = parseSave(with_({ elapsed: -1, distance: NaN }));
  assert.equal(s.elapsed, 0);
  assert.equal(s.distance, 0);
  assert.deepEqual(s.damaged, ['elapsed', 'distance']);
  assert.ok(s.pos);
});

test('the last landmark: only a recorded one that is also visited', () => {
  assert.equal(parseSave(with_({ last: undefined })).last, -1, 'old saves never recorded it: visited does not tell the order');
  assert.equal(parseSave(with_({ last: 3 })).last, -1, 'a landmark not visited');
  for (const last of [-1, 4, 1.5, '1', null]) assert.equal(parseSave(with_({ last })).last, -1);
  assert.equal(parseSave(with_({ last: 0 })).last, 0);
});

test('saves from before generators were recorded are generator 1', () => {
  assert.equal(parseSave(with_({ gen: undefined })).gen, 1);
});

// loadGame reads localStorage: a stand-in for node
function withStorage(fn) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  };
  try { fn(store); } finally { delete globalThis.localStorage; }
}

test('a position saved on another generator\'s map is not used', () => {
  const { v, gen, ...body } = GOOD;   // what the game hands saveGame (it adds v)
  withStorage(() => {
    saveGame({ ...body, gen: 1 });
    assert.ok(loadGame(1).pos);
    assert.equal(loadGame(2).pos, null);
    assert.deepEqual(loadGame(2).visited, GOOD.visited);
    saveGame(body);   // an old save: no generator recorded
    assert.equal(loadGame(2).pos, null);
    assert.ok(loadGame().pos);
  });
});

test('a save that is not JSON at all gives nothing to continue', () => {
  withStorage((store) => {
    store.set('deepend.save.v1', '{"v":1,"seed":4');
    assert.equal(loadGame(1), null);
  });
});

test('every landmark has a safe point a body can stand on, on its own floor', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const w = new World(seed);
    for (let k = 0; k < 4; k++) {
      const s = w.safePoint(k), z = w.zones[k];
      assert.ok(s, `seed ${seed} zone ${k}`);
      assert.ok(w.zoneAtChunk(Math.floor(s.x / 16), Math.floor(s.z / 16)) === z, 'inside the landmark');
      assert.ok(Math.abs(s.h - z.level * LEVEL_H) <= 3, `seed ${seed} zone ${k}: h ${s.h} on floor ${z.level}`);
      const p = new Player();
      p.teleport(w, s.x, s.z, s.yaw, s.h);
      assert.equal(p.floorH, s.h);
      assert.ok(p.canStand(w, p.x, p.z, p.floorH), `seed ${seed} zone ${k}`);
    }
  }
  assert.equal(new World(1).safePoint(4), null);
});

// Inner layer: lamp-proximity lighting and the BGM-off default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightAt, AMBIENT } from '../../js/lighting.js';
import { loadSettings } from '../../js/save.js';

const lamps = [{ x: 7, z: 7, w: 2, d: 2, k: 0 }];

test('a point under a lamp is fully lit, a far point falls back to ambient', () => {
  assert.equal(lightAt(lamps, 8, 8), 1);
  assert.equal(lightAt(lamps, 40, 40), AMBIENT);
});

test('light falls off monotonically with distance from the lamp', () => {
  let prev = Infinity;
  for (let d = 0; d <= 12; d++) {
    const v = lightAt(lamps, 9 + d, 8);
    assert.ok(v <= prev && v >= AMBIENT && v <= 1, `d=${d} v=${v}`);
    prev = v;
  }
});

test('large skylight lamps (k=1) reach further than ceiling lamps (k=0)', () => {
  const sky = [{ x: 7, z: 7, w: 2, d: 2, k: 1 }];
  assert.ok(lightAt(sky, 14, 8) > lightAt(lamps, 14, 8));
});

test('no lamps means ambient only', () => {
  assert.equal(lightAt([], 3, 3), AMBIENT);
});

test('BGM is off by default and only an explicit true turns it on', () => {
  globalThis.localStorage = { getItem: () => null };
  assert.equal(loadSettings().bgm, false);
  globalThis.localStorage = { getItem: () => JSON.stringify({ bgm: 'yes' }) };
  assert.equal(loadSettings().bgm, false);
  globalThis.localStorage = { getItem: () => JSON.stringify({ bgm: true }) };
  assert.equal(loadSettings().bgm, true);
});

import { lampFloods } from '../../js/lighting.js';

// K8: a lamp lights the connected space only, not the room behind a wall
test('K8 light does not pass through a wall into the next room', () => {
  // a lamp at x 2..3; a solid wall at x = 5; the same distance on both sides
  const isOpen = (tx) => tx !== 5;
  const lamp = [{ x: 2, z: 7, w: 1, d: 1, k: 0 }];
  const floods = lampFloods(lamp, isOpen);
  const front = lightAt(lamp, 4.5, 7.5, floods), behind = lightAt(lamp, 6.5, 7.5, floods);
  assert.ok(front > AMBIENT + 0.1, `lit in front of the wall (${front})`);
  assert.equal(behind, AMBIENT, 'the room behind the wall stays at ambient');
  assert.ok(lightAt(lamp, 6.5, 7.5) > AMBIENT, 'without the flood fill the light would leak through');
});

test('K8 light goes round a corner through a doorway but not further than its reach', () => {
  const isOpen = (tx, tz) => !(tx === 5 && tz !== 7);   // wall at x = 5 with a doorway at z = 7
  const lamp = [{ x: 3, z: 7, w: 1, d: 1, k: 0 }];
  const floods = lampFloods(lamp, isOpen);
  assert.ok(lightAt(lamp, 6.5, 7.5, floods) > AMBIENT, 'lit through the doorway');
  assert.equal(lightAt(lamp, 30.5, 7.5, floods), AMBIENT);
});

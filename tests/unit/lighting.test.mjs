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

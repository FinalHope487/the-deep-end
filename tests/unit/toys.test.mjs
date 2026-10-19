// Inner layer, 2026-10-19: floating toys come back (bright swim rings, kickboards, beach balls). A chunk generated at a
// higher tension floats more faded old rings instead, all of them at tension 1; a chunk already generated keeps its toys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';

const toys = (tension) => {
  const n = {};
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    w.tension = tension;
    for (let cz = -12; cz <= 12; cz++) for (let cx = -12; cx <= 12; cx++) {
      if (!w.isRegion(cx, cz)) continue;
      for (const f of w.layout(cx, cz).floaters) if (!w.layout(cx, cz).sealed.some((s) => f.x >= s.x && f.z >= s.z && f.x < s.x + s.w && f.z < s.z + s.d)) n[f.kind] = (n[f.kind] || 0) + 1;
    }
  }
  return n;
};

test('T1 before the first zone (tension under 0.25) the water holds bright rings, kickboards and beach balls (2 : 1 : 1); from tension 0.75 on only faded rings', () => {
  const calm = toys(0), tense = toys(1);
  const all = (calm.swim || 0) + (calm.board || 0) + (calm.ball || 0);
  assert.ok(all > 60 && !calm.ring, `tension 0: ${JSON.stringify(calm)}`);
  assert.ok(calm.swim > calm.board && calm.swim > calm.ball && calm.board > all * 0.12 && calm.ball > all * 0.12, `tension 0: ${JSON.stringify(calm)}`);
  assert.deepEqual(Object.keys(tense), ['ring'], `tension 1: ${JSON.stringify(tense)}`);
  // by stage: before the first zone (tension under 0.25) no faded ring; from the fourth (0.75) faded rings only
  assert.ok(!toys(0.2).ring, 'no faded ring at tension 0.2');
  assert.deepEqual(Object.keys(toys(0.8)), ['ring'], 'faded rings only at tension 0.8');
});

test('T2 about half the toys are faded rings at tension 0.5, and a chunk keeps the toys it was generated with when the tension rises', () => {
  const mid = toys(0.5), all = Object.values(mid).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(mid.ring / all - 0.5) < 0.12, `tension 0.5: ${JSON.stringify(mid)}`);
  const w = new World(1);
  w.tension = 0;
  const before = [];
  for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) before.push(w.layout(cx, cz).floaters.map((f) => f.kind).join());
  w.tension = 1;
  const after = [];
  for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) after.push(w.layout(cx, cz).floaters.map((f) => f.kind).join());
  assert.deepEqual(after, before);
});

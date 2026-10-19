// Inner layer: when water wets the lens (K3; 2026-10-19 only water 0.9 m deep and more). Pure logic, no three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WetTrigger, WET_MIN_DEPTH } from '../../js/wettrigger.js';

const DT = 1 / 60;
const seconds = (t, s, depth, moving = true, running = false) => {
  const hits = [];
  for (let at = 0; at < s; at += DT) { const h = t.update(DT, depth, moving, running); if (h) hits.push([at, h]); }
  return hits;
};
const seeded = () => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

test('K3 water under 0.9 m never wets the lens, stepping in or walking: puddles, the shallow pool, a 0.8 m pool', () => {
  const t = new WetTrigger(seeded());
  for (const depth of [0, 0.2, 0, 0.4, 0, 0.6, 0.8, 0.88, 0]) assert.deepEqual(seconds(t, 20, depth), [], `${depth} m`);
  assert.equal(WET_MIN_DEPTH, 0.9);
});

test('K3 stepping into water 0.9 m deep and more wets the lens at once, once; out and back in wets it again', () => {
  const t = new WetTrigger(seeded());
  seconds(t, 1, 0.4);
  const hit = seconds(t, 2, 0.95, false);
  assert.deepEqual(hit.map(([at, h]) => [Math.round(at * 60), h]), [[0, 1]], 'one full wetting the frame it steps in, none while standing');
  seconds(t, 1, 0.4);
  assert.equal(seconds(t, 1, 1.2, false).length, 1, 'again on stepping back in');
});

test('K3 deep enough and moving: one-shot wettings 3–8 s apart, not a constant wet', () => {
  const t = new WetTrigger(seeded());
  const hits = seconds(t, 120, 1.2).slice(1);   // the first is stepping in
  assert.ok(hits.length >= 120 / 8 - 1 && hits.length <= 120 / 3 + 1, `${hits.length} wettings in 120 s`);
  for (let i = 1; i < hits.length; i++) {
    const gap = hits[i][0] - hits[i - 1][0];
    assert.ok(gap >= 3 - 0.05 && gap <= 8 + 0.05, `gap ${gap.toFixed(2)} s`);
  }
  assert.ok(hits.every(([, h]) => h === 0.6));
  assert.ok(seconds(new WetTrigger(seeded()), 30, 1.2, true, true).slice(1).every(([, h]) => h === 0.85), 'running wets harder');
});

test('K3 standing still in deep water does not trigger, and stepping out re-arms with a fresh gap', () => {
  const t = new WetTrigger(seeded());
  assert.equal(seconds(t, 60, 1.2, false).length, 1, 'only the step in');
  const first = seconds(t, 20, 1.2)[0][0];
  assert.ok(first >= 3 - 0.05, `first wetting only after ${first.toFixed(2)} s of wading`);
});

// Inner layer: when water wets the lens (K3; 2026-10-19 only water 0.9 m deep and more). Pure logic, no three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WetTrigger } from '../../js/wettrigger.js';

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
});

test('K3 stepping into water 0.9 m deep and more wets the lens at once, once; out and back in wets it again', () => {
  const t = new WetTrigger(seeded());
  seconds(t, 1, 0.4);
  const hit = seconds(t, 2, 0.9, false);
  assert.equal(hit.length, 1, 'one wetting on entry, none while standing');
  assert.equal(hit[0][0], 0, 'wet immediately on entry');
  assert.ok(Number.isFinite(hit[0][1]) && hit[0][1] > 0 && hit[0][1] <= 1);
  seconds(t, 1, 0.4);
  assert.equal(seconds(t, 1, 1.2, false).length, 1, 'again on stepping back in');
});

test('K3 moving in deep water triggers intermittent valid wettings', () => {
  for (const running of [false, true]) {
    const hits = seconds(new WetTrigger(seeded()), 120, 1.2, true, running).slice(1);
    assert.ok(hits.length > 0 && hits.length < 120 / DT - 1, 'wettings are intermittent');
    for (let i = 1; i < hits.length; i++) assert.ok(hits[i][0] - hits[i - 1][0] > DT * 1.5, 'a wetting does not repeat on consecutive frames');
    for (const [, h] of hits) assert.ok(Number.isFinite(h) && h > 0 && h <= 1);
  }
});

test('K3 standing still in deep water does not trigger, and stepping out re-arms with a fresh gap', () => {
  const t = new WetTrigger(seeded());
  assert.equal(seconds(t, 60, 1.2, false).length, 1, 'only the step in');
  assert.ok(seconds(t, 120, 1.2).length > 0, 'moving re-arms intermittent wetting');
});

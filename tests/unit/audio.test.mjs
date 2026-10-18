// Inner layer: the drip bed is cut into single drips played at random gaps (pure logic, no Web Audio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDrips, dripGap, flowGap, DRIP_GAP, FLOW_GAP, DRIP_SD, FLOW_SD } from '../../js/audio.js';

const seeded = () => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

// 8 s of room tone (rms ~0.02) with drips at 1.0 s, 3.0 s + an echo at 3.1 s, and 6.0 s
function fakeBed(sr = 8000) {
  const d = new Float32Array(sr * 8), r = seeded();
  for (let i = 0; i < d.length; i++) d[i] = (r() * 2 - 1) * 0.035;
  for (const t of [1.0, 3.0, 3.1, 6.0]) {
    const i0 = Math.round(t * sr);
    for (let j = 0; j < sr * 0.08; j++) d[i0 + j] += Math.sin(j * 0.9) * 0.5 * Math.exp(-j / (sr * 0.02));
  }
  return { d, sr };
}

test('the drip loop is cut into one sample per drip; an echo inside 0.3 s stays with its drip', () => {
  const { d, sr } = fakeBed();
  const starts = findDrips(d, sr);
  assert.equal(starts.length, 3, `starts: ${starts}`);
  for (const [got, want] of starts.map((s, k) => [s, [1, 3, 6][k]])) assert.ok(Math.abs(got - (want - 0.03)) < 0.03, `${got} vs ${want}`);
});

test('drips come at random gaps, sparser than the old loop (about one every 1.3 s)', () => {
  const r = seeded(), gaps = Array.from({ length: 200 }, () => dripGap(r));
  assert.ok(Math.min(...gaps) >= DRIP_GAP[0] && Math.max(...gaps) <= DRIP_GAP[1]);
  assert.ok(DRIP_GAP[0] >= 2, 'never as dense as the old loop');
  const mean = gaps.reduce((a, b) => a + b) / gaps.length;
  assert.ok(Math.max(...gaps) - Math.min(...gaps) > 3, 'gaps spread over the range, not a fixed beat');
  assert.ok(mean > 3 && mean < 5, `mean ${mean}`);
});

test('the guide water-flow sound also comes at random gaps over a wide range', () => {
  const r = seeded(), gaps = Array.from({ length: 200 }, () => flowGap(r));
  assert.ok(Math.min(...gaps) >= FLOW_GAP[0] && Math.max(...gaps) <= FLOW_GAP[1]);
  assert.ok(FLOW_GAP[1] - FLOW_GAP[0] >= 10);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) > 8);
});

// gaps follow a bell curve round the middle of the range: about 68% land within one SD (a flat spread gives ~50%)
for (const [name, gap, [lo, hi], sd] of [['drip', dripGap, DRIP_GAP, () => DRIP_SD], ['flow', flowGap, FLOW_GAP, () => FLOW_SD]]) {
  test(`${name} gaps are Gaussian round the middle of their range`, () => {
    const r = seeded(), n = 4000, g = Array.from({ length: n }, () => gap(r)), mid = (lo + hi) / 2;
    const mean = g.reduce((a, b) => a + b) / n;
    assert.ok(Math.abs(mean - mid) < 0.05 * (hi - lo), `mean ${mean}`);
    const within = g.filter((x) => Math.abs(x - mid) <= sd()).length / n;
    assert.ok(within > 0.62 && within < 0.74, `within 1 SD: ${within}`);
  });
}

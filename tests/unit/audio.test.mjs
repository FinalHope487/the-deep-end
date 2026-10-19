// Inner layer: the drip bed is cut into single drips played at random gaps (pure logic, no Web Audio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDrips, dripGap, flowGap, DRIP_GAP, FLOW_GAP } from '../../js/audio.js';

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

// sound gaps are random but never leave their range (the range itself is sound design, not checked here)
test('drip and water-flow gaps stay inside their ranges', () => {
  const r = seeded();
  for (const [gap, [lo, hi]] of [[dripGap, DRIP_GAP], [flowGap, FLOW_GAP]]) {
    const gaps = Array.from({ length: 2000 }, () => gap(r));
    assert.ok(gaps.every((g) => g >= lo && g <= hi && Number.isFinite(g)), `${Math.min(...gaps)}..${Math.max(...gaps)} outside ${lo}..${hi}`);
  }
});

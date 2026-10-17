// Inner layer: adaptive quality controller simulated against synthetic devices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quality } from '../../js/quality.js';

// fpsOf(q) → frame rate the device reaches at the current level / pixel ratio (capped by the display)
function simulate(q, fpsOf, seconds, hz = 60) {
  const log = [];
  let t = 0, switches = 0, below = 0;
  while (t < seconds) {
    const fps = Math.min(hz, fpsOf(q));
    const dt = 1 / fps;
    if (fps < 55) below += dt;
    if (q.sample(dt)) switches++;
    t += dt;
    log.push({ t, level: q.level, scale: q.pixelRatio, fps });
  }
  return { switches, below, log };
}

test('a phone that cannot hold 60 fps on "high" settles on "mid" instead of cycling', () => {
  const q = new Quality('auto', true, 3);
  const r = simulate(q, (q) => (q.level === 'high' ? 45 : 60), 600);
  assert.ok(r.switches <= 4, `${r.switches} quality switches in 10 minutes`);
  assert.ok(r.below <= 30, `${r.below.toFixed(0)} s spent below 55 fps`);
  assert.equal(q.level, 'mid');
});

test('a display capped at 30 Hz (iOS low-power) is not degraded for nothing', () => {
  const q = new Quality('auto', true, 3);
  const start = { level: q.level, scale: q.pixelRatio };
  const r = simulate(q, () => 30, 120, 30);
  const atLow = r.log.filter((e) => e.level === 'low').length / 30;
  assert.ok(atLow <= 6, `${atLow.toFixed(0)} s at low quality`);
  assert.notEqual(q.level, 'low');
  assert.ok(q.pixelRatio >= start.scale, `ended at ×${q.pixelRatio} (started ×${start.scale})`);
});

test('a fill-rate-bound phone finds the highest resolution that holds 60 fps and stays there', () => {
  const q = new Quality('auto', true, 3);
  const r = simulate(q, (q) => (q.pixelRatio <= 0.81 ? 60 : 50), 600);
  const late = r.log.filter((e) => e.t > 300);
  const lateBelow = late.filter((e) => e.fps < 55).length / 60;
  assert.ok(lateBelow <= 6, `${lateBelow.toFixed(0)} s below 55 fps in the last 5 minutes`);
  assert.equal(Math.round(q.pixelRatio * 10) / 10, 0.8);
});

test('a fast desktop stays on high; manual settings never change', () => {
  const q = new Quality('auto', false, 1);
  simulate(q, () => 60, 60);
  assert.equal(q.level, 'high');
  const m = new Quality('low', true, 3);
  simulate(m, () => 20, 60);
  assert.equal(m.level, 'low');
  assert.equal(m.pixelRatio, 0.7);
});

test('a near-miss window does not leave a stale "no gain" streak behind', () => {
  const q = new Quality('auto', true, 3);
  const windowAt = (fps) => { for (let i = 0; i < Math.ceil(fps * 2) + 1; i++) q.sample(1 / fps); };   // closes one 2 s window
  windowAt(54.5);   // too slow → one step down
  windowAt(55.3);   // barely ok: gained < 1 fps, but no longer slow
  windowAt(60); windowAt(60);
  windowAt(50);     // a new, unrelated slowdown: one ordinary step
  windowAt(50);     // still slow, still an ordinary step (not a jump to "low")
  assert.equal(q.level, 'mid');
});

// Inner layer, batch 5 M8: walking 3.3 m/s, running 6 m/s, wading 0.75 down to 0.55 of that, strides keep their length.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World } from '../../js/world.js';
import { Player, WALK_SPEED, RUN_SPEED, waterMul } from '../../js/player.js';

const DT = 1 / 60;

test('M8 one second of walking covers 3.3 m, of running 6 m, on a flat dry floor', () => {
  const w = new World(1);
  for (const [run, want] of [[false, 3.3], [true, 6]]) {
    const p = new Player();
    p.reset(8.5, 8.5, 0, 0); p.settle(w, 0);
    const z0 = p.z;
    for (let t = 0; t < 1 - 1e-9; t += DT) p.update(w, DT, { x: 0, z: 1, run });
    assert.ok(Math.abs((z0 - p.z) - want) < 0.05, `${run ? 'ran' : 'walked'} ${(z0 - p.z).toFixed(2)} m`);
  }
  assert.equal(WALK_SPEED, 3.3); assert.equal(RUN_SPEED, 6);
});

test('M8 the water slows the pace to 0.75 in the shallows and 0.55 in the deepest wading, linearly between', () => {
  assert.equal(waterMul(0.38), 0.75);
  assert.equal(waterMul(0.4), 0.75);
  assert.ok(Math.abs(waterMul(0.9) - 0.65) < 1e-9);
  assert.ok(Math.abs(waterMul(1.4) - 0.55) < 1e-9);
  assert.ok(Math.abs(waterMul(3) - 0.55) < 1e-9);
});

test('M8 a footstep comes every stride of ground covered, so the sound follows the pace', () => {
  const src = readFileSync(new URL('../../js/audio.js', import.meta.url), 'utf8');
  assert.match(src, /\(player\.running \? 1\.76 : 1\.5\) \/ Math\.max\(0\.5, player\.speed \|\| 3\)/);
  const gap = (running, speed) => (running ? 1.76 : 1.5) / speed;
  assert.ok(gap(false, WALK_SPEED) < 0.5 && gap(true, RUN_SPEED) < 0.32, 'quicker than the old 0.5 s and 0.32 s gaps');
  assert.ok(gap(false, WALK_SPEED * 0.55) > gap(false, WALK_SPEED), 'slower in deep water');
});

// Inner layer: level jump targets (F). Every target puts the player on a spot they can stand on, in the right place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { Player } from '../../js/player.js';
import { JUMP_TARGETS } from '../../js/jump.js';

const SEEDS = [1, 2, 3, 42, 7, 11, 99];

test('the jump list has zones 1–4, the exit and a mega room, each with a label and an id', () => {
  assert.deepEqual(JUMP_TARGETS.map((t) => t.id), ['zone1', 'zone2', 'zone3', 'zone4', 'exit', 'mega']);
  for (const t of JUMP_TARGETS) assert.ok(t.label && typeof t.spot === 'function');
});

test('every jump target lands on standable floor: inside its zone, or near the exit but outside its trigger radius', () => {
  for (const seed of SEEDS) {
    const w = new World(seed), p = new Player();
    const canStand = (x, z, h) => p.canStand(w, x, z, h);
    JUMP_TARGETS.forEach((t, i) => {
      const s = t.spot(w, canStand);
      assert.ok(s, `seed ${seed} ${t.id} has a spot`);
      assert.ok(canStand(s.x, s.z, s.h), `seed ${seed} ${t.id}: spot is standable`);
      if (t.id === 'exit') {
        const d = Math.hypot(s.x - w.exit.x, s.z - w.exit.z);
        assert.ok(d >= 3 && d <= 16, `seed ${seed}: exit spot ${d.toFixed(1)} m from the door`);
      } else if (t.id === 'mega') {   // H5: just inside a ground doorway of a mega room, on its ground floor
        const m = w.lm.megaChunk(Math.floor(s.x / 16), Math.floor(s.z / 16));
        assert.ok(m, `seed ${seed}: the mega-room spot is inside a mega room`);
        assert.ok(Math.abs(s.h) < 0.01, `seed ${seed}: it is on the ground floor`);
        const edge = Math.min(s.x - m.cx0 * 16, m.cx0 * 16 + 32 - s.x, s.z - m.cz0 * 16, m.cz0 * 16 + 32 - s.z);
        assert.ok(edge < 4, `seed ${seed}: ${edge.toFixed(1)} m from the room's wall`);
      } else {
        const z = w.zones[i];
        assert.ok(Math.abs(s.x - z.x) <= 16 && Math.abs(s.z - z.z) <= 16, `seed ${seed} ${t.id}: spot is inside the zone`);
      }
    });
  }
});

// Inner layer: the distant black figure (L2) — where it shows up, and when it fades.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { WALL } from '../../js/tiles.js';
import { loadPresence } from './mesh-helper.mjs';

// a presence without the real three.js mesh: only what update() touches
async function make() {
  const mod = await loadPresence();
  const p = Object.create(mod.Presence.prototype);
  p.mesh = { position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { y: 0 }, visible: false, material: { opacity: 0 } };
  p.reset();
  return { mod, p };
}
const at = (x, z, yaw = 0) => ({ x, z, y: 1.6, yaw });

test('it appears 20 to 30 m from the player', async () => {
  const { mod, p } = await make();
  assert.equal(mod.MIN_DIST, 20);
  assert.equal(mod.MAX_DIST, 30);
  const w = new World(42), seen = [];
  for (let i = 0; i < 4000 && seen.length < 20; i++) {
    const player = at(-60 + (i % 40) * 3 + 0.5, -60 + Math.floor(i / 40) * 3 + 0.5, i * 0.7);
    if (w.typeAt(Math.floor(player.x), Math.floor(player.z)) === WALL) continue;
    p.reset(); p.cooldown = 0;
    p.update(0.016, w, player, true, 1, 0.7);
    if (p.active) seen.push(Math.hypot(p.mesh.position.x - player.x, p.mesh.position.z - player.z));
  }
  assert.ok(seen.length >= 5, `only ${seen.length} appearances`);
  for (const d of seen) assert.ok(d >= 19 && d <= 31, `appeared ${d.toFixed(1)} m away`);   // the tile centre is up to 0.7 m off the sample
});

// an active figure `dist` m straight ahead of a player at the origin looking down -z
function active(p, dist, life = 0, stare = 0) {
  p.active = true; p.fading = false; p.life = life; p.stare = stare;
  p.mesh.visible = true; p.mesh.material.opacity = 0.5;
  p.mesh.position.set(0, 1, -dist);
}
const step = (p, player, seconds) => { for (let t = 0; t < seconds; t += 0.1) p.update(0.1, null, player, true, 1, 0.7); };

test('it fades only after a 3 s stare, from 6 m, or after 25 s', async () => {
  const { p } = await make();
  const player = at(0, 0, 0);
  active(p, 12);
  step(p, player, 2.7);
  assert.equal(p.fading, false, 'faded before the stare was long enough');
  step(p, player, 0.6);
  assert.equal(p.fading, true, 'did not fade after a 3 s stare');

  active(p, 7);
  p.stare = -1e9;   // never counts as a stare here: only distance can end it
  step(p, at(0, 0, Math.PI), 1);   // looking away
  assert.equal(p.fading, false, 'faded at 7 m');
  active(p, 5.5);
  step(p, at(0, 0, Math.PI), 0.2);
  assert.equal(p.fading, true, 'did not fade inside 6 m');

  active(p, 15);
  step(p, at(0, 0, Math.PI), 24);
  assert.equal(p.fading, false, 'faded before 25 s');
  step(p, at(0, 0, Math.PI), 1.5);
  assert.equal(p.fading, true, 'still there after 25 s');
});

// Inner layer: a chunk's mesh is built a few milliseconds a frame, not all in one frame (long frames on slow phones).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { loadMesher, loadChunkManager } from './mesh-helper.mjs';

const CTX = { ceil: 4.5, T: 0, guide: null };
const sceneStub = () => ({ n: 0, add() { this.n++; }, remove() { this.n--; } });
const mats = { static: {}, lamp: {}, abyss: {}, water: {}, sun: {}, prop: {} };

// a spot whose 3×3 chunks carry no floating toys (the manager's toy geometry needs the real three.js)
function plainSpot(w) {
  for (let r = 0; r < 30; r++) for (let cz = -r; cz <= r; cz++) for (let cx = -r; cx <= r; cx++) {
    if (Math.max(Math.abs(cx), Math.abs(cz)) !== r) continue;
    let ok = true;
    for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1 && ok; dx++) ok = w.layout(cx + dx, cz + dz).floaters.length === 0;
    if (ok) return { x: cx * 16 + 8, z: cz * 16 + 8 };
  }
  throw new Error('no plain spot');
}

test('a chunk mesh is built in sections that add up to the one-shot build', async () => {
  const { buildChunkGeometry, buildChunkSteps } = await loadMesher();
  const w = new World(42);
  const L = w.layout(2, 3);
  let r;
  const steps = buildChunkSteps(w, L, CTX);
  do r = steps.next(); while (!r.done);
  const whole = buildChunkGeometry(w, L, CTX);
  for (const k of ['static', 'lamps', 'water', 'sun', 'abyss']) {
    const a = r.value[k]?.attributes.position.array, b = whole[k]?.attributes.position.array;
    assert.deepEqual(a && Array.from(a), b && Array.from(b), k);
  }
});

test('the chunk manager spends a small budget a frame: a chunk takes several frames, at most one finishes per frame', async () => {
  const ChunkManager = await loadChunkManager();
  const w = new World(42), at = plainSpot(w);
  const cm = new ChunkManager(sceneStub(), mats, () => ({ ...CTX }));
  cm.setWorld(w);
  let frames = 0, prev = 0;
  while ((cm.pending() || cm.job || !frames) && frames < 5000) {
    cm.update(at.x, at.z, 1, 1e-6);   // a budget no section fits in: one section a frame
    frames++;
    assert.ok(cm.count - prev <= 1, 'two chunks finished in one frame');
    prev = cm.count;
  }
  assert.equal(cm.count, 9);
});

test('flush builds every chunk in range in one call', async () => {
  const ChunkManager = await loadChunkManager();
  const w = new World(42), at = plainSpot(w);
  const cm = new ChunkManager(sceneStub(), mats, () => ({ ...CTX }));
  cm.setWorld(w);
  cm.flush(at.x, at.z, 1);
  assert.equal(cm.count, 9);
  assert.equal(cm.pending(), 0);
});

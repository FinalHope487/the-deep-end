// Inner layer: which chunks are drawn (K6) and which get rebuilt when the way on changes (K7). No three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { guideKey, staleGuideChunks, floorVisible } from '../../js/guides.js';

test('K6 only the player floor and the floor directly above or below are drawn', () => {
  for (const [chunk, player, shown] of [[0, 0, true], [1, 0, true], [-1, 0, true], [1, 1, true], [-1, 1, false], [1, -1, false], [-1, -1, true], [0, -1, true], [0, 1, true]]) {
    assert.equal(floorVisible(chunk, player), shown, `chunk on ${chunk} seen from ${player}`);
  }
});

// a fake loaded set with the guide each chunk was built with; ctxFn answers with the guide it would get now
function loadedSet(w, radius) {
  const out = [];
  for (let cz = -radius; cz <= radius; cz++) for (let cx = -radius; cx <= radius; cx++) out.push({ cx, cz, layout: w.layout(cx, cz), guideKey: '' });
  return out;
}

test('K7 changing the way on rebuilds only the chunks whose signs or door lamps change', () => {
  const w = new World(42);
  const loaded = loadedSet(w, 6);
  // before: only every third chunk has a guide towards target A
  const guideA = (cx, cz) => ((cx * 7 + cz * 13) % 3 === 0 ? { zone: 0, x: 100, z: 100 } : null);
  for (const c of loaded) c.guideKey = guideKey(guideA(c.cx, c.cz));
  // same target again: nothing to rebuild
  assert.equal(staleGuideChunks(loaded, (cx, cz) => ({ guide: guideA(cx, cz) })).length, 0);
  // new target B: only chunks that had or now get a guide are rebuilt (the rest never had signs or lamps)
  const guideB = (cx, cz) => ((cx * 5 + cz * 3) % 4 === 0 ? { zone: 1, x: -60, z: 30 } : null);
  const stale = staleGuideChunks(loaded, (cx, cz) => ({ guide: guideB(cx, cz) }));
  const touched = loaded.filter((c) => c.layout.kind !== 'zone' && (guideA(c.cx, c.cz) || guideB(c.cx, c.cz)));
  assert.deepEqual(stale.map((c) => `${c.cx},${c.cz}`).sort(), touched.filter((c) => guideKey(guideA(c.cx, c.cz)) !== guideKey(guideB(c.cx, c.cz))).map((c) => `${c.cx},${c.cz}`).sort());
  assert.ok(stale.length > 0 && stale.length < loaded.length * 0.65, `${stale.length} of ${loaded.length} rebuilt`);
  assert.ok(loaded.filter((c) => !guideA(c.cx, c.cz) && !guideB(c.cx, c.cz)).length > 20);
  // zone chunks never rebuild
  const zoneChunk = loaded.find((c) => c.layout.kind === 'zone');
  if (zoneChunk) assert.ok(!staleGuideChunks([zoneChunk], () => ({ guide: guideB(0, 0) || { zone: 9, x: 1, z: 1 } })).includes(zoneChunk));
});

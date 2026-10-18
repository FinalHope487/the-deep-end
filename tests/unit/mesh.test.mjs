// Inner layer: the baked chunk meshes. Needs the three.js stand-in from mesh-helper.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { loadMesher, quadsOf, coplanarOverlaps } from './mesh-helper.mjs';

const SEEDS = [1, 2, 3, 42, 7];

function* sampleChunks(w) {
  for (let cz = -5; cz < 5; cz++) for (let cx = -5; cx < 5; cx++) yield w.layout(cx, cz);
  for (const z of w.zones) for (let cz = z.cz0; cz < z.cz0 + 2; cz++) for (let cx = z.cx0; cx < z.cx0 + 2; cx++) yield w.layout(cx, cz);
}

// A1: stacked walls (ground wall under an upper wall) were each drawn full height in the same plane, so the two
// grey ramps fought for the pixels and the wall flickered white / grey.
test('no two faces of a chunk mesh lie in one plane, face the same way and overlap (z-fighting)', async () => {
  const { buildChunkGeometry } = await loadMesher();
  const seen = {};
  const bad = [];
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const z of w.zones) for (let cz = z.cz0 - 1; cz < z.cz0 + 3; cz++) for (let cx = z.cx0 - 1; cx < z.cx0 + 3; cx++) w.layout(cx, cz);
    for (let cz = -6; cz < 6; cz++) for (let cx = -6; cx < 6; cx++) w.layout(cx, cz);
    for (const L of sampleChunks(w)) {
      const g = buildChunkGeometry(w, L, { ceil: L.ceilFixed || 4.5, T: 0, guide: null });
      const kind = L.kind + (L.variant ? ':' + L.variant : '');
      seen[kind] = (seen[kind] || 0) + 1;
      const ov = coplanarOverlaps(quadsOf(g.static), 0.2);
      if (ov.length) bad.push(`seed ${seed} chunk ${L.cx},${L.cz} ${kind}: ${ov.length} overlaps, first ${JSON.stringify(ov[0].a.map((v) => +v.toFixed(2)))}`);
    }
  }
  for (const k of ['stairs:spiral', 'stairs:straight', 'stairs:uturn', 'zone', 'corridor', 'hall']) assert.ok(seen[k] >= 5, `only ${seen[k]} ${k} chunks sampled`);
  assert.deepEqual(bad.slice(0, 5), []);
});

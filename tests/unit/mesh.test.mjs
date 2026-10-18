// Inner layer: the baked chunk meshes. Needs the three.js stand-in from mesh-helper.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { loadMesher, quadsOf, coplanarOverlaps, decalsTooClose } from './mesh-helper.mjs';

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

const isHorizontalRect = (q) => {
  if (!q.every((v) => Math.abs(v[1] - q[0][1]) < 1e-6)) return false;
  const xs = new Set(q.map((v) => v[0].toFixed(4))), zs = new Set(q.map((v) => v[2].toFixed(4)));
  return xs.size === 2 && zs.size === 2;
};

// D: one lamp shape per chunk (per landmark zone), 80% round / 20% square, decided by the world seed
test('each chunk uses one lamp shape: 80% round discs, 20% square panels', async () => {
  const { buildChunkGeometry } = await loadMesher();
  let round = 0, square = 0, rectsInRound = 0, discsInSquare = 0, lit = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (let cz = -8; cz < 8; cz++) for (let cx = -8; cx < 8; cx++) {
      const L = w.layout(cx, cz);
      assert.ok(L.lampShape === 'round' || L.lampShape === 'square');
      L.lampShape === 'round' ? round++ : square++;
      if (L.suns.length || !L.lamps.length || L.kind === 'mega') continue;   // skylights and their frames are rectangles by nature; a mega room's lamps cross its chunks
      lit++;
      const g = buildChunkGeometry(w, L, { ceil: L.ceilFixed || 4.5, T: 0, guide: null });
      const flat = quadsOf(g.lamps).filter((q) => q.every((v) => Math.abs(v[1] - q[0][1]) < 1e-6));
      const rects = flat.filter(isHorizontalRect).length;
      if (L.lampShape === 'round') rectsInRound += rects; else { discsInSquare += flat.length - rects; assert.ok(rects >= 1, 'a square-lamp chunk draws rectangles'); }
      if (L.lampShape === 'round') assert.ok(flat.length >= 6, 'a round-lamp chunk draws discs');
    }
  }
  const share = round / (round + square);
  assert.ok(share > 0.75 && share < 0.85, `${(share * 100).toFixed(1)}% of chunks are round`);
  assert.ok(lit >= 200, `only ${lit} chunks checked`);
  assert.equal(rectsInRound, 0, 'no square panel in a round-lamp chunk');
  assert.equal(discsInSquare, 0, 'no disc in a square-lamp chunk');
});

// K1: decals sit at least 1 cm off the surface they are drawn on, so they do not flicker against it
test('lamp-mesh decals and water-mesh patches stay at least 1 cm off every base surface', async () => {
  const { buildChunkGeometry } = await loadMesher();
  const bad = [];
  let decals = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const z of w.zones) for (let cz = z.cz0 - 1; cz < z.cz0 + 3; cz++) for (let cx = z.cx0 - 1; cx < z.cx0 + 3; cx++) w.layout(cx, cz);
    for (let cz = -6; cz < 6; cz++) for (let cx = -6; cx < 6; cx++) w.layout(cx, cz);
    for (const L of sampleChunks(w)) {
      const g = buildChunkGeometry(w, L, { ceil: L.ceilFixed || 4.5, T: 0.7, guide: { x: 0, z: 400, zone: 1, color: [1, 1, 1] } });
      const base = quadsOf(g.static);
      for (const [name, geo] of [['lamps', g.lamps], ['water', g.water]]) {
        const q = quadsOf(geo);
        decals += q.length;
        const v = decalsTooClose(q, base, 0.01);
        if (v.length) bad.push(`seed ${seed} chunk ${L.cx},${L.cz} ${name}: ${v.length} too close, first ${JSON.stringify(v[0])}`);
      }
    }
  }
  assert.ok(decals > 5000, `only ${decals} decal quads checked`);
  assert.deepEqual(bad.slice(0, 5), []);
});

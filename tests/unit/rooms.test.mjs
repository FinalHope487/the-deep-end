// Inner layer, batch 4 L4: the flooded-column room (A) and the sunken-walkway room (B).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, FLOOD_CEIL } from '../../js/world.js';
import { SHALLOW, DEEP, FLOOR, WALL, FORM_CYL } from '../../js/tiles.js';
import { gridReach } from '../../js/levels.js';

const asGrid = (L) => ({ ...L, ox: 0, oz: 0, rails: L.rails.map((r) => ({ ...r, x0: r.x0 - L.ox, x1: r.x1 - L.ox, z0: r.z0 - L.oz, z1: r.z1 - L.oz })) });
function* rooms(kind, seeds = [1, 2, 3], R = 30) {
  for (const seed of seeds) {
    const w = new World(seed);
    for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) { const L = w.layout(cx, cz); if (L.kind === kind) yield { w, L, seed }; }
  }
}

test('L4 each new room kind is about 1 in 24 of the ordinary rooms', () => {
  let ordinary = 0, flood = 0, sunk = 0;
  const w = new World(7);
  for (let cz = -40; cz <= 40; cz++) for (let cx = -40; cx <= 40; cx++) {
    const L = w.layout(cx, cz);
    if (L.lv < 0 || L.zone >= 0 || L.mega || L.stair) continue;
    if (['hall', 'corridor', 'pool', 'colonnade', 'stairs', 'rise', 'flood', 'sunk'].includes(L.kind)) ordinary++;
    if (L.kind === 'flood') flood++;
    if (L.kind === 'sunk') sunk++;
  }
  assert.ok(Math.abs(flood / ordinary - 1 / 24) < 0.012, `flood ${flood}/${ordinary}`);
  assert.ok(Math.abs(sunk / ordinary - 1 / 24) < 0.012, `sunk ${sunk}/${ordinary}`);
});

test('L4 room A: 6 m ceiling, mostly shallow water, a deep block in the middle, 4-6 round columns, a dry walkway round the walls, every dry tile reachable', () => {
  let n = 0;
  for (const { L } of rooms('flood')) {
    n++;
    assert.equal(L.ceilFixed, FLOOD_CEIL);
    assert.equal(FLOOD_CEIL, 6);
    let water = 0, deep = 0, cols = 0, ring = 0;
    for (let z = 1; z < 16; z++) for (let x = 1; x < 16; x++) {
      const i = z * 16 + x, t = L.tiles[i], edge = x === 1 || z === 1 || x === 15 || z === 15;
      if (edge) { assert.equal(t, FLOOR, `walkway tile ${x},${z}`); assert.equal(L.h[i], L.baseY); ring++; continue; }
      if (t === WALL) { assert.ok(L.form[i] & FORM_CYL, 'columns are round'); cols++; continue; }
      assert.ok(t === SHALLOW || t === DEEP);
      water++; if (t === DEEP) deep++;
    }
    assert.ok(cols >= 4 && cols <= 6, `${cols} columns`);
    assert.ok(deep >= 16 && deep <= 36 && deep / water < 0.25, `${deep} deep of ${water}`);
    assert.ok((water + cols) / 225 > 0.7, `water share ${(water + cols) / 225}`);
    // the deep block sits in the middle
    const dx = [], dz = [];
    for (let i = 0; i < 256; i++) if (L.tiles[i] === DEEP) { dx.push(i % 16); dz.push((i / 16) | 0); }
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    assert.ok(Math.abs(mean(dx) - 8) < 1.6 && Math.abs(mean(dz) - 8) < 1.6);
    // from the middle of the north-west walkway every walkable tile is reachable
    const ok = gridReach(asGrid(L), [[1, 1, 0]]);
    for (let i = 0; i < 256; i++) if (L.tiles[i] === SHALLOW || (L.tiles[i] === FLOOR && i % 16 > 0 && i >= 16)) assert.ok(ok(i % 16, (i / 16) | 0, 0), `tile ${i % 16},${(i / 16) | 0} cut off`);
  }
  assert.ok(n >= 8, `${n} flooded rooms`);
});

test('L4 room B: deep water everywhere but two-tile walkways 0.4 m down running from each door side to the middle crossing', () => {
  let n = 0;
  for (const { L } of rooms('sunk')) {
    n++;
    for (let z = 1; z < 16; z++) for (let x = 1; x < 16; x++) {
      const i = z * 16 + x, walkway = (z === 7 || z === 8 || x === 7 || x === 8);
      if (walkway) { assert.equal(L.tiles[i], SHALLOW, `walkway ${x},${z}`); assert.ok(Math.abs(L.h[i] - L.baseY + 0.4) < 1e-6); }
      else assert.equal(L.tiles[i], DEEP, `deep ${x},${z}`);
    }
    // a door (tile 7 or 8 of an edge, whatever the door kind) opens straight onto a walkway
    const g = asGrid(L);
    const ok = gridReach(g, [[7, 1, 0]]);
    for (const [x, z] of [[1, 7], [15, 8], [8, 15], [8, 1], [8, 8]]) assert.ok(ok(x, z, 0), `${x},${z} not on the walkway network`);
    assert.equal(L.rails.length, 0, 'the walkways have no rails');
  }
  assert.ok(n >= 8, `${n} sunken-walkway rooms`);
});

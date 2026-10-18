// Inner layer, batch 5 M1: doorway arches stay inside their doorway and leave no hairline seam; the wet lens has no straight cut-off line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World } from '../../js/world.js';
import { doorwayAxis, archSpring, ARCH_R } from '../../js/shapes.js';
import { loadMesher } from './mesh-helper.mjs';

test('M1 the arch of a doorway stays within the doorway tile and its apex under the ceiling; the end wall has a sealing copy behind it', async () => {
  const { buildChunkGeometry } = await loadMesher();
  const w = new World(42);
  let checked = 0;
  for (let cz = -6; cz <= 6 && checked < 6; cz++) for (let cx = -6; cx <= 6 && checked < 6; cx++) {
    const L = w.layout(cx, cz);
    if (L.kind === 'zone' || L.kind === 'mega' || L.up) continue;
    const cellAt = (x, z) => (x >= 0 && z >= 0 && x < 16 && z < 16 ? [L, z * 16 + x] : w.cellOf(L.ox + x, L.oz + z));
    let door = null;
    for (let z = 1; z < 15 && !door; z++) for (let x = 1; x < 15 && !door; x++) { const a = doorwayAxis(L, cellAt, x, z); if (a >= 0 && !L.low[z * 16 + x]) door = { x, z, a }; }
    if (!door) continue;
    checked++;
    const ceil = 4.5, g = buildChunkGeometry(w, L, { ceil, T: 0, guide: null });
    const pos = g.static.attributes.position.array;
    const f = L.h[door.z * 16 + door.x], sy = f + archSpring(ceil - f), cx0 = L.ox + door.x + 0.5, cz0 = L.oz + door.z + 0.5;
    assert.ok(sy + ARCH_R <= ceil);
    let arch = 0, sealed = 0;
    for (let k = 0; k < pos.length; k += 3) {
      const x = pos[k], y = pos[k + 1], z = pos[k + 2];
      const along = door.a === 1 ? z : x, across = door.a === 1 ? x : z, ac = door.a === 1 ? cx0 : cz0, lc = door.a === 1 ? cz0 : cx0;
      if (y > sy + 0.01 && y < sy + ARCH_R - 0.01 && Math.abs(along - lc) <= 0.5 + 1e-6 && Math.abs(across - ac) <= 0.5 + 1e-6) arch++;
      if (y >= sy - 1e-6 && Math.abs(Math.abs(along - lc) - 0.46) < 1e-4 && Math.abs(Math.abs(across - ac) - 0.54) < 1e-4) sealed++;   // an end wall's copy 0.04 behind the end plane, reaching 0.04 into the jambs
    }
    assert.ok(arch > 8, `${arch} arch vertices`);
    assert.ok(sealed > 0, 'a sealing copy of the end wall');
    let high = -Infinity;   // no arch vertex above the apex inside the tile
    for (let k = 0; k < pos.length; k += 3) {
      const along = door.a === 1 ? pos[k + 2] : pos[k], across = door.a === 1 ? pos[k] : pos[k + 2];
      if (Math.abs(across - (door.a === 1 ? cx0 : cz0)) < 0.49 && Math.abs(along - (door.a === 1 ? cz0 : cx0)) < 0.49 && pos[k + 1] < ceil - 0.01 && pos[k + 1] > sy) high = Math.max(high, pos[k + 1]);
    }
    assert.ok(high <= sy + ARCH_R + 1e-6, `apex ${high} over ${sy + ARCH_R}`);
  }
  assert.ok(checked >= 4, `${checked} doorways checked`);
});

test('M1 the wet lens draws every drop inside its own grid cell, so no straight line cuts across the screen', () => {
  const src = readFileSync(new URL('../../js/wet.js', import.meta.url), 'utf8');
  assert.match(src, /float ry = r \/ 1\.25;/);
  assert.match(src, /\(n - 0\.5\) \* 2\.0 \* \(0\.5 - r\)/);
  assert.match(src, /\(0\.5 - ry\) \* \(1\.0 - 2\.0 \* slide\)/);
  // the same geometry in JS: the drop's reach (r across, r / 1.25 up and down) never passes the cell edge (±0.5) for any roll
  for (let n = 0; n <= 1; n += 0.05) for (let n2 = 0; n2 <= 1; n2 += 0.05) for (let slide = 0; slide <= 1; slide += 0.1) {
    const r = 0.12 + 0.17 * n2, ry = r / 1.25, px = (n - 0.5) * 2 * (0.5 - r), py = (0.5 - ry) * (1 - 2 * slide);
    assert.ok(Math.abs(px) + r <= 0.5 + 1e-9 && Math.abs(py) + ry <= 0.5 + 1e-9);
  }
});

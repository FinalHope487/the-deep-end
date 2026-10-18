// Inner layer, batch 4 L6: long straight arched corridors, sparse lamps, the same style in the ring passages of zones 1 and 4 and in B1's pipes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { FLOOR, WALL, SHALLOW, FORM_ARCH, FORM_ARCH_Z, FORM_CROWN, VAULT_SPRING, VAULT_CROWN } from '../../js/tiles.js';
import { loadMesher } from './mesh-helper.mjs';

function* corridors(seeds = [1, 2, 3], R = 24) {
  for (const seed of seeds) {
    const w = new World(seed);
    for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) { const L = w.layout(cx, cz); if (L.kind === 'corridor') yield { w, L }; }
  }
}
const onLine = (x, z) => x === 7 || x === 8 || z === 7 || z === 8;

test('L6 a corridor room is two straight tiles wide on tiles 7-8, a plus with one crossing: any route has at most one bend', () => {
  let n = 0;
  for (const { L } of corridors()) {
    n++;
    for (let z = 1; z < 16; z++) for (let x = 1; x < 16; x++) {
      const i = z * 16 + x;
      if (onLine(x, z)) {
        assert.equal(L.tiles[i], FLOOR, `${x},${z} is corridor floor`);
        assert.equal(L.h[i], L.baseY, 'a level corridor');
        assert.equal(L.dark[i], 2); assert.ok(L.low[i]);
        const crossing = x >= 7 && x <= 8 && z >= 7 && z <= 8;
        if (crossing) assert.equal(L.form[i] & (FORM_ARCH | FORM_CROWN), FORM_CROWN);
        else {
          assert.ok(L.form[i] & FORM_ARCH, 'vaulted');
          assert.equal(!!(L.form[i] & FORM_ARCH_Z), x >= 7 && x <= 8, 'the run axis is flagged');
        }
      } else assert.equal(L.tiles[i], WALL, `${x},${z} is wall`);
    }
    assert.ok(L.lamps.length >= 3 && L.lamps.length <= 4, `${L.lamps.length} lamps: sparse`);
  }
  assert.ok(n >= 20, `${n} corridor rooms`);
});

test('L6 corridor chunks side by side line up: the open door tiles carry the vault on and the line of sight runs through both', () => {
  let pairs = 0;
  for (const seed of [1, 2, 3, 4]) {
    const w = new World(seed);
    for (let cz = -30; cz <= 30; cz++) for (let cx = -30; cx <= 30; cx++) {
      const A = w.layout(cx, cz), B = w.layout(cx + 1, cz);
      if (A.kind !== 'corridor' || B.kind !== 'corridor' || B.tiles[7 * 16] !== FLOOR) continue;
      pairs++;
      for (const row of [7, 8]) {
        assert.ok(B.form[row * 16] & FORM_ARCH, 'the open door tile is vaulted too');
        for (let x = 1; x < 16; x++) assert.equal(A.tiles[row * 16 + x] === FLOOR, true);
        for (let x = 0; x < 16; x++) assert.equal(B.tiles[row * 16 + x], FLOOR);
      }
    }
  }
  assert.ok(pairs >= 8, `${pairs} neighbouring corridor chunks with an open door`);
});

test('L6 the vault is a half circle over the lane pair, lamps are bright near and the floor dim between them', async () => {
  const { buildChunkGeometry } = await loadMesher();
  const { w, L } = corridors([2]).next().value;
  const g = buildChunkGeometry(w, L, { ceil: 4.5, T: 0, guide: null });
  const pos = g.static.attributes.position.array, col = g.static.attributes.color.array;
  // the vault: ceiling points between the spring line and the crown, none of the old flat low ceiling
  let vault = 0, flatLow = 0, crown = 0;
  for (let k = 0; k < pos.length / 3; k++) {
    const y = pos[k * 3 + 1];
    if (y > VAULT_SPRING + 0.05 && y < VAULT_CROWN - 0.05) vault++;
    if (Math.abs(y - VAULT_CROWN) < 1e-4) crown++;
    if (Math.abs(y - 2.3) < 1e-4) flatLow++;
  }
  assert.ok(vault > 100 && crown > 20, `${vault} vault points, ${crown} on the crown`);
  assert.equal(flatLow, 0, 'no flat 2.3 m low ceiling');
  // floor brightness against the distance to the nearest lamp
  const lamps = L.lamps.map((l) => [L.ox + l.x + l.w / 2, L.oz + l.z + l.d / 2]);
  let near = 0, nn = 0, far = 0, nf = 0;
  for (let k = 0; k < pos.length / 3; k++) {
    if (Math.abs(pos[k * 3 + 1] - L.baseY) > 1e-4) continue;
    const x = pos[k * 3], z = pos[k * 3 + 2];
    if (!onLine(Math.floor(x - L.ox), Math.floor(z - L.oz)) && !onLine(Math.floor(x - L.ox - 0.01), Math.floor(z - L.oz - 0.01))) continue;
    const d = Math.min(...lamps.map(([lx, lz]) => Math.hypot(x - lx, z - lz)));
    const b = col[k * 3] + col[k * 3 + 1] + col[k * 3 + 2];
    if (d <= 1) { near += b; nn++; } else if (d >= 5.5) { far += b; nf++; }
  }
  assert.ok(nn > 0 && nf > 0, `${nn} near and ${nf} far vertices`);
  assert.ok(near / nn > 2 * (far / nf), `near ${(near / nn).toFixed(2)} vs far ${(far / nf).toFixed(2)}`);
});

test('L6 the ring passages of zones 1 and 4 are two-tile vaulted passages; zone 3 keeps its one-tile dark ones', () => {
  const w = new World(1);
  const zone = (i) => { const z = w.zones[i]; return [0, 1].flatMap((dz) => [0, 1].map((dx) => w.layout(z.cx0 + dx, z.cz0 + dz))); };
  for (const index of [0, 3]) {
    const L = zone(index)[0];   // the north-west chunk: its west edge carries the passages at tiles 7-8
    for (const row of [7, 8]) { assert.equal(L.tiles[row * 16 + 1], FLOOR); assert.ok(L.form[row * 16 + 1] & FORM_ARCH); assert.equal(L.dark[row * 16 + 1], 2); }
    assert.equal(L.tiles[6 * 16 + 1], WALL); assert.equal(L.tiles[9 * 16 + 1], WALL);
  }
  for (const L of zone(2)) for (let i = 0; i < 256; i++) assert.equal(L.form[i] & (FORM_ARCH | FORM_CROWN), 0, 'zone 3 has no vaults');
});

test('L6 B1 pipes: the lanes are vaulted and lit by sparse lamps', () => {
  let n = 0;
  for (const seed of [1, 2]) {
    const w = new World(seed);
    for (let cz = -20; cz <= 20; cz++) for (let cx = -20; cx <= 20; cx++) {
      const L = w.layout(cx, cz);
      if (L.kind !== 'pipes') continue;
      n++;
      for (const x of [3, 12]) for (const z of [7, 8]) {
        const i = z * 16 + x;
        assert.ok(L.tiles[i] === FLOOR || L.tiles[i] === SHALLOW);
        assert.ok(L.form[i] & FORM_ARCH, `${x},${z} vaulted`);
        assert.equal(L.dark[i], 2);
      }
      assert.ok(L.lamps.length <= 6);
    }
  }
  assert.ok(n >= 10, `${n} pipe rooms`);
});

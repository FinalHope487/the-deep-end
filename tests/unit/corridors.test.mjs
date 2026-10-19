// Inner layer, batch 4 L6: long straight arched corridors, sparse lamps, the same style in the ring passages of zones 1 and 4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { FLOOR, WALL, SHALLOW, FORM_ARCH, FORM_ARCH_Z, FORM_CROWN, VAULT_SPRING, VAULT_CROWN } from '../../js/tiles.js';
import { loadMesher } from './mesh-helper.mjs';

test('L6 the vault is a half circle over the lane pair', async () => {
  const { buildChunkGeometry } = await loadMesher();
  const w = new World(2), z = w.zones[0], L = w.layout(z.cx0, z.cz0);   // its west edge carries the ring passage's vault
  const g = buildChunkGeometry(w, L, { ceil: 4.5, T: 0, guide: null });
  const pos = g.static.attributes.position.array;
  // the vault: ceiling points between the spring line and the crown, none of the old flat low ceiling
  let vault = 0, flatLow = 0, crown = 0;
  for (let k = 0; k < pos.length / 3; k++) {
    const y = pos[k * 3 + 1] - L.baseY;
    if (y > VAULT_SPRING + 0.05 && y < VAULT_CROWN - 0.05) vault++;
    if (Math.abs(y - VAULT_CROWN) < 1e-4) crown++;
    if (Math.abs(y - 2.3) < 1e-4) flatLow++;
  }
  assert.ok(vault > 100 && crown > 20, `${vault} vault points, ${crown} on the crown`);
  assert.equal(flatLow, 0, 'no flat 2.3 m low ceiling');
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

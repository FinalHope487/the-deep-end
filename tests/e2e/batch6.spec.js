// User layer, batch 6: what the player sees in real Chromium. The underside of an abyss room's diving boards.
import { test, expect } from '@playwright/test';
import { boot, state, api, start } from './helpers.js';

// every board tile of the abyss room: floor 2 m and more up with the abyss beside it (world coordinates of its middle)
const boardTiles = (page, m) => page.evaluate(({ cx0, cz0 }) => {
  const out = [];
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const L = window.__deepend.layoutAt(cx0 + dx, cz0 + dz);
    for (let i = 0; i < 256; i++) {
      const x = i % 16, z = i >> 4;
      if (L.tiles[i] !== 0 || L.h[i] < 2) continue;
      const voidBeside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => x + a >= 0 && x + a < 16 && z + b >= 0 && z + b < 16 && L.tiles[(z + b) * 16 + x + a] === 8);
      if (voidBeside) out.push({ x: (cx0 + dx) * 16 + x + 0.5, z: (cz0 + dz) * 16 + z + 0.5, h: L.h[i] });
    }
  }
  return out;
}, m);

test('B6-1 巨型深淵池的跳水板從底下看是實心的：板下往上看撞到朝下的板底，截圖存證', async ({ page }, info) => {
  const errors = await boot(page);
  await start(page);
  const m = (await api(page, 'megas', 14)).find((r) => r.type === 'abyss');
  expect(m, 'an abyss room near the start').toBeTruthy();
  const tiles = await boardTiles(page, m);
  expect(tiles.length).toBeGreaterThanOrEqual(10);
  // stand on a board (its chunks drawn), then look up at every board tile from 1.5 m under it
  const t0 = tiles[0];
  await api(page, 'teleport', t0.x, t0.z, 0, true, t0.h);
  await page.waitForTimeout(1000);
  const solid = await page.evaluate(async (tiles) => {
    const THREE = await import('three');
    const ray = new THREE.Raycaster(), meshes = [];
    window.__deepend.scene.traverse((o) => { if (o.isMesh && o.visible && o.geometry?.attributes?.position) meshes.push(o); });
    let n = 0;
    for (const t of tiles) {
      ray.set(new THREE.Vector3(t.x, t.h - 1.5, t.z), new THREE.Vector3(0, 1, 0)); ray.far = 1.6;
      const hit = ray.intersectObjects(meshes, false)[0];   // static faces are one-sided: a top face seen from below is no hit
      if (hit && hit.face.normal.y < -0.9 && hit.distance > 0.5) n++;
    }
    return n;
  }, tiles);
  expect(solid, `${solid} of ${tiles.length} board tiles have an underside`).toBe(tiles.length);
  // the picture: from the walkway beside the board's root, looking up along it
  const root = tiles.reduce((a, b) => (b.h >= a.h ? b : a));
  const spot = await page.evaluate(({ x, z }) => {
    let best = null;
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
      const tx = Math.floor(x) + dx, tz = Math.floor(z) + dz, d = Math.hypot(dx, dz);
      if (d < 3 || window.__deepend.layoutAt(Math.floor(tx / 16), Math.floor(tz / 16)).tiles[(((tz % 16) + 16) % 16) * 16 + (((tx % 16) + 16) % 16)] !== 0) continue;
      if (Math.abs(window.__deepend.layoutAt(Math.floor(tx / 16), Math.floor(tz / 16)).h[(((tz % 16) + 16) % 16) * 16 + (((tx % 16) + 16) % 16)]) > 0.05) continue;
      if (!best || d < best.d) best = { x: tx + 0.5, z: tz + 0.5, d };
    }
    return best;
  }, root);
  expect(spot, 'a walkway tile near the board').toBeTruthy();
  await api(page, 'teleport', spot.x, spot.z, Math.atan2(-(root.x - spot.x), -(root.z - spot.z)), true, 0);
  await api(page, 'setPitch', 0.6);
  await page.waitForTimeout(500);
  expect(Math.abs((await state(page)).floorH)).toBeLessThan(0.05);
  const shot = info.outputPath('board-underside.png');   // kept in test-results/ for a person to look at
  await page.screenshot({ path: shot });
  await info.attach('board-underside', { path: shot, contentType: 'image/png' });
  expect(errors).toEqual([]);
});

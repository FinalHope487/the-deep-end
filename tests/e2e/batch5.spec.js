// User layer, batch 5: what the player sees and does in real Chromium.
import { test, expect } from '@playwright/test';
import { boot, state, api, start } from './helpers.js';

test('M2 從 1F 往上看 2F 水池的邊：天花板實心，視線打不進池子', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  const spot = await page.evaluate(() => {
    const w = window.__deepend;
    for (let cz = -14; cz <= 0; cz++) for (let cx = -14; cx <= 14; cx++) {
      const L = w.layoutAt(cx, cz);
      if (!L.up) continue;
      for (let i = 0; i < 256; i++) {
        if (L.up.tiles[i] !== 2) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = (i % 16) + dx, nz = (i >> 4) + dz;
          if (nx < 0 || nz < 0 || nx > 15 || nz > 15 || L.up.tiles[nz * 16 + nx] !== 0) continue;
          const ex = L.ox + (i % 16) + 0.5 + dx * 0.5, ez = L.oz + (i >> 4) + 0.5 + dz * 0.5;
          const gx = Math.floor(ex + dx * 2.5 - L.ox), gz = Math.floor(ez + dz * 2.5 - L.oz);
          if (gx < 0 || gz < 0 || gx > 15 || gz > 15 || L.tiles[gz * 16 + gx] !== 0) continue;
          return { eye: [ex + dx * 2.5, ez + dz * 2.5], target: [ex - dx * 0.03, L.up.h[i] - 0.05, ez - dz * 0.03] };
        }
      }
    }
    return null;
  });
  expect(spot).not.toBeNull();
  await api(page, 'teleport', spot.eye[0], spot.eye[1], 0, false);
  await page.waitForTimeout(4000);
  const blocked = await page.evaluate(async ({ eye, target }) => {
    const THREE = await import('three');
    const ray = new THREE.Raycaster();
    const from = new THREE.Vector3(eye[0], 1.6, eye[1]), to = new THREE.Vector3(...target);
    const dir = to.clone().sub(from), len = dir.length();
    ray.set(from, dir.normalize()); ray.far = len - 0.01;
    const meshes = [];
    window.__deepend.scene.traverse((o) => { if (o.isMesh && o.visible && o.geometry?.attributes?.position) meshes.push(o); });
    return ray.intersectObjects(meshes, false).length > 0;
  }, spot);
  expect(blocked).toBe(true);
  expect(errors).toEqual([]);
});

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

test('B6-2 區域裡牆的外角是圓的：貼著牆角看，牆面順著圓弧退進去，截圖存證', async ({ page }, info) => {
  const errors = await boot(page);
  await start(page);
  // an outside wall corner on region floor near the start: dry floor at one height on both open sides and across the corner
  const c = await page.evaluate(() => {
    const w = window.__deepend, tile = (x, z) => { const L = w.layoutAt(Math.floor(x / 16), Math.floor(z / 16)), i = (((z % 16) + 16) % 16) * 16 + (((x % 16) + 16) % 16); return { t: L.tiles[i], h: L.h[i], kind: L.kind, cyl: L.form[i] & 1 }; };
    for (let r = 2; r < 40; r++) for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) {
      if (Math.max(Math.abs(x), Math.abs(z)) !== r) continue;
      const wl = tile(x, z);
      if (wl.t !== 1 || wl.cyl || wl.kind !== 'region') continue;
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const a = tile(x + sx, z), b = tile(x, z + sz), d = tile(x + sx, z + sz);
        if (a.t === 0 && b.t === 0 && d.t === 0 && Math.abs(a.h - b.h) < 1e-3 && Math.abs(a.h - d.h) < 1e-3) return { x, z, sx, sz, h: a.h };
      }
    }
    return null;
  });
  expect(c, 'a rounded wall corner near the start').toBeTruthy();
  // stand on the floor across the corner, 1.5 m out, facing the corner
  const px = c.x + 0.5 + c.sx * 1.6, pz = c.z + 0.5 + c.sz * 1.6;
  await api(page, 'teleport', px, pz, Math.atan2(c.sx, c.sz), true, c.h);
  await page.waitForTimeout(1000);
  const hit = await page.evaluate(async (c) => {
    const THREE = await import('three');
    const ray = new THREE.Raycaster(), meshes = [];
    window.__deepend.scene.traverse((o) => { if (o.isMesh && o.visible && o.geometry?.attributes?.position) meshes.push(o); });
    // along the face turned to x + sx, 3 cm from the corner: a sharp corner is met 0.3 m in, the curve further back
    ray.set(new THREE.Vector3(c.x + 0.5 + c.sx * 0.8, c.h + 1, c.z + (c.sz > 0 ? 0.97 : 0.03)), new THREE.Vector3(-c.sx, 0, 0)); ray.far = 1.3;
    const h = ray.intersectObjects(meshes, false)[0];
    return h ? { dist: h.distance, toward: h.face.normal.x * c.sx > 0 } : null;
  }, c);
  expect(hit, 'the wall is drawn there').toBeTruthy();
  expect(hit.dist, 'the wall curves back near its corner').toBeGreaterThan(0.45);
  const shot = info.outputPath('rounded-corner.png');
  await page.screenshot({ path: shot });
  await info.attach('rounded-corner', { path: shot, contentType: 'image/png' });
  expect(errors).toEqual([]);
});

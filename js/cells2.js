// Generator v2 prototype: keeps the 64 m cells round the player built, a few milliseconds of mesh work a frame, and
// drops far ones. Answers the same calls main.js makes on the chunk manager.
import * as THREE from 'three';
import { CELL2 } from './gen2.js';
import { buildCell2 } from './mesh2.js';
import { CHUNK } from './tiles.js';

const BUDGET2_MS = 2;
const cellKey2 = (i, j) => i + ',' + j;

export class CellManager2 {
  constructor(scene, mats) {
    this.scene = scene;
    this.mats = mats;
    this.loaded = new Map();
    this.queue = [];
    this.job = null;
    this.world = null;
    this.maxPerFrame = 0;
    this.buildMs = [];
    this.geoMs = [];
    this.key = '';
  }

  setWorld(world, preserveReady = false) {
    const keep=preserveReady&&this.world?.seed===world.seed;
    for (const [key,c] of this.loaded) if(!keep||!world.cellReady?.(c.i,c.j)){
      this.dispose(c);this.loaded.delete(key);
    }
    this.queue = [];
    this.job = null;
    this.world = world;
    this.key = '';
  }

  dispose(c) {
    this.scene.remove(c.group);
    for (const m of c.group.children) m.geometry.dispose();
  }

  get count() { return this.loaded.size; }

  // cells whose square comes within the view distance (radius chunks) of the player
  update(px, pz, radius, budget = BUDGET2_MS) {
    const reach = radius * CHUNK + 8, i0 = Math.floor((px - reach) / CELL2), i1 = Math.floor((px + reach) / CELL2);
    const j0 = Math.floor((pz - reach) / CELL2), j1 = Math.floor((pz + reach) / CELL2), key = [i0, i1, j0, j1].join();
    if (key !== this.key) {
      this.key = key;
      for (const [k, c] of this.loaded) if (c.i < i0 - 1 || c.i > i1 + 1 || c.j < j0 - 1 || c.j > j1 + 1) { this.dispose(c); this.loaded.delete(k); }
      if (this.job && (this.job.i < i0 - 1 || this.job.i > i1 + 1 || this.job.j < j0 - 1 || this.job.j > j1 + 1)) this.job = null;
      this.queue = [];
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if(this.world.cellReady&&!this.world.cellReady(i,j))continue;
        if (this.loaded.has(cellKey2(i, j)) || (this.job && this.job.i === i && this.job.j === j)) continue;
        const d = Math.hypot((i + 0.5) * CELL2 - px, (j + 0.5) * CELL2 - pz);
        this.queue.push([d, i, j]);
      }
      this.queue.sort((a, b) => b[0] - a[0]);   // nearest last → pop()
    }
    if (!budget) return;
    if (!this.job && this.queue.length) {
      const [, i, j] = this.queue.pop();
      this.job = { i, j, steps: buildCell2(this.world, i, j), work: 0 };
    }
    if (this.job) {
      const t0 = performance.now();
      let r;
      do r = this.job.steps.next(); while (!r.done && performance.now() - t0 < budget);
      this.job.work += performance.now() - t0;
      if (r.done) { this.finish(this.job, r.value); this.job = null; this.maxPerFrame = 1; }
    }
  }

  finish({ i, j, work }, geo) {
    const group = new THREE.Group();
    if (geo.static) group.add(new THREE.Mesh(geo.static, this.mats.static));
    if (geo.lamps) group.add(new THREE.Mesh(geo.lamps, this.mats.lamp));
    if (geo.water) { const m = new THREE.Mesh(geo.water, this.mats.water); m.renderOrder = 1; group.add(m); }
    for (const m of group.children) m.matrixAutoUpdate = false;
    group.matrixAutoUpdate = false;
    this.scene.add(group);
    this.loaded.set(cellKey2(i, j), { i, j, group });
    this.geoMs.push(work);
    this.buildMs.push(work);
    if (this.geoMs.length > 200) { this.geoMs.shift(); this.buildMs.shift(); }
  }

  flush(px, pz, radius) {
    this.key = '';
    this.update(px, pz, radius, 0);
    while (this.queue.length || this.job) this.update(px, pz, radius, Infinity);
  }

  pending() { return this.queue.length + (this.job ? 1 : 0); }
  setLevel() {}
  animate() {}
  refreshGuides() {}
}

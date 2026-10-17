// Keeps the chunks around the player built; builds at most one chunk per frame, drops far ones.
import * as THREE from 'three';
import { CHUNK } from './world.js';
import { buildChunkGeometry } from './chunkmesh.js';

const chunkKey = (cx, cz) => cx + ',' + cz;

export class ChunkManager {
  // ctxFn(cx, cz) → { ceil, stripe } decided at build time (depends on tension / guide target)
  constructor(scene, mats, ctxFn) {
    this.scene = scene;
    this.mats = mats;
    this.ctxFn = ctxFn;
    this.loaded = new Map();
    this.queue = [];
    this.stale = [];
    this.world = null;
    this.pcx = NaN; this.pcz = NaN; this.radius = -1;
    this.maxPerFrame = 0;   // most chunk builds seen in a single update() (budget check)
  }

  setWorld(world) {
    for (const c of this.loaded.values()) this.dispose(c);
    this.loaded.clear();
    this.queue = [];
    this.stale = [];
    this.world = world;
    this.pcx = NaN;
  }

  dispose(c) {
    this.scene.remove(c.group);
    for (const m of c.group.children) m.geometry.dispose();
  }

  get count() { return this.loaded.size; }

  update(px, pz, radius, maxBuilds = 1) {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    if (pcx !== this.pcx || pcz !== this.pcz || radius !== this.radius) {
      this.pcx = pcx; this.pcz = pcz; this.radius = radius;
      const r2 = (radius + 0.5) ** 2, keep2 = (radius + 1.5) ** 2;
      for (const [k, c] of this.loaded) {
        const d2 = (c.cx - pcx) ** 2 + (c.cz - pcz) ** 2;
        if (d2 > keep2) { this.dispose(c); this.loaded.delete(k); }
        else c.group.visible = d2 <= r2;
      }
      this.queue = [];
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 <= r2 && !this.loaded.has(chunkKey(pcx + dx, pcz + dz))) this.queue.push([d2, pcx + dx, pcz + dz]);
      }
      this.queue.sort((a, b) => b[0] - a[0]);   // closest last → pop()
    }
    let built = 0;
    for (let i = 0; i < maxBuilds && this.queue.length; i++) {
      const [, cx, cz] = this.queue.pop();
      this.build(cx, cz);
      built++;
    }
    // refresh stale chunks only when nothing new is waiting, nearest first, same one-per-frame budget
    if (maxBuilds && !built && !this.queue.length && this.stale.length) {
      this.stale.sort((a, b) => ((b.cx - pcx) ** 2 + (b.cz - pcz) ** 2) - ((a.cx - pcx) ** 2 + (a.cz - pcz) ** 2));
      const c = this.stale.pop();
      if (this.loaded.get(chunkKey(c.cx, c.cz)) === c) {
        this.dispose(c);
        this.build(c.cx, c.cz, c.ceil);
        this.loaded.get(chunkKey(c.cx, c.cz)).group.visible = c.group.visible;
        built++;
      }
    }
    if (maxBuilds) this.maxPerFrame = Math.max(this.maxPerFrame, built);
  }

  // guide stripes are baked into chunk geometry; rebuild the loaded non-zone chunks when the target changes
  refreshStripes() {
    this.stale = [...this.loaded.values()].filter((c) => c.layout.kind !== 'zone');
  }

  build(cx, cz, keepCeil) {
    const L = this.world.layout(cx, cz);
    const ctx = this.ctxFn(cx, cz, L);
    if (keepCeil !== undefined) ctx.ceil = keepCeil;
    const geo = buildChunkGeometry(this.world, L, ctx);
    const group = new THREE.Group();
    if (geo.static) group.add(new THREE.Mesh(geo.static, this.mats.static));
    if (geo.lamps) group.add(new THREE.Mesh(geo.lamps, this.mats.lamp));
    if (geo.water) { const m = new THREE.Mesh(geo.water, this.mats.water); m.renderOrder = 1; group.add(m); }
    for (const m of group.children) m.matrixAutoUpdate = false;
    group.matrixAutoUpdate = false;
    this.scene.add(group);
    this.loaded.set(chunkKey(cx, cz), { cx, cz, group, layout: L, ceil: ctx.ceil, stripeZone: ctx.stripe ? ctx.stripe.zone : null });
  }

  // build everything in range now (after teleport / continue)
  flush(px, pz, radius) {
    this.update(px, pz, radius, 0);
    while (this.queue.length) this.update(px, pz, radius, 1);
  }

  pending() { return this.queue.length; }
}

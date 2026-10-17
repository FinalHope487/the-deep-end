// Keeps the chunks around the player built; builds at most one chunk per frame, drops far ones.
import * as THREE from 'three';
import { CHUNK } from './tiles.js';
import { buildChunkGeometry } from './chunkmesh.js';

const chunkKey = (cx, cz) => cx + ',' + cz;
const TOY_COLORS = [0xe8463a, 0xf2c230, 0x3aa0e8, 0x46c06a];

// floating toys: ring, kickboard, beach ball (vertex-coloured, shared per kind + colour)
function toyGeometry(kind, color) {
  const base = new THREE.Color(TOY_COLORS[color]), white = new THREE.Color(0xf4f2ea);
  let g;
  if (kind === 'ring') g = new THREE.TorusGeometry(0.34, 0.12, 6, 16).rotateX(Math.PI / 2);
  else if (kind === 'board') g = new THREE.BoxGeometry(0.4, 0.05, 0.62);
  else g = new THREE.SphereGeometry(0.2, 10, 8);
  g = g.toNonIndexed();
  const p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const a = Math.atan2(z, x);
    const stripe = kind === 'board' ? Math.abs(z) > 0.2 : Math.floor((a + Math.PI) / (Math.PI / 2)) % 2 === 0;
    const c = (stripe ? white : base).clone().multiplyScalar(0.7 + 0.3 * Math.max(0, y / 0.2));
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

export class ChunkManager {
  // ctxFn(cx, cz) → { ceil, T, guide } decided at build time (depends on tension / guide target)
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
    this.toys = {};
    this.buildMs = [];   // recent chunk build times (budget check)
    this.geoMs = [];
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
    for (const m of c.group.children) if (!m.userData.shared) m.geometry.dispose();
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
    // a frame either generates one missing layout (the chunk or a neighbour its mesh reads) or builds one mesh
    let built = 0, generated = false;
    for (let i = 0; i < maxBuilds && this.queue.length; i++) {
      const [, cx, cz] = this.queue[this.queue.length - 1];
      if (maxBuilds && this.generateOne(cx, cz)) { generated = true; break; }
      this.queue.pop();
      this.build(cx, cz);
      built++;
    }
    // refresh stale chunks only when nothing new is waiting, nearest first, same one-per-frame budget
    if (maxBuilds && !built && !generated && !this.queue.length && this.stale.length) {
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

  // generate the first missing layout among a chunk and its 8 neighbours; false when all are ready
  generateOne(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!this.world.hasLayout(cx + dx, cz + dz)) { this.world.layout(cx + dx, cz + dz); return true; }
    }
    return false;
  }

  // guide signs and door lamps are baked into chunk geometry; rebuild the loaded non-zone chunks when the target changes
  refreshGuides() {
    this.stale = [...this.loaded.values()].filter((c) => c.layout.kind !== 'zone');
  }

  build(cx, cz, keepCeil) {
    const t0 = performance.now();
    const L = this.world.layout(cx, cz);
    const ctx = this.ctxFn(cx, cz, L);
    if (keepCeil !== undefined) ctx.ceil = keepCeil;
    const tg = performance.now();
    const geo = buildChunkGeometry(this.world, L, ctx);
    this.geoMs.push(performance.now() - tg);
    if (this.geoMs.length > 200) this.geoMs.shift();
    const group = new THREE.Group();
    if (geo.static) group.add(new THREE.Mesh(geo.static, this.mats.static));
    if (geo.lamps) group.add(new THREE.Mesh(geo.lamps, this.mats.lamp));
    if (geo.water) { const m = new THREE.Mesh(geo.water, this.mats.water); m.renderOrder = 1; group.add(m); }
    if (geo.sun) { const m = new THREE.Mesh(geo.sun, this.mats.sun); m.renderOrder = 2; group.add(m); }
    for (const m of group.children) m.matrixAutoUpdate = false;
    const toys = geo.floaters.map((f) => {
      const k = f.kind + f.color;
      this.toys[k] ||= toyGeometry(f.kind, f.color);
      const m = new THREE.Mesh(this.toys[k], this.mats.prop);
      m.userData = { shared: true, f };
      m.position.set(f.x, f.y, f.z);
      group.add(m);
      return m;
    });
    group.matrixAutoUpdate = false;
    this.scene.add(group);
    this.loaded.set(chunkKey(cx, cz), { cx, cz, group, layout: L, ceil: ctx.ceil, toys, guideZone: ctx.guide && geo.guide ? ctx.guide.zone : null });
    const ms = performance.now() - t0;
    this.buildMs.push(ms);
    if (this.buildMs.length > 200) this.buildMs.shift();
  }

  // toys bob on the water and drift in a small circle
  animate(t) {
    for (const c of this.loaded.values()) {
      if (!c.group.visible) continue;
      for (const m of c.toys) {
        const f = m.userData.f, a = t * 0.12 + f.phase;
        m.position.set(f.x + Math.cos(a) * 0.18, f.y + 0.02 + Math.sin(t * 1.4 + f.phase) * 0.025, f.z + Math.sin(a) * 0.18);
        m.rotation.set(Math.sin(t * 0.9 + f.phase) * 0.06, f.phase + t * 0.07, Math.cos(t * 1.1 + f.phase) * 0.06);
      }
    }
  }

  // build everything in range now (after teleport / continue)
  flush(px, pz, radius) {
    this.update(px, pz, radius, 0);
    while (this.queue.length) this.update(px, pz, radius, 1);
  }

  pending() { return this.queue.length; }
}

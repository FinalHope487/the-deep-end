// Keeps the chunks around the player built; spends a few milliseconds a frame on one chunk's mesh (a chunk takes
// several frames), finishes at most one chunk per frame, drops far ones.
import * as THREE from 'three';
import { CHUNK } from './tiles.js';
import { buildChunkSteps } from './chunkmesh.js';
import { guideKey, staleGuideChunks, floorVisible } from './guides.js';

const chunkKey = (cx, cz) => cx + ',' + cz;
const BUILD_BUDGET_MS = 2;   // mesh work per frame: the rest of a 16.7 ms frame is the scene, the sim and the draw
const TOY_COLORS = [0xe8463a, 0xf2c230, 0x3aa0e8, 0x46c06a];

// floating toys (vertex-coloured, shared per kind + colour): 'ring' an old faded swim ring, half sunk; 'swim' a bright
// one; 'board' a kickboard; 'ball' a beach ball
function toyGeometry(kind, color) {
  const base = new THREE.Color(TOY_COLORS[color]), white = new THREE.Color(0xf4f2ea), faded = kind === 'ring';
  let g;
  if (kind === 'ring' || kind === 'swim') g = new THREE.TorusGeometry(0.34, 0.12, 6, 16).rotateX(Math.PI / 2);
  else if (kind === 'board') g = new THREE.BoxGeometry(0.4, 0.05, 0.62);
  else g = new THREE.SphereGeometry(0.2, 10, 8).translate(0, 0.1, 0);   // a ball rides high
  g = g.toNonIndexed();
  const p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const a = Math.atan2(z, x);
    const stripe = kind === 'board' ? Math.abs(z) > 0.2 : Math.floor((a + Math.PI) / (Math.PI / 2)) % 2 === 0;
    const c = faded ? (stripe ? white : base).clone().lerp(white, 0.45).multiplyScalar(0.62 + 0.3 * Math.max(0, y / 0.2))
      : (stripe ? white : base).clone().multiplyScalar(0.7 + 0.3 * Math.max(0, y / 0.2));
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
    this.job = null;   // the chunk being built: { cx, cz, L, ctx, steps, replace, work }
    this.world = null;
    this.pcx = NaN; this.pcz = NaN; this.radius = -1;
    this.playerLv = 0;
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
    this.job = null;
    this.world = world;
    this.pcx = NaN;
  }

  dispose(c) {
    this.scene.remove(c.group);
    for (const m of c.group.children) if (!m.userData.shared) m.geometry.dispose();
  }

  get count() { return this.loaded.size; }

  // budget: ms of mesh work this frame (0: only keep the queue up to date)
  update(px, pz, radius, budget = BUILD_BUDGET_MS) {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    if (pcx !== this.pcx || pcz !== this.pcz || radius !== this.radius) {
      this.pcx = pcx; this.pcz = pcz; this.radius = radius;
      const r2 = (radius + 0.5) ** 2, keep2 = (radius + 1.5) ** 2;
      for (const [k, c] of this.loaded) {
        const d2 = (c.cx - pcx) ** 2 + (c.cz - pcz) ** 2;
        if (d2 > keep2) { this.dispose(c); this.loaded.delete(k); }
        else c.group.visible = d2 <= r2 && floorVisible(c.layout.lv, this.playerLv);
      }
      if (this.job && (this.job.cx - pcx) ** 2 + (this.job.cz - pcz) ** 2 > keep2) this.job = null;   // left behind
      this.queue = [];
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 <= r2 && !this.loaded.has(chunkKey(pcx + dx, pcz + dz)) && !(this.job && this.job.cx === pcx + dx && this.job.cz === pcz + dz)) this.queue.push([d2, pcx + dx, pcz + dz]);
      }
      this.queue.sort((a, b) => b[0] - a[0]);   // closest last → pop()
    }
    if (!budget) return;
    // a frame either generates one missing layout (the chunk or a neighbour its mesh reads) or works on one mesh
    let generated = false;
    if (!this.job && this.queue.length) {
      const [, cx, cz] = this.queue[this.queue.length - 1];
      if (this.generateOne(cx, cz)) generated = true;
      else { this.queue.pop(); this.start(cx, cz); }
    }
    // refresh stale chunks only when nothing new is waiting, nearest first
    if (!this.job && !generated && !this.queue.length && this.stale.length) {
      this.stale.sort((a, b) => ((b.cx - pcx) ** 2 + (b.cz - pcz) ** 2) - ((a.cx - pcx) ** 2 + (a.cz - pcz) ** 2));
      const c = this.stale.pop();
      if (this.loaded.get(chunkKey(c.cx, c.cz)) === c) this.start(c.cx, c.cz, c.ceil, c);
    }
    if (this.job && this.advance(budget)) this.maxPerFrame = Math.max(this.maxPerFrame, 1);
  }

  // generate the first missing layout among a chunk and its 8 neighbours (or one region it needs); false when all are ready
  generateOne(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (this.world.hasLayout(cx + dx, cz + dz)) continue;
      // a region chunk first has the regions it touches worked out, one per frame (a big one takes a while)
      if (!this.world.prepare(cx + dx, cz + dz)) this.world.layout(cx + dx, cz + dz);
      return true;
    }
    return false;
  }

  // guide signs and door lamps are baked into chunk geometry: when the target changes, rebuild only the loaded chunks
  // whose guide (signs, door lamps) actually differs from what they were built with
  refreshGuides() {
    this.stale = staleGuideChunks(this.loaded.values(), this.ctxFn);
  }

  // the floor the player is on: chunks more than one floor away are not drawn (no looking through atria into the rest)
  setLevel(lv) {
    if (lv === this.playerLv) return;
    this.playerLv = lv;
    for (const c of this.loaded.values()) c.group.visible = this.inRange(c) && floorVisible(c.layout.lv, lv);
  }

  inRange(c) { return (c.cx - this.pcx) ** 2 + (c.cz - this.pcz) ** 2 <= (this.radius + 0.5) ** 2; }

  // begin a chunk's mesh; `replace` is the loaded chunk it refreshes (kept on screen until the new one is ready)
  start(cx, cz, keepCeil, replace) {
    const L = this.world.layout(cx, cz);
    const ctx = this.ctxFn(cx, cz, L);
    if (keepCeil !== undefined) ctx.ceil = keepCeil;
    this.job = { cx, cz, L, ctx, replace, steps: buildChunkSteps(this.world, L, ctx), work: 0 };
  }

  // run the current mesh for up to `budget` ms (at least one section); true when it is finished and loaded
  advance(budget) {
    const j = this.job, t0 = performance.now(), end = t0 + budget;
    let r;
    do r = j.steps.next(); while (!r.done && performance.now() < end);
    j.work += performance.now() - t0;
    if (!r.done) return false;
    this.job = null;
    this.geoMs.push(j.work);
    if (this.geoMs.length > 200) this.geoMs.shift();
    this.finish(j, r.value);
    return true;
  }

  finish({ cx, cz, L, ctx, replace, work }, geo) {
    const t0 = performance.now();
    if (replace) {
      if (this.loaded.get(chunkKey(cx, cz)) !== replace) return;   // dropped while its refresh was building
      this.dispose(replace);
    }
    const group = new THREE.Group();
    if (geo.static) group.add(new THREE.Mesh(geo.static, this.mats.static));
    if (geo.lamps) group.add(new THREE.Mesh(geo.lamps, this.mats.lamp));
    if (geo.abyss) group.add(new THREE.Mesh(geo.abyss, this.mats.abyss));
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
    if (replace) group.visible = replace.group.visible;
    this.loaded.set(chunkKey(cx, cz), { cx, cz, group, layout: L, ceil: ctx.ceil, toys, guideZone: ctx.guide && geo.guide ? ctx.guide.zone : null, guideKey: guideKey(ctx.guide) });
    const ms = work + performance.now() - t0;
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
    while (this.queue.length || this.job) this.update(px, pz, radius, Infinity);
  }

  pending() { return this.queue.length; }
}

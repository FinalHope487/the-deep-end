// The distant "presence": a black figure at the edge of view, never chases, fades when seen or approached.
import * as THREE from 'three';
import { WALL, DEEP, BARS, COLS, VOID, FLOOR, DEEP_WATER, walkable } from './tiles.js';
import { makeSilhouetteTexture } from './textures.js';

// it shows up 20-30 m away, fades once the player is within 6 m or has looked straight at it for 3 s, and never stays past 25 s
export const MIN_DIST = 20, MAX_DIST = 30, VANISH_DIST = 6, STARE_SECONDS = 3, MAX_LIFE = 25;

// sample along the segment; walls block sight (bars and pillar rows do not)
function hasLineOfSight(world, x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(d / 0.5);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (world.typeAt(Math.floor(x0 + (x1 - x0) * t), Math.floor(z0 + (z1 - z0) * t)) === WALL) return false;
  }
  return true;
}

export class Presence {
  constructor(scene) {
    const mat = new THREE.MeshBasicMaterial({ map: makeSilhouetteTexture(), color: 0x000000, transparent: true, fog: false, depthWrite: false, opacity: 0 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.85), mat);
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.reset();
  }

  reset() {
    this.cooldown = 60 + Math.random() * 60;
    this.active = false;
    this.fading = false;
    this.mesh.visible = false;
    this.mesh.material.opacity = 0;
    this.appearances = 0;
  }

  // freq: 1 normal, 2 doubled (4th zone onward). hFovHalf in radians.
  update(dt, world, player, enabled, freq, hFovHalf) {
    const m = this.mesh;
    if (this.active) {
      const dx = m.position.x - player.x, dz = m.position.z - player.z;
      const dist = Math.hypot(dx, dz);
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (dist || 1))));
      if (ang < 0.17) this.stare += dt;
      this.life += dt;
      if (!this.fading && (this.stare >= STARE_SECONDS || dist < VANISH_DIST || this.life > MAX_LIFE)) this.fading = true;
      const o = m.material.opacity;
      m.material.opacity = this.fading ? Math.max(0, o - dt * 1.5) : Math.min(0.92, o + dt * 0.8);
      m.rotation.y = Math.atan2(player.x - m.position.x, player.z - m.position.z);
      if (this.fading && m.material.opacity <= 0) { this.active = false; m.visible = false; }
      return;
    }
    if (!enabled) return;
    this.cooldown -= dt * freq;
    if (this.cooldown > 0) return;
    this.cooldown = 4;   // no visible spot right now: look again shortly
    for (let tries = 0; tries < 32; tries++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const a = player.yaw + side * hFovHalf * (0.55 + Math.random() * 0.4);
      const d = MIN_DIST + Math.random() * (MAX_DIST - MIN_DIST);
      const x = player.x - Math.sin(a) * d, z = player.z - Math.cos(a) * d;
      const tx = Math.floor(x), tz = Math.floor(z), t = world.typeAt(tx, tz);
      if (t === WALL || t === BARS || t === COLS) continue;
      if (!hasLineOfSight(world, player.x, player.z, x, z)) continue;
      // on a balcony edge of the upper floor (looking down), on dark water on the surface, else on the floor
      let y = null;
      if (world.upTypeAt(tx, tz) === FLOOR && Math.random() < 0.6 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => world.upTypeAt(tx + dx, tz + dz) === VOID)) y = world.upHAt(tx, tz);
      else if (t === DEEP) y = DEEP_WATER;
      else if (walkable(t)) y = world.floorAt(tx + 0.5, tz + 0.5);
      if (y === null) continue;
      m.position.set(tx + 0.5, y + 0.92, tz + 0.5);
      this.cooldown = 60 + Math.random() * 60;
      m.visible = true;
      m.material.opacity = 0;
      this.active = true; this.fading = false; this.stare = 0; this.life = 0;
      this.appearances++;
      return;
    }
  }
}

// First-person body: tile-grid collision with wall sliding, auto steps, shallow-water wading.
import { WALL, DEEP, SHALLOW, STEP_UP, STEP_DOWN, SPAWN } from './world.js';

const EYE = 1.6;
const PLAYER_R = 0.3;
const WALK_SPEED = 3;
const RUN_SPEED = 5.5;
const WATER_MUL = 0.6;
const WATER_EYE_DROP = 0.15;

export class Player {
  constructor() { this.reset(); }

  reset(x = SPAWN.x, z = SPAWN.z, yaw = 0) {
    this.x = x; this.z = z; this.yaw = yaw; this.pitch = 0;
    this.floorH = 0; this.y = EYE;
    this.inWater = false; this.moving = false; this.running = false;
    this.distance = 0;
  }

  solidAt(world, x, z) {
    const t = world.typeAt(Math.floor(x), Math.floor(z));
    return t === WALL || t === DEEP;
  }

  // body corners only test for walls / deep water; the step rule applies to the tile under the centre,
  // otherwise a corner left on a ledge after stepping down would pin the player forever
  canStand(world, x, z, curH) {
    const r = PLAYER_R;
    if (this.solidAt(world, x, z) || this.solidAt(world, x - r, z - r) || this.solidAt(world, x + r, z - r) ||
      this.solidAt(world, x - r, z + r) || this.solidAt(world, x + r, z + r)) return false;
    const h = world.hAt(Math.floor(x), Math.floor(z));
    return h - curH <= STEP_UP && curH - h <= STEP_DOWN;
  }

  // move: { x: strafe -1..1, z: forward -1..1, run: bool }
  update(world, dt, move) {
    let mx = move.x, mz = move.z;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    this.moving = len > 0.05;
    this.running = this.moving && move.run;
    const speed = (this.running ? RUN_SPEED : WALK_SPEED) * (this.inWater ? WATER_MUL : 1);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const dx = (-s * mz + c * mx) * speed * dt;
    const dz = (-c * mz - s * mx) * speed * dt;
    const x0 = this.x, z0 = this.z;
    if (dx && this.canStand(world, this.x + dx, this.z, this.floorH)) this.x += dx;
    if (dz && this.canStand(world, this.x, this.z + dz, this.floorH)) this.z += dz;
    this.distance += Math.hypot(this.x - x0, this.z - z0);
    this.settle(world, dt);
  }

  settle(world, dt) {
    const tx = Math.floor(this.x), tz = Math.floor(this.z);
    this.floorH = world.hAt(tx, tz);
    this.inWater = world.typeAt(tx, tz) === SHALLOW;
    // shallow floors sit 0.4 m below their rim; wading eye is 0.15 m below the dry-floor eye
    const target = (this.inWater ? this.floorH + 0.4 - WATER_EYE_DROP : this.floorH) + EYE;
    this.y = dt > 0 ? this.y + (target - this.y) * Math.min(1, dt * 12) : target;
  }

  teleport(world, x, z, yaw = this.yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.settle(world, 0);
  }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - dy));
  }
}

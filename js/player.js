// First-person body: layered surfaces (ground / upper floor), continuous stairs, rails, wading, slide rides, ladders.
import { SPAWN } from './world.js';

const EYE = 1.6;
const PLAYER_R = 0.3;
export const WALK_SPEED = 3.3;
export const RUN_SPEED = 6;
export const WATER_SHALLOW_MUL = 0.75, WATER_DEEP_MUL = 0.55;   // pace in ankle-deep water and in the deepest wading
const WATER_EYE_DROP = 0.13;   // wading eye sits this far below "standing on the water surface"
const SLIDE_SPEED = 3.4;
export const CLIMB_SPEED = 1.3;   // m/s up or down a ladder
const LADDER_OFF = 0.4;           // how far out from the wall a climber hangs

// 0 at 0.4 m of water and shallower, 1 at 1.4 m and deeper
export const deepFrac = (d) => Math.min(1, Math.max(0, (d - 0.4) / 1.0));
export const waterMul = (depth) => WATER_SHALLOW_MUL + (WATER_DEEP_MUL - WATER_SHALLOW_MUL) * deepFrac(depth);

export class Player {
  constructor() { this.reset(); }

  reset(x = SPAWN.x, z = SPAWN.z, yaw = 0, h = 0) {
    this.x = x; this.z = z; this.yaw = yaw; this.pitch = 0;
    this.floorH = h; this.y = h + EYE; this.wl = NaN;
    this.inWater = false; this.moving = false; this.running = false; this.speed = WALK_SPEED;
    this.distance = 0;
    this.ride = null;
    this.climb = null;
  }

  get riding() { return !!this.ride; }
  get climbing() { return !!this.climb; }

  // water over the feet in metres, 0 when dry
  get waterDepth() { return this.inWater ? this.wl - this.floorH : 0; }

  // body corners only need some surface within reach of the body's level (so ledges just stepped off never pin);
  // the centre must land on a surface it can step to; rails stop the body
  canStand(world, x, z, curH) {
    if (!this.cornersFree(world, x, z, curH)) return false;
    if (!world.surfaceAt(x, z, curH)) return false;
    return !world.railHit(x, z, PLAYER_R, curH, this.x, this.z);
  }

  cornersFree(world, x, z, curH) {
    const r = PLAYER_R;
    return !(world.blockedAt(x - r, z - r, curH) || world.blockedAt(x + r, z - r, curH) ||
      world.blockedAt(x - r, z + r, curH) || world.blockedAt(x + r, z + r, curH));
  }

  // a body that already overlaps something (bad save, landing) may move as long as its centre stays on a surface
  canMove(world, x, z, curH, stuck) {
    return stuck ? !!world.surfaceAt(x, z, curH) : this.canStand(world, x, z, curH);
  }

  // move: { x: strafe -1..1, z: forward -1..1, run: bool }
  update(world, dt, move) {
    if (this.ride) { this.updateRide(world, dt); return; }
    if (this.climb) { this.updateClimb(world, dt, move); return; }
    let mx = move.x, mz = move.z;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    this.moving = len > 0.05;
    this.running = this.moving && move.run;
    const speed = (this.running ? RUN_SPEED : WALK_SPEED) * (this.inWater ? waterMul(this.waterDepth) : 1);   // chest-deep water is slow going
    this.speed = speed;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const dx = (-s * mz + c * mx) * speed * dt;
    const dz = (-c * mz - s * mx) * speed * dt;
    const x0 = this.x, z0 = this.z;
    const stuck = (dx || dz) && !this.cornersFree(world, this.x, this.z, this.floorH);
    if (dx) this.tryMove(world, this.x + dx, this.z, stuck);
    if (dz) this.tryMove(world, this.x, this.z + dz, stuck);
    this.distance += Math.hypot(this.x - x0, this.z - z0);
    // pushing into a slide mouth starts the ride
    if (this.moving) {
      const l = Math.hypot(dx, dz) || 1;
      const sl = world.slideAt(this.x, this.z, this.floorH, dx / l, dz / l);
      if (sl) { this.startRide(sl); return; }
      const ld = world.ladderAt(this.x, this.z, this.floorH, dx / l, dz / l);
      if (ld && mz > 0.3) { this.startClimb(ld); return; }
    }
    this.settle(world, dt);
  }

  // move to (x, z); a rail in the way bends the move round it (slides, never pins head-on against a rail end)
  tryMove(world, x, z, stuck) {
    if (this.canMove(world, x, z, this.floorH, stuck)) { this.step(world, x, z); return; }
    const p = world.railPush(x, z, PLAYER_R, this.floorH, this.x, this.z);
    if (p && this.canMove(world, p[0], p[1], this.floorH, stuck)) this.step(world, p[0], p[1]);
  }

  step(world, x, z) {
    this.x = x; this.z = z;
    const s = world.surfaceAt(x, z, this.floorH);
    if (s) this.floorH = s.h;
  }

  settle(world, dt) {
    const s = world.surfaceAt(this.x, this.z, this.floorH) || world.surfaceNear(this.x, this.z, this.floorH);
    if (s) { this.floorH = s.h; this.wl = s.wl; }
    this.inWater = this.wl === this.wl && this.floorH < this.wl - 0.04;
    // wading eye: as if standing on the surface; in water over 0.4 m it sinks until, at 1.4 m, it is 10-20 cm over the water
    const target = this.inWater ? Math.max(this.floorH + EYE, this.wl + EYE - WATER_EYE_DROP - (EYE - WATER_EYE_DROP - 0.15) * deepFrac(this.wl - this.floorH)) : this.floorH + EYE;
    this.y = dt > 0 ? this.y + (target - this.y) * Math.min(1, dt * 12) : target;
  }

  teleport(world, x, z, yaw = this.yaw, h = this.floorH) {
    this.ride = null;
    this.climb = null;
    this.x = x; this.z = z; this.yaw = yaw; this.floorH = h;
    this.settle(world, 0);
  }

  // ---------- ladders ----------

  // hang on the ladder a little out from the wall; walking into it from its foot climbs, over its top edge goes down
  startClimb({ ladder: l, up }) {
    this.climb = { l };
    this.x = l.x + l.nx * LADDER_OFF; this.z = l.z + l.nz * LADDER_OFF;
    this.floorH = up ? l.h0 : l.h1;
    this.inWater = false;
    this.moving = true; this.running = false;
  }

  // forward climbs when facing the ladder and goes down when facing away; past the top the body steps onto the
  // platform, past the foot it steps back onto the floor
  updateClimb(world, dt, move) {
    const l = this.climb.l, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const facing = -s * -l.nx + -c * -l.nz;   // forward · (towards the wall)
    const v = move.z * (facing >= 0 ? 1 : -1);
    this.moving = Math.abs(move.z) > 0.05;
    const h = this.floorH + v * CLIMB_SPEED * dt;
    this.distance += Math.abs(h - this.floorH);
    if (h >= l.h1) {
      this.climb = null;
      this.x = l.x - l.nx * 0.45; this.z = l.z - l.nz * 0.45;
      this.floorH = l.h1;
    } else if (h <= l.h0) {
      this.climb = null;
      this.x = l.x + l.nx * 0.75; this.z = l.z + l.nz * 0.75;
      this.floorH = l.h0;
    } else {
      this.floorH = h;
      this.y = h + EYE;
      return;
    }
    this.settle(world, dt);
  }

  // ---------- slides ----------

  startRide(sl) {
    const pts = [[this.x, sl.pts[0][1], this.z], ...sl.pts];
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    this.ride = { slide: sl, pts, acc, d: 0 };
    this.inWater = false;
    this.moving = true; this.running = false;
  }

  updateRide(world, dt) {
    const r = this.ride;
    r.d += SLIDE_SPEED * dt;
    const total = r.acc[r.acc.length - 1];
    if (r.d >= total) {
      const land = r.slide.land;
      this.distance += total;
      this.ride = null;
      this.x = land.x; this.z = land.z;
      const s = world.surfaceNear(land.x, land.z, -0.4);
      this.floorH = s ? s.h : this.floorH;
      this.settle(world, dt);
      return;
    }
    let i = 1;
    while (r.acc[i] < r.d) i++;
    const a = r.pts[i - 1], b = r.pts[i];
    const t = (r.d - r.acc[i - 1]) / (r.acc[i] - r.acc[i - 1] || 1);
    this.x = a[0] + (b[0] - a[0]) * t;
    this.z = a[2] + (b[2] - a[2]) * t;
    this.y = a[1] + (b[1] - a[1]) * t + 0.1;
    // look down the tube
    const want = Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
    let dy = want - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 6);
    this.pitch += (-0.25 - this.pitch) * Math.min(1, dt * 4);
  }

  look(dx, dy) {
    if (this.ride) return;
    this.yaw -= dx;
    this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - dy));
  }
}

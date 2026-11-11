// Layer 2 (pure): fixed-step simulation of one body. No three.js, no DOM.
// step(state, intent, feel, world, dt) -> new state. advance(...) runs step on a fixed time step with an accumulator.
export const FIXED_DT = 1 / 120;
const G = 9.8, PITCH_MAX = 1.45;
export const FEEL_KEYS = ['walkSpeed', 'accel', 'decel', 'radius', 'eyeHeight', 'stepHeight', 'stepSmooth', 'lookSensitivity', 'bobAmp', 'bobFreq'];

export function checkFeel(feel) {
  for (const k of FEEL_KEYS) if (!Number.isFinite(feel[k])) throw new Error(`feel preset: key "${k}" is missing or not a number`);
  return feel;
}

// M4 hook (K13 wade/swim slowdown): the only place that turns water depth into a speed factor. M2: no slowdown.
function speedScale(depth, feel) { return 1; }

export function initialState(world, x, z, eyeY, yaw, pitch) {
  const y = world.groundHeight(x, z);
  const wd = Math.max(0, world.waterLevel - y);
  return { x, z, y, vx: 0, vz: 0, vy: 0, yaw, pitch, grounded: true, eye: eyeY, bob: 0, bobPhase: 0, waterDepth: wd, waterDepthPrev: wd, underwater: eyeY < world.waterLevel };
}

export function step(s, intent, feel, world, dt) {
  const yaw = s.yaw - intent.lookDX * feel.lookSensitivity;
  const pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, s.pitch - intent.lookDY * feel.lookSensitivity));
  // wish velocity
  let mx = intent.moveX, mz = intent.moveZ;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const sp = feel.walkSpeed * speedScale(s.waterDepth, feel);
  const wx = (-sy * mz + cy * mx) * sp, wz = (-cy * mz - sy * mx) * sp;
  // accelerate toward the wish, or brake when there is none
  let vx = s.vx, vz = s.vz;
  const dvx = wx - vx, dvz = wz - vz, dl = Math.hypot(dvx, dvz);
  const maxd = (ml > 0 ? feel.accel : feel.decel) * dt;
  if (dl <= maxd) { vx = wx; vz = wz; } else { vx += (dvx / dl) * maxd; vz += (dvz / dl) * maxd; }
  // move, then push out of walls and too-high steps; keep the velocity part that does not go into a wall
  const r = world.resolve(s.x + vx * dt, s.z + vz * dt, s.y, feel.radius, feel.stepHeight);
  for (const [nx, nz] of r.normals) {
    const dot = vx * nx + vz * nz;
    if (dot < 0) { vx -= dot * nx; vz -= dot * nz; }
  }
  // ground follow
  const g = world.groundHeight(r.x, r.z);
  let y = s.y, vy = s.vy, grounded;
  if (g >= y) { y = g; vy = 0; grounded = true; }
  else if (s.grounded && y - g <= feel.stepHeight) { y = g; vy = 0; grounded = true; }
  else { vy -= G * dt; y += vy * dt; if (y <= g) { y = g; vy = 0; grounded = true; } else grounded = false; }
  // eye follows the feet with smoothing, so steps and ramps do not jolt
  const target = y + feel.eyeHeight;
  const eye = feel.stepSmooth > 0 ? s.eye + (target - s.eye) * (1 - Math.exp(-dt / feel.stepSmooth)) : target;
  const speed = Math.hypot(vx, vz), frac = Math.min(1, speed / feel.walkSpeed);
  const bobPhase = s.bobPhase + (grounded ? dt * feel.bobFreq * 2 * Math.PI * frac : 0);
  const bob = grounded ? feel.bobAmp * Math.sin(bobPhase) * frac : s.bob * 0.9;
  const waterDepth = Math.max(0, world.waterLevel - y);
  return { x: r.x, z: r.z, y, vx, vz, vy, yaw, pitch, grounded, eye, bob, bobPhase, waterDepth, waterDepthPrev: s.waterDepth, underwater: eye + bob < world.waterLevel };
}

// sim = { state, acc }. Runs whole FIXED_DT steps; the look delta goes into the first step only.
// Returns the look delta that was not used (no full step this frame); the shell keeps it for the next frame.
export function createSim(state) { return { state, acc: 0 }; }
export function advance(sim, intent, feel, world, frameDt) {
  sim.acc += Math.min(frameDt, 0.1);
  let used = false;
  while (sim.acc >= FIXED_DT) {
    sim.state = step(sim.state, { moveX: intent.moveX, moveZ: intent.moveZ, lookDX: used ? 0 : intent.lookDX, lookDY: used ? 0 : intent.lookDY }, feel, world, FIXED_DT);
    sim.acc -= FIXED_DT; used = true;
  }
  return used ? { lookDX: 0, lookDY: 0 } : { lookDX: intent.lookDX, lookDY: intent.lookDY };
}

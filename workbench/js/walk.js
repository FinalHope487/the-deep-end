// Plain first-person walk: WASD + mouse look (pointer lock) + wall collision with axis-separated sliding.
// M1 scope only: constant speed, constant eye height. Feel is M2 (K15).
import { isBlocked } from './geometry.js';

export function createWalker(camera, canvas, room) {
  const keys = new Set();
  let yaw = 0, pitch = 0, enabled = false;
  const RADIUS = 0.25, SPEED = 2.2, EYE = 1.6;
  const set = (v) => { camera.rotation.order = 'YXZ'; camera.rotation.set(pitch, yaw, 0); camera.position.y = EYE; };

  function lookFrom(p, t) {
    const dx = t[0] - p[0], dz = t[2] - p[2], dy = t[1] - p[1];
    yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(dy, Math.hypot(dx, dz));
    camera.position.set(p[0], p[1], p[2]);
    camera.rotation.order = 'YXZ'; camera.rotation.set(pitch, yaw, 0);
  }
  const onKey = (e, down) => { if (!enabled) return; const k = e.code; if (down) keys.add(k); else keys.delete(k); };
  const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
  const mm = (e) => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0022; pitch = Math.max(-1.45, Math.min(1.45, pitch - e.movementY * 0.0022));
    camera.rotation.set(pitch, yaw, 0);
  };
  const click = () => { if (enabled) canvas.requestPointerLock?.(); };

  return {
    lookFrom,
    enable() { enabled = true; addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('mousemove', mm); canvas.addEventListener('click', click); },
    disable() { enabled = false; removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('mousemove', mm); canvas.removeEventListener('click', click); },
    update(dt) {
      if (!enabled) return;
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      if (!f && !s) return;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      let mx = (-sy * f + cy * s), mz = (-cy * f - sy * s);
      const l = Math.hypot(mx, mz) || 1;
      mx = (mx / l) * SPEED * dt; mz = (mz / l) * SPEED * dt;
      const p = camera.position;
      if (!isBlocked(room, p.x + mx, p.z, RADIUS)) p.x += mx;
      if (!isBlocked(room, p.x, p.z + mz, RADIUS)) p.z += mz;
    },
  };
}

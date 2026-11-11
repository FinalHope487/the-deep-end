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
  // Touch (W-10): a touch that starts on the left half is a move stick (drag from the start point); the right half drags to look.
  let stick = null, look = null, sx = 0, sy2 = 0; const STICK = 60;
  const tStart = (e) => {
    if (!enabled) return; e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth / 2) { if (!stick) stick = { id: t.identifier, x: t.clientX, y: t.clientY }; }
      else if (!look) look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  };
  const tMove = (e) => {
    if (!enabled) return; e.preventDefault();
    for (const t of e.changedTouches) {
      if (stick && t.identifier === stick.id) {
        sx = Math.max(-1, Math.min(1, (t.clientX - stick.x) / STICK)); sy2 = Math.max(-1, Math.min(1, (t.clientY - stick.y) / STICK));
      } else if (look && t.identifier === look.id) {
        yaw -= (t.clientX - look.x) * 0.005; pitch = Math.max(-1.45, Math.min(1.45, pitch - (t.clientY - look.y) * 0.005));
        look.x = t.clientX; look.y = t.clientY; camera.rotation.set(pitch, yaw, 0);
      }
    }
  };
  const tEnd = (e) => {
    for (const t of e.changedTouches) {
      if (stick && t.identifier === stick.id) { stick = null; sx = 0; sy2 = 0; }
      if (look && t.identifier === look.id) look = null;
    }
  };
  const TO = { passive: false };
  const click = () => { if (enabled) canvas.requestPointerLock?.(); };

  return {
    lookFrom,
    enable() { enabled = true; addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('mousemove', mm); canvas.addEventListener('click', click); for (const [n, f] of [['touchstart', tStart], ['touchmove', tMove], ['touchend', tEnd], ['touchcancel', tEnd]]) canvas.addEventListener(n, f, TO); },
    disable() { enabled = false; removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('mousemove', mm); canvas.removeEventListener('click', click); for (const [n, f] of [['touchstart', tStart], ['touchmove', tMove], ['touchend', tEnd], ['touchcancel', tEnd]]) canvas.removeEventListener(n, f, TO); stick = look = null; sx = sy2 = 0; },
    update(dt) {
      if (!enabled) return;
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - sy2;
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + sx;
      if (Math.abs(f) < 0.15 && Math.abs(s) < 0.15) return;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      let mx = (-sy * f + cy * s), mz = (-cy * f - sy * s);
      const l = Math.max(1, Math.hypot(mx, mz)); // keys give length 1 (as before); a part-pushed stick gives less
      mx = (mx / l) * SPEED * dt; mz = (mz / l) * SPEED * dt;
      const p = camera.position;
      if (!isBlocked(room, p.x + mx, p.z, RADIUS)) p.x += mx;
      if (!isBlocked(room, p.x, p.z + mz, RADIUS)) p.z += mz;
    },
  };
}

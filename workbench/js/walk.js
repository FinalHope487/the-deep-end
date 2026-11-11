// Layer 4 (shell): joins intent, mover (fixed step) and the camera. All movement rules live in js/move/.
import { createWorld } from './move/world.js';
import { createIntent } from './move/intent.js';
import { createSim, advance, initialState, checkFeel } from './move/mover.js';

export function createWalker(camera, canvas, room, feel) {
  checkFeel(feel);
  const world = createWorld(room);
  const intent = createIntent(canvas);
  let sim = null;

  function lookFrom(p, t) {
    const dx = t[0] - p[0], dz = t[2] - p[2], dy = t[1] - p[1];
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    camera.position.set(p[0], p[1], p[2]);
    camera.rotation.order = 'YXZ'; camera.rotation.set(pitch, yaw, 0);
    sim = createSim(initialState(world, p[0], p[2], p[1], yaw, pitch));
  }
  return {
    lookFrom, world,
    get state() { return sim.state; },
    // water change over the last update's fixed steps: { steps, depthBefore, depthAfter, enteredWater, leftWater } (read-only)
    get frame() { return sim.frame; },
    enable() { intent.enable(); },
    disable() { intent.disable(); },
    update(dt) {
      if (!intent.enabled) return;
      intent.unread(advance(sim, intent.read(), feel, world, dt));
      const s = sim.state;
      camera.position.set(s.x, s.eye + s.bob, s.z);
      camera.rotation.set(s.pitch, s.yaw, 0);
    },
  };
}

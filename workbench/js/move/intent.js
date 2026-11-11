// Layer 3 (shell): keyboard, mouse (pointer lock) and touch become one intent {moveX, moveZ, lookDX, lookDY}.
// moveX +1 = right, moveZ +1 = forward; look in radians (+x = turn right, +y = look down), summed until read.
export function createIntent(canvas) {
  const keys = new Set();
  let enabled = false, lookX = 0, lookY = 0;
  let stick = null, look = null, sx = 0, sy = 0;
  const STICK = 60; // px of drag for full speed
  const kd = (e) => keys.add(e.code), ku = (e) => keys.delete(e.code);
  const mm = (e) => { if (document.pointerLockElement === canvas) { lookX += e.movementX * 0.0022; lookY += e.movementY * 0.0022; } };
  const click = () => canvas.requestPointerLock?.();
  // touch: a touch that starts on the left half is a move stick, the right half drags to look
  const tStart = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth / 2) { if (!stick) stick = { id: t.identifier, x: t.clientX, y: t.clientY }; }
      else if (!look) look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  };
  const tMove = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (stick && t.identifier === stick.id) {
        sx = Math.max(-1, Math.min(1, (t.clientX - stick.x) / STICK)); sy = Math.max(-1, Math.min(1, (t.clientY - stick.y) / STICK));
      } else if (look && t.identifier === look.id) {
        lookX += (t.clientX - look.x) * 0.005; lookY += (t.clientY - look.y) * 0.005; look.x = t.clientX; look.y = t.clientY;
      }
    }
  };
  const tEnd = (e) => {
    for (const t of e.changedTouches) {
      if (stick && t.identifier === stick.id) { stick = null; sx = 0; sy = 0; }
      if (look && t.identifier === look.id) look = null;
    }
  };
  const TO = { passive: false };
  const TOUCH = [['touchstart', tStart], ['touchmove', tMove], ['touchend', tEnd], ['touchcancel', tEnd]];
  return {
    enable() {
      enabled = true; addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('mousemove', mm); canvas.addEventListener('click', click);
      for (const [n, f] of TOUCH) canvas.addEventListener(n, f, TO);
    },
    disable() {
      enabled = false; removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('mousemove', mm); canvas.removeEventListener('click', click);
      for (const [n, f] of TOUCH) canvas.removeEventListener(n, f, TO);
      keys.clear(); stick = look = null; sx = sy = 0;
    },
    // held movement, plus the look since the last read
    read() {
      const k = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
      let moveZ = k('KeyW', 'KeyS') + k('ArrowUp', 'ArrowDown') - sy, moveX = k('KeyD', 'KeyA') + k('ArrowRight', 'ArrowLeft') + sx;
      moveZ = Math.max(-1, Math.min(1, moveZ)); moveX = Math.max(-1, Math.min(1, moveX));
      if (Math.abs(moveZ) < 0.15 && Math.abs(moveX) < 0.15) { moveZ = 0; moveX = 0; }
      const out = { moveX, moveZ, lookDX: lookX, lookDY: lookY };
      lookX = 0; lookY = 0;
      return out;
    },
    // give back look that the simulation did not use this frame
    unread(rest) { lookX += rest.lookDX; lookY += rest.lookDY; },
    get enabled() { return enabled; },
  };
}

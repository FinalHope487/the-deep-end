// Keyboard + mouse (pointer lock or drag) + touch (left-half joystick, right-half look, tap).
const JOY_R = 56;          // px radius of the virtual joystick
const TOUCH_LOOK = 0.0055; // rad per px
const MOUSE_LOOK = 0.0025;
const TAP_MS = 300, TAP_PX = 10;

export class Input {
  // hooks: { onJoy(state|null), onTap(x, y), onInteract(), onPauseKey(), onLockLost() }
  constructor(el, hooks) {
    this.el = el;
    this.hooks = hooks;
    this.enabled = false;
    this.keys = new Set();
    this.lookX = 0; this.lookY = 0;
    this.joy = null;      // { id, ox, oy, x, y }
    this.lookId = null;
    this.drag = null;     // mouse drag-look fallback
    this.downs = new Map();
    this.locked = false;

    addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { if (!e.repeat && !this.locked) hooks.onPauseKey(); return; }
      if (!this.enabled) return;
      this.keys.add(e.code);   // auto-repeat still counts: a key held through pause/resume keeps working
      if (e.code === 'KeyE' && !e.repeat) hooks.onInteract();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.clear());

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === el;
      if (was && !this.locked) hooks.onLockLost();
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked && this.enabled) { this.lookX += e.movementX * MOUSE_LOOK; this.lookY += e.movementY * MOUSE_LOOK; }
    });

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.moveEv(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  clear() {
    this.keys.clear();
    this.joy = null; this.lookId = null; this.drag = null;
    this.downs.clear();
    this.hooks.onJoy(null);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.clear();
  }

  down(e) {
    if (!this.enabled) return;
    this.downs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 });
    if (e.pointerType === 'mouse') {
      if (this.locked) { this.hooks.onTap(innerWidth / 2, innerHeight / 2); return; }
      this.drag = { x: e.clientX, y: e.clientY };
      return;
    }
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (e.clientX < innerWidth / 2 && !this.joy) {
      this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      this.hooks.onJoy(this.joy);
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.last = { x: e.clientX, y: e.clientY };
    }
  }

  moveEv(e) {
    const d = this.downs.get(e.pointerId);
    if (d) d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y));
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      if (this.drag && e.buttons) {
        this.lookX += (e.clientX - this.drag.x) * MOUSE_LOOK * 1.6;
        this.lookY += (e.clientY - this.drag.y) * MOUSE_LOOK * 1.6;
        this.drag = { x: e.clientX, y: e.clientY };
      }
      return;
    }
    if (this.joy && e.pointerId === this.joy.id) {
      let x = (e.clientX - this.joy.ox) / JOY_R, y = (e.clientY - this.joy.oy) / JOY_R;
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      this.joy.x = x; this.joy.y = y;
      this.hooks.onJoy(this.joy);
    } else if (e.pointerId === this.lookId) {
      this.lookX += (e.clientX - this.last.x) * TOUCH_LOOK;
      this.lookY += (e.clientY - this.last.y) * TOUCH_LOOK;
      this.last = { x: e.clientX, y: e.clientY };
    }
  }

  up(e, cancelled = false) {
    const d = this.downs.get(e.pointerId);
    this.downs.delete(e.pointerId);
    if (e.pointerType === 'mouse') {
      if (this.drag && d && !cancelled && d.moved < TAP_PX && performance.now() - d.t < TAP_MS) {
        this.hooks.onTap(e.clientX, e.clientY);
        this.hooks.onClickCanvas?.();
      }
      this.drag = null;
      return;
    }
    if (d && !cancelled && d.moved < TAP_PX && performance.now() - d.t < TAP_MS) this.hooks.onTap(e.clientX, e.clientY);
    if (this.joy && e.pointerId === this.joy.id) { this.joy = null; this.hooks.onJoy(null); }
    if (e.pointerId === this.lookId) this.lookId = null;
  }

  requestLock() {
    try { const p = this.el.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch { /* unsupported */ }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  consumeLook() {
    const r = [this.lookX, this.lookY];
    this.lookX = 0; this.lookY = 0;
    return r;
  }

  // { x: strafe, z: forward, run }
  move() {
    const k = this.keys;
    let x = 0, z = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) z += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    let run = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.joy) {
      x += this.joy.x; z -= this.joy.y;
      if (Math.hypot(this.joy.x, this.joy.y) > 0.92) run = true;
    }
    return { x, z, run };
  }
}

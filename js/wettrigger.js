// When water wets the lens: only water WET_MIN_DEPTH deep and more (user 2026-10-19). Stepping into it wets the lens at
// once; wading on in it wets it again as a one-shot at random intervals while moving.
export const WET_MIN_DEPTH = 0.9;
const GAP_MIN = 3, GAP_SPAN = 5;   // seconds between wettings

export class WetTrigger {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.armed = false;
    this.timer = 0;
    this.deep = false;   // in deep enough water last frame
  }

  gap() { return GAP_MIN + this.rng() * GAP_SPAN; }

  // returns how wet to make the lens this frame (0 = leave it alone)
  update(dt, depth, moving, running) {
    const deep = depth >= WET_MIN_DEPTH, entered = deep && !this.deep;
    this.deep = deep;
    if (entered) { this.armed = false; return 1; }
    if (!deep || !moving) { this.armed = false; return 0; }
    if (!this.armed) { this.armed = true; this.timer = this.gap(); }
    this.timer -= dt;
    if (this.timer > 0) return 0;
    this.timer = this.gap();
    return running ? 0.85 : 0.6;
  }
}

// When wading wets the lens: only in water deeper than puddles and the shallow pool, and then as a one-shot at
// random intervals while moving (entering water splashes separately, see WetScreen.splash).
export const WET_MIN_DEPTH = 0.45;
const GAP_MIN = 3, GAP_SPAN = 5;   // seconds between wettings

export class WetTrigger {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.armed = false;
    this.timer = 0;
  }

  gap() { return GAP_MIN + this.rng() * GAP_SPAN; }

  // returns how wet to make the lens this frame (0 = leave it alone)
  update(dt, depth, moving, running) {
    if (!(depth >= WET_MIN_DEPTH) || !moving) { this.armed = false; return 0; }
    if (!this.armed) { this.armed = true; this.timer = this.gap(); }
    this.timer -= dt;
    if (this.timer > 0) return 0;
    this.timer = this.gap();
    return running ? 0.85 : 0.6;
  }
}

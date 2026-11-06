// Adaptive quality: watch the frame rate and walk a ladder of (level, resolution) steps.
// Remembers upgrades that failed and stops degrading when lower quality buys no frames (capped displays).
export const QUALITY_LEVELS = {
  low: { name: '低', scaleMax: 0.7, radius: 2, distort: false, grain: false, fogMul: 0.8 },
  mid: { name: '中', scaleMax: 1.0, radius: 2, distort: true, grain: false, fogMul: 1 },
  high: { name: '高', scaleMax: 1.5, radius: 3, distort: true, grain: true, fogMul: 1 },
};
// worst → best; resolution goes first, then the level (view distance / effects)
const LADDER_STEPS = [['low', 0.6], ['low', 0.7], ['mid', 0.7], ['mid', 0.8], ['mid', 0.9], ['mid', 1.0],
  ['high', 1.0], ['high', 1.1], ['high', 1.2], ['high', 1.3], ['high', 1.4], ['high', 1.5]];
const WINDOW = 2, BASE_HZ = 60, LOW_RATIO = 0.92, HIGH_RATIO = 0.967;   // 55 / 58 fps at 60 Hz
const UP_AFTER = 10, UP_AFTER_MAX = 120, FAILED_UP_WINDOW = 30, MIN_GAIN = 1;

export class Quality {
  constructor(setting, isTouch, dpr = window.devicePixelRatio || 1) {
    this.isTouch = isTouch;
    this.dpr = Math.max(1, dpr);
    this.ladder = [];
    for (const [level, s] of LADDER_STEPS) {
      const scale = Math.min(s, this.dpr), last = this.ladder[this.ladder.length - 1];
      if (!last || last.level !== level || last.scale !== scale) this.ladder.push({ level, scale });
    }
    this.set(setting);
  }

  topOf(level) {
    let i = -1;
    this.ladder.forEach((e, j) => { if (e.level === level) i = j; });
    return i;
  }

  set(setting) {
    this.setting = setting;
    this.idx = this.topOf(setting === 'auto' ? (this.isTouch ? 'mid' : 'high') : setting);
    this.ceiling = this.ladder.length - 1;
    this.upAfter = UP_AFTER;
    this.frames = 0; this.time = 0; this.goodTime = 0; this.clock = 0; this.lastUpAt = -1e9;
    this.capHz = 0; this.noGain = 0; this.probe = null; this.streakStart = this.idx;
    this.fps = 60;
    this.changed = true;
  }

  get level() { return this.ladder[this.idx].level; }
  get cfg() { return QUALITY_LEVELS[this.level]; }
  get pixelRatio() {
    if (this.setting !== 'auto') return Math.min(QUALITY_LEVELS[this.setting].scaleMax, this.dpr);
    return this.ladder[this.idx].scale;
  }

  // feed the raw frame interval; returns true when pixel ratio / level changed
  sample(dt) {
    if (dt > 0.25 || dt <= 0) return this.consume();   // tab switch / stall: ignore
    this.frames++; this.time += dt; this.clock += dt;
    if (this.time < WINDOW) return this.consume();
    const fps = this.frames / this.time, span = this.time;
    this.fps = fps;
    this.frames = 0; this.time = 0;
    if (this.setting !== 'auto') return this.consume();
    if (this.capHz && fps > this.capHz * 1.08) this.capHz = 0;   // the cap went away (e.g. low-power mode off)
    const hz = this.capHz || BASE_HZ;

    // did the previous downgrade buy any frames?
    if (this.probe) {
      const gained = fps - this.probe.fps >= MIN_GAIN;
      if (!gained && this.probe.levelJump) {
        // even dropping a whole level changed nothing: the display is capped, quality is not the problem
        this.idx = this.streakStart;
        this.capHz = fps;
        this.probe = null; this.noGain = 0;
        this.changed = true;
        return this.consume();
      }
      this.noGain = gained ? 0 : this.noGain + 1;
      this.probe = null;
    }

    if (fps >= LOW_RATIO * hz) this.noGain = 0;   // a streak only counts consecutive slow windows

    if (fps < LOW_RATIO * hz) {
      this.goodTime = 0;
      if (this.clock - this.lastUpAt < FAILED_UP_WINDOW) {   // the last upgrade was a mistake: never go that high again
        this.ceiling = this.idx - 1;
        this.upAfter = Math.min(UP_AFTER_MAX, this.upAfter * 2);
        this.lastUpAt = -1e9;
      }
      if (this.idx > 0) {
        if (this.noGain === 0) this.streakStart = this.idx;
        let next = this.idx - 1, levelJump = false;
        if (this.noGain >= 2) {   // resolution steps are not helping: try the next level down directly
          const lvl = this.level;
          let j = this.idx;
          while (j > 0 && this.ladder[j].level === lvl) j--;
          if (this.ladder[j].level !== lvl) { next = j; levelJump = true; }
        }
        this.probe = { fps, levelJump };
        this.idx = next;
        this.changed = true;
      }
    } else if (fps > HIGH_RATIO * hz) {
      this.goodTime += span;
      if (this.goodTime >= this.upAfter && this.idx < Math.min(this.ceiling, this.ladder.length - 1)) {
        this.goodTime = 0;
        this.idx++;
        this.lastUpAt = this.clock;
        this.noGain = 0;
        this.changed = true;
      }
    } else this.goodTime = 0;
    return this.consume();
  }

  consume() {
    const c = this.changed;
    this.changed = false;
    return c;
  }
}

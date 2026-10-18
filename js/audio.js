// Web Audio: CC0 loops and one-shots, a tiled-room reverb, and a directional guide sound.
const AUDIO_BASE = 'audio/';
const AUDIO_TIMEOUT_MS = 15000;
const AUDIO_FILES = {
  drip: 'amb_drip.mp3', drone: 'amb_drone.mp3', music: 'guide_musicbox.mp3', sad: 'guide_sad.mp3',
  flow: 'water_flow.mp3', pickup: 'pickup.mp3',
  step0: 'step_0.mp3', step1: 'step_1.mp3', step2: 'step_2.mp3', step3: 'step_3.mp3', step4: 'step_4.mp3',
  splash1: 'splash_1.mp3', splash3: 'splash_3.mp3', splash4: 'splash_4.mp3',
};

export const DRIP_GAP = [2, 6], FLOW_GAP = [5, 16];   // seconds between drips / guide water-flow sounds
export const DRIP_SD = 1, FLOW_SD = 2.5;
const DRIP_LEN = 0.6;
// a bell curve round the middle of [lo, hi] (Box-Muller), redrawn when it falls outside
function gaussIn([lo, hi], sd, rnd) {
  for (;;) {
    const x = (lo + hi) / 2 + sd * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    if (x >= lo && x <= hi) return x;
  }
}
export const dripGap = (rnd = Math.random) => gaussIn(DRIP_GAP, DRIP_SD, rnd);
export const flowGap = (rnd = Math.random) => gaussIn(FLOW_GAP, FLOW_SD, rnd);

// start times (s) of the single drips in a recorded drip bed: 10 ms RMS windows well above the room tone that jump
// from the window before; anything inside 0.3 s of a drip is its echo
export function findDrips(data, rate) {
  const w = Math.max(1, Math.round(rate * 0.01)), env = [];
  for (let i = 0; i + w <= data.length; i += w) { let s = 0; for (let j = 0; j < w; j++) s += data[i + j] * data[i + j]; env.push(Math.sqrt(s / w)); }
  const floor = [...env].sort((a, b) => a - b)[env.length >> 1];
  const starts = [];
  for (let i = 1; i < env.length; i++) {
    const t = i * 0.01;
    if (env[i] > floor * 5 && env[i] > env[i - 1] * 1.5 && (!starts.length || t - starts[starts.length - 1] > 0.3)) starts.push(t);
  }
  return starts.map((t) => Math.max(0, t - 0.03)).filter((t) => t + DRIP_LEN <= data.length / rate);
}

function makeImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.buf = {};
    this.volume = 0.8;
    this.stepTimer = 0;
    this.flowTimer = 4;
    this.dripTimer = 1;
    this.drips = [];
    this.guideName = '';
    this.ready = false;
    this.failed = 0;
  }

  // must be called from a user gesture (mobile autoplay rules)
  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume * 0.7;
    // limiter: stacked splashes + reverb used to clip into harsh distortion
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.verb = ctx.createConvolver();
    this.verb.buffer = makeImpulse(ctx, 1.8, 2.6);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.3;
    this.verbSend.connect(this.verb);
    this.verb.connect(this.master);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.dry.connect(this.verbSend);
    this.guidePan = ctx.createPanner();
    this.guidePan.panningModel = 'equalpower';
    this.guidePan.distanceModel = 'linear';
    this.guidePan.refDistance = 1; this.guidePan.maxDistance = 10000; this.guidePan.rolloffFactor = 0;
    this.guideGain = ctx.createGain();
    this.guideGain.gain.value = 0;
    this.guidePan.connect(this.guideGain);
    this.guideGain.connect(this.dry);
    this.dripGain = ctx.createGain(); this.dripGain.gain.value = 0.4; this.dripGain.connect(this.dry);
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0; this.droneGain.connect(this.dry);
    ctx.resume();
    this.ready = true;
    this.load();
  }

  // every file is usable as soon as it decodes; one slow or missing file never silences the rest
  load() {
    for (const [k, f] of Object.entries(AUDIO_FILES)) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), AUDIO_TIMEOUT_MS);
      fetch(AUDIO_BASE + f, { signal: abort.signal })
        .then((res) => res.arrayBuffer())
        .then((data) => new Promise((ok, bad) => this.ctx.decodeAudioData(data, ok, bad)))
        .then((b) => {
          this.buf[k] = b;
          if (k === 'drip') this.drips = findDrips(b.getChannelData(0), b.sampleRate);
          if (k === 'drone') this.loop('drone', this.droneGain);
        })
        .catch(() => { this.failed++; /* missing sound is not fatal */ })
        .finally(() => clearTimeout(timer));
    }
  }

  loop(name, g) {
    const b = this.buf[name];
    const s = this.ctx.createBufferSource();
    s.buffer = b; s.loop = true;
    s.loopStart = Math.min(0.05, b.duration / 4); s.loopEnd = b.duration - Math.min(0.05, b.duration / 4);
    s.connect(g);
    s.start();
  }

  play(name, gain = 1, rate = 1, dest = this.dry) {
    const b = this.buf[name];
    if (!this.ctx || !b) return;
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(g); g.connect(dest);
    s.start();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v * 0.7, this.ctx.currentTime, 0.05);
  }

  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }

  // one drip cut from the bed, somewhere left or right, pitch a little off
  drip() {
    const b = this.buf.drip, t = this.ctx.currentTime;
    if (!b || !this.drips.length) return;
    const s = this.ctx.createBufferSource();
    s.buffer = b; s.playbackRate.value = 0.9 + Math.random() * 0.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(1, t); g.gain.setTargetAtTime(0, t + DRIP_LEN * 0.6, DRIP_LEN * 0.12);
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; s.connect(g); g.connect(pan); pan.connect(this.dripGain); } else { s.connect(g); g.connect(this.dripGain); }
    s.start(t, this.drips[(Math.random() * this.drips.length) | 0], DRIP_LEN);
  }

  pickup() { this.play('pickup', 0.7); }
  splash() { this.play('splash' + [1, 3, 4][(Math.random() * 3) | 0], 0.4, 0.95 + Math.random() * 0.1); }

  setGuide(name, rate) {
    const key = name + ':' + rate;
    if (!this.ready || key === this.guideName || (name && !this.buf[name])) return;   // retried once the file arrives
    this.guideName = key;
    const old = this.guideSrc;
    if (old) { try { old.stop(this.ctx.currentTime + 0.5); } catch { /* already stopped */ } }
    if (!name || !this.buf[name]) { this.guideSrc = null; return; }
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf[name]; s.loop = true; s.playbackRate.value = rate;
    s.connect(this.guidePan);
    s.start();
    this.guideSrc = s;
  }

  // player: {x,z,yaw,moving,running,inWater}; target: {x,z,zone} | null
  update(dt, player, tension, target) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.dripGain.gain.setTargetAtTime(0.45 * (1 - tension) + 0.08, t, 0.5);
    this.droneGain.gain.setTargetAtTime(0.65 * tension, t, 0.5);
    this.verbSend.gain.setTargetAtTime(0.3 + 0.5 * tension, t, 0.5);
    this.dripTimer -= dt;
    if (this.dripTimer <= 0) { this.dripTimer = dripGap(); this.drip(); }

    if (target) {
      const dx = target.x - player.x, dz = target.z - player.z;
      const dist = Math.hypot(dx, dz) || 1;
      const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
      // listener-local: right = (c, -s), forward = (-s, -c)
      const lx = (dx * c - dz * s) / dist, lf = (-dx * s - dz * c) / dist;
      const p = this.guidePan;
      const ly = Math.max(-3, Math.min(3, ((target.y ?? player.floorH) - player.floorH) * 0.5));   // the floor the way on is on
      if (p.positionX) { p.positionX.value = lx * 3; p.positionY.value = ly; p.positionZ.value = -lf * 3; }
      else p.setPosition(lx * 3, ly, -lf * 3);
      const near = Math.max(0.12, Math.min(1, 1 - dist / 220));
      this.guideGain.gain.setTargetAtTime(0.55 * near, t, 0.4);
      if (target.zone >= 2 || target.zone < 0) {
        this.flowTimer -= dt;
        if (this.flowTimer <= 0) { this.flowTimer = flowGap(); this.play('flow', 0.2 * near, 0.85, this.guidePan); }
      }
    } else this.guideGain.gain.setTargetAtTime(0, t, 0.4);

    if (player.moving) {
      this.stepTimer -= dt * (player.inWater ? 0.75 : 1);
      if (this.stepTimer <= 0) {
        this.stepTimer = player.running ? 0.32 : 0.5;
        if (player.inWater) this.play('splash' + [1, 3, 4][(Math.random() * 3) | 0], 0.12, 1 + Math.random() * 0.1);
        else this.play('step' + ((Math.random() * 5) | 0), 0.5, 0.9 + Math.random() * 0.2);
      }
    } else this.stepTimer = 0.1;
  }
}

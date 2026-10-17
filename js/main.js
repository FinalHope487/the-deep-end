// 深水區 The Deep End — game loop and flow: title → playing ⇄ paused → ending → ended.
import * as THREE from 'three';
import { hash2 } from './rng.js';
import { World, SPAWN, CHUNK, FLOOR, WALL, SHALLOW, ZONE_NAMES, ZONE_COLORS, EXIT_COLOR, layoutHash } from './world.js';
import { makeTileTexture, makeRippleTexture, makeGlowTexture } from './textures.js';
import { ChunkManager } from './chunks.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { ItemSet } from './items.js';
import { Atmosphere, tensionTarget } from './atmosphere.js';
import { Presence } from './presence.js';
import { WetScreen } from './wet.js';
import { AudioSys } from './audio.js';
import { loadGame, saveGame, clearGame, loadSettings, saveSettings } from './save.js';
import { Quality, QUALITY_LEVELS } from './quality.js';
import { UI } from './ui.js';

const PARAMS = new URLSearchParams(location.search);
const TEST_MODE = PARAMS.has('test');
// first guess from the primary pointer; the input actually used decides afterwards (touch laptops, tablets with keyboards)
let touchMode = matchMedia('(pointer: coarse)').matches;
const SAVE_EVERY = 10;
const EXIT_RADIUS = 1.3;
const END_FADE = 2.2;

const canvas = document.getElementById('view');

function bootFail(msg) {
  const b = document.getElementById('btn-start');
  b.textContent = msg;
  b.disabled = true;
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  bootFail('需要支援 WebGL2 的瀏覽器（新版 Chrome、Safari、Edge）');
  throw e;
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
camera.rotation.order = 'YXZ';

const tileTex = makeTileTexture();
tileTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
const rippleTex = makeRippleTexture();
const glowTex = makeGlowTexture();
const mats = {
  static: new THREE.MeshBasicMaterial({ map: tileTex, vertexColors: true }),
  lamp: new THREE.MeshBasicMaterial({ vertexColors: true }),
  water: new THREE.MeshBasicMaterial({ map: rippleTex, transparent: true, opacity: 0.55, depthWrite: false }),
};

const settings = loadSettings();
const game = {
  mode: 'title', world: null, visited: [false, false, false, false], found: new Set(),
  elapsed: 0, saveTimer: 0, exitUnlocked: false, endTimer: 0, lastInWater: false, zoneNow: -1, bubbleItem: null,
  runs: 0, redraw: 0,
};
const player = new Player();
const atmos = new Atmosphere(scene, mats);
const quality = new Quality(settings.quality, touchMode);
const chunks = new ChunkManager(scene, mats, chunkContext);
const items = new ItemSet(scene);
const presence = new Presence(scene);
const wet = new WetScreen();
const audio = new AudioSys();
audio.volume = settings.volume;

// guide glow (one sprite, moved toward the current target) and the exit door
const guide = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, transparent: true, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0,
}));
guide.renderOrder = 10;
scene.add(guide);
const door = new THREE.Group();
{
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, side: THREE.DoubleSide }));
  glow.position.y = 1.2;
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x9aa3a8 });
  for (const [w, h, x, y] of [[0.15, 2.6, -0.78, 1.3], [0.15, 2.6, 0.78, 1.3], [1.71, 0.15, 0, 2.55]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), frameMat);
    b.position.set(x, y, 0);
    door.add(b);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  halo.scale.set(6, 6, 1);
  halo.position.y = 1.2;
  door.add(glow, halo);
  door.visible = false;
  scene.add(door);
}

const ui = new UI({
  onStart: startNew, onContinue: continueGame, onPause: pause, onResume: resume, onToTitle: toTitle,
  onAgain: startNew, onBubble: () => game.bubbleItem && pickup(game.bubbleItem), onSettings: changeSettings,
});
ui.setHint(touchMode);
function setTouchMode(on) {
  if (on === touchMode) return;
  touchMode = on;
  ui.setHint(on);
}
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) setTouchMode(false); }, true);
addEventListener('pointerdown', (e) => setTouchMode(e.pointerType === 'touch'), true);
addEventListener('keydown', () => setTouchMode(false), true);
ui.applySettings(settings);

const input = new Input(canvas, {
  onJoy: (j) => ui.setJoy(j),
  onTap: (x, y) => {
    if (game.mode !== 'playing') return;
    const m = items.pick(camera, x, y, player.x, player.z);
    if (m) pickup(m);
  },
  onInteract: () => {
    if (game.mode !== 'playing') return;
    const m = items.nearest(player.x, player.z);
    if (m) pickup(m);
  },
  onPauseKey: () => { if (game.mode === 'playing') pause(); else if (game.mode === 'paused' && ui.menuInGame) resume(); },
  onLockLost: () => { if (game.mode === 'playing') pause(); },
  onClickCanvas: () => { if (game.mode === 'playing' && !touchMode && !TEST_MODE) input.requestLock(); },
});

// ---------- world / targets ----------

// ?seed=N fixes the first world only; "再玩一次" always rolls a new one
function randomSeed(fromUrl = true) {
  if (fromUrl && PARAMS.has('seed')) return Number(PARAMS.get('seed')) >>> 0;
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

function setWorld(seed) {
  if (game.world && game.world.seed === seed >>> 0) return;
  game.world = new World(seed);
  chunks.setWorld(game.world);
  const ex = game.world.exit;
  door.position.set(ex.x, game.world.hAt(Math.floor(ex.x), Math.floor(ex.z)), ex.z);
  door.rotation.y = ex.yaw;
}

const visitedCount = () => game.visited.filter(Boolean).length;
const explorePct = () => visitedCount() * 15 + game.found.size * (40 / 12);

function currentTarget() {
  const w = game.world;
  if (!w) return null;
  const k = game.visited.indexOf(false);
  if (k >= 0) return { x: w.zones[k].x, z: w.zones[k].z, zone: k, color: ZONE_COLORS[k] };
  return { x: w.exit.x, z: w.exit.z, zone: -1, color: EXIT_COLOR };
}

const stripeColor = new THREE.Color();
const STRIPE_BASE = new THREE.Color(1, 0.985, 0.955);
function chunkContext(cx, cz, L) {
  const ceil = L.ceilFixed || Math.max(2.6, atmos.ceiling() + L.ceilVar * (1 - atmos.T));
  let stripe = null;
  const tgt = currentTarget();
  if (tgt && L.kind !== 'zone') {
    const dx = tgt.x - (cx * CHUNK + 8), dz = tgt.z - (cz * CHUNK + 8), d = Math.hypot(dx, dz);
    const density = Math.min(0.9, Math.max(0.15, 1 - d / 220));
    if (d > 12 && hash2(game.world.seed, cx, cz, 4242) / 4294967296 < density) {
      // tinted tiles rather than paint: halfway between the zone colour and the floor white
      stripeColor.setHex(tgt.color).lerp(STRIPE_BASE, 0.45);
      stripe = { dx, dz, zone: tgt.zone, color: [stripeColor.r, stripeColor.g, stripeColor.b] };
    }
  }
  return { ceil, stripe };
}

function stats() {
  return {
    explore: explorePct(), distance: player.distance, elapsed: game.elapsed, found: game.found.size,
    zones: game.visited.map((v, i) => (v ? ZONE_NAMES[i] : null)).filter(Boolean),
  };
}

function persist() {
  game.saveTimer = 0;
  if ((game.mode !== 'playing' && game.mode !== 'paused') || !game.world) return;
  saveGame({
    seed: game.world.seed, x: player.x, z: player.z, yaw: player.yaw, visited: game.visited,
    found: [...game.found], elapsed: game.elapsed, distance: player.distance,
  });
}

// ---------- flow ----------

function beginPlaying() {
  game.mode = 'playing';
  ui.showPlaying();
  input.setEnabled(true);
  audio.unlock();
  audio.resume();
  if (!touchMode && !TEST_MODE) input.requestLock();
  if (touchMode && !TEST_MODE) { try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* unsupported */ } }
}

function resetProgress() {
  game.visited = [false, false, false, false];
  game.found = new Set();
  game.elapsed = 0;
  game.exitUnlocked = false;
  game.zoneNow = -1;
  game.lastInWater = false;
  door.visible = false;
  presence.reset();
  atmos.T = 0;
  wet.wet = 0;
  player.reset(SPAWN.x, SPAWN.z, 0);
  player.settle(game.world, 0);
  items.setItems(game.world.items, game.found);
}

// the first run uses the world already behind the title; every later "開始" / "再玩一次" rolls a new one
function startNew() {
  const fresh = game.runs > 0;
  if (fresh) setWorld(randomSeed(false));
  game.runs++;
  clearGame();
  resetProgress();
  if (fresh) chunks.flush(player.x, player.z, quality.cfg.radius);
  beginPlaying();
  persist();
}

function continueGame() {
  const s = loadGame();
  if (!s) { ui.showTitle(false); return; }
  setWorld(s.seed);
  resetProgress();
  game.visited = s.visited.map(Boolean);
  game.found = new Set(s.found.filter((n) => Number.isInteger(n) && n >= 0 && n < 12));
  game.elapsed = s.elapsed;
  items.setItems(game.world.items, game.found);
  player.teleport(game.world, s.x, s.z, s.yaw);
  if (!player.canStand(game.world, player.x, player.z, player.floorH)) {   // saved inside a wall: nearest floor
    const t = game.world.findTile(FLOOR, s.x, s.z, 40);
    if (t) player.teleport(game.world, t.x, t.z, s.yaw);
  }
  player.distance = s.distance;
  game.runs++;
  game.exitUnlocked = visitedCount() === 4;
  door.visible = game.exitUnlocked;
  atmos.T = tensionTarget(visitedCount(), game.elapsed);
  chunks.setWorld(game.world);
  chunks.flush(player.x, player.z, quality.cfg.radius);
  beginPlaying();
}

function pause() {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  input.setEnabled(false);
  input.exitLock();
  audio.suspend();
  persist();
  ui.showMenu(true, stats());
  game.redraw = 2;
}

function resume() {
  if (game.mode === 'title') { ui.hideMenu(); return; }   // settings opened from the title
  if (game.mode !== 'paused') return;
  ui.hideMenu();
  beginPlaying();
}

function toTitle() {
  persist();
  game.mode = 'title';
  input.setEnabled(false);
  presence.reset();
  audio.suspend();
  ui.showTitle(!!loadGame());
}

function changeSettings(patch) {
  Object.assign(settings, patch);
  saveSettings(settings);
  if ('volume' in patch) audio.setVolume(settings.volume);
  if ('quality' in patch) { quality.set(settings.quality); applyQuality(); }
  ui.applySettings(settings);
  game.redraw = 2;
}

function pickup(mesh) {
  const it = mesh.userData.item;
  if (game.found.has(it.id) || game.mode !== 'playing') return;
  game.found.add(it.id);
  mesh.visible = false;
  game.bubbleItem = null;
  ui.hideBubble();
  ui.toast('item', it.name);
  audio.pickup();
  persist();
}

function startEnding() {
  game.mode = 'ending';
  game.endTimer = 0;
  input.setEnabled(false);
  input.exitLock();
  clearGame();
  presence.reset();
  ui.startEnding();
}

// ---------- per frame ----------

const proj = new THREE.Vector3();

function updatePlaying(dt) {
  const w = game.world;
  const [lx, ly] = input.consumeLook();
  player.look(lx, ly);
  player.update(w, dt, input.move());
  if (player.inWater && !game.lastInWater) { wet.splash(); audio.splash(); }
  game.lastInWater = player.inWater;
  game.elapsed += dt;

  // zones
  const z = w.zoneAtChunk(Math.floor(player.x / CHUNK), Math.floor(player.z / CHUNK));
  const zi = z ? z.index : -1;
  if (zi !== game.zoneNow) {
    game.zoneNow = zi;
    if (zi >= 0) {
      ui.toast('zone', ZONE_NAMES[zi]);
      if (!game.visited[zi]) {
        game.visited[zi] = true;
        if (visitedCount() === 4) { game.exitUnlocked = true; door.visible = true; }
        chunks.refreshStripes();   // floor guides now point at the next target
        persist();
      }
    }
  }

  // pickup bubble for the nearest item in reach
  const near = items.nearest(player.x, player.z);
  game.bubbleItem = null;
  if (near) {
    // anchor to the item's rest position (not its bobbing mesh) so the bubble holds still for tapping
    const it = near.userData.item;
    proj.set(it.x, it.h + 0.45, it.z).project(camera);
    if (proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05) {
      game.bubbleItem = near;
      ui.showBubble((proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight);
    }
  }
  if (!game.bubbleItem) ui.hideBubble();

  if (game.exitUnlocked && Math.hypot(player.x - w.exit.x, player.z - w.exit.z) < EXIT_RADIUS) { startEnding(); return; }

  presence.update(dt, w, player, atmos.T >= 0.5, visitedCount() >= 3 ? 2 : 1, hFovHalf());
  const tgt = currentTarget();
  if (tgt.zone < 0) audio.setGuide('music', 0.75);
  else if (tgt.zone < 2) audio.setGuide('music', 1);
  else audio.setGuide('sad', 0.85);
  audio.update(dt, player, atmos.T, tgt);
  game.saveTimer += dt;
  if (game.saveTimer >= SAVE_EVERY) persist();
}

function hFovHalf() {
  return Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
}

function updateGuide() {
  const tgt = currentTarget();
  const m = guide.material;
  if (!tgt || game.mode === 'title') { m.opacity = 0; return; }
  const dx = tgt.x - player.x, dz = tgt.z - player.z, d = Math.hypot(dx, dz) || 1;
  const reach = Math.min(d, atmos.fogFar * 0.9);
  guide.position.set(player.x + (dx / d) * reach, player.y + 1.5, player.z + (dz / d) * reach);
  const s = 4 + reach * 0.35;
  guide.scale.set(s, s, 1);
  m.color.setHex(tgt.color);
  const fadeNear = Math.min(1, Math.max(0, (d - 10) / 25));
  m.opacity = (0.16 + 0.16 * atmos.T) * fadeNear;
}

function applyQuality() {
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  ui.setQualityLabel(`${QUALITY_LEVELS[quality.level].name}・解析度 ×${quality.pixelRatio.toFixed(1)}`);
  game.redraw = 2;
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 80 : 70;
  camera.updateProjectionMatrix();
  game.redraw = 2;
}
addEventListener('resize', resize);
// mobile browsers can suspend audio behind our back (calls, other apps): any touch or key wakes it
const wakeAudio = () => { if (game.mode === 'playing') audio.resume(); };
addEventListener('pointerdown', wakeAudio, true);
addEventListener('keydown', wakeAudio, true);
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (game.mode === 'playing') pause(); else persist(); } });

const frameStats = { frames: 0, sum: 0, max: 0, work: 0, slow: 0 };
let last = performance.now(), simTime = 0, fpsTimer = 0, fpsFrames = 0, started = false;

function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(Math.max(raw, 0), 0.1);
  // the pause menu and the white end screen show a still image: stop drawing (battery, heat)
  if ((game.mode === 'paused' || game.mode === 'ended') && game.redraw <= 0) return;
  if (game.redraw > 0) game.redraw--;
  const t0 = performance.now();
  if (game.mode === 'playing' && quality.sample(raw)) applyQuality();
  const cfg = quality.cfg;

  if (game.mode !== 'paused') simTime += dt;
  if (game.mode === 'playing') updatePlaying(dt);
  else if (game.mode === 'title') player.yaw += dt * 0.04;
  else if (game.mode === 'ending') {
    game.endTimer += dt;
    if (game.endTimer >= END_FADE) { game.mode = 'ended'; audio.suspend(); ui.showEnd(stats()); game.redraw = 1; }
  }
  if (game.mode !== 'playing' && game.mode !== 'paused') wet.update(dt, false, false, false);
  else if (game.mode === 'playing') wet.update(dt, player.inWater, player.moving, player.running);

  chunks.update(player.x, player.z, cfg.radius);
  const target = game.mode === 'title' ? 0 : tensionTarget(visitedCount(), game.elapsed);
  atmos.update(game.mode === 'paused' ? 0 : dt, target, cfg.radius * CHUNK - 6, cfg.fogMul);
  // the far plane follows the fog but never cuts off the presence (it ignores fog and stands up to 34 m away)
  const far = Math.max(atmos.fogFar + 4, 40);
  if (Math.abs(camera.far - far) > 0.5) { camera.far = far; camera.updateProjectionMatrix(); }
  rippleTex.offset.set(simTime * 0.02, simTime * 0.013);
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  items.update(simTime, player.x, player.z);
  updateGuide();
  wet.render(renderer, scene, camera, cfg.distort);

  if (raw > 0 && raw <= 0.25) {
    frameStats.frames++; frameStats.sum += raw; frameStats.max = Math.max(frameStats.max, raw);
    if (raw > 0.025) frameStats.slow++;
    frameStats.work += performance.now() - t0;
  }
  fpsTimer += raw; fpsFrames++;
  if (fpsTimer >= 0.5) { if (settings.showFps) ui.setFps(`${Math.round(fpsFrames / fpsTimer)} fps · ${QUALITY_LEVELS[quality.level].name}`); fpsTimer = 0; fpsFrames = 0; }
  if (!started && chunks.pending() === 0) {
    started = true;
    warmUp();
    ui.enableStart();
    window.__deepEndBooted = true;
    if (TEST_MODE) window.__deepend.ready = true;
  }
}

// compile every shader variant while the title covers the canvas, instead of stalling the first time
// the player wades in (render-target variants), sees an item, the door or the presence
function warmUp() {
  const hidden = [door, presence.mesh, ...items.meshes].filter((o) => !o.visible);
  for (const o of hidden) o.visible = true;
  renderer.compile(scene, camera);
  renderer.setRenderTarget(wet.prepare(renderer));
  renderer.compile(scene, camera);
  renderer.setRenderTarget(null);
  renderer.compile(wet.scene, wet.cam);
  for (const o of hidden) o.visible = false;
}

// ---------- boot ----------

setWorld(randomSeed());
resetProgress();
resize();
applyQuality();
ui.showTitle(!!loadGame());
requestAnimationFrame(frame);

if (TEST_MODE) {
  window.__deepend = {
    ready: false,
    state: () => ({
      mode: game.mode, x: player.x, z: player.z, y: player.y, yaw: player.yaw, inWater: player.inWater, wet: wet.wet,
      tension: atmos.T, fogFar: scene.fog.far, explore: explorePct(), visited: [...game.visited], found: [...game.found],
      elapsed: game.elapsed, distance: player.distance, exitUnlocked: game.exitUnlocked, doorVisible: door.visible,
      loadedChunks: chunks.count, pendingChunks: chunks.pending(), seed: game.world.seed, bubble: ui.bubbleShown,
      quality: { level: quality.level, scale: quality.pixelRatio, setting: quality.setting },
      audio: { ready: audio.ready, sounds: Object.keys(audio.buf).length, state: audio.ctx ? audio.ctx.state : 'none', failed: audio.failed },
      presence: { count: presence.appearances, active: presence.active, visible: presence.mesh.visible,
        dist: Math.hypot(presence.mesh.position.x - player.x, presence.mesh.position.z - player.z) },
      cameraFar: camera.far, renders: renderer.info.render.frame, programs: renderer.info.programs.length,
      lamp: mats.lamp.color.getHexString(), lampNominal: atmos.lampNominal(new THREE.Color()).getHexString(),
      presenceCooldown: presence.cooldown, maxChunkBuildsPerFrame: chunks.maxPerFrame,
    }),
    stripeTargets: () => [...chunks.loaded.values()].map((c) => c.stripeZone).filter((z) => z !== null && z !== undefined),
    forcePresence() { presence.cooldown = 0; },
    forceFlicker() { atmos.flicker = 5; },
    audioSuspend() { audio.ctx?.suspend(); },
    teleport(x, z, yaw, flush = true) {
      player.teleport(game.world, x, z, yaw ?? player.yaw);
      if (flush) chunks.flush(player.x, player.z, quality.cfg.radius);
    },
    setElapsed(s) { game.elapsed = s; },
    findTile(kind, x = player.x, z = player.z, r = 40) { return game.world.findTile({ shallow: SHALLOW, wall: WALL }[kind] ?? FLOOR, x, z, r); },
    // a tile of `kind` with `len` more tiles of the same kind straight ahead; returns position + yaw
    findRun(kind, len, x = player.x, z = player.z, r = 40) {
      const type = kind === 'shallow' ? SHALLOW : FLOOR, w = game.world;
      const dirs = [[0, -1, 0], [1, 0, -Math.PI / 2], [0, 1, Math.PI], [-1, 0, Math.PI / 2]];
      for (let rr = 0; rr <= r; rr++) for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== rr) continue;
        const tx = Math.floor(x) + dx, tz = Math.floor(z) + dz;
        for (const [ux, uz, yaw] of dirs) {
          let ok = true;
          for (let i = 0; i <= len && ok; i++) {
            for (const s of [-1, 0, 1]) {   // keep a 3-tile-wide lane
              const ax = tx + ux * i + (uz ? s : 0), az = tz + uz * i + (ux ? s : 0);
              if (w.typeAt(ax, az) !== type || Math.abs(w.hAt(ax, az) - w.hAt(tx, tz)) > 0.01) ok = false;
            }
          }
          if (ok) return { x: tx + 0.5, z: tz + 0.5, yaw };
        }
      }
      return null;
    },
    zones: () => game.world.zones.map((z) => ({ index: z.index, x: z.x, z: z.z, name: ZONE_NAMES[z.index] })),
    items: () => game.world.items.map((i) => ({ id: i.id, zone: i.zone, name: i.name, x: i.x, z: i.z })),
    exit: () => ({ x: game.world.exit.x, z: game.world.exit.z }),
    layoutHash: (cx, cz, seed) => layoutHash(new World(seed ?? game.world.seed).layout(cx, cz)),
    resetFrameStats() { Object.assign(frameStats, { frames: 0, sum: 0, max: 0, work: 0, slow: 0 }); },
    frameStats: () => ({
      frames: frameStats.frames, avgMs: (frameStats.sum / Math.max(1, frameStats.frames)) * 1000,
      maxMs: frameStats.max * 1000, workMs: frameStats.work / Math.max(1, frameStats.frames),
      slowPct: (frameStats.slow / Math.max(1, frameStats.frames)) * 100,
    }),
  };
}

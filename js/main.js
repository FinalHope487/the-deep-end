// 深水區 The Deep End — game loop and flow: title → playing ⇄ paused → ending → ended.
import * as THREE from 'three';
import { hash2 } from './rng.js';
import { World, SPAWN, ZONE_NAMES, ZONE_COLORS, EXIT_COLOR, layoutHash } from './world.js';
import { CHUNK, FLOOR, WALL, SHALLOW, RAMP, DIRS, LEVEL_H } from './tiles.js';
import { makeTileTexture, makeRippleTexture, makeCausticTexture, makeBeamTexture, makeGlowTexture, makeSignAtlas } from './textures.js';
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
import { JUMP_TARGETS } from './jump.js';
import { PATCH, patchOf } from './levelmap.js';
import { MEGA_FOG } from './mega.js';
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
const causticTex = makeCausticTexture();
const glowTex = makeGlowTexture();
// caustics are painted onto submerged surfaces by the static material: the chunk meshes mark every vertex with how
// far it sits under water (`wetDepth`), a scrolling line pattern is added there and fades out with depth
const caustics = { time: { value: 0 }, amount: { value: 1 } };
function withCaustics(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCaus = { value: causticTex };
    sh.uniforms.uTime = caustics.time;
    sh.uniforms.uAmt = caustics.amount;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float wetDepth;
varying float vWetD;
varying vec3 vWpos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWetD = wetDepth; vWpos = position;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vWetD;
varying vec3 vWpos;
uniform sampler2D uCaus;
uniform float uTime;
uniform float uAmt;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (vWetD > 0.02) {
        // floors take the pattern from above; walls from the side (no vertical streaks)
        vec3 nrm = normalize(cross(dFdx(vWpos), dFdy(vWpos)));
        vec2 q = (abs(nrm.y) > 0.5 ? vWpos.xz : vec2(vWpos.x + vWpos.z, vWpos.y)) * 0.31;
        float a = texture2D(uCaus, q + vec2(uTime * 0.021, uTime * 0.014)).r;
        float b = texture2D(uCaus, q * 1.43 + vec2(0.5 - uTime * 0.017, uTime * 0.023)).r;
        float c = clamp((a + b) * 0.85, 0.0, 1.0);
        float fade = smoothstep(0.02, 0.2, vWetD) * (1.0 - smoothstep(0.6, 3.2, vWetD));
        diffuseColor.rgb += vec3(0.28, 0.56, 0.62) * c * fade * uAmt;
      }`);
  };
  return mat;
}
const mats = {
  static: withCaustics(new THREE.MeshBasicMaterial({ map: tileTex, vertexColors: true })),
  // ceiling panels, windows and wall signs share the sign atlas (panels sample its white corner)
  lamp: new THREE.MeshBasicMaterial({ map: makeSignAtlas(), vertexColors: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
  water: new THREE.MeshBasicMaterial({ map: rippleTex, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),   // per-vertex alpha
  sun: new THREE.MeshBasicMaterial({ map: makeBeamTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  prop: new THREE.MeshBasicMaterial({ vertexColors: true }),
  abyss: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),   // pit walls fade to real black, the fog colour never touches them
};

const settings = loadSettings();
const game = {
  mode: 'title', world: null, visited: [false, false, false, false], found: new Set(),
  elapsed: 0, saveTimer: 0, exitUnlocked: false, endTimer: 0, lastInWater: false, zoneNow: -1,
  runs: 0, redraw: 0, jump: null, wayKey: '', fogK: 1, megaK: 0,
};
const player = new Player();
const atmos = new Atmosphere(scene, mats);
const quality = new Quality(settings.quality, touchMode);
const chunks = new ChunkManager(scene, mats, chunkContext);
const items = new ItemSet(scene, glowTex);
const presence = new Presence(scene);
const wet = new WetScreen();
const audio = new AudioSys();
audio.volume = settings.volume;

// guide glow (one sprite, moved toward the current target; walls hide it, it only shows through openings)
// and the exit door
const guide = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, transparent: true, depthTest: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0,
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
  onAgain: startNew, onSettings: changeSettings, onJump: jumpTo,
});
ui.buildJumpList(JUMP_TARGETS);
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
    const m = items.pick(camera, x, y, player.x, player.z, player.floorH);
    if (m) pickup(m);
  },
  onInteract: () => {
    if (game.mode !== 'playing') return;
    const m = items.nearest(player.x, player.z, player.floorH);
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

// level jump: while game.jump is set, the real progress sits in it and nothing below counts or saves
const real = () => game.jump || { visited: game.visited, found: game.found, distance: player.distance };
const visitedCount = () => game.visited.filter(Boolean).length;
const explorePct = () => { const r = real(); return r.visited.filter(Boolean).length * 15 + r.found.size * (40 / 12); };

// the middle chunks of a patch's four sides: where its stairs are
const stairSpots = (pi, pj) => [[-1, 1], [3, 1], [1, -1], [1, 3]].map(([a, b]) => ({ x: (pi * PATCH + a) * CHUNK + 8, z: (pj * PATCH + b) * CHUNK + 8 }));
const nearestSpot = (spots) => spots.reduce((a, b) => (Math.hypot(b.x - player.x, b.z - player.z) < Math.hypot(a.x - player.x, a.z - player.z) ? b : a));

// what the glow, the sound and the door signs lead to: the next zone (or the exit), or, when it is on another floor,
// the stairs that get there (and the stairs back down when the player is on the wrong floor)
function currentTarget() {
  const w = game.world;
  if (!w) return null;
  const k = game.visited.indexOf(false);
  const g = k >= 0 ? { ...w.zones[k], zone: k, color: ZONE_COLORS[k] } : { ...w.exit, zone: -1, color: EXIT_COLOR };
  const pi = patchOf(Math.floor(player.x / CHUNK)), pj = patchOf(Math.floor(player.z / CHUNK));
  const plv = w.lm.patchLevel(pi, pj);
  let way = null;
  if (plv !== 0 && !(pi === g.pi && pj === g.pj)) way = nearestSpot(stairSpots(pi, pj));
  else if (g.level !== 0 && plv === 0) way = nearestSpot(stairSpots(g.pi, g.pj));
  if (way) return { x: way.x, z: way.z, y: 0, zone: g.zone, color: g.color };
  return { x: g.x, z: g.z, y: g.level * LEVEL_H, zone: g.zone, color: g.color };
}

const guideColor = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);
function chunkContext(cx, cz, L) {
  const ceil = L.ceilFixed || Math.max(2.6, L.minCeil, atmos.ceiling() + L.ceilVar * (1 - atmos.T));
  let guide = null;
  const tgt = currentTarget();
  if (tgt && L.kind !== 'zone' && L.kind !== 'mega') {
    const dx = tgt.x - (cx * CHUNK + 8), dz = tgt.z - (cz * CHUNK + 8), d = Math.hypot(dx, dz);
    const density = Math.min(0.8, Math.max(0.12, 1 - d / 220));
    if (d > 12 && hash2(game.world.seed, cx, cz, 4242) / 4294967296 < density) {
      // a sign by the door that leads on, and a lamp just inside it faintly in the target's colour
      guideColor.setHex(tgt.color).lerp(WHITE, 0.35);
      guide = { x: tgt.x, z: tgt.z, zone: tgt.zone, color: [guideColor.r, guideColor.g, guideColor.b] };
    }
  }
  return { ceil, T: atmos.T, guide };
}

function stats() {
  return {
    explore: explorePct(), distance: real().distance, elapsed: game.elapsed, found: real().found.size,
    zones: real().visited.map((v, i) => (v ? ZONE_NAMES[i] : null)).filter(Boolean),
  };
}

function persist() {
  game.saveTimer = 0;
  if ((game.mode !== 'playing' && game.mode !== 'paused') || !game.world || player.riding || game.jump) return;
  saveGame({
    seed: game.world.seed, x: player.x, z: player.z, h: player.floorH, yaw: player.yaw, visited: game.visited,
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

// leave the jumped state: put the real progress back (the save on disk was never touched)
function endJump() {
  if (!game.jump) return;
  game.visited = game.jump.visited;
  game.found = game.jump.found;
  player.distance = game.jump.distance;
  game.jump = null;
  ui.setJumped(false);
}

function resetProgress() {
  endJump();
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
  endJump();
  const s = loadGame();
  if (!s) { ui.showTitle(false); return; }
  setWorld(s.seed);
  resetProgress();
  game.visited = s.visited.map(Boolean);
  game.found = new Set(s.found.filter((n) => Number.isInteger(n) && n >= 0 && n < 12));
  game.elapsed = s.elapsed;
  items.setItems(game.world.items, game.found);
  player.teleport(game.world, s.x, s.z, s.yaw, s.h);
  if (!player.canStand(game.world, player.x, player.z, player.floorH)) {   // saved inside a wall: nearest floor
    const t = game.world.findTile(FLOOR, s.x, s.z, 40);
    if (t) player.teleport(game.world, t.x, t.z, s.yaw, game.world.hAt(Math.floor(t.x), Math.floor(t.z)));
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

function jumpTo(id) {
  const target = JUMP_TARGETS.find((t) => t.id === id);
  if (!target || !game.world || (game.mode !== 'title' && game.mode !== 'paused')) return;
  const spot = target.spot(game.world, (x, z, h) => player.canStand(game.world, x, z, h));
  if (!spot) return;
  persist();   // real progress goes to disk before the flag goes up
  if (!game.jump) game.jump = { visited: game.visited, found: game.found, distance: player.distance };
  game.visited = [true, true, true, true];
  game.found = new Set();
  game.exitUnlocked = true;
  door.visible = true;
  game.zoneNow = -1;
  game.lastInWater = false;
  game.runs++;
  presence.reset();
  wet.wet = 0;
  atmos.T = tensionTarget(4, game.elapsed);
  items.setItems(game.world.items, game.found);
  player.teleport(game.world, spot.x, spot.z, spot.yaw, spot.h);
  chunks.refreshGuides();
  chunks.flush(player.x, player.z, quality.cfg.radius);
  ui.setJumped(true);
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
  endJump();
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
  ui.toast('item', it.name);
  audio.pickup();
  persist();
}

function startEnding() {
  game.mode = 'ending';
  game.endTimer = 0;
  input.setEnabled(false);
  input.exitLock();
  if (!game.jump) clearGame();
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
        chunks.refreshGuides();   // door signs and lamps now point at the next target
        persist();
      }
    }
  }

  if (game.exitUnlocked && Math.hypot(player.x - w.exit.x, player.z - w.exit.z) < EXIT_RADIUS) { startEnding(); return; }

  presence.update(dt, w, player, atmos.T >= 0.5, visitedCount() >= 3 ? 2 : 1, hFovHalf());
  const tgt = currentTarget();
  const wayKey = tgt.x + ',' + tgt.z;
  if (wayKey !== game.wayKey) { game.wayKey = wayKey; chunks.refreshGuides(); }   // the way on changed (floor or patch)
  if (!settings.bgm) audio.setGuide('', 1);
  else if (tgt.zone < 0) audio.setGuide('music', 0.75);
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
  guide.position.set(player.x + (dx / d) * reach, (tgt.y ?? player.floorH) + 1.9, player.z + (dz / d) * reach);
  const s = 4 + reach * 0.35;
  guide.scale.set(s, s, 1);
  m.color.setHex(tgt.color);
  const fadeNear = Math.min(1, Math.max(0, (d - 10) / 25));
  m.opacity = (0.16 + 0.16 * atmos.T) * fadeNear;
}

// film grain: a fixed noise tile, high quality only (a full-screen blend layer costs fill rate)
const grainEl = document.getElementById('grain');
{
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d'), im = x.createImageData(128, 128);
  for (let i = 0; i < im.data.length; i += 4) { const v = 90 + Math.random() * 165; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0);
  grainEl.style.backgroundImage = `url(${c.toDataURL()})`;
}

function applyQuality() {
  grainEl.hidden = !quality.cfg.grain;
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
  if (game.mode !== 'playing' && game.mode !== 'paused') wet.update(dt, 0, false, false);
  else if (game.mode === 'playing') wet.update(dt, player.waterDepth, player.moving, player.running);

  const here = game.world.layout(Math.floor(player.x / CHUNK), Math.floor(player.z / CHUNK)), playerLv = here.lv;
  chunks.setLevel(playerLv);
  chunks.update(player.x, player.z, cfg.radius);
  const target = game.mode === 'title' ? 0 : tensionTarget(visitedCount(), game.elapsed);
  // the view shortens smoothly down in B1 (the fog colour itself never changes)
  game.fogK += ((playerLv < 0 ? 0.6 : 1) - game.fogK) * Math.min(1, dt * 1.5);
  // inside a mega room the fog closes in to 40 m, and eases back out of it
  game.megaK += ((here.kind === 'mega' ? 1 : 0) - game.megaK) * Math.min(1, dt * 1.5);
  const fogCap = cfg.radius * CHUNK - 6;
  atmos.update(game.mode === 'paused' ? 0 : dt, target, fogCap + (Math.min(fogCap, MEGA_FOG) - fogCap) * game.megaK, cfg.fogMul * game.fogK);
  // the far plane follows the fog but never cuts off the presence (it ignores fog and stands up to 34 m away)
  const far = Math.max(atmos.fogFar + 4, 40);
  if (Math.abs(camera.far - far) > 0.5) { camera.far = far; camera.updateProjectionMatrix(); }
  rippleTex.offset.set(simTime * 0.02, simTime * 0.013);
  caustics.time.value = simTime;
  caustics.amount.value = 1 - 0.7 * atmos.T;
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  items.update(simTime, player.x, player.z, player.floorH);
  chunks.animate(simTime);
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
  // sunbeams and floating toys may not be on screen yet: stand-ins so their shaders compile now too
  const probe = new THREE.BufferGeometry();
  probe.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  probe.setAttribute('color', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const stand = [new THREE.Mesh(probe, mats.sun), new THREE.Mesh(probe, mats.prop)];
  for (const m of stand) scene.add(m);
  renderer.compile(scene, camera);
  renderer.setRenderTarget(wet.prepare(renderer));
  renderer.compile(scene, camera);
  renderer.setRenderTarget(null);
  renderer.compile(wet.scene, wet.cam);
  for (const m of stand) scene.remove(m);
  probe.dispose();
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
    scene,
    state: () => ({
      mode: game.mode, x: player.x, z: player.z, y: player.y, yaw: player.yaw, inWater: player.inWater, wet: wet.wet,
      tension: atmos.T, fogFar: scene.fog.far, explore: explorePct(), visited: [...game.visited], found: [...game.found],
      jumped: !!game.jump, elapsed: game.elapsed, distance: real().distance, exitUnlocked: game.exitUnlocked, doorVisible: door.visible,
      loadedChunks: chunks.count, pendingChunks: chunks.pending(), seed: game.world.seed, floorH: player.floorH, riding: player.riding,
      guideOpacity: guide.material.opacity, guideDepthTest: guide.material.depthTest,
      quality: { level: quality.level, scale: quality.pixelRatio, setting: quality.setting },
      audio: { ready: audio.ready, sounds: Object.keys(audio.buf).length, state: audio.ctx ? audio.ctx.state : 'none', failed: audio.failed },
      presence: { count: presence.appearances, active: presence.active, visible: presence.mesh.visible,
        dist: Math.hypot(presence.mesh.position.x - player.x, presence.mesh.position.z - player.z) },
      cameraFar: camera.far, renders: renderer.info.render.frame, programs: renderer.info.programs.length,
      lamp: mats.lamp.color.getHexString(), lampNominal: atmos.lampNominal(new THREE.Color()).getHexString(),
      tile: mats.static.color.getHexString(), tileNominal: atmos.staticNominal(new THREE.Color()).getHexString(),
      presenceCooldown: presence.cooldown, maxChunkBuildsPerFrame: chunks.maxPerFrame,
      draw: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
      buildMs: { avg: chunks.buildMs.reduce((a, b) => a + b, 0) / Math.max(1, chunks.buildMs.length), max: Math.max(0, ...chunks.buildMs), n: chunks.buildMs.length,
        geo: chunks.geoMs.reduce((a, b) => a + b, 0) / Math.max(1, chunks.geoMs.length) },
    }),
    megas: (patches = 10) => game.world.megasNear(player.x, player.z, patches).map((m) => ({ ...m, ports: game.world.lm.megaPorts(m) })),
    // the middle of the nearest ordinary chunk on a floor (-1: B1), outside the zones
    findLevelChunk(level, x = player.x, z = player.z) {
      const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK), w = game.world;
      for (let r = 0; r <= 40; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = pcx + dx, cz = pcz + dz;
        if (w.lm.levelOf(cx, cz) === level && !w.lm.stairOf(cx, cz) && !w.zoneAtChunk(cx, cz) && !w.lm.megaChunk(cx, cz)) return { x: cx * CHUNK + 8.5, z: cz * CHUNK + 8.5 };
      }
      return null;
    },
    // draw cost of the scene as it stands: calls, triangles, visible transparent meshes
    drawInfo() {
      let transparent = 0, meshes = 0;
      scene.traverseVisible((o) => { if (o.isMesh) { meshes++; if (o.material.transparent) transparent++; } });
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, meshes, transparent, programs: renderer.info.programs.length };
    },
    guideTargets: () => [...chunks.loaded.values()].map((c) => c.guideZone).filter((z) => z !== null && z !== undefined),
    // the nearest rideable slide: where to stand and which way to push
    findSlide(x = player.x, z = player.z) {
      let best = null, bd = Infinity;
      const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
      for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
        for (const s of game.world.layout(pcx + dx, pcz + dz).slides) {
          if (!s.entry) continue;
          const d = Math.hypot(s.entry.x - x, s.entry.z - z);
          if (d < bd) { bd = d; best = s; }
        }
      }
      if (!best) return null;
      const e = best.entry;
      return { x: e.x - e.nx * 0.45, z: e.z - e.nz * 0.45, h: e.h, yaw: Math.atan2(-e.nx, -e.nz), land: best.land };
    },
    // a stair room near (x, z) of the given variant
    stairRoom(variant, x = player.x, z = player.z) {
      const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
      for (let r = 0; r <= 12; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const L = game.world.layout(pcx + dx, pcz + dz);
        if (L.kind === 'stairs' && (!variant || L.variant === variant)) return L;
      }
      return null;
    },
    // one tile before the foot of a straight flight, facing up it
    findFlight(x, z) {
      const L = this.stairRoom('straight', x, z);
      if (!L) return null;
      let foot = -1;
      for (let i = 0; i < 256; i++) if (L.tiles[i] === RAMP && (foot < 0 || L.h[i] < L.h[foot])) foot = i;
      const [dx, dz] = DIRS[L.rdir[foot]];
      const fx = L.ox + (foot % 16) + 0.5 - dx, fz = L.oz + (foot >> 4) + 0.5 - dz;
      return { x: fx, z: fz, yaw: Math.atan2(-dx, -dz), h: game.world.floorAt(fx, fz) };
    },
    // the middle of an open stretch of upper floor in a stair room
    findUpper(x, z) {
      const L = this.stairRoom(null, x, z);
      if (!L) return null;
      for (let i = 0; i < 256; i++) {
        const tx = i % 16, tz = i >> 4;
        if (tx < 2 || tz < 2 || tx > 13 || tz > 13) continue;
        const ok = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b2]) => L.up.tiles[(tz + b2) * 16 + tx + a] === FLOOR);
        if (ok) return { x: L.ox + tx + 0.5, z: L.oz + tz + 0.5, h: L.up.h[i], ground: game.world.floorAt(L.ox + tx + 0.5, L.oz + tz + 0.5) };
      }
      return null;
    },
    // an item's screen position (for tapping it)
    itemScreen(id) {
      const m = items.meshes.find((mm) => mm.userData.item.id === id);
      if (!m) return null;
      proj.copy(m.position).project(camera);
      return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight, onScreen: proj.z < 1 && Math.abs(proj.x) < 1 && Math.abs(proj.y) < 1 };
    },
    itemGlint(id) { const m = items.meshes.find((mm) => mm.userData.item.id === id); return m ? m.userData.glint.material.opacity : -1; },
    forcePresence() { presence.cooldown = 0; },
    forceFlicker() { atmos.flicker = 5; },
    audioSuspend() { audio.ctx?.suspend(); },
    teleport(x, z, yaw, flush = true, h) {
      player.teleport(game.world, x, z, yaw ?? player.yaw, h ?? game.world.hAt(Math.floor(x), Math.floor(z)));
      if (flush) chunks.flush(player.x, player.z, quality.cfg.radius);
    },
    setElapsed(s) { game.elapsed = s; },
    setPitch(p) { player.pitch = p; },
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
    layoutAt: (cx, cz) => game.world.layout(cx, cz),
    zones: () => game.world.zones.map((z) => ({ index: z.index, x: z.x, z: z.z, level: z.level, name: ZONE_NAMES[z.index] })),
    // the 1F plaza of the stair on a zone's west side (it leads straight into the zone), facing the flight
    stairInto(i) {
      const z = game.world.zones[i], cx = z.cx0 - 1, cz = z.cz0 + 1;
      return { x: cx * CHUNK + 4.5, z: cz * CHUNK + 8.5, yaw: -Math.PI / 2, h: 0, stair: game.world.lm.stairOf(cx, cz) };
    },
    items: () => game.world.items.map((i) => ({ id: i.id, zone: i.zone, name: i.name, x: i.x, z: i.z, h: i.h, up: i.up })),
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

// localStorage persistence. Every access is guarded: private mode / blocked storage just means no save.
const SAVE_KEY = 'deepend.save.v1';
const SETTINGS_KEY = 'deepend.settings.v1';
const MAX_COORD = 500000;
const DEFAULT_SETTINGS = { volume: 0.8, quality: 'auto', showFps: false, bgm: false };

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function writeJson(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

const finite = (...v) => v.every(Number.isFinite);

// What a save still holds that can be trusted, field by field: a broken position or progress field is dropped (and named
// in `damaged`), never the whole save. null only when nothing reliable is left (not a v1 object, or no usable seed).
// last: the landmark visited most recently (-1 when unknown: old saves never recorded it, visited cannot tell the order).
// gen: the map generator the position belongs to (saves from before it existed are generator 1).
export function parseSave(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s) || s.v !== 1 || !Number.isFinite(s.seed)) return null;
  const damaged = [];
  let visited = [false, false, false, false];
  if (Array.isArray(s.visited) && s.visited.length === 4 && s.visited.every((v) => typeof v === 'boolean')) visited = s.visited.slice();
  else damaged.push('visited');
  let found = [];
  if (Array.isArray(s.found)) found = s.found.filter((n) => Number.isInteger(n) && n >= 0 && n < 12);
  else damaged.push('found');
  const count = (k) => {
    if (Number.isFinite(s[k]) && s[k] >= 0) return s[k];
    damaged.push(k);
    return 0;
  };
  const elapsed = count('elapsed'), distance = count('distance');
  const last = Number.isInteger(s.last) && s.last >= 0 && s.last < 4 && visited[s.last] ? s.last : -1;
  const gen = s.gen === undefined ? 1 : s.gen;
  // chunk keys hold |chunk| < 32768 (524 km); anything near that is not a real walk. Standing height: saves from before
  // upper floors stand on the ground
  const h = s.h === undefined ? 0 : s.h;
  let pos = null;
  if (finite(s.x, s.z, s.yaw, h) && Math.abs(s.x) <= MAX_COORD && Math.abs(s.z) <= MAX_COORD && Math.abs(h) <= 20) pos = { x: s.x, z: s.z, h, yaw: s.yaw };
  else damaged.push('pos');
  return { seed: s.seed, visited, found, elapsed, distance, last, gen, pos, damaged };
}

// the save for the map generator `gen`: a position saved on another generator's map means nothing here
export function loadGame(gen = 1) {
  const s = parseSave(readJson(SAVE_KEY));
  if (s && s.gen !== gen) s.pos = null;
  return s;
}

export function saveGame(s) { writeJson(SAVE_KEY, { v: 1, ...s }); }

export function clearGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function loadSettings() {
  const s = readJson(SETTINGS_KEY) || {};
  return {
    volume: Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : DEFAULT_SETTINGS.volume,
    quality: ['auto', 'high', 'mid', 'low'].includes(s.quality) ? s.quality : DEFAULT_SETTINGS.quality,
    showFps: s.showFps === true,
    bgm: s.bgm === true,
  };
}

export function saveSettings(s) { writeJson(SETTINGS_KEY, s); }

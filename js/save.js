// localStorage persistence. Every access is guarded: private mode / blocked storage just means no save.
const SAVE_KEY = 'deepend.save.v1';
const SETTINGS_KEY = 'deepend.settings.v1';
const MAX_COORD = 500000;
const DEFAULT_SETTINGS = { volume: 0.8, quality: 'auto', showFps: false };

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function writeJson(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

const finite = (...v) => v.every(Number.isFinite);

export function loadGame() {
  const s = readJson(SAVE_KEY);
  if (!s || s.v !== 1 || !finite(s.seed, s.x, s.z, s.yaw, s.elapsed, s.distance)) return null;
  // chunk keys hold |chunk| < 32768 (524 km); anything near that is not a real walk
  if (Math.abs(s.x) > MAX_COORD || Math.abs(s.z) > MAX_COORD || s.elapsed < 0 || s.distance < 0) return null;
  if (!Array.isArray(s.visited) || s.visited.length !== 4 || !Array.isArray(s.found)) return null;
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
  };
}

export function saveSettings(s) { writeJson(SETTINGS_KEY, s); }

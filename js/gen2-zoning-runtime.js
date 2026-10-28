// Fixed planning domain for the cross-floor bridges (S2 slice 1, work/s2-plan-c2c_5b2e.md). The S1 plan (js/gen2-zoning.js) is built over a finite
// window of cells; the game world is unbounded and streams cells in any order. A bridge decision must not depend on which cells were generated
// first, so the world is cut into fixed planning tiles of TILE_DISTRICTS x TILE_DISTRICTS districts (4 x 4 districts = 8 x 8 cells, the S1 corpus
// size). A tile is planned once, whole, on the BASE World2 (no S2 applied): buildZoningPlan(collectZoningInputs(world, cellsOfTile)).
//
//   zoningDecision(seed, borderId) -> { borderId, owner, status, record?, reason? }, a function of (seed, borderId) alone:
//     'accepted'  the S1 plan of the owner tile bridges this border; `record` is the plan entry (frozen, read-only)
//     'rejected'  the border drew a bridge and the plan refused it; `reason` is the S1 reason
//     'undrawn'   the border did not draw a bridge; no tile is built to say so
//     'tile-edge' the two districts lie in two tiles; such a border is never bridged; no tile is built to say so
//   A tile-edge border is checked before the draw, so a drawn tile-edge border reports 'tile-edge'.
//   owner: the id of the tile that holds district (a, b) of `db:<axis>:a,b`. For an inner border it is the only tile that holds both districts.
//   For a tile-edge border it is the lower-index tile of the pair, so both sides of a border always name the same owner.
//
// Limit: a plan sees the routes inside its tile only. A route that leaves the tile is unknown here, so the S1 ratio and the "1F stays joined"
// check hold for the tile, not for the unbounded world. Slice 6 re-verifies every candidate by walking the real world and may refuse it.
//
// Pure data, no I/O. js/gen2.js must not import this file or js/gen2-zoning.js: the game gets a provider (createZoningProvider) injected.
import { World2 } from './gen2.js';
import { borderDrawn, buildZoningPlan, collectZoningInputs, parseBorderId } from './gen2-zoning.js';

export const TILE_DISTRICTS = 4;
const TILE_CELLS = TILE_DISTRICTS * 2;   // a district is 2 x 2 cells
const MAX_TILES = 16;                    // cached tile plans per provider; the least recently used one goes first

const bad = (msg) => new TypeError(msg);
const mod = (n, m) => ((n % m) + m) % m;
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

// ---- the tiles ----
export const tileId = (ti, tj) => {
  if (!Number.isSafeInteger(ti) || !Number.isSafeInteger(tj)) throw bad('a tile is named by two integers');
  return `zt:${ti},${tj}`;
};
export function parseTileId(id) {
  const m = /^zt:(-?\d+),(-?\d+)$/.exec(String(id));
  if (!m) throw bad(`not a tile id: ${id}`);
  return { ti: Number(m[1]), tj: Number(m[2]) };
}
export const districtTile = (a, b) => ({ ti: Math.floor(a / TILE_DISTRICTS), tj: Math.floor(b / TILE_DISTRICTS) });

export function tileOf(border) {
  const { a, b } = parseBorderId(border), { ti, tj } = districtTile(a, b);
  return tileId(ti, tj);
}
// the second district of the border lies in the next tile
export function isTileEdge(border) {
  const { axis, a, b } = parseBorderId(border);
  return mod(axis === 'x' ? a : b, TILE_DISTRICTS) === TILE_DISTRICTS - 1;
}
// the cells [i, j] of a tile, row by row
export function tileCells(tile) {
  const { ti, tj } = parseTileId(tile), cells = [];
  for (let j = 0; j < TILE_CELLS; j++) for (let i = 0; i < TILE_CELLS; i++) cells.push([ti * TILE_CELLS + i, tj * TILE_CELLS + j]);
  return cells;
}

// ---- the provider: one cache of tile plans over one way to make the base world ----
// makeWorld(seed) must return a fresh base World2 (no S2 applied) and be deterministic in the seed. options.maxTiles bounds the cache.
export function createZoningProvider(makeWorld, { maxTiles = MAX_TILES } = {}) {
  const cache = new Map();   // `${seed}|${tile}` -> { seed, tile, inputs, plan }, oldest first

  function planTile(seed, tile) {
    parseTileId(tile);
    const key = `${seed}|${tile}`, hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
    const inputs = collectZoningInputs(makeWorld(seed), tileCells(tile)), entry = { seed, tile, inputs, plan: deepFreeze(buildZoningPlan(inputs)) };
    cache.set(key, entry);
    while (cache.size > Math.max(1, maxTiles)) cache.delete(cache.keys().next().value);
    return entry;
  }

  function zoningDecision(seed, border) {
    const owner = tileOf(border);
    if (isTileEdge(border)) return { borderId: border, owner, status: 'tile-edge' };
    if (!borderDrawn(seed, border)) return { borderId: border, owner, status: 'undrawn' };
    const { plan } = planTile(seed, owner), record = plan.borders.find((b) => b.id === border);
    if (record) return { borderId: border, owner, status: 'accepted', record };
    const refused = plan.rejected.find((r) => r.id === border);
    if (!refused) throw new Error(`the plan of ${owner} has no answer for the drawn border ${border}`);
    return { borderId: border, owner, status: 'rejected', reason: refused.reason };
  }

  return { planTile, zoningDecision, clearCache: () => cache.clear(), cacheSize: () => cache.size };
}

// ---- the default provider: the base World2 of a seed ----
const base = createZoningProvider((seed) => new World2(seed));
export const planTile = base.planTile;
export const zoningDecision = base.zoningDecision;
export const clearZoningCache = base.clearCache;

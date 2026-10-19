// Facilities on region floor (batch 6 step 3): a tower is a 2 × 2 platform 1.5-3 m up, reached by a ladder (caged in a
// pillar pool) or a spiral stair, with a slide off one side. Some stand where the land asks for them (pillar pools, pools a
// slide can land in), the rest are scattered, more of them as the tension rises. A tower is only kept when it clips no
// wall, has 2 m of headroom and leaves every tile its chunk could reach still reachable. Pure data, no three.js.
import { FLOOR, SHALLOW, SPIRAL, DIRS, STEP_UP, STEP_DOWN, walkable, groundWater } from './tiles.js';
import { addSpiral, tryAddSlide, gridReach, edgeOf, walkTop, upTop, ladderLinks } from './levels.js';

export const TOWER_SHARE = [0.03, 0.14];   // of region chunks, from tension 0 to 1, a scattered tower is tried
export const POOL_TOWER = 0.35;           // chunks with a pillar pool in them try a caged-ladder tower this often
export const SLIDE_TOWER = 0.12;          // chunks with a pool in them try a tower whose slide lands in it this often
export const SLIDE_SHARE = 0.6;           // of the other towers, a slide is tried off this many
export const TOWER_H = [1.6, 3];          // platform height over its foot, before the headroom cuts it down
const TOWER_ROOM = 2.2;   // headroom over a platform or tread, as over any floor
const TOWER_SWEEP = Math.PI * 1.5, TOWER_SPIRAL_R = 2.06;   // a tower's spiral reaches over its square's edge onto the platform

const twStandable = (g, i) => (g.tiles[i] === FLOOR || g.tiles[i] === SHALLOW) && !g.block[i];
const twAt = (x, z) => z * 16 + x;
const twInner = (x, z) => x >= 1 && z >= 1 && x <= 14 && z <= 14;

// tiles a walker reaches from the chunk's edge, standing on the ground (or a spiral's high treads)
function twReachable(g) {
  const starts = [];
  for (let t = 0; t < 16; t++) for (const [x, z] of [[t, 0], [t, 15], [0, t], [15, t]]) if (twStandable(g, twAt(x, z))) starts.push([x, z, 0]);
  const ok = gridReach(g, starts), out = new Uint8Array(256);
  for (let i = 0; i < 256; i++) out[i] = ok(i % 16, i >> 4, 0) || ok(i % 16, i >> 4, 1) ? 1 : 0;
  return out;
}

// tiles from which a walker gets back out to the chunk's edge (the way back up out of a pool may differ from the way in):
// a walk backwards from the edge, where a step from a tile onto one already known is a step a body can take
function twEscape(g) {
  const out = new Uint8Array(256), q = [];
  const top = (x, z, px, pz) => { const i = twAt(x, z), a = walkTop(g, i, px, pz), b = upTop(g, i, px, pz); return [a, b].filter((v) => v !== null); };
  for (let t = 0; t < 16; t++) for (const [x, z] of [[t, 0], [t, 15], [0, t], [15, t]]) if (twStandable(g, twAt(x, z)) && !out[twAt(x, z)]) { out[twAt(x, z)] = 1; q.push([x, z]); }
  for (let k = 0; k < q.length; k++) {
    const [x, z] = q[k];
    const near = DIRS.map(([dx, dz]) => [x + dx, z + dz, dx, dz]).concat(ladderLinks(g.ladders, x, z).map(([a, b]) => [a, b, 0, 0]));
    for (const [nx, nz, dx, dz] of near) {
      if (nx < 0 || nz < 0 || nx > 15 || nz > 15 || out[twAt(nx, nz)]) continue;
      let ok = !dx && !dz;   // a ladder goes both ways
      if (!ok) {
        const mx = x + 0.5 + dx * 0.5, mz = z + 0.5 + dz * 0.5, here = top(x, z, mx - dx * 0.02, mz - dz * 0.02), there = top(nx, nz, mx + dx * 0.02, mz + dz * 0.02);
        ok = there.some((a) => here.some((b) => b - a <= STEP_UP && a - b <= STEP_DOWN));   // from there onto here
      }
      if (ok) { out[twAt(nx, nz)] = 1; q.push([nx, nz]); }
    }
  }
  return out;
}

// undo-able edits of a grid's tiles and lists
function twSnapshot(g) {
  return { tiles: g.tiles.slice(), h: g.h.slice(), block: g.block.slice(), wet: g.wet.slice(), form: g.form.slice(), spirals: g.spirals.length, slides: g.slides.length, ladders: g.ladders.length, noRail: g.noRail.length };
}
function twRestore(g, s) {
  g.tiles.set(s.tiles); g.h.set(s.h); g.block.set(s.block); g.wet.set(s.wet); g.form.set(s.form);
  g.spirals.length = s.spirals; g.slides.length = s.slides; g.ladders.length = s.ladders; g.noRail.length = s.noRail;
}

// the 2 × 2 platform twAt (px, pz) is free: open floor of one height, clear of walls and anything blocking, with TOWER_ROOM under
// the ceiling at height H over it
function twPlatformFree(g, px, pz, H, clear) {
  const base = g.h[twAt(px, pz)];
  // keep a tile clear of rails already there (a small pool's), so none ends up facing the platform
  if (g.rails.some((rl) => Math.min(rl.x0, rl.x1) >= px - 2 && Math.max(rl.x0, rl.x1) <= px + 4 && Math.min(rl.z0, rl.z1) >= pz - 2 && Math.max(rl.z0, rl.z1) <= pz + 4)) return false;
  for (let z = pz; z < pz + 2; z++) for (let x = px; x < px + 2; x++) {
    const i = twAt(x, z);
    if (!twInner(x, z) || !twStandable(g, i) || g.wet[i] || Math.abs(g.h[i] - base) > 1e-6 || clear(x, z)) return false;
    if (g.ceilT[i] - (base + H) < TOWER_ROOM - 1e-6) return false;
  }
  return true;
}

function twRaise(g, px, pz, top) {
  for (let z = pz; z < pz + 2; z++) for (let x = px; x < px + 2; x++) { g.tiles[twAt(x, z)] = FLOOR; g.h[twAt(x, z)] = top; g.wet[twAt(x, z)] = 0; g.form[twAt(x, z)] = 0; }
}

// a ladder up side d of the platform, from the tile in front of platform tile (x, z)
function twTryLadder(g, px, pz, top, r, arche) {
  const sides = [];
  for (let d = 0; d < 4; d++) for (const k of [0, 1]) {
    const [dx, dz] = DIRS[d];
    const x = dx > 0 ? px + 1 : dx < 0 ? px : px + k, z = dz > 0 ? pz + 1 : dz < 0 ? pz : pz + k;
    const fx = x + dx, fz = z + dz, bx = fx + dx, bz = fz + dz;
    if (!twInner(fx, fz) || !twInner(bx, bz) || !twStandable(g, twAt(fx, fz)) || !twStandable(g, twAt(bx, bz))) continue;
    if (Math.abs(g.h[twAt(fx, fz)] - g.h[twAt(bx, bz)]) > 0.3) continue;
    sides.push([d, x, z, fx, fz]);
  }
  if (!sides.length) return null;
  const [d, x, z, fx, fz] = sides[(r() * sides.length) | 0], [dx, dz] = DIRS[d];
  const l = { x: x + 0.5 + dx * 0.5, z: z + 0.5 + dz * 0.5, nx: dx, nz: dz, h0: g.h[twAt(fx, fz)], h1: top, cage: !!arche && arche(fx, fz) === 'pillarpool' };   // every ladder standing in a pillar pool is caged
  g.ladders.push(l);
  const [a, b, c, e] = edgeOf(x, z, d);
  g.noRail.push({ x0: a, z0: b, x1: c, z1: e });
  return l;
}

// a spiral stair whose top tread steps onto the platform: its 4 × 4 square of open floor beside the platform
function twTrySpiral(g, px, pz, top, r, clear) {
  const opts = [];
  for (let cz = 2; cz <= 14; cz++) for (let cx = 2; cx <= 14; cx++) for (let k = 0; k < 4; k++) for (const sense of [1, -1]) {
    const a0 = k * Math.PI / 2, end = a0 + sense * TOWER_SWEEP;
    const ux = Math.round(Math.cos(end)), uz = Math.round(Math.sin(end));   // outwards at the top of the flight
    // the highest tread's outer tile, beside the axis on the treads' side
    const p = [cx + 1.6 * Math.cos(end - sense * 0.25), cz + 1.6 * Math.sin(end - sense * 0.25)];
    const tx = Math.floor(p[0]), tz = Math.floor(p[1]);
    const ax = tx + ux, az = tz + uz;   // the platform tile the flight runs onto
    if (!(ax >= px && ax <= px + 1 && az >= pz && az <= pz + 1)) continue;
    // the stair's square: open level floor at the platform's foot, nothing of the platform in it
    let ok = cx - 2 >= 1 && cz - 2 >= 1 && cx + 1 <= 14 && cz + 1 <= 14;
    const base = g.h[twAt(cx - 2, cz - 2)];
    for (let z = cz - 2; z < cz + 2 && ok; z++) for (let x = cx - 2; x < cx + 2; x++) {
      const i = twAt(x, z);
      if (!twStandable(g, i) || clear(x, z) || g.tiles[i] !== FLOOR || g.wet[i] || Math.abs(g.h[i] - base) > 1e-6 || (x >= px && x <= px + 1 && z >= pz && z <= pz + 1) || g.ceilT[i] - top < TOWER_ROOM - 1e-6) { ok = false; break; }
    }
    // the treads reach 6 cm past the square's sides: nothing solid there
    for (let t = -2; t < 2 && ok; t++) for (const [x, z] of [[cx + t, cz - 3], [cx + t, cz + 2], [cx - 3, cz + t], [cx + 2, cz + t]]) {
      const i = twAt(x, z);
      if (g.tiles[i] !== FLOOR && g.tiles[i] !== SHALLOW && !(x >= px && x <= px + 1 && z >= pz && z <= pz + 1)) { ok = false; break; }
    }
    if (ok) opts.push([cx, cz, a0, sense, base]);
  }
  if (!opts.length) return null;
  const [cx, cz, a0, sense, base] = opts[(r() * opts.length) | 0];
  return addSpiral(g, cx, cz, a0, sense, base, top, TOWER_SPIRAL_R);
}

// one tower in chunk grid g (16 × 16, region floor at height 0). want: { cage, wet } — a caged ladder (pillar pools), a
// slide that must land in water. Returns the tower or null; nothing is left changed when it does not fit
export function tryTower(g, r, want = {}) {
  g.ladders ||= [];
  g.towers ||= [];
  const clear = want.clear || (() => false);   // tiles that must stay plain floor (World.keepClear: doorways, the start's spine)
  const before = twReachable(g);
  before.out = twEscape(g);
  const H = TOWER_H[0] + r() * (TOWER_H[1] - TOWER_H[0]);
  const sites = [];
  for (let pz = 2; pz <= 12; pz++) for (let px = 2; px <= 12; px++) {
    const i = twAt(px, pz);
    if (want.cage && (g.tiles[i] !== SHALLOW || want.arche(px, pz) !== 'pillarpool')) continue;
    if (want.arche && want.arche(px, pz) === 'sunk') continue;   // a sunken walkway is too narrow a way to stand a tower on
    // as high as the headroom allows, never under 1.5 m
    // counted from the water surface in a pool, so the platform stands 1.5 m and more out of it
    const base = g.tiles[i] === SHALLOW ? Math.max(g.h[i], groundWater(g, i)) : g.h[i];
    let h = H;
    for (let z = pz; z < pz + 2; z++) for (let x = px; x < px + 2; x++) h = Math.min(h, g.ceilT[twAt(x, z)] - base - TOWER_ROOM);
    h = Math.round(h * 10) / 10;
    if (h >= 1.5 && twPlatformFree(g, px, pz, base + h - g.h[i], clear)) sites.push([px, pz, base + h - g.h[i]]);
  }
  for (let tries = 0; tries < 8 && sites.length; tries++) {
    const [px, pz, h] = sites.splice((r() * sites.length) | 0, 1)[0];
    const snap = twSnapshot(g), top = g.h[twAt(px, pz)] + h;
    // a spiral stair half the time where its 4 × 4 square of dry floor fits beside the platform, else a ladder
    const spiral = !want.cage && !(want.arche && want.arche(px, pz) === 'pillarpool') && r() < 0.5;
    twRaise(g, px, pz, top);
    let made = spiral ? twTrySpiral(g, px, pz, top, r, clear) : null, access = made ? 'spiral' : 'ladder';
    if (!made) made = twTryLadder(g, px, pz, top, r, want.arche);
    if (!made || !twKeepsWay(g, before, px, pz)) { twRestore(g, snap); continue; }
    // a slide off a side the access does not use, landing in shallow water (spec A17)
    const slideSnap = twSnapshot(g);
    let slid = false;
    for (const d of want.wet || r() < SLIDE_SHARE ? twShuffled([0, 1, 2, 3], r) : []) {
      const [dx, dz] = DIRS[d];
      for (const k of [0, 1]) {
        const ux = dx > 0 ? px + 1 : dx < 0 ? px : px + k, uz = dz > 0 ? pz + 1 : dz < 0 ? pz : pz + k;
        if (g.noRail.some((e) => twSameEdge(e, edgeOf(ux, uz, d)))) continue;
        if (tryAddSlide(g, ux, uz, dx, dz, r, { deck: true })) { slid = true; break; }
      }
      if (slid) break;
    }
    // the tube must leave the way up free: the ladder's foot, the spiral's treads
    // and must not hang over a sunken walkway, the only way across its deep water
    const access_ = () => (access === 'ladder' ? [twFootOf(made)] : twSpiralTiles(made)).every((i) => !g.block[i]);
    const walkways = () => g.block.every((b, i) => !b || slideSnap.block[i] || (!clear(i % 16, i >> 4) && !(want.arche && want.arche(i % 16, i >> 4) === 'sunk')));
    if (slid && (!twKeepsWay(g, before, px, pz) || !access_() || !walkways())) { twRestore(g, slideSnap); slid = false; }
    if (want.wet && !slid) { twRestore(g, snap); continue; }
    const t = { x0: px, z0: pz, x1: px + 1, z1: pz + 1, h: top, access, slide: slid, terrain: !!(want.cage || want.wet) };
    g.towers.push(t);
    return t;
  }
  return null;
}

const twFootOf = (l) => twAt(Math.floor(l.x + l.nx * 0.5), Math.floor(l.z + l.nz * 0.5));
const twSpiralTiles = (s) => { const out = []; for (let z = s.z - 2; z < s.z + 2; z++) for (let x = s.x - 2; x < s.x + 2; x++) out.push(twAt(x, z)); return out; };
const twSameEdge = (e, [a, b, c, d]) => e.x0 === a && e.z0 === b && e.x1 === c && e.z1 === d;
const twShuffled = (list, r) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// every tile reachable before the tower (but its own) still is, and so is its platform
function twKeepsWay(g, before, px, pz) {
  const after = twReachable(g), out = twEscape(g);
  for (let z = pz; z < pz + 2; z++) for (let x = px; x < px + 2; x++) if (!after[twAt(x, z)]) return false;
  for (let i = 0; i < 256; i++) if (before[i] && (!after[i] || (before.out[i] && !out[i])) && walkable(g.tiles[i]) && g.tiles[i] !== SPIRAL && !g.block[i]) {
    const x = i % 16, z = i >> 4;
    if (!(x >= px && x <= px + 1 && z >= pz && z <= pz + 1)) return false;
  }
  return true;
}

// the towers of a region chunk: by the land first (pillar pools, pools), then scattered by the tension
export function addFacilities(g, r, tension, arche, clear) {
  g.ladders ||= [];
  g.towers ||= [];
  let pillar = 0, pool = 0;
  for (let i = 0; i < 256; i++) {
    if (g.tiles[i] !== SHALLOW) continue;
    if (arche(i % 16, i >> 4) === 'pillarpool') pillar++; else pool++;
  }
  if (pillar >= 40 && r() < POOL_TOWER) tryTower(g, r, { cage: true, arche, clear });
  else if (pool >= 20 && r() < SLIDE_TOWER) tryTower(g, r, { wet: true, arche, clear });
  if (!g.towers.length && r() < TOWER_SHARE[0] + (TOWER_SHARE[1] - TOWER_SHARE[0]) * tension) tryTower(g, r, { arche, clear });
}


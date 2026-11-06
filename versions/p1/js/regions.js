// Continuous regions (batch 6): the ground floor is no longer one room per chunk. World tiles are grouped into regions of
// 4 m blocks (a two-level Voronoi of jittered sites: 40% of the coarse 36 m cells stay whole, the rest split into ~14 m
// cells), and every region draws its terrain from a stack of layers, each with several algorithms and continuous
// parameters: water (dry, ankle-deep, pools of six shapes, flooded, deep with a winding sunken walkway), a raised floor,
// columns, partitions, lamps, and what stands on its boundary (nothing, a broken wall, a wall with openings, a column row).
// Everything is a function of world tile coordinates, so chunks cut from it join without seams. The local steps (pools
// stepping down from their rim, cellular automata, lamps keeping clear of walls) run on a window MARGIN tiles wider than
// the chunk, enough that every tile inside comes out the same whichever chunk computes it.
// B1 (batch 6 step 2) runs a second generator of its own flavour: low ceilings, maze partitions, water that follows one
// field of land height shared by all its regions (winding channels along a contour, basins in the low ground, ditches).
// Pure data, no three.js.
import { hash2, mulberry32 } from './rng.js';
import { CHUNK, FLOOR, WALL, SHALLOW, DEEP, BARS, STEP_UP, STEP_DOWN, SHALLOW_FLOOR, SHALLOW_DEPTH, DEEP_FLOOR, FORM_CYL, FORM_DEEPER, TAU, newGrid } from './tiles.js';
import { POOL_STEP, edgeOf } from './levels.js';

export const BLOCK = 4;            // region outlines follow a 4 m lattice
export const COARSE = 36, FINE = 14;
export const BIG_SHARE = 0.4;      // coarse cells that stay one big region
export const MARGIN = 14;
export const LEDGE_H = 0.55, LEDGE_EVERY = 3;   // a ledge platform and how often its edge has a half step up
export const RAISE_STEP = 0.44;    // a raised floor climbs this much a tile inward from its edge (under the 0.45 a body climbs)
export const PILLAR_POOL_SHARE = 0.3;   // of big regions: a flooded hall of sparse round columns
export const SUNK_REGION_SHARE = 0.05;    // of regions: deep water crossed by winding walkways just under the surface
export const SMALL_POOL = 40, RAIL_SHARE = 0.7;   // pools of up to SMALL_POOL tiles are railed this often
export const CEIL_MIN = 3, CEIL_MAX = 8, B1_CEIL = [2.2, 3];   // a region's ceiling over its floor at 0 (m)
export const SEALED_SHARE = 0.4;   // of other regions of 10 blocks or more: a sealed room, seen through barred openings, never entered
const W = CHUNK + 2 * MARGIN;
const WATER = 1, DEEPW = 2, ANKLE = 3;   // water kinds per tile

const canStepH = (from, to) => to - from <= STEP_UP + 1e-6 && from - to <= STEP_DOWN + 1e-6;
const rh01 = (seed, a, b, salt) => hash2(seed, a, b, salt) / 4294967296;
const pick = (r, list) => list[(r() * list.length) | 0];
const weighted = (r, pairs) => { let v = r() * pairs.reduce((s, p) => s + p[1], 0); for (const [k, w] of pairs) { if ((v -= w) < 0) return k; } return pairs[0][0]; };
const smooth = (t) => t * t * (3 - 2 * t);

// value noise in [0, 1) with features about `scale` tiles across
function vnoise(seed, salt, x, z, scale) {
  const fx = x / scale, fz = z / scale, ix = Math.floor(fx), iz = Math.floor(fz), tx = smooth(fx - ix), tz = smooth(fz - iz);
  const v = (a, b) => rh01(seed, a, b, salt);
  return (v(ix, iz) * (1 - tx) + v(ix + 1, iz) * tx) * (1 - tz) + (v(ix, iz + 1) * (1 - tx) + v(ix + 1, iz + 1) * tx) * tz;
}

export const coarseId = (ci, cj) => ((ci + 4096) * 8192 + (cj + 4096)) * 2;
export const fineId = (fi, fj) => ((fi + 16384) * 32768 + (fj + 16384)) * 2 + 1;

// a chunk's window work buffers, kept between chunks so walking makes no garbage (one set per caller that may be mid-chunk)
const windowBuffers = (N = W * W) => ({
  ids: new Float64Array(N), tiles: new Uint8Array(N), water: new Uint8Array(N), up: new Uint8Array(N), form: new Uint8Array(N),
  keep: new Uint8Array(N), fixedH: new Float32Array(N), shut: new Uint8Array(N), dW: new Int16Array(N), dU: new Int16Array(N),
  upSize: new Int32Array(N), tt: new Uint8Array(N), hh: new Float32Array(N), ff: new Uint8Array(N), wetA: new Uint8Array(N),
  pocket: new Uint8Array(N), stamp: new Int32Array(N), q: new Int32Array(N), seen: new Int32Array(N),
});

export class Regions {
  // clear(x, z): world tiles that must stay plain dry floor (see World.keepClear); a sealed room keeps 2 tiles off them
  // flavour 'b1': the basement's generator
  constructor(seed, tension = () => 0, clear = () => false, flavour = '') {
    this.seed = seed >>> 0;
    this.b1 = flavour === 'b1';
    this.tension = tension;
    this.clear = clear;
    this.blocks = new Map();
    this.owners = new Map();
    this.merged = new Map();
    this.params = new Map();
    this.depths = new Map();   // region → pool depth: fixed the first time, so chunks generated later still match
    this.ceils = new Map();    // region → ceiling height, fixed the same way
    this.ready = new Map();    // chunks worked out ahead by step(), waiting for chunk()
    this.job = null;
  }

  coarseSite(ci, cj) {
    return [(ci + 0.15 + 0.7 * rh01(this.seed, ci, cj, 8001)) * COARSE, (cj + 0.15 + 0.7 * rh01(this.seed, ci, cj, 8002)) * COARSE];
  }

  fineSite(fi, fj) {
    return [(fi + 0.1 + 0.8 * rh01(this.seed, fi, fj, 8011)) * FINE, (fj + 0.1 + 0.8 * rh01(this.seed, fi, fj, 8012)) * FINE];
  }

  isBig(ci, cj) { return rh01(this.seed, ci, cj, 8003) < BIG_SHARE; }

  nearestCoarse(px, pz) {
    const i0 = Math.floor(px / COARSE), j0 = Math.floor(pz / COARSE);
    let best = Infinity, bi = 0, bj = 0;
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
      const [sx, sz] = this.coarseSite(i, j), d = (sx - px) ** 2 + (sz - pz) ** 2;
      if (d < best) { best = d; bi = i; bj = j; }
    }
    return [bi, bj];
  }

  fineOwner(fi, fj) {
    const k = fineId(fi, fj);
    let o = this.owners.get(k);
    if (o === undefined) {
      const [sx, sz] = this.fineSite(fi, fj), [ci, cj] = this.nearestCoarse(sx, sz);
      o = coarseId(ci, cj);
      if (this.owners.size > 200000) this.owners.clear();
      this.owners.set(k, o);
    }
    return o;
  }

  // the region a 4 m block belongs to: its Voronoi cell, unless that cell is a sliver of under 4 blocks (a fine cell
  // clipped by its coarse cell's edge), which joins the neighbour it touches most
  blockId(bx, bz) {
    const k = (bx + 65536) * 131072 + (bz + 65536);
    let id = this.merged.get(k);
    if (id !== undefined) return id;
    id = this.rawId(bx, bz);
    const m = this.sliver(id, bx, bz);
    if (m !== undefined) id = m;
    if (this.merged.size > 400000) this.merged.clear();
    this.merged.set(k, id);
    return id;
  }

  // a sliver's blocks are found by a flood fill over raw ids (a sliver is small, so it stops quickly). A cell may fall in
  // several pieces, so this is decided per piece, never per id
  sliver(id, bx, bz) {
    if (id % 2 === 0) return undefined;
    const seen = new Set([bx + ',' + bz]), q = [[bx, bz]];
    for (let h = 0; h < q.length && q.length < 4; h++) {
      const [x, z] = q[h];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = x + dx, b = z + dz, key = a + ',' + b;
        if (seen.has(key) || this.rawId(a, b) !== id) continue;
        seen.add(key); q.push([a, b]);
      }
    }
    let m;
    if (q.length < 4) {
      const touch = new Map();
      for (const [x, z] of q) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const o = this.rawId(x + dx, z + dz);
        if (o !== id) touch.set(o, (touch.get(o) || 0) + 1);
      }
      let best = -1;
      for (const [o, c] of touch) if (c > best || (c === best && o < m)) { best = c; m = o; }
    }
    return m;
  }

  rawId(bx, bz) {
    const k = (bx + 65536) * 131072 + (bz + 65536);
    let id = this.blocks.get(k);
    if (id !== undefined) return id;
    const px = bx * BLOCK + BLOCK / 2, pz = bz * BLOCK + BLOCK / 2;
    const [ci, cj] = this.nearestCoarse(px, pz), c = coarseId(ci, cj);
    id = c;
    if (!this.isBig(ci, cj)) {
      const i0 = Math.floor(px / FINE), j0 = Math.floor(pz / FINE);
      let best = Infinity;
      for (let j = j0 - 2; j <= j0 + 2; j++) for (let i = i0 - 2; i <= i0 + 2; i++) {
        if (this.fineOwner(i, j) !== c) continue;
        const [sx, sz] = this.fineSite(i, j), d = (sx - px) ** 2 + (sz - pz) ** 2;
        if (d < best) { best = d; id = fineId(i, j); }
      }
    }
    if (this.blocks.size > 400000) this.blocks.clear();
    this.blocks.set(k, id);
    return id;
  }

  tileId(x, z) { return this.blockId(Math.floor(x / BLOCK), Math.floor(z / BLOCK)); }

  // a region's blocks: a flood fill (8-connected) from the block holding its site, or, when a merged sliver or a clipped
  // cell leaves the site outside, from the nearest block of it within 18 blocks
  blocksOf(id, sbx, sbz) {
    let start = this.blockId(sbx, sbz) === id ? [sbx, sbz] : null;
    for (let r = 1; r <= 18 && !start; r++) for (let bz = sbz - r; bz <= sbz + r && !start; bz++) for (let bx = sbx - r; bx <= sbx + r; bx++) {
      if (Math.max(Math.abs(bx - sbx), Math.abs(bz - sbz)) === r && this.blockId(bx, bz) === id) { start = [bx, bz]; break; }
    }
    if (!start) return [];
    const seen = new Set([start[0] + ',' + start[1]]), out = [start];
    for (let k = 0; k < out.length; k++) {
      const [x, z] = out[k];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const a = x + dx, b = z + dz, key = a + ',' + b;
        if (seen.has(key)) continue;
        seen.add(key);
        if (this.blockId(a, b) === id) out.push([a, b]);
      }
    }
    return out;
  }

  // everything a region draws, decided once from its id
  region(id) {
    let P = this.params.get(id);
    if (P) return P;
    const big = id % 2 === 0;
    const rest = (id - (id % 2)) / 2;
    const [a, b] = big ? [Math.floor(rest / 8192) - 4096, (rest % 8192) - 4096] : [Math.floor(rest / 32768) - 16384, (rest % 32768) - 16384];
    const [sx, sz] = big ? this.coarseSite(a, b) : this.fineSite(a, b);
    // its blocks: a scan round the site (a region never reaches further than about two of its cells)
    const blocks = this.blocksOf(id, Math.floor(sx / BLOCK), Math.floor(sz / BLOCK));
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, mx = 0, mz = 0;
    for (const [bx, bz] of blocks) {
      x0 = Math.min(x0, bx * BLOCK); z0 = Math.min(z0, bz * BLOCK); x1 = Math.max(x1, bx * BLOCK + BLOCK - 1); z1 = Math.max(z1, bz * BLOCK + BLOCK - 1);
      mx += bx * BLOCK + 2; mz += bz * BLOCK + 2;
    }
    const n = Math.max(1, blocks.length);
    P = { id, big, a, b, blocks, x0, z0, x1, z1, cx: mx / n, cz: mz / n, area: blocks.length * BLOCK * BLOCK };
    const r = mulberry32(hash2(this.seed, a, b, big ? 8100 : 8101));
    P.salt = (hash2(this.seed, a, b, big ? 8102 : 8103) & 0xffff) + 9000;
    // the boundary segment kept open towards each neighbour region (the cheapest by hash), so no region is shut in
    P.forced = new Map();
    const best = new Map();
    for (const [bx, bz] of blocks) {
      for (let d = 0; d < 4; d++) {
        const nb = this.blockId(bx + DX4[d], bz + DZ4[d]);
        if (nb === id) continue;
        const v = hash2(this.seed, bx * 4 + d, bz, 8300), cur = best.get(nb);
        if (cur === undefined || v < cur) { best.set(nb, v); P.forced.set(nb, segKey(bx, bz, d)); }
      }
    }
    // archetype
    P.arche = this.b1 ? '' : big && r() < PILLAR_POOL_SHARE ? 'pillarpool' : r() < SUNK_REGION_SHARE && blocks.length >= 20 ? 'sunk' : '';
    if (this.b1) {   // narrow corridors, water from the land, sparse small lamps
      P.water = weighted(r, [['channel', 25], ['terrain', 50], ['ditch', 25]]);
      P.basin = 0.22 + r() * 0.1;
      P.ankle = 0.25 + r() * 0.1;
      P.pillars = r() < 0.2 ? { algo: 'scatter', cell: 4 + ((r() * 3) | 0), p: 0.4, round: r() < 0.5 } : null;
      P.up = null;
      P.part = weighted(r, [['maze', 85], ['stubs', 10], [null, 5]]);
      if (P.part === 'maze') P.part = { algo: 'maze', cell: r() < 0.75 ? 3 : 4, braid: r() * 0.08 };
      else if (P.part === 'stubs') P.part = { algo: 'stubs', cell: 5 + ((r() * 3) | 0), p: 0.7 };
      P.lamps = { algo: weighted(r, [['scatter', 3], ['dark', 2], ['grid', 2]]) };
    } else if (P.arche === 'pillarpool') {
      P.water = 'flooded';
      P.pillars = { algo: 'grid', sx: 6 + ((r() * 4) | 0), sz: 6 + ((r() * 4) | 0), ox: (r() * 9) | 0, oz: (r() * 9) | 0, miss: 0.08 + r() * 0.2, round: true };
      P.up = null; P.part = null;
      P.lamps = { algo: weighted(r, [['grid', 3], ['dark', 2], ['scatter', 2], ['cluster', 1]]) };
    } else if (P.arche === 'sunk') {
      P.water = 'sunk';
      P.pillars = r() < 0.4 ? { algo: 'scatter', cell: 5 + ((r() * 3) | 0), p: 0.4, round: true } : null;
      P.up = null; P.part = null;
      P.lamps = { algo: weighted(r, [['scatter', 2], ['dark', 2], ['grid', 1]]) };
    } else {
      P.water = weighted(r, [['dry', 30], ['ankle', 15], ['pools', 45], ['flooded', 10]]);
      P.pillars = weighted(r, [[null, 45], ['grid', 25], ['rows', 15], ['scatter', 15]]);
      if (P.pillars === 'grid') P.pillars = { algo: 'grid', sx: 3 + ((r() * 3) | 0), sz: 3 + ((r() * 3) | 0), ox: (r() * 6) | 0, oz: (r() * 6) | 0, miss: r() * 0.25, round: r() < 0.7 };
      else if (P.pillars === 'rows') P.pillars = { algo: 'rows', alongX: r() < 0.5, gap: 2 + ((r() * 2) | 0), every: 5 + ((r() * 4) | 0), o: (r() * 9) | 0, round: r() < 0.7 };
      else if (P.pillars === 'scatter') P.pillars = { algo: 'scatter', cell: 4 + ((r() * 3) | 0), p: 0.35 + r() * 0.3, round: r() < 0.7 };
      P.up = r() < 0.3 ? { algo: pick(r, ['rects', 'disc', 'blob']), H: RAISE_STEP * (1 + ((r() * 3) | 0)), ledge: r() < 0.4 } : null;
      if (P.up && P.up.ledge) P.up.H = LEDGE_H;
      P.part = weighted(r, [[null, 60], ['dashed', 25], ['stubs', 15]]);
      if (P.part === 'dashed') P.part = { algo: 'dashed', alongX: r() < 0.5, every: 6 + ((r() * 4) | 0), run: 2 + ((r() * 3) | 0), gap: 2, o: (r() * 10) | 0, both: r() < 0.35 };
      else if (P.part === 'stubs') P.part = { algo: 'stubs', cell: 7 + ((r() * 3) | 0), p: 0.5 + r() * 0.3 };
      P.lamps = { algo: weighted(r, [['grid', 30], ['strip', 12], ['scatter', 22], ['cluster', 12], ['along', 12], ['dark', 12], ['sky', 10]]) };
    }
    if (P.water === 'pools') {
      P.pool = { algo: pick(r, ['rects', 'disc', 'blob', 'channel', 'ca', 'ring']) };
      Object.assign(P.pool, shapeParams(r, P));
    }
    if (P.up) Object.assign(P.up, shapeParams(r, P));
    if (P.water === 'ankle') P.ankle = 0.2 + r() * 0.2;
    // lamp parameters
    const L = P.lamps;
    L.size = pick(r, [[1, 1], [1, 1], [2, 1], [1, 2], [2, 2]]);
    if (this.b1) L.size = [1, 1];
    if (L.algo === 'grid') { L.sx = L.size[0] + 2 + ((r() * 4) | 0); L.sz = L.size[1] + 2 + ((r() * 4) | 0); L.ox = (r() * 8) | 0; L.oz = (r() * 8) | 0; }
    if (P.arche === 'pillarpool' && L.algo === 'grid') { L.sx = P.pillars.sx; L.sz = P.pillars.sz; L.ox = P.pillars.ox + (P.pillars.sx >> 1); L.oz = P.pillars.oz + (P.pillars.sz >> 1); }
    if (L.algo === 'strip') { L.alongX = r() < 0.5; L.every = 4 + ((r() * 3) | 0); L.len = 3 + ((r() * 2) | 0); L.o = (r() * 6) | 0; }
    L.round = r() < 0.8;
    if (P.water === 'sunk') P.paths = sunkPaths(this, P, r);
    P.sealed = !P.arche && blocks.length >= 10 && r() < SEALED_SHARE ? placeSealed(this, P, r) : null;
    // a small pool (4-40 tiles) is railed all round but for a gap, 7 times in 10. The gap is the rim tile (dry floor that
    // nothing will stand on) with the lowest hash, and the rim tiles round it; only the piece of the pool the gap opens
    // onto is railed (columns or walls may cut a pool in pieces)
    if (P.water === 'pools' && P.pool.algo !== 'ca') {
      const inSealed = (x, z) => P.sealed && x >= P.sealed.x - 1 && z >= P.sealed.z - 1 && x <= P.sealed.x + P.sealed.w && z <= P.sealed.z + P.sealed.d;
      const inner = (x, z) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => this.tileId(x + dx, z + dz) === id);   // off the region's edge
      const standing = (x, z) => inner(x, z) && !this.clear(x, z) && !inSealed(x, z) && !(P.pillars && pillarAt(this.seed, P, x, z)) && !(P.part && partAt(this.seed, P, x, z));
      const water = (x, z) => inShape(this.seed, P, P.pool, x, z) && standing(x, z);   // pool tiles that stay water
      const free = (x, z) => !inShape(this.seed, P, P.pool, x, z) && standing(x, z);
      const pool = [], rim = [];
      for (const [bx, bz] of blocks) for (let z = bz * BLOCK; z < bz * BLOCK + BLOCK; z++) for (let x = bx * BLOCK; x < bx * BLOCK + BLOCK; x++) {
        if (!water(x, z)) continue;
        pool.push([x, z]);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (free(x + dx, z + dz)) rim.push([x + dx, z + dz]);
      }
      P.poolTiles = pool.length;
      if (pool.length >= 4 && pool.length <= SMALL_POOL && rim.length && r() < RAIL_SHARE) {
        let best = rim[0], bv = Infinity;
        for (const [x, z] of rim) { const v = hash2(this.seed, x, z, 8600); if (v < bv) { bv = v; best = [x, z]; } }
        P.rail = { gap: new Set(), pool: new Set() };
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) P.rail.gap.add(tkey(best[0] + dx, best[1] + dz));
        // the piece of the pool beside the gap
        const q = pool.filter(([x, z]) => Math.abs(x - best[0]) + Math.abs(z - best[1]) === 1);
        for (const [x, z] of q) P.rail.pool.add(tkey(x, z));
        for (let k = 0; k < q.length; k++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = q[k][0] + dx, z = q[k][1] + dz;
          if (!P.rail.pool.has(tkey(x, z)) && water(x, z)) { P.rail.pool.add(tkey(x, z)); q.push([x, z]); }
        }
        // rails stand only on the pool's outer rim: dry floor from which the region's edge is in reach (not an island)
        P.rail.out = new Set();
        for (const [x0, z0] of rim) {
          const k0 = tkey(x0, z0);
          if (P.rail.out.has(k0)) continue;
          const seen = new Set([k0]), list = [[x0, z0]];
          let out = false;
          for (let k = 0; k < list.length && !out; k++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const x = list[k][0] + dx, z = list[k][1] + dz, key = tkey(x, z);
            if (seen.has(key) || inShape(this.seed, P, P.pool, x, z)) continue;
            if (this.tileId(x, z) !== id || list.length > 80) { out = true; break; }
            seen.add(key); list.push([x, z]);
          }
          if (out) P.rail.out.add(k0);
        }
      }
    }
    if (this.params.size > 4000) this.params.clear();
    this.params.set(id, P);
    return P;
  }

  // the deepest a region's pools go: 0.4, 0.9 or 1.4 m; deeper ones get commoner with tension (as L10 had per room)
  depthOf(P) {
    let d = this.depths.get(P.id);
    if (d === undefined) {
      const u = rh01(this.seed, P.a, P.b, P.big ? 8110 : 8111), v = rh01(this.seed, P.a, P.b, P.big ? 8112 : 8113);
      d = this.b1 ? (u < 0.3 ? 0.9 : 0.4) : P.arche === 'pillarpool' ? (v < 1 / 3 ? 0.4 : v < 2 / 3 ? 0.9 : 1.4) : u < 0.2 + 0.4 * this.tension() ? (v < 1 / 3 ? 1.4 : 0.9) : 0.4;
      this.depths.set(P.id, d);
    }
    return d;
  }

  // a region's ceiling over its floor at 0: 3-8 m above ground, higher the bigger the region, pushed down by up to half as
  // the tension rises; 2.2-3 m in B1. Never under 2.4 m over a raised floor
  ceilOf(P) {
    let c = this.ceils.get(P.id);
    if (c === undefined) {
      const span = Math.max(P.x1 - P.x0, P.z1 - P.z0) + 1, s = Math.min(1, Math.max(0, (span - 12) / 40));
      const v = 0.75 * s + 0.25 * rh01(this.seed, P.a, P.b, P.big ? 8120 : 8121), squeeze = 1 - 0.5 * this.tension();
      const [lo, hi] = this.b1 ? B1_CEIL : [CEIL_MIN, CEIL_MAX];
      c = lo + (hi - lo) * v * squeeze;
      if (P.up) c = Math.min(hi, Math.max(c, P.up.H + 2.4));
      c = Math.round(c * 20) / 20;
      this.ceils.set(P.id, c);
    }
    return c;
  }

  // work out one region of chunk (cx, cz)'s window that is not cached yet; false when there is none
  prepare(cx, cz) {
    const ox = cx * CHUNK - MARGIN, oz = cz * CHUNK - MARGIN;
    const bx0 = Math.floor(ox / BLOCK), bz0 = Math.floor(oz / BLOCK), nb = Math.ceil((ox + W) / BLOCK) - bx0;
    for (let b = 0; b < nb; b++) for (let a = 0; a < nb; a++) {
      const id = this.blockId(bx0 + a, bz0 + b);
      if (!this.params.has(id)) { this.region(id); return true; }
    }
    return false;
  }

  // chunk (cx, cz) of the region floor as a 16×16 grid. clear(x, z) says which world tiles must stay plain dry floor
  // (beside doorways into chunks that are not region floor, the start area's spine)
  chunk(cx, cz) {
    const key = tkey(cx, cz), done = this.ready.get(key);
    if (done) { this.ready.delete(key); return done; }
    const steps = this.chunkSteps(cx, cz, (this.buf ||= windowBuffers()));
    let r;
    do r = steps.next(); while (!r.done);
    return r.value;
  }

  // one stage of chunk (cx, cz) worked out ahead, so no single frame builds a whole chunk; false once it is ready for chunk()
  step(cx, cz) {
    const key = tkey(cx, cz);
    if (this.ready.has(key)) return false;
    if (this.job?.key !== key) this.job = { key, steps: this.chunkSteps(cx, cz, (this.jobBuf ||= windowBuffers())) };
    const r = this.job.steps.next();
    if (!r.done) return true;
    this.job = null;
    if (this.ready.size > 64) this.ready.clear();
    this.ready.set(key, r.value);
    return false;
  }

  *chunkSteps(cx, cz, B) {
    const clear = this.clear;
    const ox = cx * CHUNK - MARGIN, oz = cz * CHUNK - MARGIN, N = W * W;
    for (const k of ['tiles', 'water', 'up', 'form', 'keep', 'shut', 'tt', 'ff', 'wetA', 'pocket', 'stamp']) B[k].fill(0);
    B.hh.fill(0); B.fixedH.fill(NaN); B.upSize.fill(-1);
    const { ids, tiles, water, up, form, keep, fixedH, shut, upSize, tt, hh, ff, wetA, pocket, stamp } = B;
    const regs = new Map();
    {   // region ids block by block
      const bx0 = Math.floor(ox / BLOCK), bz0 = Math.floor(oz / BLOCK), nb = Math.ceil((ox + W) / BLOCK) - bx0;
      const bid = new Float64Array(nb * nb);
      for (let b = 0; b < nb; b++) for (let a = 0; a < nb; a++) {
        const id = this.blockId(bx0 + a, bz0 + b);
        bid[b * nb + a] = id;
        if (!regs.has(id)) regs.set(id, this.region(id));
      }
      for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) ids[z * W + x] = bid[(Math.floor((oz + z) / BLOCK) - bz0) * nb + Math.floor((ox + x) / BLOCK) - bx0];
    }
    const at = (x, z) => z * W + x;
    const inW = (x, z) => x >= 0 && z >= 0 && x < W && z < W;
    const shapeAt = (P, S, x, z) => (S.algo === 'ca' ? caAt(this.seed, P, ox + x, oz + z) : inShape(this.seed, P, S, ox + x, oz + z));

    // 1. the layers of each tile's own region
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      const i = at(x, z), P = regs.get(ids[i]), wx = ox + x, wz = oz + z;
      if (clear(wx, wz)) { keep[i] = 1; continue; }
      if (P.water === 'flooded') water[i] = WATER;
      else if (P.water === 'ankle') water[i] = ANKLE;
      else if (P.water === 'pools' && shapeAt(P, P.pool, x, z)) water[i] = WATER;
      else if (P.water === 'sunk') water[i] = P.paths.has(tkey(wx, wz)) ? WATER : DEEPW;
      else if (this.b1) water[i] = landWater(this.seed, P, wx, wz);
      if (P.up && !water[i] && shapeAt(P, P.up, x, z)) up[i] = 1;
      if (this.b1 && water[i] === WATER) continue;   // B1's channels run on through its walls
      if (P.pillars && pillarAt(this.seed, P, wx, wz)) { tiles[i] = WALL; form[i] = P.pillars.round ? FORM_CYL : 0; }
      if (P.part && partAt(this.seed, P, wx, wz)) { tiles[i] = WALL; form[i] = 0; }
    }
    yield;
    // 2. boundaries: drawn on the lower id's side, one tile thick
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      const i = at(x, z), id = ids[i];
      if (keep[i]) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX4[d], nz = z + DZ4[d];
        if (!inW(nx, nz)) continue;
        const nb = ids[at(nx, nz)];
        if (nb <= id || (this.b1 && water[i] === WATER && water[at(nx, nz)] === WATER)) continue;
        const wx = ox + x, wz = oz + z, bx = Math.floor(wx / BLOCK), bz = Math.floor(wz / BLOCK), seg = segKey(bx, bz, d);
        const P = regs.get(id);
        if (P.forced.get(nb) === seg) continue;
        const st = boundaryStyle(this.seed, id, nb);
        const closed = rh01(this.seed, bx * 4 + d, bz, 8310) < [0, 0.55, 0.85, 0.7][st];
        if (!closed) continue;
        const along = d < 2 ? wz : wx;
        if (st === 1 && rh01(this.seed, wx, wz, 8311) < 0.18) continue;          // a broken wall: holes here and there
        if (st === 3) { if (((along % 2) + 2) % 2 === 0) { tiles[i] = WALL; form[i] = FORM_CYL; } continue; }   // a row of columns
        tiles[i] = WALL; form[i] = 0;
      }
    }
    // the deep water of a sunken-walkway region keeps a 2-tile shallow rim along the region's edge
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      const i = at(x, z);
      if (water[i] !== DEEPW) continue;
      let rim = false;
      for (let dz = -2; dz <= 2 && !rim; dz++) for (let dx = -2; dx <= 2; dx++) {
        const a = x + dx, b = z + dz;
        if (inW(a, b) && ids[at(a, b)] !== ids[i]) { rim = true; break; }
      }
      if (rim) water[i] = WATER;
    }
    for (let i = 0; i < N; i++) if (keep[i]) { tiles[i] = FLOOR; water[i] = 0; up[i] = 0; form[i] = 0; }
    // sealed rooms: a closed ring of wall and bars, nothing standing in the tile round it, their own floor inside
    const sealedHere = [];
    for (const P of regs.values()) {
      const S = P.sealed;
      if (!S) continue;
      sealedHere.push(S);
      for (let z = S.z - 1; z <= S.z + S.d; z++) for (let x = S.x - 1; x <= S.x + S.w; x++) {
        const lx = x - ox, lz = z - oz;
        if (!inW(lx, lz)) continue;
        const i = at(lx, lz), ring = x === S.x || z === S.z || x === S.x + S.w - 1 || z === S.z + S.d - 1;
        shut[i] = 1;
        if (x < S.x || z < S.z || x >= S.x + S.w || z >= S.z + S.d) { if (tiles[i] === WALL) tiles[i] = FLOOR; form[i] = 0; continue; }
        up[i] = 0; form[i] = 0;
        if (ring) { tiles[i] = sealedRing(S, x, z); water[i] = 0; continue; }
        tiles[i] = FLOOR;
        water[i] = S.inner === 'deep' ? DEEPW : S.inner === 'shallow' ? WATER : 0;
        if (S.inner === 'empty') fixedH[i] = -1.2;
      }
    }
    // a raised floor stays a tile away from any water, so the step between them is never more than one
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      const i = at(x, z);
      if (!up[i]) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const a = x + dx, b = z + dz;
        if (inW(a, b) && water[at(a, b)]) up[i] = 0;
      }
    }
    yield;
    // 3. heights: pools step down from their rim, raised floors climb from their edge; both count a region boundary as an
    // edge, so two regions' pools (or raised floors) of different depths meet at the rim height
    let dists = 0;
    const distTo = (inside) => {
      const dist = (dists ^= 1) ? B.dW : B.dU, q = B.q;
      let qn = 0;
      dist.fill(-1);
      for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
        const i = at(x, z);
        if (!inside(i)) continue;
        for (let d = 0; d < 4; d++) {
          const a = x + DX4[d], b = z + DZ4[d];
          if (inW(a, b) && (!inside(at(a, b)) || ids[at(a, b)] !== ids[i])) { dist[i] = 1; q[qn++] = i; break; }
        }
      }
      for (let k = 0; k < qn; k++) {
        const i = q[k], x = i % W, z = (i / W) | 0;
        if (dist[i] >= 6) continue;
        for (let d = 0; d < 4; d++) {
          const a = x + DX4[d], b = z + DZ4[d];
          if (!inW(a, b)) continue;
          const j = at(a, b);
          if (inside(j) && dist[j] < 0 && ids[j] === ids[i]) { dist[j] = dist[i] + 1; q[qn++] = j; }
        }
      }
      return dist;
    };
    const wet = (i) => water[i] === WATER && tiles[i] !== WALL;
    const dW = distTo((i) => water[i] === WATER || water[i] === DEEPW), dU = distTo((i) => up[i] === 1);

    // a ledge platform of under 12 tiles might get no half step: it steps up like any raised floor instead. Platforms are
    // labelled once; one that runs to the window's edge counts as big
    const smallUp = (i0) => {
      if (upSize[i0] < 0) {
        const q = B.q;
        let qn = 1;
        q[0] = i0;
        upSize[i0] = 0;
        let edge = false;
        for (let k = 0; k < qn; k++) {
          const x = q[k] % W, z = (q[k] / W) | 0;
          for (let d = 0; d < 4; d++) {
            const a2 = x + DX4[d], b2 = z + DZ4[d];
            if (!inW(a2, b2)) { edge = true; continue; }
            const j = at(a2, b2);
            if (up[j] && ids[j] === ids[i0] && upSize[j] < 0) { upSize[j] = 0; q[qn++] = j; }
          }
        }
        const size = edge ? 1 << 20 : qn;
        for (let k = 0; k < qn; k++) upSize[q[k]] = size;
      }
      return upSize[i0] < 12;
    };
    yield;
    // 4. every window tile's final type and height
    ff.set(form);
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      const i = at(x, z), P = regs.get(ids[i]);
      if (tiles[i] === WALL || tiles[i] === BARS) { tt[i] = tiles[i]; continue; }
      if (water[i] === DEEPW) { tt[i] = DEEP; hh[i] = DEEP_FLOOR; continue; }
      if (wet(i)) {
        tt[i] = SHALLOW;
        const depth = P.water === 'sunk' ? 0.4 : this.depthOf(P), dd = dW[i] < 0 ? 6 : dW[i];
        const h = -Math.min(0.4 + POOL_STEP * (dd - 1), depth > 0.41 ? depth + 0.02 : 0.4);   // depth counted from the surface (-0.02)
        hh[i] = Math.abs(h - SHALLOW_FLOOR) < 0.01 ? SHALLOW_FLOOR : h;
        if (h < SHALLOW_FLOOR - 0.01) ff[i] |= FORM_DEEPER;
        continue;
      }
      tt[i] = FLOOR;
      if (fixedH[i] === fixedH[i]) { hh[i] = fixedH[i]; continue; }
      if (water[i] === ANKLE) { hh[i] = -P.ankle; wetA[i] = 1; continue; }
      if (!up[i]) continue;
      // a ledge: 0.55 m all over, too high to climb but a step down, with a half step every few tiles along its edge
      if (P.up.ledge && !smallUp(i)) hh[i] = dU[i] === 1 && mod(ox + x + oz + z, LEDGE_EVERY) === 0 ? LEDGE_H / 2 : LEDGE_H;
      else hh[i] = Math.min(P.up.H, RAISE_STEP * (dU[i] < 0 ? 6 : dU[i]));
    }
    yield;
    // pockets: a few tiles that walls, columns and ledges happen to shut in, no way into them from 10 tiles off (walked
    // backwards from the tile: who can step onto it). They are filled in as wall. Sealed rooms are shut in on purpose
    // pocket: 0 unknown, 1 reachable, 2 shut in
    const standable = (i) => (tt[i] === FLOOR || tt[i] === SHALLOW) && !shut[i];
    const POCKET_R = this.b1 ? MARGIN - 1 : 10;   // B1's mazes shut bigger pockets in
    let round = 0;
    const resolve = (i0) => {
      const x0 = i0 % W, z0 = (i0 / W) | 0, seen = B.seen;
      let sn = 1;
      seen[0] = i0;
      stamp[i0] = ++round;
      let open = false;
      for (let k = 0; k < sn && !open; k++) {
        const i = seen[k], x = i % W, z = (i / W) | 0;
        if (pocket[i] === 1 || Math.max(Math.abs(x - x0), Math.abs(z - z0)) >= POCKET_R || keep[i]) { open = true; break; }
        for (let d = 0; d < 4; d++) {
          const a = x + DX4[d], b = z + DZ4[d];
          if (!inW(a, b)) { open = true; break; }
          const j = at(a, b);
          if (stamp[j] === round || !standable(j) || !canStepH(hh[j], hh[i])) continue;
          stamp[j] = round; seen[sn++] = j;
        }
      }
      // the tiles seen can all step their way onto i0: if i0 is shut in, so are they; if not, only i0 is known reachable
      if (open) pocket[i0] = 1; else for (let k = 0; k < sn; k++) pocket[seen[k]] = 2;
    };
    for (let z = MARGIN - 1; z <= MARGIN + CHUNK; z++) for (let x = MARGIN - 1; x <= MARGIN + CHUNK; x++) {
      const i = at(x, z);
      if (standable(i) && !pocket[i]) resolve(i);
      if (pocket[i] === 2) { tt[i] = WALL; hh[i] = 0; ff[i] = 0; wetA[i] = 0; }
    }

    // 5. the chunk itself
    const g = newGrid(CHUNK);
    g.ox = 0; g.oz = 0;
    g.kind = 'region';
    g.regions = new Set();
    g.ceilT = new Float32Array(CHUNK * CHUNK);
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const i = at(x + MARGIN, z + MARGIN), li = z * CHUNK + x, P = regs.get(ids[i]);
      g.regions.add(ids[i]);
      g.ceilT[li] = this.ceilOf(P);
      g.tiles[li] = tt[i]; g.h[li] = hh[i]; g.form[li] = ff[i]; g.wet[li] = wetA[i];
      // the rail round a small pool: on every edge between its dry floor and its water, but for the gap
      if (!P.rail || tt[i] !== FLOOR || shut[i]) continue;
      for (let d = 0; d < 4; d++) {
        const j = at(x + MARGIN + DX4[d], z + MARGIN + DZ4[d]);
        if (ids[j] !== ids[i] || tt[j] !== SHALLOW || water[j] !== WATER || shut[j]) continue;
        const jx = cx * CHUNK + x + DX4[d], jz = cz * CHUNK + z + DZ4[d];
        const k = tkey(cx * CHUNK + x, cz * CHUNK + z);
        if (P.rail.gap.has(k) || !P.rail.out.has(k) || !P.rail.pool.has(tkey(jx, jz))) continue;
        const [x0, z0, x1, z1] = edgeOf(x, z, d);
        g.rails.push({ x0, z0, x1, z1, y0: hh[i], y1: hh[i], ax: x, az: z });
      }
    }
    yield;
    // 6. lamps: every region's own pattern, kept 0.5 m clear of walls and columns and never overlapping each other.
    // Each lamp is listed in grid-local coordinates (it may reach outside the chunk): `lamps` holds the ones that touch the
    // chunk, `glow` every one close enough to light it
    const cands = [];
    for (const P of regs.values()) lampCandidates(this.seed, P, ox, oz, W, cands);
    const okTile = (x, z) => inW(x, z);
    const m = this.b1 ? 0 : 1;   // B1's corridors are too narrow to keep lamps a tile off their walls
    const lampOk = (l) => {
      for (let z = l.z - m; z < l.z + l.d + m; z++) for (let x = l.x - m; x < l.x + l.w + m; x++) {
        const lx = x - ox, lz = z - oz;
        if (!okTile(lx, lz)) return false;
        if (tt[at(lx, lz)] === WALL) return false;
      }
      for (let z = l.z; z < l.z + l.d; z++) for (let x = l.x; x < l.x + l.w; x++) if (ids[at(x - ox, z - oz)] !== l.region || keep[at(x - ox, z - oz)] || shut[at(x - ox, z - oz)]) return false;
      if (!l.along) return true;
      // a lamp along walls and pool rims: a wall, or water beside dry floor, 2 m from it
      for (let z = l.z - 2; z <= l.z + 2; z++) for (let x = l.x - 2; x <= l.x + 2; x++) {
        const lx = x - ox, lz = z - oz;
        if (!okTile(lx, lz)) continue;
        const i = at(lx, lz);
        if (tiles[i] === WALL) return true;
        if (water[i] === WATER && okTile(lx + 1, lz) && !water[at(lx + 1, lz)]) return true;
        if (water[i] === WATER && okTile(lx, lz + 1) && !water[at(lx, lz + 1)]) return true;
      }
      return false;
    };
    const fine = cands.filter(lampOk);
    // lamps keep half a metre apart, and LAMP_CLEAR (2 m) off a skylight's patch; a skylight wins over any lamp
    const clash = (p, q) => { const m = p.sky || q.sky ? 2 : 0.5; return p.x - m < q.x + q.w && q.x - m < p.x + p.w && p.z - m < q.z + q.d && q.z - m < p.z + p.d; };
    const kept = fine.filter((p) => !fine.some((q) => q !== p && q.pri > p.pri && clash(p, q)));
    const cx0 = cx * CHUNK, cz0 = cz * CHUNK;
    const mineAt = (x, z) => x >= cx0 && z >= cz0 && x < cx0 + CHUNK && z < cz0 + CHUNK;
    for (const S of sealedHere) {   // its own lamp over the inside, its record and its toy go to the chunk holding its middle
      if (S.w >= 5 && S.d >= 5) kept.push({ x: S.x + 2, z: S.z + 2, w: S.w - 4, d: S.d - 4, round: false, lit: true });
      if (!mineAt(Math.floor(S.x + S.w / 2), Math.floor(S.z + S.d / 2))) continue;
      g.sealed.push({ x: S.x - cx0, z: S.z - cz0, w: S.w, d: S.d });
      if (S.inner === 'shallow') g.floaters.push({ x: S.x + S.w / 2 - cx0, z: S.z + S.d / 2 - cz0, y: SHALLOW_FLOOR + SHALLOW_DEPTH, kind: 'ring', phase: S.phase, color: S.color });
    }
    g.glow = [];
    for (const l of kept) {
      if (l.sky) {   // a skylight: every chunk its patch of light reaches is lit by it, the one holding its middle draws it
        const x = l.x + l.w / 2 - cx0, z = l.z + l.d / 2 - cz0, hw = l.w / 2 + 1.6, hd = l.d / 2 + 1.6;
        if (x + hw > 0 && x - hw < CHUNK && z + hd > 0 && z - hd < CHUNK) g.suns.push({ x, z, w: l.w, d: l.d, wx: x, wz: z, sky: true, own: mineAt(Math.floor(l.x + l.w / 2), Math.floor(l.z + l.d / 2)) });
        continue;
      }
      const loc = { x: l.x - cx0, z: l.z - cz0, w: l.w, d: l.d, k: l.lit ? 1 : 0, round: l.round };
      if (loc.x + loc.w > -8 && loc.x < 24 && loc.z + loc.d > -8 && loc.z < 24) g.glow.push(loc);
      if (loc.x + loc.w > 0 && loc.x < CHUNK && loc.z + loc.d > 0 && loc.z < CHUNK) g.lamps.push(loc);
    }
    return g;
  }
}

// a sealed room in the region: 5-10 m a side and 2 tiles clear of its edge and of tiles that must stay clear. Three kinds:
// a walled room with barred openings in 2-4 of its walls, three walls and one side all bars, or a 5 × 5 box with two
// walls and two sides of bars (the old barred box, now against walls). Inside: an empty pool, shallow water with a ring
// floating in it, or deep water
function placeSealed(self, P, r) {
  const kind = weighted(r, [['windows', 5], ['open3', 3], ['corner', 2]]);
  for (let t = 0; t < 16; t++) {
    const [bx, bz] = P.blocks[(r() * P.blocks.length) | 0];
    const w = kind === 'corner' ? 5 : 5 + ((r() * 6) | 0), d = kind === 'corner' ? 5 : 5 + ((r() * 6) | 0);
    const x = bx * BLOCK + ((r() * BLOCK) | 0), z = bz * BLOCK + ((r() * BLOCK) | 0);
    let ok = true;
    for (let zz = z - 2; zz < z + d + 2 && ok; zz++) for (let xx = x - 2; xx < x + w + 2; xx++) {
      if (self.tileId(xx, zz) !== P.id || self.clear(xx, zz)) { ok = false; break; }
    }
    if (!ok) continue;
    const S = { x, z, w, d, kind, inner: pick(r, ['empty', 'shallow', 'deep']), phase: r() * TAU, color: (r() * 4) | 0 };
    S.open = (r() * 4) | 0;   // open3: the barred side; corner: the first of its two barred sides (the next one round is the other)
    S.windows = [0, 1, 2, 3].map((side) => {   // windows: per side, [first, last] tile along it, or null
      if (side !== S.open && r() < 0.35) return null;
      const L = side < 2 ? d : w, len = 2 + ((r() * 2) | 0), a = 1 + ((r() * Math.max(1, L - len - 2)) | 0);
      return [a, Math.min(L - 2, a + len - 1)];
    });
    return S;
  }
  return null;
}

// the ring tile of a sealed room at (x, z): WALL or BARS. Sides: 0 east, 1 west, 2 south, 3 north
function sealedRing(S, x, z) {
  const sides = [];
  if (x === S.x + S.w - 1) sides.push(0);
  if (x === S.x) sides.push(1);
  if (z === S.z + S.d - 1) sides.push(2);
  if (z === S.z) sides.push(3);
  if (sides.length > 1) return WALL;   // corners are wall
  const s = sides[0], t = s < 2 ? z - S.z : x - S.x;
  if (S.kind === 'open3') return s === S.open ? BARS : WALL;
  if (S.kind === 'corner') return s === S.open || s === [2, 3, 1, 0][S.open] ? BARS : WALL;
  const win = S.windows[s];
  return win && t >= win[0] && t <= win[1] ? BARS : WALL;
}

const segKey = (bx, bz, d) => (bx + 65536) * 524288 + (bz + 65536) * 4 + d;
const tkey = (x, z) => (x + 1048576) * 2097152 + (z + 1048576);

// 0 open, 1 a broken wall, 2 a wall with openings, 3 a row of columns
function boundaryStyle(seed, a, b) {
  const v = hash2(seed, a | 0, b | 0, 8200) / 4294967296;
  return v < 0.35 ? 0 : v < 0.65 ? 1 : v < 0.8 ? 2 : 3;
}

// shape parameters inside the region's box (pools and raised floors)
function shapeParams(r, P) {
  const bw = P.x1 - P.x0 + 1, bd = P.z1 - P.z0 + 1;
  const S = {};
  S.rects = [];
  const k = 1 + ((r() * 3) | 0);
  for (let i = 0; i < k; i++) {
    const w = 3 + ((r() * Math.max(1, bw * 0.55)) | 0), d = 3 + ((r() * Math.max(1, bd * 0.55)) | 0);
    const x = P.x0 + 1 + ((r() * Math.max(1, bw - w - 2)) | 0), z = P.z0 + 1 + ((r() * Math.max(1, bd - d - 2)) | 0);
    S.rects.push([x, z, x + w - 1, z + d - 1]);
  }
  S.ex = P.cx + (r() - 0.5) * bw * 0.2; S.ez = P.cz + (r() - 0.5) * bd * 0.2;
  S.rx = Math.max(2.5, bw * (0.2 + r() * 0.25)); S.rz = Math.max(2.5, bd * (0.2 + r() * 0.25));
  S.inner = 0.35 + r() * 0.25;
  S.scale = 4 + r() * 6; S.cut = 0.5 + r() * 0.15;
  S.alongX = r() < 0.5; S.amp = 2 + r() * 4; S.wave = 5 + r() * 7; S.phase = r() * 6.3; S.width = 1 + ((r() * 2) | 0);
  S.fill = 0.47 + r() * 0.06;
  return S;
}

function inShape(seed, P, S, x, z) {
  switch (S.algo) {
    case 'rects': return S.rects.some(([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d);
    case 'disc': return ((x + 0.5 - S.ex) / S.rx) ** 2 + ((z + 0.5 - S.ez) / S.rz) ** 2 <= 1;
    case 'ring': { const q = ((x + 0.5 - S.ex) / S.rx) ** 2 + ((z + 0.5 - S.ez) / S.rz) ** 2; return q <= 1 && q >= S.inner; }
    case 'blob': return vnoise(seed, P.salt, x, z, S.scale) > S.cut;
    case 'channel': {   // a meandering channel across the region
      const t = S.alongX ? x : z, c = (S.alongX ? S.ez : S.ex) + S.amp * Math.sin(t / S.wave + S.phase), v = S.alongX ? z + 0.5 : x + 0.5;
      return Math.abs(v - c) <= S.width;
    }
    default: return false;
  }
}

const mod = (a, m) => ((a % m) + m) % m;
const DX4 = [1, -1, 0, 0], DZ4 = [0, 0, 1, -1];   // the four directions, in DIRS order

// cellular-automaton pools: noise smoothed by four rounds of the 5-of-9 rule over the region's box (and 5 tiles round it,
// so every tile of the region comes out whole), worked out once per region
function caAt(seed, P, x, z) {
  if (!P.ca) {
    const x0 = P.x0 - 5, z0 = P.z0 - 5, w = P.x1 - P.x0 + 11, d = P.z1 - P.z0 + 11;
    let g = new Uint8Array(w * d);
    for (let k = 0; k < w * d; k++) g[k] = rh01(seed, x0 + (k % w), z0 + ((k / w) | 0), P.salt) < P.pool.fill ? 1 : 0;
    for (let it = 0; it < 4; it++) {
      const nx = new Uint8Array(w * d);
      for (let b = 1; b < d - 1; b++) for (let a = 1; a < w - 1; a++) {
        let sum = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) sum += g[(b + dz) * w + a + dx];
        nx[b * w + a] = sum >= 5 ? 1 : 0;
      }
      g = nx;
    }
    P.ca = { g, x0, z0, w, d };
  }
  const C = P.ca, a = x - C.x0, b = z - C.z0;
  return a >= 0 && b >= 0 && a < C.w && b < C.d && C.g[b * C.w + a] === 1;
}

function pillarAt(seed, P, x, z) {
  const C = P.pillars;
  if (C.algo === 'grid') return mod(x - C.ox, C.sx) === 0 && mod(z - C.oz, C.sz) === 0 && hash2(seed, x, z, 8400) / 4294967296 >= C.miss;
  if (C.algo === 'rows') {
    const [u, v] = C.alongX ? [x, z] : [z, x];
    return mod(v - C.o, C.every) === 0 && mod(u, C.gap + 1) === 0;
  }
  if (C.algo === 'scatter') {   // one column somewhere inside each cell, never on its last row or column
    const ci = Math.floor(x / C.cell), cj = Math.floor(z / C.cell);
    if (hash2(seed, ci, cj, 8401) / 4294967296 >= C.p) return false;
    const px = ci * C.cell + (hash2(seed, ci, cj, 8402) % (C.cell - 1)), pz = cj * C.cell + (hash2(seed, ci, cj, 8403) % (C.cell - 1));
    return x === px && z === pz;
  }
  return false;
}

// partitions: dashed walls (runs of 2-4 m with 2 m gaps, lines 6-9 m apart) or short stubs in some cells
function partAt(seed, P, x, z) {
  const Q = P.part;
  if (Q.algo === 'dashed') {
    const line = (u, v) => mod(v - Q.o, Q.every) === 0 && mod(u + Q.o, Q.run + Q.gap) < Q.run;
    return Q.alongX ? line(x, z) || (Q.both && line(z, x)) : line(z, x) || (Q.both && line(x, z));
  }
  if (Q.algo === 'maze') {   // walls on a lattice of cells `cell` m apart; every cell opens to its west or north neighbour, and
    // any other wall is missing `braid` of the time, so the corridors join up with loops
    const c = Q.cell, lx = mod(x, c), lz = mod(z, c);
    if (lx && lz) return false;
    if (!lx && !lz) return true;
    const ci = Math.floor(x / c), cj = Math.floor(z / c), west = !lx;
    if ((hash2(seed, ci, cj, 8420) & 1) === (west ? 0 : 1)) return false;
    return hash2(seed, ci * 2 + (west ? 0 : 1), cj, 8421) / 4294967296 >= Q.braid;
  }
  if (Q.algo === 'stubs') {   // an L or a straight stub in a cell, starting 2 tiles in from its corner
    const ci = Math.floor(x / Q.cell), cj = Math.floor(z / Q.cell);
    if (hash2(seed, ci, cj, 8410) / 4294967296 >= Q.p) return false;
    const h = hash2(seed, ci, cj, 8411), lx = x - ci * Q.cell, lz = z - cj * Q.cell, len = 2 + (h % 3);
    const ax = 2 + ((h >> 4) % 2), az = 2 + ((h >> 6) % 2);
    const armX = lz === az && lx >= ax && lx < ax + len, armZ = lx === ax && lz >= az && lz < az + len;
    return (h >> 8) % 3 === 0 ? armX || armZ : (h >> 8) % 3 === 1 ? armX : armZ;
  }
  return false;
}

// B1's water from one field of land height shared by every region: a channel winding along one of its contour lines
// through every region, basins in the low ground ('terrain' regions), ankle-deep ditches along a contour of a second
// field ('terrain' and 'ditch' regions)
function landWater(seed, P, x, z) {
  const t = vnoise(seed, 8700, x, z, 22) * 0.75 + vnoise(seed, 8701, x, z, 7) * 0.25;
  if (Math.abs(t - 0.5) < 0.035 || (P.water === 'terrain' && t < P.basin)) return WATER;
  return P.water !== 'channel' && Math.abs(vnoise(seed, 8702, x, z, 15) - 0.5) < 0.03 ? ANKLE : 0;
}

// winding walkways over a deep region: two zigzag lines across its box, each turning every 3-6 tiles
function sunkPaths(self, P, r) {
  const set = new Set();
  const paint = (x, z) => { for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set.add(tkey(x + dx, z + dz)); };
  for (const alongX of [true, false]) {
    const [u0, u1, v0, v1] = alongX ? [P.x0 - 2, P.x1 + 2, P.z0, P.z1] : [P.z0 - 2, P.z1 + 2, P.x0, P.x1];
    let v = Math.round((v0 + v1) / 2 + (r() - 0.5) * (v1 - v0) * 0.3), u = u0, turns = 0;
    while (u <= u1) {
      const run = 3 + ((r() * 4) | 0);
      for (let k = 0; k < run && u <= u1; k++, u++) alongX ? paint(u, v) : paint(v, u);
      const shift = (2 + ((r() * 4) | 0)) * (r() < 0.5 ? -1 : 1);
      const nv = Math.max(v0 + 1, Math.min(v1 - 2, v + shift));
      if (nv !== v) turns++;
      for (let t = Math.min(v, nv); t <= Math.max(v, nv); t++) alongX ? paint(u, t) : paint(t, u);
      v = nv;
    }
    if (!turns) P.straight = true;
  }
  return set;
}

// lamp candidates of a region inside the window, world tile coordinates; pri orders them when two would overlap
function lampCandidates(seed, P, ox, oz, Wn, out) {
  const L = P.lamps, [w, d] = L.size;
  const x0 = Math.max(ox, P.x0), z0 = Math.max(oz, P.z0), x1 = Math.min(ox + Wn - 1, P.x1), z1 = Math.min(oz + Wn - 1, P.z1);
  if (x0 > x1 || z0 > z1) return;
  const add = (x, z, lw, ld) => out.push({ x, z, w: lw, d: ld, region: P.id, round: L.round, along: L.algo === 'along', pri: hash2(seed, x, z, 8500) });
  const cells = (cell, fn) => {
    for (let cj = Math.floor(z0 / cell); cj <= Math.floor(z1 / cell); cj++) for (let ci = Math.floor(x0 / cell); ci <= Math.floor(x1 / cell); ci++) fn(ci, cj);
  };
  switch (L.algo) {
    case 'grid':
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (mod(x - L.ox, L.sx) === 0 && mod(z - L.oz, L.sz) === 0) add(x, z, w, d);
      break;
    case 'strip':
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const [u, v] = L.alongX ? [x, z] : [z, x];
        if (mod(v - L.o, L.every) === 0 && mod(u, L.len + 1) === 0) L.alongX ? add(x, z, L.len, 1) : add(x, z, 1, L.len);
      }
      break;
    case 'scatter':   // one lamp at a random spot in each 5 m cell (some cells empty), a tile clear of the cell's far side
      cells(5, (ci, cj) => {
        if (hash2(seed, ci, cj, P.salt + 1) / 4294967296 > 0.65) return;
        add(ci * 5 + (hash2(seed, ci, cj, P.salt + 2) % (5 - w)), cj * 5 + (hash2(seed, ci, cj, P.salt + 3) % (5 - d)), w, d);
      });
      break;
    case 'cluster':   // 3-5 small lamps on a 2 m lattice round a point in each 12 m cell
      cells(12, (ci, cj) => {
        if (hash2(seed, ci, cj, P.salt + 4) / 4294967296 > 0.7) return;
        const h = hash2(seed, ci, cj, P.salt + 5), bx = ci * 12 + 2 + (h % 6), bz = cj * 12 + 2 + ((h >> 8) % 6), k = 3 + ((h >> 16) % 3);
        for (let j = 0; j < k; j++) { const q = hash2(seed, ci * 7 + j, cj, P.salt + 6); add(bx + 2 * (q % 3), bz + 2 * ((q >> 4) % 3), 1, 1); }
      });
      break;
    case 'along':     // a lamp every 3 m near walls and pool rims (checked against the tiles in lampOk)
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (mod(x, 3) === 0 && mod(z, 3) === 0) add(x, z, 1, 1);
      break;
    case 'sky':       // skylights instead of lamps: a 2-3 m opening in most 10 m cells, its patch of light on the floor. Three
      // spots are tried in turn (the clash check keeps the first that fits)
      cells(10, (ci, cj) => {
        const h = hash2(seed, ci, cj, P.salt + 10);
        if (h / 4294967296 > 0.7) return;
        const n = 2 + (h & 1);
        for (let k = 0; k < 3; k++) {
          const q = hash2(seed, ci, cj, P.salt + 11 + k);
          out.push({ x: ci * 10 + 1 + (q % (8 - n)), z: cj * 10 + 1 + ((q >> 8) % (8 - n)), w: n, d: n, region: P.id, sky: true, pri: 2 ** 32 * (4 - k) + (q >>> 12) });
        }
      });
      break;
    case 'dark':      // almost nothing: one small lamp in some 13 m cells
      cells(13, (ci, cj) => {
        if (hash2(seed, ci, cj, P.salt + 7) / 4294967296 > 0.45) return;
        add(ci * 13 + 2 + (hash2(seed, ci, cj, P.salt + 8) % 9), cj * 13 + 2 + (hash2(seed, ci, cj, P.salt + 9) % 9), 1, 1);
      });
      break;
  }
}

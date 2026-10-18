// Which floor every chunk is on and how the floors connect. Pure data, no three.js.
//
// The map is cut into 3×3-chunk patches. A patch is B1 (-3 m), 1F (0, the "ocean") or 2F (+3 m); B1 and 2F patches only
// sit on even checkerboard squares, so every one of them has 1F on all four sides. The middle chunk of each side of
// such a patch (in the neighbouring 1F patch) is a stair chunk: a straight flight from 1F up or down to the patch.
// That is the only way between floors. Doorways between plain 1F chunks may be sealed (about 30%), but only when the
// two chunks stay joined by a route of doorways that can never be sealed, which includes stairs and the other floors.
import { hash2 } from './rng.js';
import { LEVEL_H, DIRS } from './tiles.js';

export const PATCH = 3;
export const SEAL_SHARE = 0.3;
export const HALF_ROOM_SHARE = 0.05;   // ordinary chunks holding a half-chunk sealed room
const BYPASS_NODES = 220;
const OPP = [1, 0, 3, 2];

export const patchOf = (c) => Math.floor(c / PATCH);
const pkey = (i, j) => (i + 8192) * 16384 + (j + 8192);
const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
const h01 = (seed, a, b, salt) => hash2(seed, a, b, salt) / 4294967296;

// the patch cell that holds a stair for the patch on side d: [col, row] in the host patch, d = direction to the target
const STAIR_CELL = [[2, 1], [0, 1], [1, 2], [1, 0]];

export class LevelMap {
  // zones: [{ cx0, cz0, level }]; exit: { cx, cz, level } | null; megas: [{ cx0, cz0 }] (2×2 chunks inside a 1F patch)
  constructor(seed, zones, exit, megas = []) {
    this.seed = seed >>> 0;
    this.zones = zones;
    this.exit = exit;
    this.megas = megas;
    this.special = new Map();   // patch → fixed level
    this.forced = new Set();    // patches around the fixed 1F ones: never B1 / 2F
    const ring = (i, j) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) this.forced.add(pkey(i + a, j + b)); };
    for (const i of [-1, 0]) for (const j of [-1, 0]) { this.special.set(pkey(i, j), 0); ring(i, j); }
    for (const z of zones) {
      const i = patchOf(z.cx0), j = patchOf(z.cz0);
      this.special.set(pkey(i, j), z.level);
      if (z.level === 0) ring(i, j);
    }
    if (exit) this.special.set(pkey(patchOf(exit.cx), patchOf(exit.cz)), exit.level);
    for (const m of megas) { const i = patchOf(m.cx0), j = patchOf(m.cz0); this.special.set(pkey(i, j), 0); ring(i, j); }
    this.edges = new Map();
    this.stairs = new Map();
  }

  patchLevel(i, j) {
    const k = pkey(i, j);
    if (this.special.has(k)) return this.special.get(k);
    if (this.forced.has(k) || (i + j) % 2 !== 0) return 0;
    if (h01(this.seed, i, j, 7001) >= 0.55) return 0;
    return h01(this.seed, i, j, 7002) < 0.55 ? -1 : 1;
  }

  levelOf(cx, cz) { return this.patchLevel(patchOf(cx), patchOf(cz)); }

  // { dir, level }: this chunk is a stair chunk climbing towards direction dir to a patch on `level`
  stairOf(cx, cz) {
    const k = ckey(cx, cz);
    let s = this.stairs.get(k);
    if (s === undefined) {
      s = null;
      const pi = patchOf(cx), pj = patchOf(cz), a = cx - pi * PATCH, b = cz - pj * PATCH;
      if (this.patchLevel(pi, pj) === 0) {
        for (let d = 0; d < 4 && !s; d++) {
          if (STAIR_CELL[d][0] !== a || STAIR_CELL[d][1] !== b) continue;
          const lv = this.patchLevel(pi + DIRS[d][0], pj + DIRS[d][1]);
          if (lv !== 0) s = { dir: d, level: lv };
        }
      }
      this.stairs.set(k, s);
    }
    return s;
  }

  // an ordinary room chunk: on 1F or 2F, not a stair, zone, start area or exit
  ordinary(cx, cz) {
    if (this.levelOf(cx, cz) < 0 || this.stairOf(cx, cz)) return false;
    if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) return false;
    if (this.exit && cx === this.exit.cx && cz === this.exit.cz) return false;
    for (const z of this.zones) if (cx >= z.cx0 && cx <= z.cx0 + 1 && cz >= z.cz0 && cz <= z.cz0 + 1) return false;
    return true;
  }

  // the side (direction index) a half-chunk sealed room fills, or -1: that side's doorway is walled up
  halfRoom(cx, cz) {
    if (!this.ordinary(cx, cz)) return -1;
    if (h01(this.seed, cx, cz, 7200) >= HALF_ROOM_SHARE) return -1;
    return Math.floor(h01(this.seed, cx, cz, 7201) * 4);
  }

  // floor height of the doorway on side d of a chunk (d: direction the side faces); null: walled up
  portH(cx, cz, d) {
    if (this.halfRoom(cx, cz) === d) return null;
    const s = this.stairOf(cx, cz);
    if (s) return d === s.dir ? s.level * LEVEL_H : 0;   // the other three sides open onto the 1F plaza
    return this.levelOf(cx, cz) * LEVEL_H;
  }

  // a plain 1F chunk: the only kind whose doorways may be sealed
  isPlain(cx, cz) {
    if (this.levelOf(cx, cz) !== 0 || this.stairOf(cx, cz)) return false;
    if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) return false;
    for (const z of this.zones) if (cx >= z.cx0 && cx <= z.cx0 + 1 && cz >= z.cz0 && cz <= z.cz0 + 1) return false;
    for (const m of this.megas) if (cx >= m.cx0 && cx <= m.cx0 + 1 && cz >= m.cz0 && cz <= m.cz0 + 1) return false;
    return true;
  }

  // the doorway between chunk A and chunk B (B = A + (1,0) → B's west edge, B = A + (0,1) → B's north edge) joins
  // heights at all
  joined(ax, az, bx, bz) {
    const horizontal = bx !== ax;
    const ha = this.portH(ax, az, horizontal ? 0 : 2), hb = this.portH(bx, bz, horizontal ? 1 : 3);
    return ha !== null && hb !== null && Math.abs(ha - hb) < 0.01;
  }

  // A may be sealed from B (not forced open): both plain 1F and the hash falls in the sealed share
  candidate(ax, az, bx, bz) {
    if (!this.isPlain(ax, az) || !this.isPlain(bx, bz)) return false;
    return h01(this.seed, bx, bz, bx !== ax ? 7100 : 7101) < SEAL_SHARE;
  }

  // the doorways that can never be sealed, from chunk (x, z) to its neighbours
  firmNeighbours(x, z, out) {
    out.length = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      const [ax, az, bx, bz] = dx + dz > 0 ? [x, z, nx, nz] : [nx, nz, x, z];
      if (this.joined(ax, az, bx, bz) && !this.candidate(ax, az, bx, bz)) out.push([nx, nz]);
    }
    return out;
  }

  // is B reachable from A over doorways that stay open, within a bounded search
  bypass(ax, az, bx, bz) {
    const seen = new Set([ckey(ax, az)]);
    const q = [[ax, az]], nb = [];
    for (let head = 0; head < q.length && q.length < BYPASS_NODES; head++) {
      const [x, z] = q[head];
      for (const [nx, nz] of this.firmNeighbours(x, z, nb)) {
        const k = ckey(nx, nz);
        if (seen.has(k)) continue;
        if (nx === bx && nz === bz) return true;
        seen.add(k);
        q.push([nx, nz]);
      }
    }
    return false;
  }

  // the doorway on chunk (cx, cz)'s west (dir 0) or north (dir 1) edge: { open, h (floor height of the door tiles),
  // narrow (a stair chunk is on one side: the doorway is the 2-tile lane) }
  edge(cx, cz, dir) {
    const k = ckey(cx, cz) * 2 + dir;
    let e = this.edges.get(k);
    if (e) return e;
    const ax = dir === 0 ? cx - 1 : cx, az = dir === 0 ? cz : cz - 1;
    const hb = this.portH(cx, cz, dir === 0 ? 1 : 3);
    let open = this.joined(ax, az, cx, cz);
    if (open && this.candidate(ax, az, cx, cz) && this.bypass(ax, az, cx, cz)) open = false;
    e = { open, h: hb ?? 0, narrow: !!(this.stairOf(ax, az) || this.stairOf(cx, cz)) };
    this.edges.set(k, e);
    return e;
  }
}

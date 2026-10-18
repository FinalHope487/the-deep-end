// Multi-level pieces: stair-room templates (two stacked floors), the new zone 2, sealed rooms, slides,
// auto rails and context signs. Pure data on grids (see tiles.js), so it runs in node for unit tests.
import { inFillet } from './shapes.js';
import {
  FLOOR, WALL, SHALLOW, DEEP, RAMP, SPIRAL, BARS, COLS, VOID, SHALLOW_FLOOR, SHALLOW_DEPTH, DEEP_FLOOR, DEEP_WATER,
  UP_H, SLAB, DIRS, TAU, STEP_UP, STEP_DOWN, walkable, newGrid, addUpper, fill, fillUp, mark, ramp, rampFrac, spiralH,
  groundWater, transformGrid, vaultCells, FORM_DEEPER,
} from './tiles.js';

// sign atlas cells (textures.js draws them in this order)
export const SIGN = {
  WET: 0, DEPTH: 1, DEEP: 2, UP2F: 3, SHOWER: 4, NORUN: 5, LOCKER: 6,
  TO_HALL: 7, TO_TERRACE: 8, TO_PIPES: 9, TO_DEEP: 10, TO_EXIT: 11,
  W_DEPTH: 12, W_3F: 13, W_NOLOOK: 14, CHALK_TEXT: 15,
  ARROW: 16, P_NODIVE: 17, P_NORUN: 18, P_NOTURN: 19, G_SMILE: 20, G_DUCK: 21, G_HANDS: 22, G_PRINT: 23,
  // batch 4 (L11): floors that do not exist, odd rules, chalk text, paint and chalk pictures. None points anywhere.
  F_B7: 24, F_13: 25, F_FRAC: 26, R_ANSWER: 27, R_NAME: 28, R_EMPTY: 29, R_GUARD: 30, R_CLOSED: 31,
  CHALK_REPEAT: 32, CHALK_CROSS: 33, CHALK_COUNT: 34, CHALK_UNDER: 35,
  G_KIDHANDS: 40, G_FIGURE: 41, G_CROWD: 42, G_POOLSCRAWL: 43,
};
// The sign atlas is 512 × 1024: text plates are 128 × 64 (cells 0-15 on top, 24-39 below the first pictures), pictures
// 128 × 128 (cells 16-23 in the middle, 40-47 at the bottom). cellRect gives a cell's pixel rectangle [x, y, w, h].
export const ATLAS_W = 512, ATLAS_H = 1024;
export function cellRect(cell) {
  if (cell < 16) return [(cell % 4) * 128, (cell >> 2) * 64, 128, 64];
  if (cell < 24) return [((cell - 16) % 4) * 128, 256 + ((cell - 16) >> 2) * 128, 128, 128];
  if (cell < 40) return [((cell - 24) % 4) * 128, 512 + ((cell - 24) >> 2) * 64, 128, 64];
  return [((cell - 40) % 4) * 128, 768 + ((cell - 40) >> 2) * 128, 128, 128];
}
export const isGraphic = (cell) => cellRect(cell)[3] === 128;
export const SLIDE_COLORS = [[0.98, 0.8, 0.18], [0.9, 0.24, 0.2], [0.3, 0.75, 0.35], [0.22, 0.5, 0.92]];
export const TUBE_R = 0.5;

// ---------- surfaces on a grid (coordinates in the grid's own frame: g.ox / g.oz offset the tiles) ----------

function spiralOf(g, x, z) {
  for (const s of g.spirals) if (Math.abs(x - s.x) <= 2.01 && Math.abs(z - s.z) <= 2.01) return s;
  return null;
}

// floor top used for meshing faces and rails: spirals report their floor (h0), blocked tiles still have a floor
export function floorTop(g, i, x, z) {
  const t = g.tiles[i];
  if (t === WALL || t === VOID) return null;
  if (t === RAMP) {
    const n = g.n, tx = i % n, tz = (i / n) | 0;
    return g.h[i] + g.rise[i] * rampFrac(g.rdir[i], x - g.ox - tx, z - g.oz - tz);
  }
  return g.h[i];
}

// height a body can stand on at a point of a ground tile (null: not standable)
export function walkTop(g, i, x, z) {
  const t = g.tiles[i];
  if (t === DEEP && g.corner[i]) {   // the cut-off corner of a deep pool is floor, the rest is water
    const n = g.n;
    return inFillet(g.corner[i], x - g.ox - (i % n), z - g.oz - ((i / n) | 0)) ? g.rim[i] : null;
  }
  if (!walkable(t) || g.block[i]) return null;
  if (t === SPIRAL) {   // a tread high enough to walk under leaves the floor beneath it standable (the tread itself is upTop's)
    const s = spiralOf(g, x, z), h = s ? spiralH(s, x, z) : null;
    return h === null ? null : h - s.h0 >= SPIRAL_CLEAR ? s.h0 : h;
  }
  return floorTop(g, i, x, z);
}

// the part of a spiral's treads that is higher than SPIRAL_CLEAR over its floor can be walked under; below that it blocks
export const SPIRAL_CLEAR = 2.2;

export function upTop(g, i, x, z) {
  if (x !== undefined && g.tiles[i] === SPIRAL) {   // a high tread is a surface of its own over the floor beneath it
    const s = spiralOf(g, x, z), h = s ? spiralH(s, x, z) : null;
    return h !== null && h - s.h0 >= SPIRAL_CLEAR ? h : null;
  }
  if (!g.up) return null;
  const t = g.up.tiles[i];
  return t === FLOOR || t === SHALLOW ? g.up.h[i] : null;
}

export function upWater(g, i) {
  return g.up && g.up.tiles[i] === SHALLOW ? g.up.h[i] + SHALLOW_DEPTH : NaN;
}

// ---------- breadth-first reach over (tile, level) with step rules at shared edges ----------
// acc: { inside(tx,tz), cell(tx,tz) → [grid, i], railOnEdge(tx,tz,dir,h) }
export function reach(acc, starts) {
  const seen = new Set();
  const key = (tx, tz, lv) => ((tz + 65536) * 131072 + tx + 65536) * 2 + lv;
  const q = [];
  for (const [tx, tz, lv] of starts) { seen.add(key(tx, tz, lv)); q.push([tx, tz, lv]); }
  const topAt = (tx, tz, lv, x, z) => {
    const c = acc.cell(tx, tz);
    if (!c) return null;
    const [g, i] = c;
    return lv ? upTop(g, i, x, z) : walkTop(g, i, x, z);
  };
  // a spiral tile holds a low tread (the ground level's surface) and a high one (the upper level's) that meet inside it: a walker
  // entering at one level can be standing on the other a step later
  const peers = new Map();
  const peerOf = (tx, tz, g, i) => {
    const k = key(tx, tz, 0);
    if (!peers.has(k)) {
      let ok = false;
      const P = [];
      for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) { const x = tx + (a + 0.5) / 6, z = tz + (b + 0.5) / 6; P.push([walkTop(g, i, x, z), upTop(g, i, x, z), a, b]); }
      for (const [g1, u1, a1, b1] of P) for (const [g2, u2, a2, b2] of P) {
        if (Math.abs(a1 - a2) > 1 || Math.abs(b1 - b2) > 1) continue;
        if (g1 !== null && u2 !== null && Math.abs(g1 - u2) <= STEP_UP) ok = true;
        if (u1 !== null && g2 !== null && Math.abs(u1 - g2) <= STEP_UP) ok = true;
      }
      peers.set(k, ok);
    }
    return peers.get(k);
  };
  while (q.length) {
    const [tx, tz, lv] = q.pop();
    {
      const c = acc.cell(tx, tz);
      if (c && c[0].tiles[c[1]] === SPIRAL && !seen.has(key(tx, tz, 1 - lv)) && peerOf(tx, tz, c[0], c[1])) { seen.add(key(tx, tz, 1 - lv)); q.push([tx, tz, 1 - lv]); }
    }
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = DIRS[d], nx = tx + dx, nz = tz + dz;
      if (!acc.inside(nx, nz)) continue;
      // midpoint of the shared edge, nudged into each tile
      const mx = tx + 0.5 + dx * 0.5, mz = tz + 0.5 + dz * 0.5;
      const ha = topAt(tx, tz, lv, mx - dx * 0.02, mz - dz * 0.02);
      if (ha === null) continue;
      if (acc.railOnEdge(tx, tz, d, ha)) continue;
      for (const nlv of [0, 1]) {
        const k = key(nx, nz, nlv);
        if (seen.has(k)) continue;
        const hb = topAt(nx, nz, nlv, mx + dx * 0.02, mz + dz * 0.02);
        if (hb === null || hb - ha > STEP_UP || ha - hb > STEP_DOWN) continue;
        seen.add(k);
        q.push([nx, nz, nlv]);
      }
    }
  }
  return (tx, tz, lv) => seen.has(key(tx, tz, lv));
}

// unit tile edges as numbers: (lower end point, orientation)
export const edgeKey = (x0, z0, x1, z1) => {
  const vertical = x0 === x1 ? 1 : 0;
  const x = Math.min(x0, x1), z = Math.min(z0, z1);
  return ((z + 65536) * 131072 + x + 65536) * 2 + vertical;
};

// the unit edge on side d of tile (tx, tz)
export function edgeOf(tx, tz, d) {
  if (d === 0) return [tx + 1, tz, tx + 1, tz + 1];
  if (d === 1) return [tx, tz, tx, tz + 1];
  if (d === 2) return [tx, tz + 1, tx + 1, tz + 1];
  return [tx, tz, tx + 1, tz];
}

// a rail only stops movement at its own level (an upper-floor rail does not block the ground under it)
export const railBlocks = (rl, h) => Math.abs((rl.y0 + rl.y1) / 2 - h) <= 0.6;

export function gridReach(g, starts) {
  const rails = new Map();
  for (const rl of g.rails) {
    const k = edgeKey(rl.x0, rl.z0, rl.x1, rl.z1);
    if (!rails.has(k)) rails.set(k, []);
    rails.get(k).push(rl);
  }
  return reach({
    inside: (x, z) => x >= 0 && z >= 0 && x < g.n && z < g.n,
    cell: (x, z) => [g, z * g.n + x],
    railOnEdge: (x, z, d, h) => (rails.get(edgeKey(...edgeOf(x, z, d))) || []).some((rl) => railBlocks(rl, h)),
  }, starts);
}

// ---------- rails ----------

// rails on every drop ≥ 0.6 m between ground tiles, and on upper floor edges over open air;
// an upper edge that meets a stair top at the same height stays open; row / column 0 belong to the edge logic
export function autoRails(g) {
  const n = g.n, skip = new Set(g.noRail.map((r) => edgeKey(r.x0, r.z0, r.x1, r.z1)));
  const have = new Set(g.rails.map((r) => edgeKey(r.x0, r.z0, r.x1, r.z1)));
  for (let z = 1; z < n; z++) for (let x = 1; x < n; x++) {
    const i = z * n + x;
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = DIRS[d], nx = x + dx, nz = z + dz;
      if (nx < 1 || nz < 1 || nx >= n || nz >= n) continue;
      const j = nz * n + nx;
      const [x0, z0, x1, z1] = edgeOf(x, z, d);
      const free = () => { const k = edgeKey(x0, z0, x1, z1); if (skip.has(k) || have.has(k)) return false; have.add(k); return true; };
      const ta = g.tiles[i], tb = g.tiles[j];
      const inA = (px, pz) => [px - dx * 0.02, pz - dz * 0.02], inB = (px, pz) => [px + dx * 0.02, pz + dz * 0.02];
      if (walkable(ta) && ta !== SPIRAL && tb !== SPIRAL && tb !== WALL && tb !== DEEP && tb !== BARS && tb !== COLS) {
        const a0 = floorTop(g, i, ...inA(x0, z0)), a1 = floorTop(g, i, ...inA(x1, z1));
        const b0 = floorTop(g, j, ...inB(x0, z0)), b1 = floorTop(g, j, ...inB(x1, z1));
        const meetsUpper = g.up && upTop(g, j) !== null && Math.abs(g.up.h[j] - (a0 + a1) / 2) <= 0.35;
        if (b0 !== null && !meetsUpper && (a0 - b0 + a1 - b1) / 2 >= 0.6) {
          if (free()) g.rails.push({ x0, z0, x1, z1, y0: a0, y1: a1, ax: x, az: z });
          continue;
        }
      }
      if (g.up && (g.up.tiles[i] === FLOOR || g.up.tiles[i] === SHALLOW) && g.up.tiles[j] === VOID) {
        const ha = g.up.tiles[i] === SHALLOW ? UP_H : g.up.h[i];
        const px = x + 0.5 + dx * 0.52, pz = z + 0.5 + dz * 0.52, gb = walkTop(g, j, px, pz), tb = upTop(g, j, px, pz);   // a spiral's high tread counts as a stair top too
        if ((gb === null || Math.abs(gb - ha) > 0.35) && (tb === null || Math.abs(tb - ha) > 0.35) && free()) g.rails.push({ x0, z0, x1, z1, y0: ha, y1: ha, ax: x, az: z, up: true });
      }
    }
  }
}

// rails along floor ↔ deep water edges inside a rectangle (a fenced pool side)
export function deepRails(g, x0, z0, x1, z1) {
  for (let z = Math.max(1, z0); z <= z1; z++) for (let x = Math.max(1, x0); x <= x1; x++) {
    const i = z * g.n + x;
    if (g.tiles[i] !== FLOOR) continue;
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = DIRS[d], nx = x + dx, nz = z + dz;
      if (nx < 1 || nz < 1 || nx >= g.n || nz >= g.n || g.tiles[nz * g.n + nx] !== DEEP) continue;
      const [a, b, c, e] = edgeOf(x, z, d);
      g.rails.push({ x0: a, z0: b, x1: c, z1: e, y0: g.h[i], y1: g.h[i], ax: x, az: z });
    }
  }
}

// ---------- signs ----------

// a sign on the face of wall tile (wx, wz) that looks into its neighbour (wx+dx, wz+dz)
export function signOn(g, wx, wz, dx, dz, cell, o = {}) {
  const j = (wz + dz) * g.n + (wx + dx);
  const base = o.up ? g.up.h[j] : (g.tiles[j] === RAMP ? g.h[j] + g.rise[j] / 2 : g.tiles[j] === SHALLOW ? g.h[j] + SHALLOW_DEPTH : g.h[j]);
  const graphic = isGraphic(cell);
  g.signs.push({
    x: wx + 0.5 + dx * 0.5, z: wz + 0.5 + dz * 0.5, y: base + (o.y ?? 1.55), nx: dx, nz: dz,
    w: o.w ?? (graphic ? 0.46 : 0.66), h: o.h ?? (graphic ? 0.46 : 0.33), cell, weird: o.weird ?? -1, minT: o.minT ?? 0,
  });
}

const CHALK = [[SIGN.G_SMILE, 0], [SIGN.G_DUCK, 0], [SIGN.CHALK_TEXT, 0.3], [SIGN.G_HANDS, 0.35], [SIGN.G_PRINT, 0.5]];
const PLAIN = [[SIGN.WET, -1], [SIGN.NORUN, SIGN.W_NOLOOK], [SIGN.P_NORUN, SIGN.P_NOTURN], [SIGN.SHOWER, -1], [SIGN.LOCKER, -1]];
// ordinary rooms also draw from these: [cell, the tension from which it can show]
const CHALK_MORE = [[SIGN.G_KIDHANDS, 0.1], [SIGN.CHALK_COUNT, 0.25], [SIGN.CHALK_REPEAT, 0.4], [SIGN.G_POOLSCRAWL, 0.45], [SIGN.G_FIGURE, 0.5], [SIGN.CHALK_CROSS, 0.55], [SIGN.CHALK_UNDER, 0.6], [SIGN.G_CROWD, 0.7]];
const ODD = [[SIGN.F_B7, 0.2], [SIGN.F_13, 0.3], [SIGN.R_CLOSED, 0.25], [SIGN.R_EMPTY, 0.35], [SIGN.R_ANSWER, 0.45], [SIGN.R_NAME, 0.5], [SIGN.F_FRAC, 0.5], [SIGN.R_GUARD, 0.6]];

// A room's sign shows once the tension reaches its gate. SIGN_SHARE0 of the rooms have a visible sign at tension 0, all of them at
// tension 1: `roll` is the room's uniform draw, the gate the tension that reveals its sign. About a fifth of the rooms (pools, sunken
// walkways, some halls) have no wall inside to hang one on, which brings the start to one room in three or four.
export const SIGN_SHARE0 = 0.35;
export const signGate = (roll) => Math.max(0, (roll - SIGN_SHARE0) / (1 - SIGN_SHARE0));

// pick up to `count` wall faces (≥ 5 m apart) and put a sign there that fits what is around it
export function autoSigns(g, r, count, opts = {}) {
  const n = g.n, faces = [];
  const lo = opts.margin ?? 1;
  for (let z = lo; z < n; z++) for (let x = lo; x < n; x++) {
    if (g.tiles[z * n + x] !== WALL) continue;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (nx < 1 || nz < 1 || nx >= n - 1 || nz >= n - 1) continue;
      const t = g.tiles[nz * n + nx];
      if (t !== FLOOR && t !== SHALLOW && t !== RAMP) continue;
      faces.push([x, z, dx, dz]);
    }
  }
  for (let i = faces.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [faces[i], faces[j]] = [faces[j], faces[i]]; }
  const chosen = [];
  for (const [x, z, dx, dz] of faces) {
    if (chosen.length >= count) break;
    if (chosen.some(([a, b]) => Math.hypot(a - x, b - z) < 5)) continue;
    const fx = x + dx, fz = z + dz;
    let shallow = 0, deep = 0, stairs = 0;
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
      const px = fx + a, pz = fz + b;
      if (px < 0 || pz < 0 || px >= n || pz >= n) continue;
      const t = g.tiles[pz * n + px];
      if (t === SHALLOW) shallow++;
      else if (t === DEEP) deep++;
      else if (t === RAMP || t === SPIRAL) stairs++;
    }
    const gate = opts.gate;
    const put = (cell, o = {}) => signOn(g, x, z, dx, dz, cell, gate === undefined ? o : { ...o, minT: Math.max(o.minT ?? 0, gate) });
    // a gated (ordinary) room's sign shows from its gate on; the picture is drawn from what that tension allows
    const pickFrom = (tbl) => { const ok = tbl.filter(([, m]) => m <= gate); return ok[(r() * ok.length) | 0]; };
    if (gate !== undefined && (g.dark[fz * n + fx] || r() < 0.3)) {
      const [cell] = pickFrom([...CHALK, ...CHALK_MORE]);
      put(cell, { y: 0.55 + r() * 0.5, minT: gate });
    } else if (gate !== undefined && (deep || shallow) && r() < 0.4 && ODD.some(([, m]) => m <= gate)) {
      put(pickFrom(ODD)[0], { minT: gate });
    } else if (gate !== undefined && !deep && !shallow && !(stairs && g.up) && r() < 0.5 && ODD.some(([, m]) => m <= gate)) {
      put(pickFrom(ODD)[0], { minT: gate });
    } else if (g.dark[fz * n + fx]) {
      const [cell, minT] = CHALK[(r() * CHALK.length) | 0];
      put(cell, { y: 0.55 + r() * 0.5, minT });
    } else if (deep) {
      if (r() < 0.5) put(SIGN.DEEP, { weird: SIGN.W_DEPTH });
      else put(SIGN.P_NODIVE, { weird: SIGN.P_NOTURN });
    } else if (shallow) put(SIGN.DEPTH, { weird: SIGN.W_DEPTH });
    else if (stairs && g.up) put(SIGN.UP2F, { weird: SIGN.W_3F });
    else {
      const [cell, weird] = PLAIN[(r() * PLAIN.length) | 0];
      put(cell, { weird });
    }
    chosen.push([x, z]);
  }
  // the upper floor gets a couple of its own
  if (g.up && opts.upper !== false && opts.gate === undefined) {
    const up = [];
    for (let z = 1; z < n - 1; z++) for (let x = 1; x < n - 1; x++) {
      if (g.up.tiles[z * n + x] !== WALL) continue;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (nx < 1 || nz < 1 || nx >= n - 1 || nz >= n - 1 || g.up.tiles[nz * n + nx] !== FLOOR) continue;
        up.push([x, z, dx, dz]);
      }
    }
    const pick = [[SIGN.NORUN, SIGN.W_NOLOOK, 0], [SIGN.G_HANDS, -1, 0.3], [SIGN.WET, -1, 0], [SIGN.CHALK_TEXT, -1, 0.4]];
    for (let k = 0; k < Math.min(2, up.length); k++) {
      const [x, z, dx, dz] = up[(r() * up.length) | 0];
      const [cell, weird, minT] = pick[(r() * pick.length) | 0];
      signOn(g, x, z, dx, dz, cell, { up: true, weird, minT, y: cell >= 16 || cell === SIGN.CHALK_TEXT ? 0.8 : 1.55 });
    }
  }
}

// ---------- spiral stair ----------

// centre on a tile corner; the quadrant at angles (sweep, 2π) stays an ordinary floor (ground entry) with the
// upper floor above it (top exit), the other three quadrants become treads
export function addSpiral(g, cx, cz, a0, sense, h0 = 0, h1 = UP_H) {
  const s = { x: g.ox + cx, z: g.oz + cz, rIn: 0.32, rOut: 1.95, h0, h1, a0, sense, sweep: Math.PI * 1.5 };
  for (let z = cz - 2; z < cz + 2; z++) for (let x = cx - 2; x < cx + 2; x++) {
    let a = ((Math.atan2(z + 0.5 - cz, x + 0.5 - cx) - a0) * sense) % TAU;
    if (a < 0) a += TAU;
    const i = z * g.n + x;
    if (a > s.sweep) {   // entry / exit quadrant
      fill(g, x, z, x, z, FLOOR, h0);
      if (g.up) fillUp(g, x, z, x, z, FLOOR, h1);
    } else {
      fill(g, x, z, x, z, SPIRAL, h0);
      if (g.up) g.up.tiles[i] = VOID;
    }
  }
  g.spirals.push(s);
  return s;
}

// ---------- slides ----------

// tube centreline: a short straight lead, an optional arc (signed turn, gently falling), a straight descent of `len`
// metres down to yEnd, then a level run-out of SLIDE_OUT metres so the mouth sits over the water, not in the floor.
// Bends stay high and the steep part comes last, over the pool, so the tube never has to dive through dry floor.
export const SLIDE_OUT = 1.6;
const ARC_FALL = 0.12;
export function slidePath(x, y, z, heading, R, turn, yEnd, len) {
  const pts = [];
  let hx = Math.cos(heading), hz = Math.sin(heading);
  const run = 0.9, out = SLIDE_OUT, step = 0.35;
  const arcLen = turn ? R * Math.abs(turn) : 0;
  const y1 = y - 0.05 * run, y2 = y1 - ARC_FALL * arcLen, s2 = run + arcLen, s3 = s2 + len;
  const yAt = (s) => (s <= run ? y - 0.05 * s : s <= s2 ? y1 - ARC_FALL * (s - run) : s >= s3 ? yEnd : y2 + (yEnd - y2) * ((s - s2) / len));
  // points every `step` metres along a segment, always ending exactly on its end
  const along = (n, f) => { for (let s = step; s < n - 1e-6; s += step) f(s); f(n); };
  pts.push([x, y, z]);
  along(run, (s) => pts.push([x + hx * s, yAt(s), z + hz * s]));
  let px = x + hx * run, pz = z + hz * run;
  if (turn) {
    const side = Math.sign(turn);
    const cx = px - hz * R * side, cz = pz + hx * R * side;   // centre to the turning side
    const a0 = Math.atan2(pz - cz, px - cx);
    along(arcLen, (s) => { const a = a0 + side * (s / R); pts.push([cx + Math.cos(a) * R, yAt(run + s), cz + Math.sin(a) * R]); });
    const ae = a0 + turn;
    px = cx + Math.cos(ae) * R; pz = cz + Math.sin(ae) * R;
    hx = -Math.sin(ae) * side; hz = Math.cos(ae) * side;
  }
  along(len, (s) => pts.push([px + hx * s, yAt(s2 + s), pz + hz * s]));
  const ex = px + hx * len, ez = pz + hz * len;
  along(out, (s) => pts.push([ex + hx * s, yEnd, ez + hz * s]));
  const last = pts[pts.length - 1];
  return { pts, land: { x: last[0] + hx * 0.85, z: last[2] + hz * 0.85 }, length: s3 + out };
}

// tiles under the tube where it hangs low enough to hit a walker
function tubeBlocks(g, pts, skipEntry) {
  const out = new Set();
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay, az] = pts[k], [bx, by, bz] = pts[k + 1];
    for (let s = 0; s <= 1; s += 0.25) {
      const x = ax + (bx - ax) * s, y = ay + (by - ay) * s, z = az + (bz - az) * s;
      for (const [ox, oz] of [[0, 0], [0.42, 0], [-0.42, 0], [0, 0.42], [0, -0.42]]) {
        const tx = Math.floor(x + ox - g.ox), tz = Math.floor(z + oz - g.oz);
        if (tx < 0 || tz < 0 || tx >= g.n || tz >= g.n) continue;
        const i = tz * g.n + tx;
        const f = floorTop(g, i, tx + 0.5 + g.ox, tz + 0.5 + g.oz);
        if (f !== null && y - TUBE_R < Math.max(f, groundWater(g, i) || f) + 2.05) out.add(i);
      }
    }
  }
  if (skipEntry) out.delete(skipEntry);
  return out;
}

// a rideable slide from the upper tile (ux, uz) out over its side (dx, dz). Added only when the whole ride
// fits and ends over walkable shallow water; otherwise nothing is added and the edge keeps its rail.
const CURVED = [], STRAIGHT = [];
for (const len of [2.4, 3, 3.8, 4.8]) for (const R of [3, 2.4, 2, 1.6, 1.4]) for (const t of [0.15, 0.25, 0.35, 0.5, 0.65, 0.8, 1]) CURVED.push([R, Math.PI * t, len], [R, -Math.PI * t, len]);
for (const len of [7, 6, 5.2, 4.5]) STRAIGHT.push([0, 0, len]);
const shuffled = (list, r) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export function tryAddSlide(g, ux, uz, dx, dz, r) {
  // which shape is tried first is a weighted coin flip (the u-turn room only fits a straight tube, so the other rooms
  // lean towards bends); the other shape is the fallback. A unit test keeps the mix near half and half.
  const first = r() < 0.36 ? STRAIGHT : CURVED;
  const variants = shuffled(first, r).concat(shuffled(first === STRAIGHT ? CURVED : STRAIGHT, r));
  const n = g.n, ui = uz * n + ux;
  if (!g.up || g.up.tiles[ui] !== FLOOR) return null;
  const vx = ux + dx, vz = uz + dz;
  if (vx < 1 || vz < 1 || vx >= n - 1 || vz >= n - 1 || g.up.tiles[vz * n + vx] !== VOID) return null;
  const ex = ux + 0.5 + dx * 0.5, ez = uz + 0.5 + dz * 0.5, eh = g.up.h[ui];
  const heading = Math.atan2(dz, dx);
  for (const [R, turn, len] of variants) {
    const yEnd = DEEP_WATER + 0.42;
    const path = slidePath(ex, eh + 0.55, ez, heading, R, turn, yEnd, len);
    if (!slideFits(g, path, ex, ez)) continue;
    const blocks = tubeBlocks(g, path.pts, -1);
    // land a little past the mouth, where the whole body fits in open shallow water
    const [px, , pz] = path.pts[path.pts.length - 1], [qx, , qz] = path.pts[path.pts.length - 2];
    const hl = Math.hypot(px - qx, pz - qz) || 1, hx = (px - qx) / hl, hz = (pz - qz) / hl;
    const fits = (x, z) => [[0, 0], [-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]].every(([a, b]) => {
      const tx = Math.floor(x + a), tz = Math.floor(z + b);
      if (tx < 1 || tz < 1 || tx >= n - 1 || tz >= n - 1) return false;
      const i = tz * n + tx;
      return g.tiles[i] === SHALLOW && !g.block[i] && !blocks.has(i);
    });
    let land = null;
    for (let d = 0.85; d <= 2.2 && !land; d += 0.15) if (fits(px + hx * d, pz + hz * d)) land = { x: px + hx * d, z: pz + hz * d };
    if (!land) continue;
    path.land = land;
    const lx = Math.floor(land.x), lz = Math.floor(land.z);
    // the landing must open onto the rest of the room, not a pocket boxed in by the tube's own footprint
    const fresh = [...blocks].filter((i) => !g.block[i]);
    for (const i of fresh) g.block[i] = 1;
    const out = gridReach(g, [[lx, lz, 0]]);
    let open = 0;
    for (let z = 0; z < n && open < 30; z++) for (let x = 0; x < n; x++) if (out(x, z, 0)) open++;
    if (open < 30) { for (const i of fresh) g.block[i] = 0; continue; }
    const s = {
      pts: path.pts.map(([x, y, z]) => [x + g.ox, y, z + g.oz]),
      entry: { x: ex + g.ox, z: ez + g.oz, nx: dx, nz: dz, h: eh },
      land: { x: path.land.x + g.ox, z: path.land.z + g.oz },
      color: (r() * SLIDE_COLORS.length) | 0, length: path.length, straight: !turn,
    };
    g.slides.push(s);
    const [a, b, c, e] = edgeOf(ux, uz, DIRS.findIndex(([p, q]) => p === dx && q === dz));
    g.noRail.push({ x0: a, z0: b, x1: c, z1: e });
    return s;
  }
  return null;
}

// the whole tube stays inside the grid, over open air upstairs, clear of walls, treads and slabs
function slideFits(g, path, ex, ez) {
  const n = g.n;
  for (const [x, y, z] of path.pts) {
    if (Math.hypot(x - ex, z - ez) < 0.9) continue;   // the mouth rests on the floor edge
    for (const [ox, oz] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
      const tx = Math.floor(x + ox), tz = Math.floor(z + oz);
      if (tx < 1 || tz < 1 || tx >= n - 1 || tz >= n - 1) return false;
      const i = tz * n + tx, t = g.tiles[i];
      if (t === WALL || t === BARS || t === COLS || t === SPIRAL) return false;
      if (t === RAMP && y - TUBE_R < g.h[i] + g.rise[i] + 2.1) return false;
      if (g.up && g.up.tiles[i] !== VOID && y + TUBE_R > UP_H - SLAB - 0.05 && y - TUBE_R < UP_H + 2.2) return false;
      const f = floorTop(g, i, tx + 0.5, tz + 0.5);
      if (f !== null && y - TUBE_R < f - 0.02) return false;   // never buried in a floor
    }
  }
  return true;
}

// decorative tube that comes down out of the ceiling and coils onto the floor; it has no entrance
export function decoSlide(g, cx, cz, r) {
  const R = 1.25, turns = 1.6, yTop = 9, yEnd = 0.5;
  const pts = [], a0 = r() * TAU, dir = r() < 0.5 ? 1 : -1;
  const steps = 40;
  for (let k = 0; k <= steps; k++) {
    const s = k / steps, a = a0 + dir * s * turns * TAU;
    pts.push([cx + Math.cos(a) * R, yTop + (yEnd - yTop) * Math.min(1, s * 1.08), cz + Math.sin(a) * R]);
  }
  for (const i of tubeBlocks(g, pts.map(([x, y, z]) => [x, y, z]), -1)) g.block[i] = 1;
  g.slides.push({ pts: pts.map(([x, y, z]) => [x + g.ox, y, z + g.oz]), entry: null, land: null, color: (r() * SLIDE_COLORS.length) | 0 });
}

// ---------- sealed room: visible through bars / dense pillars, never enterable ----------

export function sealedRoom(g, x0, z0, x1, z1, r, kind) {
  const ring = r() < 0.5 ? BARS : COLS;
  fill(g, x0, z0, x1, z1, ring, 0);
  fill(g, x0 + 1, z0 + 1, x1 - 1, z1 - 1, FLOOR, 0);
  const ix0 = x0 + 1, iz0 = z0 + 1, ix1 = x1 - 1, iz1 = z1 - 1;
  const what = kind ?? ['pool', 'stairs', 'water', 'pool'][(r() * 4) | 0];
  if (what === 'pool' && ix1 - ix0 >= 2 && iz1 - iz0 >= 2) fill(g, ix0 + 1, iz0 + 1, ix1 - 1, iz1 - 1, FLOOR, -1.2);
  else if (what === 'stairs') {
    // a flight that climbs to a ledge and stops in mid-air
    const len = Math.min(3, ix1 - ix0);
    ramp(g, ix0, iz0 + 1, ix0 + len - 1, iz0 + 1, 0, 0, 0.45);
    fill(g, ix0 + len, iz0 + 1, ix0 + len, iz0 + 1, FLOOR, 0.45 * len);
  } else {
    fill(g, ix0, iz0, ix1, iz1, SHALLOW, SHALLOW_FLOOR);
    g.floaters.push({ x: g.ox + (ix0 + ix1 + 1) / 2, z: g.oz + (iz0 + iz1 + 1) / 2, y: SHALLOW_FLOOR + SHALLOW_DEPTH, kind: 'ring', phase: r() * TAU, color: (r() * 4) | 0 });
  }
  g.lamps.push({ x: ix0, z: iz0, w: ix1 - ix0 + 1, d: iz1 - iz0 + 1, k: 1 });
  g.sealed.push({ x: g.ox + x0, z: g.oz + z0, w: x1 - x0 + 1, d: z1 - z0 + 1 });
}

// A half-chunk sealed room: the strip of the chunk along side d (a direction index) is a 15 × 6 room walled in by bars or
// pillars, with two framed windows in the outer wall. Its doorway on that side is walled up (see levelmap.js halfRoom).
// Drawn in a frame where u runs along the wall (1..15) and v goes into the chunk (1..6), then mapped onto the grid.
const HALF_MAP = [(u, v) => [16 - v, u], (u, v) => [v, u], (u, v) => [u, 16 - v], (u, v) => [u, v]];   // east, west, south, north
const HALF_FACE = [[-1, 0], [1, 0], [0, -1], [0, 1]];   // into the room, per side

export function halfSealedRoom(g, side, r) {
  const map = HALF_MAP[side], at = (u, v) => map(u, v);
  const cont = (u, v) => (side === 0 ? [17 - v, u] : side === 1 ? [v, u] : side === 2 ? [u, 17 - v] : [u, v]);   // boundary / centre coordinates (tile t spans t..t+1)
  const rect = (u0, v0, u1, v1) => {   // tiles u0..u1, v0..v1 → grid rect
    const [a, b] = at(u0, v0), [c, d] = at(u1, v1);
    return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
  };
  const ring = r() < 0.5 ? BARS : COLS;
  fill(g, ...rect(1, 1, 15, 6), ring, 0);
  fill(g, ...rect(2, 2, 14, 5), FLOOR, 0);
  const [x0, z0, x1, z1] = rect(2, 2, 14, 5);
  const what = ['deep', 'slide', 'stairs'][(r() * 3) | 0];
  if (what === 'deep') fill(g, x0, z0, x1, z1, DEEP, DEEP_FLOOR);
  else if (what === 'slide') {
    fill(g, x0, z0, x1, z1, SHALLOW, SHALLOW_FLOOR);
    const [cx, cz] = cont(8, 3.5);
    decoSlide(g, cx, cz, r);
  } else {
    // a flight climbing along the room to a ledge that stops in mid-air
    const [a0, b0, a1, b1] = rect(3, 3, 7, 4);
    ramp(g, a0, b0, a1, b1, side < 2 ? 2 : 0, 0, 0.45);
    fill(g, ...rect(8, 3, 8, 4), FLOOR, 0.45 * 5);
  }
  g.lamps.push({ x: x0, z: z0, w: x1 - x0 + 1, d: z1 - z0 + 1, k: 1 });
  // two windows in the outer wall, their beams falling across the room
  for (const u of [4, 12]) {
    const [wx, wz] = cont(u, 1.02), [bx0, bz0, bx1, bz1] = rect(u - 1, 2, u, 4);
    g.suns.push({ x: bx0, z: bz0, w: bx1 - bx0 + 1, d: bz1 - bz0 + 1, wx, wz, wy: 3.2, nx: HALF_FACE[side][0], nz: HALF_FACE[side][1], sky: false });
  }
  const [sx0, sz0, sx1, sz1] = rect(1, 1, 15, 6);
  g.sealed.push({ x: g.ox + sx0, z: g.oz + sz0, w: sx1 - sx0 + 1, d: sz1 - sz0 + 1 });
}

// ---------- floating toys ----------

export function scatterFloaters(g, r, chance) {
  if (r() >= chance) return;
  const water = [];
  for (let i = 0; i < g.n * g.n; i++) {
    if ((g.tiles[i] === SHALLOW || g.tiles[i] === DEEP) && !g.block[i]) water.push(i);
  }
  if (!water.length) return;
  const count = 1 + ((r() * 3) | 0);
  for (let k = 0; k < count; k++) {
    const i = water[(r() * water.length) | 0];
    const x = i % g.n, z = (i / g.n) | 0;
    g.floaters.push({
      x: g.ox + x + 0.25 + r() * 0.5, z: g.oz + z + 0.25 + r() * 0.5, y: groundWater(g, i),
      kind: 'ring', phase: r() * TAU, color: (r() * 4) | 0,
    });
  }
}

// ---------- stair rooms (16×16, two floors; spine x/z 6..9 stays walkable at ground level) ----------

// upper border cells next to an upper floor become walls (the chunk's outer skin upstairs)
function borderUpWalls(g) {
  const n = g.n, u = g.up;
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    if (x && z && x < n - 1 && z < n - 1) continue;
    const i = z * n + x;
    if (u.tiles[i] !== VOID) continue;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const t = u.tiles[nz * n + nx];
      if (t === FLOOR || t === SHALLOW) { u.tiles[i] = WALL; break; }
    }
  }
}

const walls = (g, cells, up = false) => { for (const [x, z] of cells) (up ? fillUp(g, x, z, x, z, WALL) : fill(g, x, z, x, z, WALL, 0)); };
const SLAB_LAMP = UP_H - SLAB - 0.02;

// A: round spiral stair, L-shaped gallery, pool and slide
function tplSpiral(g, r) {
  addUpper(g);
  fillUp(g, 1, 1, 14, 5, FLOOR);
  fillUp(g, 1, 6, 5, 14, FLOOR);
  // stacked rooms: the same footprint walled on both floors
  const roomNW = [[5, 1], [5, 2], [5, 4], [1, 5], [2, 5], [4, 5], [5, 5]];
  walls(g, roomNW); walls(g, roomNW.filter(([x, z]) => !(x === 2 && z === 5)).concat([[3, 5]]), true);
  mark(g, 'dark', 1, 1, 4, 4);
  walls(g, [[1, 10], [3, 10], [4, 10], [5, 10], [5, 11], [5, 13], [5, 14]]);
  mark(g, 'dark', 1, 11, 4, 14);
  fillUp(g, 7, 1, 9, 2, SHALLOW, UP_H - 0.4);
  fill(g, 7, 8, 14, 14, SHALLOW, SHALLOW_FLOOR);   // a pool big enough for the slide to bend before it drops
  addSpiral(g, 12, 6, 0, 1);
  g.lamps.push({ x: 7, z: 7, w: 2, d: 2, k: 0 }, { x: 10, z: 10, w: 4, d: 4, k: 1 },
    { x: 2, z: 2, w: 1, d: 1, k: 0, y: SLAB_LAMP }, { x: 7, z: 2, w: 2, d: 1, k: 0, y: SLAB_LAMP }, { x: 2, z: 7, w: 1, d: 2, k: 0, y: SLAB_LAMP });
  g.upLamps.push({ x: 2, z: 2, w: 2, d: 2, k: 0 }, { x: 8, z: 2, w: 2, d: 1, k: 0 }, { x: 2, z: 9, w: 2, d: 2, k: 0 }, { x: 11, z: 2, w: 2, d: 1, k: 0 });
  if (r() < 0.6) tryAddSlide(g, 5, 12, 1, 0, r);
  if (r() < 0.4) g.suns.push({ x: 11.5, z: 12, w: 2.2, d: 2.2, wx: 11.5, wz: 12, sky: true });
}

// B: straight long stair in a walled stairwell, its foot under water, sunlight from a high window
function tplStraight(g, r) {
  addUpper(g);
  fillUp(g, 1, 1, 14, 5, FLOOR);
  const roomNE = [[10, 1], [10, 2], [10, 4], [10, 5], [11, 5], [13, 5], [14, 5]];
  walls(g, roomNE); walls(g, roomNE.filter(([x, z]) => !(x === 10 && z === 4)).concat([[10, 3]]), true);
  mark(g, 'dark', 11, 1, 14, 4);
  fillUp(g, 6, 1, 8, 2, SHALLOW, UP_H - 0.4);
  fill(g, 1, 12, 8, 14, SHALLOW, SHALLOW_FLOOR);
  fill(g, 6, 10, 11, 14, SHALLOW, SHALLOW_FLOOR);
  ramp(g, 2, 8, 3, 13, 3, SHALLOW_FLOOR, (UP_H - SHALLOW_FLOOR) / 6);   // six tiles, 0.82 m a tile
  fill(g, 2, 6, 3, 7, FLOOR, UP_H);                                       // the landing at the top, level with the gallery
  mark(g, 'wet', 2, 13, 3, 13);
  fill(g, 1, 6, 1, 11, WALL, 0);
  fill(g, 4, 6, 4, 11, WALL, 0);
  g.lamps.push({ x: 6, z: 7, w: 3, d: 3, k: 0 }, { x: 11, z: 10, w: 3, d: 3, k: 0 }, { x: 2, z: 12, w: 4, d: 2, k: 1 },
    { x: 7, z: 2, w: 2, d: 2, k: 0, y: SLAB_LAMP }, { x: 12, z: 2, w: 1, d: 1, k: 0, y: SLAB_LAMP });
  g.upLamps.push({ x: 2, z: 2, w: 2, d: 2, k: 0 }, { x: 7, z: 3, w: 2, d: 1, k: 0 }, { x: 12, z: 2, w: 2, d: 2, k: 0 });
  // window high in the stairwell's west wall, the beam falls across the treads
  g.suns.push({ x: 2.5, z: 9.5, w: 2, d: 2.5, wx: 2.02, wz: 9, wy: UP_H + 1.7, nx: 1, nz: 0, sky: false });
  if (r() < 0.6) tryAddSlide(g, 9, 5, 0, 1, r);
}

// C: U-turn (回字) stair with a landing, east gallery, pool
function tplUTurn(g, r) {
  addUpper(g);
  fillUp(g, 1, 1, 14, 5, FLOOR);
  fillUp(g, 10, 6, 14, 14, FLOOR);
  const roomSE = [[10, 10], [11, 10], [13, 10], [14, 10]];
  walls(g, roomSE); walls(g, roomSE, true);
  walls(g, [[10, 11], [10, 12], [10, 14]]); walls(g, [[10, 11], [10, 13], [10, 14]], true);
  mark(g, 'dark', 11, 11, 14, 14);
  fillUp(g, 12, 6, 13, 8, SHALLOW, UP_H - 0.4);
  ramp(g, 6, 6, 7, 8, 2, 0, UP_H / 6);            // flight 1 climbs south, three tiles at 0.75 m
  fill(g, 4, 9, 7, 10, FLOOR, UP_H / 2);          // landing
  ramp(g, 4, 6, 5, 8, 3, UP_H / 2, UP_H / 6);     // flight 2 climbs back north onto the gallery
  fill(g, 1, 12, 5, 14, SHALLOW, SHALLOW_FLOOR);
  g.lamps.push({ x: 5, z: 7, w: 3, d: 3, k: 1 }, { x: 1, z: 12, w: 3, d: 2, k: 0 }, { x: 7, z: 12, w: 2, d: 2, k: 0 },
    { x: 7, z: 2, w: 2, d: 2, k: 0, y: SLAB_LAMP }, { x: 12, z: 7, w: 1, d: 2, k: 0, y: SLAB_LAMP });
  g.upLamps.push({ x: 2, z: 2, w: 2, d: 2, k: 0 }, { x: 8, z: 2, w: 2, d: 2, k: 0 }, { x: 12, z: 11, w: 2, d: 2, k: 0 });
  if (r() < 0.5) g.suns.push({ x: 5, z: 10.5, w: 3, d: 2, wx: 5, wz: 10.5, sky: true });
  if (r() < 0.5) tryAddSlide(g, 10, 12, -1, 0, r);
}

const STAIR_TEMPLATES = [tplSpiral, tplStraight, tplUTurn];

// a stair room on a fresh 16×16 grid, mirrored / rotated by the seed
export function stairRoom(r) {
  let g = newGrid(16);
  g.ox = 0; g.oz = 0;
  const t = (r() * STAIR_TEMPLATES.length) | 0;
  STAIR_TEMPLATES[t](g, r);
  borderUpWalls(g);
  g = transformGrid(g, (r() * 8) | 0);
  g.ox = 0; g.oz = 0;
  g.variant = ['spiral', 'straight', 'uturn'][t];
  return g;
}

// ---------- zone 2 「階梯高低池」: a two-floor gallery round a sunlit pool atrium ----------

export function zoneTerraces(r) {
  const g = newGrid(32);
  g.ox = 0; g.oz = 0;
  addUpper(g);
  // ground: walkway ring 1..3, a solid band under the gallery that gets carved into rooms, the atrium 10..21
  fill(g, 4, 4, 27, 27, WALL, 0);
  fill(g, 10, 10, 21, 21, FLOOR, 0);
  fillUp(g, 4, 4, 27, 27, FLOOR);
  fillUp(g, 10, 10, 21, 21, VOID);
  fillUp(g, 3, 3, 28, 3, WALL); fillUp(g, 3, 28, 28, 28, WALL); fillUp(g, 3, 3, 3, 28, WALL); fillUp(g, 28, 3, 28, 28, WALL);
  // the four bands under the gallery, carved the same way: u along the band, v = depth 4 (outside) .. 9 (atrium side)
  const sides = [(u, v) => [u, v], (u, v) => [u, 31 - v], (u, v) => [v, u], (u, v) => [31 - v, u]];
  for (const at of sides) {
    const cell = (u, v, type = FLOOR) => { const [x, z] = at(u, v); fill(g, x, z, x, z, type, 0); };
    for (let u = 4; u <= 27; u++) { cell(u, 5); mark(g, 'dark', ...at(u, 5), ...at(u, 5)); mark(g, 'low', ...at(u, 5), ...at(u, 5)); }
    for (const u of [8, 24]) cell(u, 4);                       // doors from the outer walkway
    for (let u = 6; u <= 25; u++) for (let v = 7; v <= 9; v++) cell(u, v);
    for (const u of [6, 13, 18, 25]) cell(u, 6);               // doors from the dark corridor into the rooms
    for (const u of [10, 15, 21]) for (let v = 7; v <= 8; v++) cell(u, v, WALL);
  }
  // atrium pool with a deep end
  fill(g, 11, 11, 20, 20, SHALLOW, SHALLOW_FLOOR);
  fill(g, 16, 13, 19, 18, DEEP, DEEP_FLOOR);
  // spiral in the north-east corner of the atrium
  addSpiral(g, 22, 10, 0, 1);
  // straight flight out of the pool up to the north gallery
  fillUp(g, 13, 10, 14, 10, VOID);
  ramp(g, 13, 10, 14, 16, 3, SHALLOW_FLOOR, (UP_H - SHALLOW_FLOOR) / 7);
  mark(g, 'wet', 13, 16, 14, 16);
  // flooded south-west: the whole lower level under the gallery is under water; an L stair climbs out of it
  for (let z = 22; z <= 26; z++) for (let x = 5; x <= 15; x++) {
    const i = z * 32 + x;
    if (g.tiles[i] === FLOOR) { g.tiles[i] = SHALLOW; g.h[i] = SHALLOW_FLOOR; }
  }
  fill(g, 10, 24, 11, 24, SHALLOW, SHALLOW_FLOOR);
  ramp(g, 10, 20, 11, 23, 3, SHALLOW_FLOOR, 0.7);    // flight 1 climbs north out of the water
  mark(g, 'wet', 10, 23, 11, 23);
  fill(g, 10, 18, 11, 19, FLOOR, UP_H / 2);         // landing
  ramp(g, 7, 18, 9, 19, 1, UP_H / 2, (UP_H - UP_H / 2) / 3);   // flight 2 turns west onto the gallery
  fillUp(g, 7, 18, 11, 23, VOID);
  fillUp(g, 6, 18, 6, 19, FLOOR);
  // sealed shallow room behind bars under the north gallery
  sealedRoom(g, 15, 6, 20, 9, r, 'water');
  for (let x = 15; x <= 20; x++) fill(g, x, 9, x, 9, BARS, 0);
  // upper rooms and an upper pool
  walls(g, [[8, 4], [8, 5], [8, 7], [8, 8], [4, 8], [6, 8], [7, 8]], true);
  walls(g, [[23, 23], [23, 24], [23, 26], [23, 27], [24, 23], [26, 23], [27, 23]], true);
  fillUp(g, 24, 13, 26, 17, SHALLOW, UP_H - 0.4);
  // light: skylights over the atrium, dim lamps under the slab, lamps along the gallery
  g.lamps.push({ x: 12, z: 12, w: 3, d: 3, k: 1 }, { x: 17, z: 12, w: 3, d: 3, k: 1 }, { x: 12, z: 17, w: 3, d: 3, k: 1 },
    { x: 17, z: 17, w: 3, d: 3, k: 1 }, { x: 10, z: 18, w: 2, d: 2, k: 0 });
  for (const [x, z] of [[7, 8], [24, 8], [8, 24], [24, 24], [16, 8], [8, 16], [23, 16]]) g.lamps.push({ x, z, w: 1, d: 1, k: 0, y: SLAB_LAMP });
  for (const [x, z] of [[1, 1], [14, 1], [28, 1], [1, 14], [28, 14], [1, 28], [14, 28], [28, 28]]) g.lamps.push({ x, z, w: 3, d: 2, k: 0 });
  for (const [x, z] of [[5, 5], [15, 5], [24, 5], [5, 15], [24, 19], [5, 24], [15, 24], [24, 25]]) g.upLamps.push({ x, z, w: 2, d: 2, k: 0 });
  g.suns.push({ x: 11, z: 19, w: 2.5, d: 2.5, wx: 11, wz: 19, sky: true }, { x: 15, z: 13, w: 2, d: 3, wx: 15, wz: 13, sky: true });
  tryAddSlide(g, 22, 15, -1, 0, r);
  g.floaters.push({ x: 12.2, z: 19.4, y: DEEP_WATER, kind: 'ring', phase: 1, color: 1 });
  autoRails(g);
  autoSigns(g, r, 7, { margin: 2 });
  return g;
}

// zone-wide cross passages through a solid ring (zones 1 and 4): two tiles wide under a barrel vault, on tiles 7-8 of each chunk
// (the line a corridor chunk uses), one sparse lamp half way along each
export function ringPassages(g, lo, hi) {
  for (const p of [7, 23]) {
    for (const [x0, z0, x1, z1, zRun] of [[0, p, lo, p + 1, 0], [p, 0, p + 1, lo, 1], [hi, p, 31, p + 1, 0], [p, hi, p + 1, 31, 1]]) {
      fill(g, x0, z0, x1, z1, FLOOR, 0);
      vaultCells(g, x0, z0, x1, z1, zRun);
      g.lamps.push(zRun ? { x: p + 0.5, z: (z0 + z1) >> 1, w: 1, d: 1, k: 0 } : { x: (x0 + x1) >> 1, z: p + 0.5, w: 1, d: 1, k: 0 });
    }
  }
}

// ---------- deeper shallow pools (L10) ----------

export const POOL_STEP = 0.42;   // each tile inward from a shallow pool's rim is this much deeper: under the 0.45 m a body can climb
// Dig the room's ordinary shallow pools (floor 0.4 m down) to `depth` metres (0.9 or 1.4): the rim tile stays at 0.4 and
// the floor steps down by POOL_STEP a tile until it reaches the depth, so the way out is always a climbable step.
// A pool of 1.4 m gets a half-sunk fence row across part of it; some pools get a rail all round with one gap in it.
// Neither may cut any walkable tile off from the chunk edge (checked with the same reach the slides use).
export function deepenPools(g, depth, r) {
  const n = g.n, N = n * n, WATER = -0.02;
  const pool = (i) => g.tiles[i] === SHALLOW && Math.abs(g.h[i] - SHALLOW_FLOOR) < 0.01 && !g.block[i];
  const dist = new Int16Array(N).fill(-1), q = [];
  for (let i = 0; i < N; i++) {
    if (!pool(i)) continue;
    const x = i % n, z = (i / n) | 0;
    if (DIRS.some(([dx, dz]) => { const a = x + dx, b = z + dz; return a < 0 || b < 0 || a >= n || b >= n || !pool(b * n + a); })) { dist[i] = 0; q.push(i); }
  }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % n, z = (i / n) | 0;
    for (const [dx, dz] of DIRS) { const a = x + dx, b = z + dz; if (a < 0 || b < 0 || a >= n || b >= n) continue; const j = b * n + a; if (pool(j) && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); } }
  }
  let dug = 0, deepest = 0;
  for (let i = 0; i < N; i++) {
    if (dist[i] < 1) continue;
    const h = -Math.min(0.4 + POOL_STEP * dist[i], depth + WATER * -1);
    g.h[i] = h; g.form[i] |= FORM_DEEPER; dug++;
    deepest = Math.min(deepest, h);
  }
  if (!dug) return 0;
  // the walkable tiles reachable from the chunk's edge tiles before and after adding rails
  const edgeStarts = [];
  for (let i = 0; i < N; i++) { const x = i % n, z = (i / n) | 0; if ((x === 0 || z === 0 || x === n - 1 || z === n - 1) && walkTop(g, i, g.ox + x + 0.5, g.oz + z + 0.5) !== null) edgeStarts.push([x, z, 0]); }
  const reachCount = () => { const ok = gridReach(g, edgeStarts); let c = 0; for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) if (ok(x, z, 0)) c++; return c; };
  const before = reachCount();
  const tryRails = (list) => {
    const mark = g.rails.length;
    for (const rl of list) g.rails.push(rl);
    if (reachCount() < before) { g.rails.length = mark; return false; }
    return true;
  };
  const rim = [];   // edges between a dry floor tile and a pool tile
  for (let i = 0; i < N; i++) {
    if (g.tiles[i] !== FLOOR) continue;
    const x = i % n, z = (i / n) | 0;
    if (x < 1 || z < 1 || x >= n - 1 || z >= n - 1) continue;
    DIRS.forEach(([dx, dz], d) => {
      const j = (z + dz) * n + x + dx;
      if (dist[j] === 0) { const [x0, z0, x1, z1] = edgeOf(x, z, d); rim.push({ x0, z0, x1, z1, y0: g.h[i], y1: g.h[i], ax: x, az: z }); }
    });
  }
  if (rim.length > 6 && r() < 0.5) {
    const gap = (r() * rim.length) | 0;
    tryRails(rim.filter((_, k) => Math.abs(k - gap) > 1));
  }
  if (depth > 1.2 && deepest < -1.2) {
    // a fence of 3-5 tiles standing in the deep part, its top half a metre above the water
    const deep = [];
    for (let i = 0; i < N; i++) if (g.h[i] < -1.2 && g.tiles[i] === SHALLOW) deep.push(i);
    for (let t = 0; t < 8 && deep.length; t++) {
      const i = deep[(r() * deep.length) | 0], x = i % n, z = (i / n) | 0, alongX = r() < 0.5;
      const len = 3 + ((r() * 3) | 0), edges = [];
      for (let k = 0; k < len; k++) {
        const tx = alongX ? x + k : x, tz = alongX ? z : z + k;
        if (tx >= n || tz >= n || !(g.form[tz * n + tx] & FORM_DEEPER) || g.tiles[tz * n + tx] !== SHALLOW) break;
        const [x0, z0, x1, z1] = edgeOf(tx, tz, alongX ? 3 : 1);
        const y = g.h[tz * n + tx];
        edges.push({ x0, z0, x1, z1, y0: y, y1: y, ax: tx, az: tz, h: WATER + 0.5 - y });
      }
      if (edges.length >= 3 && tryRails(edges)) break;
    }
  }
  return dug;
}

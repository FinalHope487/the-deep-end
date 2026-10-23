// Generator v2 prototype: turns one 64 m cell's plan (gen2.js) into merged geometries — floors with pools cut out along
// their true rims, pool walls and sloping bottoms, water, walls and ceilings from a 0.5 m raster of each floor, and the
// enclosed flights between floors. Light is baked into vertex colours like chunkmesh.js; materials are the same.
import * as THREE from 'three';
import { Q2, FLIGHT_WALL, LANDING, cellRaster, poolBox, shapeOutline, shapeContains, poolDepth, poolBands } from './gen2.js';
import { lightAt } from './lighting.js';
import { ATLAS_W, ATLAS_H } from './levels.js';
import { DRY } from './chunkmesh.js';

const C2 = {
  floor: [1, 0.985, 0.955], wall: [0.93, 0.935, 0.93], ceil: [0.74, 0.77, 0.79], poolWall: [0.5, 0.76, 0.92], pool: [0.55, 0.82, 0.97],
  shallow: [0.5, 0.88, 0.93], deep: [0.05, 0.3, 0.56], lamp: [1, 1, 1], teal: [0.32, 0.5, 0.52],
};
const B1_TINT = [0.36, 0.52, 0.6];       // the basement: dark and cold
const LAMP_UV2 = [1 - 4 / ATLAS_W, 1 - (ATLAS_W - 4) / ATLAS_H];   // white corner of the sign atlas
const MERGE2 = 4;                        // raster cells merged into one quad at most (2 m): keeps the baked light smooth
const RISER = 0.17;

class Buf2 {
  constructor(alpha = false, wet = false) { this.pos = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; this.alpha = alpha; this.wet = wet ? [] : null; }
  v(x, y, z, u, w, c, wd = DRY) {
    this.pos.push(x, y, z); this.uv.push(u, w);
    if (this.alpha) this.col.push(c[0], c[1], c[2], c[3]); else this.col.push(c[0], c[1], c[2]);
    if (this.wet) this.wet.push(wd);
    return this.n++;
  }
  // a triangle turned to face `hint` (a direction its front should look along)
  tri(a, b, c, hint) {
    const p = this.pos, ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az, vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
  quad(a, b, c, d, hint) { this.tri(a, b, c, hint); this.tri(a, c, d, hint); }
  geometry() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, this.alpha ? 4 : 3));
    if (this.wet) g.setAttribute('wetDepth', new THREE.Float32BufferAttribute(this.wet, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const UP = [0, 1, 0], DOWN = [0, -1, 0];
const shade = (c, l, tint) => (tint ? [c[0] * l * tint[0], c[1] * l * tint[1], c[2] * l * tint[2]] : [c[0] * l, c[1] * l, c[2] * l]);

// greedy rectangles of raster cells where ok(k) holds and key(k) is equal, at most MERGE2 cells a side
function rects2(n, ok, key, out) {
  const used = new Uint8Array(n * n);
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    const k0 = b * n + a;
    if (used[k0] || !ok(k0)) continue;
    const kv = key(k0);
    let w = 1;
    while (w < MERGE2 && a + w < n && !used[k0 + w] && ok(k0 + w) && key(k0 + w) === kv) w++;
    let d = 1;
    grow: while (d < MERGE2 && b + d < n) {
      for (let t = 0; t < w; t++) { const k = (b + d) * n + a + t; if (used[k] || !ok(k) || key(k) !== kv) break grow; }
      d++;
    }
    for (let z = 0; z < d; z++) for (let t = 0; t < w; t++) used[(b + z) * n + a + t] = 1;
    out(a, b, w, d, kv);
  }
}

// cut a polygon list [[x, z]...] into triangles (outer contour plus holes); returns [points, faces]
function triangulate2(contour, holes) {
  const v = (p) => new THREE.Vector2(p[0], p[1]);
  const c = contour.map(v), h = holes.map((hl) => hl.map(v));
  const faces = THREE.ShapeUtils.triangulateShape(c, h);
  return [contour.concat(...holes), faces];
}

// the whole cell, a section at a time (each yield is a slice of a frame's mesh budget)
export function* buildCell2(world, i, j) {
  const plan = world.plan(i, j), st = new Buf2(false, true), lamps = new Buf2(), water = new Buf2(true);
  const lampsOf = new Map(plan.rooms.map((o) => [o.id, o.lamps]));
  for (const lv of [-1, 0, 1]) {
    if (!plan.rooms.some((o) => o.lv === lv)) continue;
    const R = cellRaster(world, i, j, lv), n = R.n, Y = world.Y[lv], tint = lv < 0 ? B1_TINT : null;
    yield;
    const light = (k, x, z) => lightAt(lampsOf.get(R.room[k]) || [], x, z);
    const cx = (a) => R.ox + a * Q2, cz = (b) => R.oz + b * Q2;
    // floors (pool boxes and flight footprints left out)
    rects2(n, (k) => R.inside[k] && !R.flight[k] && !R.pool[k], (k) => R.room[k], (a, b, w, d) => {
      const k = b * n + a, x0 = cx(a), z0 = cz(b), x1 = cx(a + w), z1 = cz(b + d);
      const vs = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => st.v(x, Y, z, x, z, shade(C2.floor, light(k, x, z), tint)));
      st.quad(...vs, UP);
    });
    // ceilings, and the step faces where a corridor's lower ceiling meets a hall
    rects2(n, (k) => R.inside[k] && !R.flight[k], (k) => R.ceil[k] * 1000 + R.room[k], (a, b, w, d) => {
      const k = b * n + a, x0 = cx(a), z0 = cz(b), x1 = cx(a + w), z1 = cz(b + d), y = Y + R.ceil[k];
      const vs = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => st.v(x, y, z, x, z, shade(C2.ceil, light(k, x, z), tint)));
      st.quad(...vs, DOWN);
    });
    yield;
    // walls: every raster edge between room floor and solid ground (not the open end of a flight), merged into runs
    const outside = (a, b) => {
      if (a >= 0 && b >= 0 && a < n && b < n) { const k = b * n + a; return !R.inside[k] && !R.flight[k]; }
      const x = cx(a) + Q2 / 2, z = cz(b) + Q2 / 2;
      return !world.roomAt(lv, x, z) && !world.flightAt(x, z);
    };
    for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const alongA = db !== 0;   // the wall runs along a (x) when the neighbour is across b (z)
      for (let line = 0; line < n; line++) {
        let start = -1, h = 0, room = -1;
        const flush = (end) => {
          if (start < 0) return;
          const s0 = start * Q2, s1 = end * Q2;
          // the wall sits on the shared edge, facing back into the room
          const fixed = alongA ? (db > 0 ? cz(line + 1) : cz(line)) : (da > 0 ? cx(line + 1) : cx(line));
          const P = (s, y) => (alongA ? [R.ox + s, y, fixed] : [fixed, y, R.oz + s]);
          const hint = alongA ? [0, 0, -db] : [-da, 0, 0];
          for (let s = s0; s < s1 - 1e-9; s += 2) {
            const e = Math.min(s + 2, s1), pa = P(s, Y), pb = P(e, Y);
            const la = lightAt(lampsOf.get(room) || [], pa[0], pa[2]), lb = lightAt(lampsOf.get(room) || [], pb[0], pb[2]);
            const ua = alongA ? pa[0] : pa[2], ub = alongA ? pb[0] : pb[2];
            const v0 = st.v(pa[0], Y, pa[2], ua, Y, shade(C2.wall, la, tint)), v1 = st.v(pb[0], Y, pb[2], ub, Y, shade(C2.wall, lb, tint));
            const v2 = st.v(pb[0], Y + h, pb[2], ub, Y + h, shade(C2.wall, lb * 0.82, tint)), v3 = st.v(pa[0], Y + h, pa[2], ua, Y + h, shade(C2.wall, la * 0.82, tint));
            st.quad(v0, v1, v2, v3, hint);
          }
          start = -1;
        };
        for (let s = 0; s < n; s++) {
          const a = alongA ? s : line, b = alongA ? line : s, k = b * n + a;
          const wall = R.inside[k] && !R.flight[k] && outside(a + da, b + db);
          if (wall && start >= 0 && (R.ceil[k] !== h || R.room[k] !== room)) flush(s);
          if (wall && start < 0) { start = s; h = R.ceil[k]; room = R.room[k]; }
          if (!wall) flush(s);
        }
        flush(n);
      }
    }
    // ceiling steps between neighbouring room cells of different heights (faces the lower side)
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const k = b * n + a;
      if (!R.inside[k] || R.flight[k]) continue;
      for (const [da, db] of [[1, 0], [0, 1]]) {
        if (a + da >= n || b + db >= n) continue;
        const m = (b + db) * n + a + da;
        if (!R.inside[m] || R.flight[m] || R.ceil[m] === R.ceil[k]) continue;
        const lo = Math.min(R.ceil[k], R.ceil[m]), hi = Math.max(R.ceil[k], R.ceil[m]), towards = R.ceil[k] < R.ceil[m] ? -1 : 1;
        const x = cx(a + da), z = cz(b + db), c = shade(C2.wall, 0.7, tint);
        const P = da ? [[x, z], [x, z + Q2]] : [[x, z], [x + Q2, z]];
        const vs = [[P[0], lo], [P[1], lo], [P[1], hi], [P[0], hi]].map(([[px, pz], y]) => st.v(px, Y + y, pz, da ? pz : px, Y + y, c));
        st.quad(...vs, da ? [towards, 0, 0] : [0, 0, towards]);
      }
    }
    // ceiling lamps
    for (const o of plan.rooms) {
      if (o.lv !== lv) continue;
      const lc = o.kind === 'basement' ? C2.teal : C2.lamp;
      for (const l of o.lamps) {
        const y = Y + o.ceil - 0.02;
        const vs = [[l.x, l.z], [l.x + l.w, l.z], [l.x + l.w, l.z + l.d], [l.x, l.z + l.d]].map(([x, z]) => lamps.v(x, y, z, LAMP_UV2[0], LAMP_UV2[1], lc));
        lamps.quad(...vs, DOWN);
      }
    }
    yield;
    // pools: the floor round each with its rim cut out exactly, the walls down to a flat or sloping bottom, the water
    for (const p of plan.pools) {
      if (p.lv !== lv) continue;
      const box = poolBox(p), rim = shapeOutline(p.shape), room = plan.rooms.find((o) => o.id === p.room), L = lampsOf.get(room.id);
      const lit = (x, z) => lightAt(L, x, z);
      {
        const [pts, faces] = triangulate2([[box.x0, box.z0], [box.x1, box.z0], [box.x1, box.z1], [box.x0, box.z1]], [rim]);
        const ids = pts.map(([x, z]) => st.v(x, Y, z, x, z, shade(C2.floor, lit(x, z), tint)));
        for (const [a, b, c] of faces) st.tri(ids[a], ids[b], ids[c], UP);
      }
      const bottom = (x, z) => p.water - poolDepth(p, x, z);
      const bands = poolBands(p), k = p.axis === 'x' ? 0 : 1, cuts = bands.slice(1).map((q) => q.a0);
      // the band a point of the floor belongs to (a cut point: the one its neighbour lies in)
      const bandOf = (v) => bands.find((q) => v >= q.a0 && v < q.a1) || bands[bands.length - 1];
      const cw = (mx, mz, y) => shade(C2.poolWall, 0.75 + 0.25 * lit(mx, mz) - 0.12 * Math.min(1, (p.water - y) / 2.5), tint);
      // a wall face from height top down to ya .. yb along a to b
      const wall = (xa, za, ya, xb, zb, yb, s, hint, mx, mz, top = Y) => {
        const l = Math.hypot(xb - xa, zb - za);
        const v0 = st.v(xa, top, za, s, top, cw(mx, mz, top), p.water - top), v1 = st.v(xb, top, zb, s + l, top, cw(mx, mz, top), p.water - top);
        const v2 = st.v(xb, yb, zb, s + l, yb, cw(mx, mz, yb), p.water - yb), v3 = st.v(xa, ya, za, s, ya, cw(mx, mz, ya), p.water - ya);
        st.quad(v0, v1, v2, v3, hint);
      };
      let s = 0;   // tile u runs on round the rim
      for (let a = 0; a < rim.length; a++) {
        const [xa, za] = rim[a], [xb, zb] = rim[(a + 1) % rim.length];
        const ex = xb - xa, ez = zb - za, l = Math.hypot(ex, ez), mx = (xa + xb) / 2, mz = (za + zb) / 2;
        const inSide = shapeContains(p.shape, mx - (ez / l) * 0.05, mz + (ex / l) * 0.05) ? 1 : -1;   // which normal points into the pool
        const hint = [-ez / l * inSide, 0, ex / l * inSide];
        // split where the floor bends or steps, so each piece's foot follows the floor exactly
        const ca = k ? za : xa, cb = k ? zb : xb, ts = [0];
        for (const c of cuts) if ((ca - c) * (cb - c) < 0) ts.push((c - ca) / (cb - ca));
        ts.push(1); ts.sort((u, v) => u - v);
        for (let q = 0; q + 1 < ts.length; q++) {
          const t0 = ts[q], t1 = ts[q + 1], band = bandOf(ca + (cb - ca) * (t0 + t1) / 2);
          const x0 = xa + ex * t0, z0 = za + ez * t0, x1 = xa + ex * t1, z1 = za + ez * t1;
          const y0 = Number.isNaN(band.depth) ? bottom(x0, z0) : p.water - band.depth, y1 = Number.isNaN(band.depth) ? bottom(x1, z1) : p.water - band.depth;
          wall(x0, z0, y0, x1, z1, y1, s + l * t0, hint, mx, mz);
        }
        s += l;
      }
      // the risers of a stepped floor: where each cut line crosses the pool, from the higher step down to the lower
      for (let c = 0; c < cuts.length && p.steps; c++) {
        const up = bands[c], dn = bands[c + 1], hi = Math.min(up.depth, dn.depth), lo2 = Math.max(up.depth, dn.depth), toDeep = dn.depth > up.depth ? 1 : -1;
        const xs = [];
        for (let a = 0; a < rim.length; a++) {
          const P = rim[a], Q = rim[(a + 1) % rim.length];
          if ((P[k] - cuts[c]) * (Q[k] - cuts[c]) < 0) xs.push(P[1 - k] + (Q[1 - k] - P[1 - k]) * (cuts[c] - P[k]) / (Q[k] - P[k]));
        }
        xs.sort((u, v) => u - v);
        for (let q = 0; q + 1 < xs.length; q += 2) {
          const pt = (o) => (k ? [o, cuts[c]] : [cuts[c], o]), [ax, az] = pt(xs[q]), [bx, bz] = pt(xs[q + 1]);
          wall(ax, az, p.water - lo2, bx, bz, p.water - lo2, 0, k ? [0, 0, toDeep] : [toDeep, 0, 0], (ax + bx) / 2, (az + bz) / 2, p.water - hi);
        }
      }
      for (const band of bands) for (const poly of band.polys) {
        const [pts, faces] = triangulate2(poly, []);
        const ids = pts.map(([x, z]) => { const y = Number.isNaN(band.depth) ? bottom(x, z) : p.water - band.depth; return st.v(x, y, z, x, z, shade(C2.pool, 0.6 + 0.4 * lit(x, z) - 0.15 * Math.min(1, (p.water - y) / 2.5), tint), p.water - y); });
        for (const [a, b, c] of faces) st.tri(ids[a], ids[b], ids[c], UP);
      }
      {
        const [pts, faces] = triangulate2(rim, []);
        const wids = pts.map(([x, z]) => {
          const t = Math.min(1, Math.max(0, (poolDepth(p, x, z) - 0.3) / 2.2)), c = C2.shallow.map((v, q) => v + (C2.deep[q] - v) * t);
          const m = 0.55 + 0.45 * lit(x, z);
          return water.v(x, p.water, z, x * 0.25, z * 0.25, [c[0] * m * (tint ? tint[0] * 1.6 : 1), c[1] * m * (tint ? tint[1] * 1.6 : 1), c[2] * m * (tint ? tint[2] * 1.6 : 1), 0.55 + 0.35 * t]);
        });
        for (const [a, b, c] of faces) water.tri(wids[a], wids[b], wids[c], UP);
      }
    }
    yield;
  }
  for (const f of plan.flights) flightMesh(world, plan, f, st, lamps);
  return { static: st.geometry(), lamps: lamps.geometry(), water: water.geometry() };
}

// an enclosed straight flight: treads and landing, both side walls, the end walls round its two openings, a lit lid
function flightMesh(world, plan, f, st, lamps) {
  const hall = plan.rooms[0], far = plan.rooms.find((o) => o.id === f.room);
  const ceilLo = f.lo === 0 ? hall.ceil : far.ceil, ceilHi = f.hi === 0 ? hall.ceil : far.ceil;
  const yLo = world.Y[f.lo], yHi = world.Y[f.hi], top = yHi + ceilHi, tint = f.lo < 0 ? [0.7, 0.85, 0.95] : null;
  const ax = f.axis === 'x';
  const a0 = ax ? f.x0 : f.z0, a1 = ax ? f.x1 : f.z1, c0 = (ax ? f.z0 : f.x0) + FLIGHT_WALL, c1 = (ax ? f.z1 : f.x1) - FLIGHT_WALL;
  const P = (a, y, c) => (ax ? [a, y, c] : [c, y, a]);
  const along = ax ? [1, 0, 0] : [0, 0, 1], acrossV = ax ? [0, 0, 1] : [1, 0, 0];
  // lamps on the lid every 4 m
  const L = [];
  for (let a = a0 + 2; a < a1 - 1; a += 4) {
    const [x, , z] = P(a - 0.5, 0, (c0 + c1) / 2 - 0.5);
    L.push({ x, z, w: 1, d: 1, k: 0 });
    const vs = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]].map(([px, pz]) => lamps.v(px, top - 0.02, pz, LAMP_UV2[0], LAMP_UV2[1], C2.lamp));
    lamps.quad(...vs, DOWN);
  }
  const lit = (p) => 0.75 + 0.25 * lightAt(L, p[0], p[2]);
  const vtx = (p, u, w, c, l = lit(p)) => st.v(p[0], p[1], p[2], u, w, shade(c, l, tint));
  const face = (pts, hint, c, uvs) => { const ids = pts.map((p, q) => vtx(p, uvs[q][0], uvs[q][1], c)); st.quad(...ids, hint); };
  // treads: risers of about RISER, a flat landing between the two runs; each tread top is where the walked slope (flightH)
  // reaches at the tread's upper edge, so feet never stand above a tread
  const run = (a1 - a0 - LANDING) / 2, rise = (yHi - yLo) / 2, steps = Math.max(1, Math.round(rise / RISER)), dir = f.up;
  const at = (d) => (dir > 0 ? a0 + d : a1 - d);   // distance from the low end → coordinate along the axis
  for (const [d0, y0] of [[0, yLo], [run + LANDING, yLo + rise]]) {
    const len = run / steps, dy = rise / steps;
    for (let s = 0; s < steps; s++) {
      const pa = at(d0 + s * len), pb = at(d0 + (s + 1) * len), yb = y0 + s * dy, y = yb + dy;
      face([P(pa, y, c0), P(pb, y, c0), P(pb, y, c1), P(pa, y, c1)], UP, C2.floor, [[pa, c0], [pb, c0], [pb, c1], [pa, c1]]);
      face([P(pa, yb, c0), P(pa, y, c0), P(pa, y, c1), P(pa, yb, c1)], along.map((v) => -v * dir), C2.wall, [[c0, yb], [c0, y], [c1, y], [c1, yb]]);
    }
  }
  {
    const pa = at(run), pb = at(run + LANDING), y = yLo + rise;
    face([P(pa, y, c0), P(pb, y, c0), P(pb, y, c1), P(pa, y, c1)], UP, C2.floor, [[pa, c0], [pb, c0], [pb, c1], [pa, c1]]);
  }
  // side walls, inner and outer faces, the whole height of the shaft
  for (const [c, n] of [[c0, 1], [c1, -1]]) {
    face([P(a0, yLo, c), P(a1, yLo, c), P(a1, top, c), P(a0, top, c)], acrossV.map((v) => v * n), C2.wall, [[a0, yLo], [a1, yLo], [a1, top], [a0, top]]);
    const co = c - n * FLIGHT_WALL;
    face([P(a0, yLo, co), P(a1, yLo, co), P(a1, top, co), P(a0, top, co)], acrossV.map((v) => -v * n), C2.wall, [[a0, yLo], [a1, yLo], [a1, top], [a0, top]]);
  }
  // end walls: the low end is open up to its room's ceiling, the high end from its floor up to its ceiling
  const lowA = dir > 0 ? a0 : a1, highA = dir > 0 ? a1 : a0, oc0 = c0 - FLIGHT_WALL, oc1 = c1 + FLIGHT_WALL;
  for (const [a, y0, y1] of [[lowA, yLo + ceilLo, top], [highA, yLo, yHi]]) {
    if (y1 - y0 < 1e-3) continue;
    for (const s of [1, -1]) face([P(a, y0, oc0), P(a, y0, oc1), P(a, y1, oc1), P(a, y1, oc0)], along.map((v) => v * s), C2.wall, [[oc0, y0], [oc1, y0], [oc1, y1], [oc0, y1]]);
  }
  // the lid
  face([P(a0, top, oc0), P(a1, top, oc0), P(a1, top, oc1), P(a0, top, oc1)], DOWN, C2.ceil, [[a0, oc0], [a1, oc0], [a1, oc1], [a0, oc1]]);
}


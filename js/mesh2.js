// Generator v2 prototype: turns one 64 m cell's plan (gen2.js) into merged geometries — floors with pools cut out along
// their true rims, pool walls and sloping bottoms, water, walls and ceilings from a 0.5 m raster of each floor, and the
// enclosed flights between floors. Light is baked into vertex colours like chunkmesh.js; materials are the same.
import * as THREE from 'three';
import { Q2, CURVE_SEG, FLIGHT_WALL, LANDING, PARAPET, PARAPET_H, WIN_WALL, cellRaster, poolBox, shapeOutline, shapeContains, poolDepth, poolBands, lineCrossings, floorRise2 } from './gen2.js';
import { lightAt } from './lighting.js';
import { ATLAS_W, ATLAS_H } from './levels.js';
import { DRY } from './chunkmesh.js';

const C2 = {
  floor: [1, 0.985, 0.955], wall: [0.93, 0.935, 0.93], ceil: [0.74, 0.77, 0.79], poolWall: [0.5, 0.76, 0.92], pool: [0.55, 0.82, 0.97],
  shallow: [0.5, 0.88, 0.93], deep: [0.03, 0.17, 0.45], abyss: [0.01, 0.03, 0.09], lamp: [1, 1, 1], teal: [0.32, 0.5, 0.52],
};
const B1_TINT = [0.36, 0.52, 0.6];       // the basement: dark and cold
const LAMP_UV2 = [1 - 4 / ATLAS_W, 1 - (ATLAS_W - 4) / ATLAS_H];   // white corner of the sign atlas
const MERGE2 = 4;                        // raster cells merged into one quad at most (2 m): keeps the baked light smooth
const RISER = 0.17;
// water seen from above by its depth: pale over a wading floor, deep blue from 1.2 m, blue-black from 2.5 m; rgba
function waterTint2(d) {
  if (d <= 1.2) { const t = Math.max(0, (d - 0.3) / 0.9); return [...C2.shallow.map((v, q) => v + (C2.deep[q] - v) * t), 0.55 + 0.3 * t]; }
  const t = Math.min(1, (d - 1.2) / 1.3);
  return [...C2.deep.map((v, q) => v + (C2.abyss[q] - v) * t), 0.85 + 0.12 * t];
}
// pool walls and floor darken with the water over them
const sink2 = (y, water) => 1 - 0.8 * Math.min(1, Math.max(0, water - y) / 3);

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
  const lampsOf = new Map(plan.rooms.map((o) => [o.id, o.lamps])), roomOf = new Map(plan.rooms.map((o) => [o.id, o]));
  // a sloping room's floor, walls, ceiling and lamps follow its floor: its cells are drawn one by one (never merged across a bend)
  const rise = (id, x, z) => { const o = roomOf.get(id); return o ? floorRise2(o, x, z) : 0; };
  const sloped = (id) => !!roomOf.get(id)?.slope;
  for (const lv of [-1, 0, 1]) {
    if (!plan.rooms.some((o) => o.lv === lv)) continue;
    const R = cellRaster(world, i, j, lv), n = R.n, Y = world.Y[lv], tint = lv < 0 ? B1_TINT : null;
    yield;
    const light = (k, x, z) => lightAt(lampsOf.get(R.room[k]) || [], x, z);
    const cx = (a) => R.ox + a * Q2, cz = (b) => R.oz + b * Q2;
    // floors (pool boxes and flight footprints left out)
    rects2(n, (k) => R.inside[k] && !R.flight[k] && !R.pool[k] && !R.hole[k], (k) => (sloped(R.room[k]) ? -1 - k : R.room[k]), (a, b, w, d) => {
      const k = b * n + a, x0 = cx(a), z0 = cz(b), x1 = cx(a + w), z1 = cz(b + d);
      const vs = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => st.v(x, Y + rise(R.room[k], x, z), z, x, z, shade(C2.floor, light(k, x, z), tint)));
      st.quad(...vs, UP);
    });
    // ceilings, and the step faces where a corridor's lower ceiling meets a hall
    rects2(n, (k) => R.inside[k] && !R.flight[k] && !R.open[k], (k) => (sloped(R.room[k]) ? -1 - k : R.ceil[k] * 1000 + R.room[k]), (a, b, w, d) => {
      const k = b * n + a, x0 = cx(a), z0 = cz(b), x1 = cx(a + w), z1 = cz(b + d), y = Y + R.ceil[k];
      const vs = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => st.v(x, y + rise(R.room[k], x, z), z, x, z, shade(C2.ceil, light(k, x, z), tint)));
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
          const piece = sloped(room) ? Q2 : 2;
          for (let s = s0; s < s1 - 1e-9; s += piece) {
            const e = Math.min(s + piece, s1), pa = P(s, Y), pb = P(e, Y), ya = Y + rise(room, pa[0], pa[2]), yb = Y + rise(room, pb[0], pb[2]);
            const la = lightAt(lampsOf.get(room) || [], pa[0], pa[2]), lb = lightAt(lampsOf.get(room) || [], pb[0], pb[2]);
            const ua = alongA ? pa[0] : pa[2], ub = alongA ? pb[0] : pb[2];
            const v0 = st.v(pa[0], ya, pa[2], ua, ya, shade(C2.wall, la, tint)), v1 = st.v(pb[0], yb, pb[2], ub, yb, shade(C2.wall, lb, tint));
            const v2 = st.v(pb[0], yb + h, pb[2], ub, yb + h, shade(C2.wall, lb * 0.82, tint)), v3 = st.v(pa[0], ya + h, pa[2], ua, ya + h, shade(C2.wall, la * 0.82, tint));
            st.quad(v0, v1, v2, v3, hint);
          }
          start = -1;
        };
        for (let s = 0; s < n; s++) {
          const a = alongA ? s : line, b = alongA ? line : s, k = b * n + a;
          const fixed = alongA ? (db > 0 ? cz(b + 1) : cz(b)) : (da > 0 ? cx(a + 1) : cx(a)), mid = alongA ? cx(a) + Q2 / 2 : cz(b) + Q2 / 2;
          const wall = R.inside[k] && !R.flight[k] && outside(a + da, b + db) && !inWindow2(plan, lv, alongA, fixed, mid);
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
        const vs = [[l.x, l.z], [l.x + l.w, l.z], [l.x + l.w, l.z + l.d], [l.x, l.z + l.d]].map(([x, z]) => lamps.v(x, y + floorRise2(o, x, z), z, LAMP_UV2[0], LAMP_UV2[1], lc));
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
      const cw = (mx, mz, y) => shade(C2.poolWall, (0.75 + 0.25 * lit(mx, mz)) * sink2(y, p.water), tint);
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
        for (const c of cuts) if ((ca < c) !== (cb < c) && ca !== c && cb !== c) ts.push((c - ca) / (cb - ca));
        ts.push(1); ts.sort((u, v) => u - v);
        for (let q = 0; q + 1 < ts.length; q++) {
          // the band on the pool's side of the piece (a piece lying along a cut belongs to the step it walls)
          const t0 = ts[q], t1 = ts[q + 1], band = bandOf(ca + (cb - ca) * (t0 + t1) / 2 + hint[k ? 2 : 0] * 0.01);
          const x0 = xa + ex * t0, z0 = za + ez * t0, x1 = xa + ex * t1, z1 = za + ez * t1;
          const y0 = Number.isNaN(band.depth) ? bottom(x0, z0) : p.water - band.depth, y1 = Number.isNaN(band.depth) ? bottom(x1, z1) : p.water - band.depth;
          wall(x0, z0, y0, x1, z1, y1, s + l * t0, hint, mx, mz);
        }
        s += l;
      }
      // the risers of a stepped floor: where each cut line crosses the pool, from the higher step down to the lower
      for (let c = 0; c < cuts.length && p.steps; c++) {
        const up = bands[c], dn = bands[c + 1], hi = Math.min(up.depth, dn.depth), lo2 = Math.max(up.depth, dn.depth), toDeep = dn.depth > up.depth ? 1 : -1;
        const xs = lineCrossings(rim, k, cuts[c]);
        for (let q = 0; q + 1 < xs.length; q += 2) {
          const pt = (o) => (k ? [o, cuts[c]] : [cuts[c], o]), [ax, az] = pt(xs[q]), [bx, bz] = pt(xs[q + 1]);
          wall(ax, az, p.water - lo2, bx, bz, p.water - lo2, 0, k ? [0, 0, toDeep] : [toDeep, 0, 0], (ax + bx) / 2, (az + bz) / 2, p.water - hi);
        }
      }
      for (const band of bands) for (const poly of band.polys) {
        const [pts, faces] = triangulate2(poly, []);
        const ids = pts.map(([x, z]) => { const y = Number.isNaN(band.depth) ? bottom(x, z) : p.water - band.depth; return st.v(x, y, z, x, z, shade(C2.pool, (0.6 + 0.4 * lit(x, z)) * sink2(y, p.water), tint), p.water - y); });
        for (const [a, b, c] of faces) st.tri(ids[a], ids[b], ids[c], UP);
      }
      {
        const [pts, faces] = triangulate2(rim, []);
        const wids = pts.map(([x, z]) => {
          const c = waterTint2(poolDepth(p, x, z)), m = 0.55 + 0.45 * lit(x, z);
          return water.v(x, p.water, z, x * 0.25, z * 0.25, [c[0] * m * (tint ? tint[0] * 1.6 : 1), c[1] * m * (tint ? tint[1] * 1.6 : 1), c[2] * m * (tint ? tint[2] * 1.6 : 1), c[3]]);
        });
        for (const [a, b, c] of faces) water.tri(wids[a], wids[b], wids[c], UP);
      }
    }
    // columns, floor to ceiling: round ones in pieces no longer than a drawn curve's, square ones as four faces
    for (const c of plan.columns) {
      if (c.lv !== lv) continue;
      const room = plan.rooms.find((o) => o.id === c.room), L = lampsOf.get(room.id), top = Y + room.ceil;
      const n = c.form === 'round' ? Math.max(12, Math.ceil((2 * Math.PI * c.r) / CURVE_SEG)) : 4;
      const at = (k) => (c.form === 'round'
        ? [c.x + Math.cos((k / n) * Math.PI * 2) * c.r, c.z + Math.sin((k / n) * Math.PI * 2) * c.r]
        : [c.x + c.r * [1, -1, -1, 1][k % 4], c.z + c.r * [1, 1, -1, -1][k % 4]]);
      let u = 0;
      for (let k = 0; k < n; k++) {
        const [xa, za] = at(k), [xb, zb] = at(k + 1), l = Math.hypot(xb - xa, zb - za);
        const mx = (xa + xb) / 2 - c.x, mz = (za + zb) / 2 - c.z, ml = Math.hypot(mx, mz);
        const la = lightAt(L, xa, za), lb = lightAt(L, xb, zb);
        const v0 = st.v(xa, Y, za, u, Y, shade(C2.wall, la, tint)), v1 = st.v(xb, Y, zb, u + l, Y, shade(C2.wall, lb, tint));
        const v2 = st.v(xb, top, zb, u + l, top, shade(C2.wall, lb * 0.82, tint)), v3 = st.v(xa, top, za, u, top, shade(C2.wall, la * 0.82, tint));
        st.quad(v0, v1, v2, v3, [mx / ml, 0, mz / ml]);
        u += l;
      }
    }
    yield;
  }
  for (const f of plan.flights) flightMesh(world, plan, f, st, lamps);
  for (const v of plan.voids) voidMesh(world, plan, v, st);
  for (const wn of plan.windows) windowMesh(world, plan, wn, st);
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
  {   // the high end's wall under the top tread, both sides
    const a = highA, y0 = yLo, y1 = yHi;
    for (const s of [1, -1]) face([P(a, y0, oc0), P(a, y0, oc1), P(a, y1, oc1), P(a, y1, oc0)], along.map((v) => v * s), C2.wall, [[oc0, y0], [oc1, y0], [oc1, y1], [oc0, y1]]);
  }
  // the lintel over the low opening: a wall FLIGHT_WALL thick, its outer face, inner face and underside
  const y0L = yLo + ceilLo, aIn = lowA + dir * FLIGHT_WALL;
  if (top - y0L > 1e-3) {
    face([P(lowA, y0L, oc0), P(lowA, y0L, oc1), P(lowA, top, oc1), P(lowA, top, oc0)], along.map((v) => -v * dir), C2.wall, [[oc0, y0L], [oc1, y0L], [oc1, top], [oc0, top]]);
    face([P(aIn, y0L, c0), P(aIn, y0L, c1), P(aIn, top, c1), P(aIn, top, c0)], along.map((v) => v * dir), C2.wall, [[c0, y0L], [c1, y0L], [c1, top], [c0, top]]);
    face([P(lowA, y0L, c0), P(aIn, y0L, c0), P(aIn, y0L, c1), P(lowA, y0L, c1)], DOWN, C2.ceil, [[lowA, c0], [aIn, c0], [aIn, c1], [lowA, c1]]);
  }
  // the side walls' ends round both openings (their jambs): the low one up to the lintel, the high one from the top tread up
  for (const [a, y0, y1, out] of [[lowA, yLo, y0L, -dir], [highA, yHi, top, dir]]) {
    if (y1 - y0 < 1e-3) continue;
    for (const [ca, cb] of [[oc0, c0], [c1, oc1]]) face([P(a, y0, ca), P(a, y0, cb), P(a, y1, cb), P(a, y1, ca)], along.map((v) => v * out), C2.wall, [[ca, y0], [cb, y0], [cb, y1], [ca, y1]]);
  }
  // the lid
  face([P(a0, top, oc0), P(a1, top, oc0), P(a1, top, oc1), P(a0, top, oc1)], DOWN, C2.ceil, [[a0, oc0], [a1, oc0], [a1, oc1], [a0, oc1]]);
}


// is the raster wall at fixed (on its line), mid (along it) inside a window of floor lv
function inWindow2(plan, lv, alongA, fixed, mid) {
  for (const wn of plan.windows) {
    if (wn.lv !== lv || (wn.run === 'x') !== alongA || mid <= wn.s0 || mid >= wn.s1) continue;
    if (Math.abs(fixed - wn.c) < 1e-6 || Math.abs(fixed - (wn.c + wn.out * WIN_WALL)) < 1e-6) return true;
  }
  return false;
}

// a window through a hall wall into a showcase: both faces round the opening, and its sill, head and two jambs. Lit like the
// raster walls (each face by its own room's lamps, darker towards the ceiling), tiled along whichever way each face runs
function windowMesh(world, plan, wn, st) {
  const Y = world.Y[wn.lv], hall = plan.rooms.find((o) => o.id === wn.hall), far = plan.rooms.find((o) => o.id === wn.room);
  const P = (s, y, f) => (wn.run === 'x' ? [s, y, f] : [f, y, s]);
  const n = (v) => (wn.run === 'x' ? [0, 0, v] : [v, 0, 0]), t = (v) => (wn.run === 'x' ? [v, 0, 0] : [0, 0, v]);
  // uv: 's' along the wall, 'f' through it, 'h' flat (s, f)
  const q = (pts, hint, room, uv) => {
    const L = room.lamps, ceil = room.ceil;
    const ids = pts.map((p) => {
      const [x, y, z] = p, s = wn.run === 'x' ? x : z, f = wn.run === 'x' ? z : x;
      const l = lightAt(L, x, z) * (1 - 0.18 * Math.min(1, (y - Y) / ceil));
      return st.v(x, y, z, uv === 'h' ? s : uv === 's' ? s : f, uv === 'h' ? f : y, shade(C2.wall, l, null));
    });
    st.quad(...ids, hint);
  };
  const f0 = wn.c, f1 = wn.c + wn.out * WIN_WALL, { s0, s1 } = wn, ys = Y + wn.sill, yh = Y + wn.head;
  for (const [f, room, dir] of [[f0, hall, -wn.out], [f1, far, wn.out]]) {
    q([P(s0, Y, f), P(s1, Y, f), P(s1, ys, f), P(s0, ys, f)], n(dir), room, 's');
    q([P(s0, yh, f), P(s1, yh, f), P(s1, Y + room.ceil, f), P(s0, Y + room.ceil, f)], n(dir), room, 's');
  }
  q([P(s0, ys, f0), P(s1, ys, f0), P(s1, ys, f1), P(s0, ys, f1)], [0, 1, 0], hall, 'h');
  q([P(s0, yh, f0), P(s1, yh, f0), P(s1, yh, f1), P(s0, yh, f1)], [0, -1, 0], hall, 'h');
  q([P(s0, ys, f0), P(s0, yh, f0), P(s0, yh, f1), P(s0, ys, f1)], t(1), hall, 'f');
  q([P(s1, ys, f0), P(s1, yh, f0), P(s1, yh, f1), P(s1, ys, f1)], t(-1), hall, 'f');
}

// a void through a floor: its four sides from the ceiling under it up to the parapet's top, and the parapet round it (the
// north and south runs reach over the corners, so the ring closes)
function voidMesh(world, plan, v, st) {
  const under = plan.rooms.find((o) => o.id === v.under), tint = v.lv < 0 ? B1_TINT : null;
  const y0 = world.Y[v.lv] + under.ceil, y1 = world.Y[v.lv + 1], top = y1 + PARAPET_H, T = PARAPET;
  const c = shade(C2.wall, 0.8, tint), up = v.lv + 1 < 0 ? B1_TINT : null, cUp = shade(C2.wall, 0.8, up), cTop = shade(C2.floor, 0.9, up);
  const q = (pts, hint, col) => { const ids = pts.map(([x, y, z]) => st.v(x, y, z, x + z, y, col)); st.quad(...ids, hint); };
  const { x0, x1, z0, z1 } = v;
  // the void's own sides, facing in
  q([[x0, y0, z0], [x1, y0, z0], [x1, top, z0], [x0, top, z0]], [0, 0, 1], c);
  q([[x0, y0, z1], [x1, y0, z1], [x1, top, z1], [x0, top, z1]], [0, 0, -1], c);
  q([[x0, y0, z0], [x0, y0, z1], [x0, top, z1], [x0, top, z0]], [1, 0, 0], c);
  q([[x1, y0, z0], [x1, y0, z1], [x1, top, z1], [x1, top, z0]], [-1, 0, 0], c);
  // the parapet: outer faces, tops, and the corner ends of the north and south runs
  for (const [z, zo, s] of [[z0, z0 - T, -1], [z1, z1 + T, 1]]) {
    q([[x0 - T, y1, zo], [x1 + T, y1, zo], [x1 + T, top, zo], [x0 - T, top, zo]], [0, 0, s], cUp);
    q([[x0 - T, top, z], [x1 + T, top, z], [x1 + T, top, zo], [x0 - T, top, zo]], [0, 1, 0], cTop);
    for (const [x, sx] of [[x0 - T, -1], [x1 + T, 1]]) q([[x, y1, z], [x, y1, zo], [x, top, zo], [x, top, z]], [sx, 0, 0], cUp);
  }
  for (const [x, xo, s] of [[x0, x0 - T, -1], [x1, x1 + T, 1]]) {
    q([[xo, y1, z0], [xo, y1, z1], [xo, top, z1], [xo, top, z0]], [s, 0, 0], cUp);
    q([[x, top, z0], [x, top, z1], [xo, top, z1], [xo, top, z0]], [0, 1, 0], cTop);
  }
}

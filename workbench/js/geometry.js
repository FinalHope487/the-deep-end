// Room -> triangle soup (positions, normals, UVs, albedo) + occupancy query.
// Pure: no THREE, no DOM. Units: metres. One plan character = room.unit metres.
import { cellAt } from './room.js';
import { tileUV } from './kit/tile.js';

const STEP = 0.5; // max edge length of a sub-quad, so per-vertex indirect light has resolution

export function makeSolid(room) {
  const u = room.unit, w = room.w, d = room.d, H = room.ceiling;
  const grid = new Uint8Array(w * d); // 0 free, 1 wall, 2 opening
  const sill = new Float32Array(w * d), head = new Float32Array(w * d);
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const c = room.plan[z][x];
      grid[z * w + x] = c === '#' ? 1 : c === '=' ? 2 : 0;
      if (c === '=') { const op = room.openings.get(z * w + x); sill[z * w + x] = op.sill; head[z * w + x] = op.head; }
    }
  }
  return (x, y, z) => {
    if (y < 0 || y > H) return true;
    const cx = Math.floor(x / u), cz = Math.floor(z / u);
    if (cx < 0 || cz < 0 || cx >= w || cz >= d) return false;
    const i = cz * w + cx, g = grid[i];
    if (g === 0) return false;
    if (g === 1) return true;
    return y < sill[i] || y > head[i];
  };
}

export function isBlocked(room, x, z, r) {
  const u = room.unit;
  for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]]) {
    const c = cellAt(room, Math.floor((x + dx) / u), Math.floor((z + dz) / u));
    if (c !== '.') return true;
  }
  return false;
}

export function buildSurfaces(room, mat) {
  const u = room.unit, H = room.ceiling;
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const colorFor = (n) => (n[1] > 0.5 ? mat.floor : n[1] < -0.5 ? mat.ceiling : mat.wall);

  // quad: origin o, edge vectors a and b, outward normal n
  function quad(o, a, b, n) {
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    if (la < 1e-6 || lb < 1e-6) return;
    const na = Math.max(1, Math.ceil(la / STEP)), nb = Math.max(1, Math.ceil(lb / STEP));
    const axis = Math.abs(n[0]) > 0.5 ? 0 : Math.abs(n[1]) > 0.5 ? 1 : 2;
    const cr = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const flip = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
    const base = pos.length / 3;
    const c = colorFor(n);
    for (let j = 0; j <= nb; j++) {
      for (let i = 0; i <= na; i++) {
        const s = i / na, t = j / nb;
        const x = o[0] + a[0] * s + b[0] * t, y = o[1] + a[1] * s + b[1] * t, z = o[2] + a[2] * s + b[2] * t;
        pos.push(x, y, z); nor.push(...n); col.push(...c);
        uv.push(...tileUV(x, y, z, axis, mat.tileSize));
      }
    }
    for (let j = 0; j < nb; j++) {
      for (let i = 0; i < na; i++) {
        const p0 = base + j * (na + 1) + i, p1 = p0 + 1, p2 = p0 + na + 1, p3 = p2 + 1;
        if (flip) idx.push(p0, p2, p1, p1, p2, p3); else idx.push(p0, p1, p2, p1, p3, p2);
      }
    }
  }

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let cz = 0; cz < room.d; cz++) {
    for (let cx = 0; cx < room.w; cx++) {
      const ch = room.plan[cz][cx];
      const x0 = cx * u, z0 = cz * u;
      if (ch === '.') {
        quad([x0, 0, z0], [u, 0, 0], [0, 0, u], [0, 1, 0]);
        quad([x0, H, z0], [u, 0, 0], [0, 0, u], [0, -1, 0]);
        for (const [dx, dz] of dirs) {
          const nc = cellAt(room, cx + dx, cz + dz);
          if (nc === 'out') continue;
          const edge = dx === 1 ? { o: [x0 + u, 0, z0], a: [0, 0, u] } : dx === -1 ? { o: [x0, 0, z0], a: [0, 0, u] }
            : dz === 1 ? { o: [x0, 0, z0 + u], a: [u, 0, 0] } : { o: [x0, 0, z0], a: [u, 0, 0] };
          const n = [-dx, 0, -dz];
          if (nc === '#') {
            quad(edge.o, edge.a, [0, H, 0], n);
          } else if (nc === '=') {
            const op = room.openings.get((cz + dz) * room.w + (cx + dx));
            if (op.sill > 0) quad(edge.o, edge.a, [0, op.sill, 0], n);
            if (op.head < H) quad([edge.o[0], op.head, edge.o[2]], edge.a, [0, H - op.head, 0], n);
          }
        }
      } else if (ch === '=') {
        const op = room.openings.get(cz * room.w + cx);
        quad([x0, op.sill, z0], [u, 0, 0], [0, 0, u], [0, 1, 0]); // tunnel floor
        quad([x0, op.head, z0], [u, 0, 0], [0, 0, u], [0, -1, 0]); // tunnel ceiling
        for (const [dx, dz] of dirs) {
          if (cellAt(room, cx + dx, cz + dz) !== '#') continue;
          const edge = dx === 1 ? { o: [x0 + u, op.sill, z0], a: [0, 0, u] } : dx === -1 ? { o: [x0, op.sill, z0], a: [0, 0, u] }
            : dz === 1 ? { o: [x0, op.sill, z0 + u], a: [u, 0, 0] } : { o: [x0, op.sill, z0], a: [u, 0, 0] };
          quad(edge.o, edge.a, [0, op.head - op.sill, 0], [-dx, 0, -dz]);
        }
      }
    }
  }
  return { pos, nor, uv, col, idx };
}

// Water covers every floor cell at the water level.
export function buildWaterPlan(room) {
  const u = room.unit, y = room.waterLevel, pos = [], idx = [];
  for (let cz = 0; cz < room.d; cz++) {
    for (let cx = 0; cx < room.w; cx++) {
      if (room.plan[cz][cx] !== '.') continue;
      const b = pos.length / 3, x0 = cx * u, z0 = cz * u;
      pos.push(x0, y, z0, x0 + u, y, z0, x0, y, z0 + u, x0 + u, y, z0 + u);
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  return { pos, idx };
}

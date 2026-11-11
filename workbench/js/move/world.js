// Layer 1 (pure): height, solid and water queries built once from a parsed room. No three.js, no DOM.
// Floor height: digit * room.floorStep from the `floor` grid (0 when there is no grid), overridden by `ramp` cells.
const DIRS = new Set(['N', 'E', 'S', 'W']);

export function createWorld(room) {
  const u = room.unit, w = room.w, d = room.d;
  const base = new Float32Array(w * d);
  if (room.floor) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) base[z * w + x] = Number(room.floor[z][x]) * room.floorStep;
  const rampOf = new Int16Array(w * d).fill(-1);
  room.ramps.forEach((r, i) => {
    if (!DIRS.has(r.dir)) throw new Error(`ramp dir must be N, E, S or W, got "${r.dir}"`);
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) rampOf[z * w + x] = i;
  });
  const isFloor = (cx, cz) => cx >= 0 && cz >= 0 && cx < w && cz < d && room.plan[cz][cx] === '.';

  // height of floor cell (cx,cz) at the point (x,z) inside it
  function cellHeight(cx, cz, x, z) {
    const i = cz * w + cx, ri = rampOf[i];
    if (ri < 0) return base[i];
    const r = room.ramps[ri];
    const ax = r.x0 * u, bx = (r.x1 + 1) * u, az = r.z0 * u, bz = (r.z1 + 1) * u;
    let t = r.dir === 'E' ? (x - ax) / (bx - ax) : r.dir === 'W' ? (bx - x) / (bx - ax) : r.dir === 'S' ? (z - az) / (bz - az) : (bz - z) / (bz - az);
    t = Math.max(0, Math.min(1, t));
    return r.from + (r.to - r.from) * t;
  }
  const groundHeight = (x, z) => {
    const cx = Math.floor(x / u), cz = Math.floor(z / u);
    return isFloor(cx, cz) ? cellHeight(cx, cz, x, z) : Infinity;
  };

  const closest = (cx, cz, x, z) => [Math.max(cx * u, Math.min((cx + 1) * u, x)), Math.max(cz * u, Math.min((cz + 1) * u, z))];
  // does this cell block a circle whose feet are at feetY? (height at the cell point nearest to the circle centre)
  function cellBlocks(cx, cz, x, z, feetY, climb) {
    if (!isFloor(cx, cz)) return true;
    const [qx, qz] = closest(cx, cz, x, z);
    return cellHeight(cx, cz, qx, qz) > feetY + climb;
  }

  function touching(x, z, r) {
    const out = [];
    for (let cz = Math.floor((z - r) / u); cz <= Math.floor((z + r) / u); cz++) {
      for (let cx = Math.floor((x - r) / u); cx <= Math.floor((x + r) / u); cx++) out.push([cx, cz]);
    }
    return out;
  }

  function blocked(x, z, feetY, radius, climb) {
    for (const [cx, cz] of touching(x, z, radius)) {
      if (!cellBlocks(cx, cz, x, z, feetY, climb)) continue;
      const [qx, qz] = closest(cx, cz, x, z);
      if ((x - qx) ** 2 + (z - qz) ** 2 < radius * radius) return true;
    }
    return false;
  }

  // push the circle out of every blocking cell, nearest cell first; returns the new centre and the push normals
  function resolve(x, z, feetY, radius, climb) {
    const normals = [];
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      const cells = touching(x, z, radius).filter(([cx, cz]) => cellBlocks(cx, cz, x, z, feetY, climb)).map(([cx, cz]) => {
        const [qx, qz] = closest(cx, cz, x, z);
        return { cx, cz, d2: (x - qx) ** 2 + (z - qz) ** 2 };
      }).sort((a, b) => a.d2 - b.d2);
      for (const c of cells) {
        const [qx, qz] = closest(c.cx, c.cz, x, z);
        const dx = x - qx, dz = z - qz, d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        let nx, nz, push;
        if (d2 > 1e-12) { const dl = Math.sqrt(d2); nx = dx / dl; nz = dz / dl; push = radius - dl; }
        else { // centre inside the cell: leave through the nearest face
          const fx0 = x - c.cx * u, fx1 = (c.cx + 1) * u - x, fz0 = z - c.cz * u, fz1 = (c.cz + 1) * u - z;
          const m = Math.min(fx0, fx1, fz0, fz1);
          if (m === fx0) { nx = -1; nz = 0; } else if (m === fx1) { nx = 1; nz = 0; } else if (m === fz0) { nx = 0; nz = -1; } else { nx = 0; nz = 1; }
          push = m + radius;
        }
        x += nx * push; z += nz * push; moved = true;
        normals.push([nx, nz]);
      }
      if (!moved) break;
    }
    return { x, z, normals };
  }

  return {
    unit: u, waterLevel: room.waterLevel, ceiling: room.ceiling,
    isFloor, isRamp: (cx, cz) => cx >= 0 && cz >= 0 && cx < w && cz < d && rampOf[cz * w + cx] >= 0, cellHeight, groundHeight, blocked, resolve,
    waterDepth: (x, z) => Math.max(0, room.waterLevel - groundHeight(x, z)),
  };
}

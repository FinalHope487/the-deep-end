// K5: soft indirect light. CPU gather at load time, one value per vertex:
//   sky seen through openings + one bounce off sunlit surfaces (cosine-weighted rays marched through the room grid).
// Inputs are the declared sources (through the grid) and the light preset. No per-surface or per-room key.
const RAYS = 40;
const PASSES = 3; // pass k adds the mean light of pass k-1 to every hit surface: a cheap stand-in for further bounces
const MAX_DIST = 14;
const STEP = 0.3;


export function computeIndirect(room, solid, surf, light, mat) {
  const { pos, nor } = surf;
  const n = pos.length / 3;
  const out = new Float32Array(n * 3);
  const W = room.w * room.unit, D = room.d * room.unit, H = room.ceiling;
  const sunSrc = room.sources.find((s) => s.type === 'sun');
  let L = null;
  if (sunSrc) { const l = Math.hypot(...sunSrc.dir); L = sunSrc.dir.map((v) => -v / l); } // towards the sun
  const sunE = light.sunColor.map((c) => c * light.sunStrength);
  const skyTop = light.skyTop, skyHor = light.skyHorizon, skyK = light.skyStrength;
    const albedo = (nm) => (nm[1] > 0.5 ? mat.floor : nm[1] < -0.5 ? mat.ceiling : mat.wall);

  // fixed cosine-weighted hemisphere samples in local frame (z = normal)
  const samples = [];
  for (let i = 0; i < RAYS; i++) {
    const u1 = (i + 0.5) / RAYS, u2 = ((i * 0.618034) % 1);
    const r = Math.sqrt(u1), ph = 2 * Math.PI * u2;
    samples.push([r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - u1)]);
  }

  const outside = (x, z) => x < 0 || z < 0 || x > W || z > D;
  function sunVisible(x, y, z) {
    for (let t = 0.1; t < 40; t += 0.35) {
      const px = x + L[0] * t, py = y + L[1] * t, pz = z + L[2] * t;
      if (solid(px, py, pz)) return false;
      if (outside(px, pz) && py > 0 && py < H) return true;
    }
    return true;
  }

  const r = [0, 0, 0];
  let amb = [0, 0, 0];
  for (let pass = 0; pass < PASSES; pass++) {
  const sum = [0, 0, 0];
  for (let v = 0; v < n; v++) {
    const nx = nor[v * 3], ny = nor[v * 3 + 1], nz = nor[v * 3 + 2];
    const px = pos[v * 3] + nx * 0.03, py = pos[v * 3 + 1] + ny * 0.03, pz = pos[v * 3 + 2] + nz * 0.03;
    // tangent frame
    let tx, ty, tz;
    if (Math.abs(ny) > 0.9) { tx = 1; ty = 0; tz = 0; } else { tx = 0; ty = 1; tz = 0; }
    let bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    let bl = Math.hypot(bx, by, bz); bx /= bl; by /= bl; bz /= bl;
    tx = by * nz - bz * ny; ty = bz * nx - bx * nz; tz = bx * ny - by * nx;
    const cr = 1, sr = 0;
    r[0] = r[1] = r[2] = 0;
    for (let s = 0; s < RAYS; s++) {
      const [sa0, sb0, sc] = samples[s];
      const sa = sa0 * cr - sb0 * sr, sb = sa0 * sr + sb0 * cr;
      const dx = tx * sa + bx * sb + nx * sc, dy = ty * sa + by * sb + ny * sc, dz = tz * sa + bz * sb + nz * sc;
      for (let t = 0.1; t < MAX_DIST; t += STEP) {
        const qx = px + dx * t, qy = py + dy * t, qz = pz + dz * t;
        if (outside(qx, qz) && qy > 0 && qy < H) { // escaped through an opening: sky
          const k = Math.max(0, Math.min(1, dy)) ;
          r[0] += (skyHor[0] + (skyTop[0] - skyHor[0]) * k) * skyK;
          r[1] += (skyHor[1] + (skyTop[1] - skyHor[1]) * k) * skyK;
          r[2] += (skyHor[2] + (skyTop[2] - skyHor[2]) * k) * skyK;
          break;
        }
        if (!solid(qx, qy, qz)) continue;
        {
          // entry axis -> hit normal
          const bx2 = qx - dx * STEP, by2 = qy - dy * STEP, bz2 = qz - dz * STEP;
          let hn;
          if (!solid(bx2, qy, qz)) hn = [-Math.sign(dx), 0, 0];
          else if (!solid(qx, qy, bz2)) hn = [0, 0, -Math.sign(dz)];
          else hn = [0, -Math.sign(dy), 0];
          const a0 = albedo(hn);
          r[0] += a0[0] * amb[0]; r[1] += a0[1] * amb[1]; r[2] += a0[2] * amb[2];
          const cl = L ? hn[0] * L[0] + hn[1] * L[1] + hn[2] * L[2] : 0;
          if (cl > 0 && sunVisible(qx + hn[0] * 0.08, qy + hn[1] * 0.08, qz + hn[2] * 0.08)) {
            const a = a0, k = cl / Math.PI;
            r[0] += a[0] * sunE[0] * k; r[1] += a[1] * sunE[1] * k; r[2] += a[2] * sunE[2] * k;
          }
        }
        break;
      }
    }
    const f = 1 / RAYS, af = light.ambientFloor;
    out[v * 3] = r[0] * f + af; out[v * 3 + 1] = r[1] * f + af; out[v * 3 + 2] = r[2] * f + af;
    sum[0] += out[v * 3]; sum[1] += out[v * 3 + 1]; sum[2] += out[v * 3 + 2];
  }
  amb = sum.map((x) => (x / n) * light.bounceGain);
  }
  return out;
}

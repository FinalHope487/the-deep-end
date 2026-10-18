// Baked light level: floors and water are bright near lamps / skylights, dim elsewhere.
export const AMBIENT = 0.5;
const REACH = [4.5, 7, 4.5];   // metres of falloff per lamp kind (ceiling, skylight, teal)

const fkey = (tx, tz) => (tx + 64) * 256 + (tz + 64);

// The tiles each lamp can light: a flood fill over open tiles out to the lamp's reach, so light does not go through
// walls into the room next door. isOpen(tx, tz) says whether light travels over a tile (anything but a solid wall).
export function lampFloods(lamps, isOpen) {
  return lamps.map((l) => {
    const reach = Math.ceil(REACH[l.k]) + 1, seen = new Set(), q = [];
    const x0 = Math.floor(l.x), z0 = Math.floor(l.z), x1 = Math.ceil(l.x + l.w), z1 = Math.ceil(l.z + l.d);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) { seen.add(fkey(x, z)); q.push(x, z); }
    for (let h = 0; h < q.length; h += 2) {
      const x = q[h], z = q[h + 1];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < x0 - reach || nx >= x1 + reach || nz < z0 - reach || nz >= z1 + reach) continue;
        const k = fkey(nx, nz);
        if (seen.has(k) || !isOpen(nx, nz)) continue;
        seen.add(k); q.push(nx, nz);
      }
    }
    return seen;
  });
}

// floods (from lampFloods, same lamp order) is optional: without it light ignores walls
export function lightAt(lamps, x, z, floods) {
  let sum = 0;
  const tx = Math.floor(x), tz = Math.floor(z);
  for (let i = 0; i < lamps.length; i++) {
    const l = lamps[i];
    const dx = Math.max(l.x - x, 0, x - (l.x + l.w)), dz = Math.max(l.z - z, 0, z - (l.z + l.d));
    const t = 1 - Math.hypot(dx, dz) / REACH[l.k];
    if (t <= 0) continue;
    if (floods) {   // a point on a tile corner belongs to the four tiles round it
      const f = floods[i], ex = x === tx, ez = z === tz;
      if (!(f.has(fkey(tx, tz)) || (ex && f.has(fkey(tx - 1, tz))) || (ez && f.has(fkey(tx, tz - 1))) || (ex && ez && f.has(fkey(tx - 1, tz - 1))))) continue;
    }
    sum += t * t;
  }
  return AMBIENT + (1 - AMBIENT) * Math.min(1, sum);
}

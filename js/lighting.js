// Baked light level: floors and water are bright near lamps / skylights, dim elsewhere.
export const AMBIENT = 0.5;
const REACH = [4.5, 7, 4.5];   // metres of falloff per lamp kind (ceiling, skylight, teal)

export function lightAt(lamps, x, z) {
  let sum = 0;
  for (const l of lamps) {
    const dx = Math.max(l.x - x, 0, x - (l.x + l.w)), dz = Math.max(l.z - z, 0, z - (l.z + l.d));
    const t = 1 - Math.hypot(dx, dz) / REACH[l.k];
    if (t > 0) sum += t * t;
  }
  return AMBIENT + (1 - AMBIENT) * Math.min(1, sum);
}

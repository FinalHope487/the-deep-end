// P1-S01 NP-02 baseline (v1 only): walkable area reachable from the v1 spawn, over the fixed seed corpus.
// usage (repo root): node tools/measure-np02.mjs [--radius 32] [--out file.json]
// v1 has a Node-queryable tile world (World.surfaceAt). v2 has no tile query outside the browser: it is recorded as "no equivalent".
// Method: 4-neighbour flood fill over 1 m tiles from SPAWN, a tile counts when surfaceAt(tile centre, current height) is not null
// (same step rule the player uses), limited to a square of +-radius metres. Area is in m2. The corpus is the v2 measurement corpus.
import { writeFileSync } from 'node:fs';
import { World, SPAWN } from '../js/world.js';
import { CORPUS } from '../js/gen2-measure.js';

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const R = Number(arg('--radius', 32));
const OUT = arg('--out', '');

function walkableArea(seed) {
  const w = new World(seed);
  const start = w.surfaceNear(SPAWN.x, SPAWN.z, 0);
  if (!start) return { seed, area: 0, note: 'no surface at spawn' };
  const key = (x, z) => `${x},${z}`;
  const sx = Math.floor(SPAWN.x), sz = Math.floor(SPAWN.z);
  const seen = new Map([[key(sx, sz), start.h]]);
  const queue = [[sx, sz]];
  while (queue.length) {
    const [x, z] = queue.pop();
    const h = seen.get(key(x, z));
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (Math.abs(nx - sx) > R || Math.abs(nz - sz) > R || seen.has(key(nx, nz))) continue;
      const s = w.surfaceAt(nx + 0.5, nz + 0.5, h);
      if (s) { seen.set(key(nx, nz), s.h); queue.push([nx, nz]); }
    }
  }
  return { seed, area: seen.size };
}

const rows = CORPUS.seeds.map(walkableArea);
const areas = rows.map((r) => r.area).sort((a, b) => a - b);
const summary = {
  label: 'np02-v1-walkable-area', radiusMetres: R, spawn: SPAWN, squareAreaM2: (2 * R + 1) ** 2, seeds: CORPUS.seeds,
  min: areas[0], median: (areas[3] + areas[4]) / 2, max: areas.at(-1), rows,
  v2: 'no equivalent: v2 has no tile query outside the browser; local v3 baseline only (USER-2)',
};
if (OUT) writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ min: summary.min, median: summary.median, max: summary.max, rows: rows.map((r) => `${r.seed}:${r.area}`) }));

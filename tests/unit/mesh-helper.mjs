// Lets node load js/chunkmesh.js (which imports three.js) by standing in a tiny geometry class for 'three',
// and reads the quads back out of a built chunk. Not a test file: the glob only runs *.test.mjs.
import { register } from 'node:module';

const STUB = `
class Attr { constructor(array, size) { this.array = array; this.itemSize = size; } }
export class Float32BufferAttribute extends Attr { constructor(a, s) { super(Float32Array.from(a), s); } }
export class Uint16BufferAttribute extends Attr { constructor(a, s) { super(Uint16Array.from(a), s); } }
export class Uint32BufferAttribute extends Attr { constructor(a, s) { super(Uint32Array.from(a), s); } }
export class BufferGeometry {
  constructor() { this.attributes = {}; }
  setAttribute(n, a) { this.attributes[n] = a; }
  setIndex(a) { this.index = a; }
  computeBoundingSphere() {}
}`;
const HOOK = `
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(STUB)}), shortCircuit: true };
  return next(spec, ctx);
}`;

let mesher = null;
export async function loadMesher() {
  if (!mesher) {
    register('data:text/javascript,' + encodeURIComponent(HOOK));
    mesher = await import('../../js/chunkmesh.js');
  }
  return mesher;
}

// every quad of a geometry as 4 corner points
export function quadsOf(geo) {
  if (!geo) return [];
  const p = geo.attributes.position.array, out = [];
  for (let q = 0; q < p.length / 12; q++) {
    const c = [];
    for (let k = 0; k < 4; k++) c.push([p[q * 12 + k * 3], p[q * 12 + k * 3 + 1], p[q * 12 + k * 3 + 2]]);
    out.push(c);
  }
  return out;
}

// pairs of axis-aligned quads that lie in one plane, face the same way and overlap: they z-fight on screen
export function coplanarOverlaps(quads, minArea = 1e-3) {
  const groups = new Map();
  for (const q of quads) {
    for (let axis = 0; axis < 3; axis++) {
      if (!q.every((v) => Math.abs(v[axis] - q[0][axis]) < 1e-5)) continue;
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const ax = q[1][u] - q[0][u], ay = q[1][v] - q[0][v], bx = q[2][u] - q[0][u], by = q[2][v] - q[0][v];
      const sign = Math.sign(ax * by - ay * bx);
      if (!sign) break;
      const rect = [Math.min(...q.map((c) => c[u])), Math.min(...q.map((c) => c[v])), Math.max(...q.map((c) => c[u])), Math.max(...q.map((c) => c[v]))];
      const key = `${axis}:${Math.round(q[0][axis] * 1000)}:${sign}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ rect, axis, at: q[0][axis] });
      break;
    }
  }
  const out = [];
  for (const [key, list] of groups) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i].rect, b = list[j].rect;
      const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), d = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      if (w > 0 && d > 0 && w * d >= minArea) out.push({ key, a, b, area: w * d });
    }
  }
  return out;
}

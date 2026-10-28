// The World2 adapter of the bridge compiler (js/gen2-bridge.js): turns the rooms, pools, flights, voids and columns of the sampled cells into the
// context compileBridge reads. Imperative shell: it asks World2 for plans and records, and decides nothing. A split hall region
// (`<hall>#split:..`) gets no rects here: its pit is not modelled yet, so a bridge in it is refused as geometry-conflict.
import { shapeOutline } from './gen2.js';
import { roomGraphRecords } from './gen2-measure.js';
import { compileBridge } from './gen2-bridge.js';

const MOUTH = 3;   // open floor kept in front of a corridor that opens into a hall
const boxOf = (shape) => {
  if (Number.isFinite(shape.hw) && Number.isFinite(shape.hd) && Number.isFinite(shape.cx) && Number.isFinite(shape.cz)) return { x0: shape.cx - shape.hw, x1: shape.cx + shape.hw, z0: shape.cz - shape.hd, z1: shape.cz + shape.hd };
  const pts = shapeOutline(shape).map((p) => (Array.isArray(p) ? p : [p.x, p.z]));
  return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), z0: Math.min(...pts.map((p) => p[1])), z1: Math.max(...pts.map((p) => p[1])) };
};
const rectOf = (r) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });
const grow = (r, m) => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
const crosses = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

// inputs: collectZoningInputs output (its graph holds the anchors); cells: the sampled cells [i, j]
export function bridgeContext(world, inputs, cells) {
  const records = roomGraphRecords(world, cells), parts = new Map(), plans = new Map();
  for (const room of records.rooms) parts.set(room.spaceId, (parts.get(room.spaceId) ?? []).concat(room.parts));
  const plan = (i, j) => { const k = i + ',' + j; if (!plans.has(k)) plans.set(k, world.plan(i, j)); return plans.get(k); };
  const mine = (id) => (id.includes('#split:') ? [] : parts.get(id) ?? []);
  const sampled = cells.map(([i, j]) => plan(i, j));
  return {
    Y: inputs.Y,
    anchor: (id) => inputs.graph.nodes.get(id).anchor,
    rects: (id) => mine(id).map(rectOf),
    blockers: (id) => {
      const out = [], cellsOf = new Set(mine(id).map((p) => p.i + ',' + p.j));
      for (const k of cellsOf) {
        const [i, j] = k.split(',').map(Number), pl = plan(i, j);
        for (const p of pl.pools) if (p.lv === 0) out.push(boxOf(p.shape));
        for (const f of pl.flights) out.push(rectOf(f), rectOf(f.hallEntry));
        for (const v of pl.voids ?? []) out.push(rectOf(v));
        for (const c of pl.columns ?? []) out.push({ x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r });
        for (const w of pl.windows ?? []) if (w.front) out.push(rectOf(w.front));
        for (const o of pl.rooms) if (o.lv === 0 && o.kind !== 'hall') out.push(grow(rectOf(o), MOUTH));   // corridors and connector rooms that open into the hall
      }
      return out;
    },
    upper: (floor) => sampled.flatMap((pl) => [
      ...pl.rooms.filter((o) => o.lv === floor).map(rectOf), ...pl.flights.map(rectOf), ...(pl.voids ?? []).map(rectOf),
    ]),
  };
}

// compile every accepted border of a plan; { results: [descriptor | refusal], counts }
export function compilePlan(world, inputs, cells, plan) {
  const ctx = bridgeContext(world, inputs, cells), results = plan.borders.map((b) => compileBridge(b, ctx)), counts = { accepted: 0 };
  for (const r of results) { const k = r.status === 'accepted' ? 'accepted' : r.reason; counts[k] = (counts[k] ?? 0) + 1; }
  return { results, counts };
}

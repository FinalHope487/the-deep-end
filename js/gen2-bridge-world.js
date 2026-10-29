// The World2 adapter of the bridge compiler (js/gen2-bridge.js): turns the rooms, pools, flights, voids and columns of the sampled cells into the
// context compileBridge reads. Split region bits use the same cell and void order as routeGraph3D.
import { shapeOutline, CELL2 } from './gen2.js';
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
  const sampled = cells.map(([i, j]) => plan(i, j));
  const splits = new Map();
  for (const [i, j] of [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const pl = plan(i, j);
    for (const v of pl.voids ?? []) {
      if (v.kind !== 'split') continue;
      const room = pl.rooms.find((o) => o.id === v.over);
      if (!room) throw new TypeError('Split bridge region has no hall');
      const axis = v.run === 'x' ? 'z' : 'x', across = v.run === 'x' ? 'x' : 'z';
      const edge = across === 'x' ? pl.ox : pl.oz;
      // Match the route graph: a pit that ends at a cell edge does not split the shared hall.
      if (!parts.has(room.spaceId) || room[across + '0'] <= edge || room[across + '1'] >= edge + CELL2) continue;
      if (!splits.has(room.spaceId)) splits.set(room.spaceId, []);
      splits.get(room.spaceId).push({ axis, lo: v[axis + '0'], hi: v[axis + '1'] });
    }
  }
  const mine = (id) => {
    const at = id.indexOf('#split:');
    if (at < 0) return parts.get(id) ?? [];
    const base = id.slice(0, at), bits = id.slice(at + 7), cuts = splits.get(base);
    if (!cuts || bits.length !== cuts.length || !/^[01]+$/.test(bits)) throw new TypeError('Invalid split bridge region');
    let rects = (parts.get(base) ?? []).map((r) => ({ ...r }));
    cuts.forEach(({ axis, lo, hi }, k) => {
      rects = rects.map((r) => bits[k] === '0'
        ? { ...r, [axis + '1']: Math.min(r[axis + '1'], lo) }
        : { ...r, [axis + '0']: Math.max(r[axis + '0'], hi) })
        .filter((r) => r.x1 > r.x0 && r.z1 > r.z0);
    });
    return rects;
  };
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
      ...pl.rooms.filter((o) => o.lv === floor).map(rectOf),
      ...pl.flights.filter((f) => f.lo <= floor && floor <= f.hi).map(rectOf),
      ...(pl.voids ?? []).filter((v) => v.lv === floor || v.lv + 1 === floor).map(rectOf),
    ]),
  };
}

// compile every accepted border of a plan; { results: [descriptor | refusal], counts }
export function compilePlan(world, inputs, cells, plan) {
  const ctx = bridgeContext(world, inputs, cells), results = plan.borders.map((b) => compileBridge(b, ctx)), counts = { accepted: 0 };
  for (const r of results) { const k = r.status === 'accepted' ? 'accepted' : r.reason; counts[k] = (counts[k] ?? 0) + 1; }
  return { results, counts };
}

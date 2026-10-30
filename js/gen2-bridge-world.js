// The World2 adapter of the bridge compiler (js/gen2-bridge.js): turns the rooms, pools, flights, voids and columns of the sampled cells into the
// context compileBridge reads. Split region bits use the same cell and void order as routeGraph3D.
import { shapeOutline, CELL2 } from './gen2.js';
import { roomGraphRecords } from './gen2-measure.js';
import { compileBridge, BRIDGE } from './gen2-bridge.js';

const MOUTH = 3;   // open floor kept in front of a corridor that opens into a hall
const boxOf = (shape) => {
  if (Number.isFinite(shape.hw) && Number.isFinite(shape.hd) && Number.isFinite(shape.cx) && Number.isFinite(shape.cz)) return { x0: shape.cx - shape.hw, x1: shape.cx + shape.hw, z0: shape.cz - shape.hd, z1: shape.cz + shape.hd };
  const pts = shapeOutline(shape).map((p) => (Array.isArray(p) ? p : [p.x, p.z]));
  return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), z0: Math.min(...pts.map((p) => p[1])), z1: Math.max(...pts.map((p) => p[1])) };
};
const rectOf = (r) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });
const grow = (r, m) => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
const crosses = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

// Bounds must come from geometry or legal body paths. A possible interval is never acceptance.
export function physicalRatioPrefilter({groundLower,groundUpper,allLower,allUpper,drawn,tolerance=.15}) {
  if (![groundLower,allLower,drawn,tolerance].every(Number.isFinite) ||
      groundLower<=0 || allLower<=0 || drawn<=tolerance || tolerance<0 ||
      !(groundUpper>=groundLower) || !(allUpper>=allLower)) throw new RangeError('Invalid physical ratio bounds');
  if (groundUpper/allLower<drawn-tolerance-1e-9) return {status:'impossible-low'};
  if (groundLower/allUpper>drawn+tolerance+1e-9) return {status:'impossible-high'};
  return {status:'possible-unproven'};
}

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
  const blockers = (id, kind = 'all') => {
      const out = [], cellsOf = new Set(mine(id).map((p) => p.i + ',' + p.j));
      for (const k of cellsOf) {
        const [i, j] = k.split(',').map(Number), pl = plan(i, j);
        if(kind!=='hard'){
          for (const p of pl.pools) if (p.lv === 0) out.push(boxOf(p.shape));
          for (const c of pl.columns ?? []) out.push({ x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r });
        }
        if(kind==='soft')continue;
        for (const f of pl.flights) out.push(rectOf(f), rectOf(f.hallEntry));
        for (const v of pl.voids ?? []) out.push(rectOf(v));
        for (const w of pl.windows ?? []) if (w.front) out.push(rectOf(w.front));
        for (const o of pl.rooms) if (o.lv === 0 && o.kind !== 'hall') out.push(grow(rectOf(o), MOUTH));   // corridors and connector rooms that open into the hall
      }
      return out;
    };
  return {
    Y: inputs.Y,
    anchor: (id) => inputs.graph.nodes.get(id).anchor,
    rects: (id) => mine(id).map(rectOf),
    blockers: id=>blockers(id),
    hardBlockers: id=>blockers(id,'hard'),
    softBlockers: id=>blockers(id,'soft'),
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

// S2 compiles against measured distance and refuses unsupported ownership before any World2 is built.
export function compilePhysicalCandidate(record, ctx, groundLength, diagnostic = null, {keepPath=null,reserveSoftFeatures=false}={}) {
  if(!Number.isFinite(groundLength)||groundLength<=0)throw new RangeError('Physical candidate requires a measured ground length');
  const use=reserveSoftFeatures?{...ctx,blockers:ctx.hardBlockers}:ctx;
  const bridge=compileBridge(record,use,diagnostic,{groundLength,keepPath});
  if(bridge.status!=='accepted')return bridge;
  for(const part of [bridge.parts[0],bridge.parts[2]]){
    const f=part.flight,i=Math.floor((f.x0+f.x1)/2/CELL2),j=Math.floor((f.z0+f.z1)/2/CELL2);
    if(f.x0<i*CELL2||f.x1>(i+1)*CELL2||f.z0<j*CELL2||f.z1>(j+1)*CELL2)
      return {status:'refused',borderId:record.id,reason:'geometry-conflict',detail:'Bridge flight crosses its endpoint cell'};
    if(!bridge.parts[1].rects.some(r=>part.exit[0]>=Math.max(r.x0,i*CELL2)&&part.exit[0]<=Math.min(r.x1,(i+1)*CELL2)&&part.exit[1]>=Math.max(r.z0,j*CELL2)&&part.exit[1]<=Math.min(r.z1,(j+1)*CELL2)))
      return {status:'refused',borderId:record.id,reason:'geometry-conflict',detail:'Bridge exit has no passage room'};
  }
  if(reserveSoftFeatures){
    const rects=[];
    const reserve=r=>rects.push({x0:Math.floor(r.x0/.5)*.5,x1:Math.ceil(r.x1/.5)*.5,z0:Math.floor(r.z0/.5)*.5,z1:Math.ceil(r.z1/.5)*.5});
    for(const part of [bridge.parts[0],bridge.parts[2]]){
      reserve(grow(part.flight,BRIDGE.clear));reserve(grow(part.flight.hallEntry,BRIDGE.clear));
      const a=ctx.anchor(part.room),b=part.entry,n=Math.max(1,Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/.5));
      for(let k=0;k<=n;k++){const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n;reserve({x0:x-1.5,x1:x+1.5,z0:z-1.5,z1:z+1.5});}
    }
    bridge.softReservations=rects;
  }
  return bridge;
}

// Immutable input for World2. Rooms are clipped per cell. A stair stays whole in its endpoint cell.
export function bridgeFragments(bridges) {
  const out = new Map();
  const cell = (i,j) => {
    const key = `${i},${j}`;
    if (!out.has(key)) out.set(key, { rooms: [], flights: [] });
    return out.get(key);
  };
  for (const bridge of bridges) {
    if (bridge.status !== 'accepted') throw new TypeError('Only compiled bridges have geometry');
    const passage = bridge.parts[1], prefix = `bridge:${bridge.borderId}`;
    for(const r of bridge.softReservations??[]){
      for(let j=Math.floor(r.z0/CELL2);j<Math.ceil(r.z1/CELL2);j++)for(let i=Math.floor(r.x0/CELL2);i<Math.ceil(r.x1/CELL2);i++){
        const c=cell(i,j);(c.reservations??=[]).push({...r});
      }
    }
    for (const [k,r] of passage.rects.entries()) {
      for (let j=Math.floor(r.z0/CELL2); j<Math.ceil(r.z1/CELL2);j++) for(let i=Math.floor(r.x0/CELL2);i<Math.ceil(r.x1/CELL2);i++) {
        const cut = { x0:Math.max(r.x0,i*CELL2),x1:Math.min(r.x1,(i+1)*CELL2),z0:Math.max(r.z0,j*CELL2),z1:Math.min(r.z1,(j+1)*CELL2) };
        cell(i,j).rooms.push({ ...cut, id:`${prefix}:${k}`, spaceId:prefix, bridgeId:bridge.borderId, lv:bridge.floor, kind:'bridge', ceil:3, lamps:[] });
      }
    }
    for (const [end, part] of [['A',bridge.parts[0]],['B',bridge.parts[2]]]) {
      const f=part.flight, i=Math.floor((f.x0+f.x1)/2/CELL2),j=Math.floor((f.z0+f.z1)/2/CELL2), c=cell(i,j);
      if(f.x0<i*CELL2||f.x1>(i+1)*CELL2||f.z0<j*CELL2||f.z1>(j+1)*CELL2) throw new Error('Bridge flight crosses its endpoint cell');
      const far = c.rooms.find(r=>part.exit[0]>=r.x0&&part.exit[0]<=r.x1&&part.exit[1]>=r.z0&&part.exit[1]<=r.z1);
      if(!far) throw new Error('Bridge exit has no passage room');
      c.flights.push({ ...f, bridgeId:bridge.borderId, bridgeEnd:end, hallSpaceId:part.room.split('#split:')[0], entry:[...part.entry], room:far.id });
    }
  }
  return out;
}

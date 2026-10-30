// S3 slice 2: the rectangular sub-rooms of the S3-1 planner become rooms of a World2 cell plan (option s3Rects, off by default). Pure data: this module
// imports the planner and nothing of gen2.js, so gen2.js can import it.
//
// Floor ownership. A hall that is cut keeps its rectangle and lists the footprints it gave away in `s3Cuts`; each footprint is a room of its own
// (kind 's3-room', the same lv, ceiling and floor as the hall). s3RoomContains is the one test of "is this point on this room's floor": the candidates,
// roomAt and cellRaster of World2 all ask it, so collision, drawing and lighting agree on who owns a cell.
//
// What is made real here: a flat rectangle with one door (shape rect-union of one rectangle, no elevation). Discs and split levels stay in the
// planner's data (slices S3-3 and S3-4).
import { planSubdivision, validateSubdivision, protectedRectsFor, isSpecialHall } from './gen2-s3-plan.js';

const RECT_EPS = 1e-9;
const SEAM_DEPTH = 6;      // floor kept open in front of a shared hall's seam (makeClusterPlan keeps 6 m too)
const FACE_DEPTH = 3;      // and along a wall that two halls share
const GUARD = 1;           // half the side of the square kept clear round each of restPoint's four candidates

const rectHit = (a, b) => a.x0 < b.x1 - RECT_EPS && b.x0 < a.x1 - RECT_EPS && a.z0 < b.z1 - RECT_EPS && b.z0 < a.z1 - RECT_EPS;
const clipTo = (h, r) => {
  const q = { x0: Math.max(h.x0, r.x0), x1: Math.min(h.x1, r.x1), z0: Math.max(h.z0, r.z0), z1: Math.min(h.z1, r.z1) };
  return q.x1 > q.x0 && q.z1 > q.z0 ? q : null;
};

// is (x, z) on the floor of `room`? Its rectangle, less the footprints it gave to sub-rooms
export function s3RoomContains(room, x, z) {
  if (x < room.x0 || x >= room.x1 || z < room.z0 || z >= room.z1) return false;
  const cuts = room.s3Cuts;
  if (cuts) for (const c of cuts) if (x >= c.x0 && x < c.x1 && z >= c.z0 && z < c.z1) return false;
  return true;
}

// the four squares round restPoint(0, 0)'s candidates, so the spawn of the start cell is the one it has without S3
function spawnGuards(plan, hall) {
  if (plan.i !== 0 || plan.j !== 0 || hall.id !== plan.primaryHallId) return [];
  const cx = (hall.x0 + hall.x1) / 2, cz = (hall.z0 + hall.z1) / 2;
  return [[hall.x0 + 1.25, cz], [hall.x1 - 1.25, cz], [cx, hall.z0 + 1.25], [cx, hall.z1 - 1.25]].map(([x, z]) => ({ x0: x - GUARD, x1: x + GUARD, z0: z - GUARD, z1: z + GUARD }));
}

// every rectangle of `hall` that no sub-room may take: what the planner lists for a real hall, plus what a cell plan alone does not show it: S2's
// reservations, other halls of the same floor, the open stretch of every seam, and the spawn's squares
function protectFor(plan, hall, reservations) {
  const out = [...protectedRectsFor(plan, hall)], add = (r) => { const q = clipTo(hall, r); if (q) out.push(q); };
  for (const r of reservations) add(r);
  for (const o of plan.rooms) {
    if (o === hall || o.lv !== hall.lv || o.elevation !== hall.elevation || o.kind !== 'hall') continue;
    add(o);                                                      // two halls laid over each other
    const zs = [Math.max(hall.z0, o.z0), Math.min(hall.z1, o.z1)], xs = [Math.max(hall.x0, o.x0), Math.min(hall.x1, o.x1)];
    if (zs[1] > zs[0]) {                                         // side by side: the wall they share keeps a strip open
      if (Math.abs(hall.x1 - o.x0) < RECT_EPS) add({ x0: hall.x1 - FACE_DEPTH, x1: hall.x1, z0: zs[0], z1: zs[1] });
      if (Math.abs(hall.x0 - o.x1) < RECT_EPS) add({ x0: hall.x0, x1: hall.x0 + FACE_DEPTH, z0: zs[0], z1: zs[1] });
    }
    if (xs[1] > xs[0]) {
      if (Math.abs(hall.z1 - o.z0) < RECT_EPS) add({ x0: xs[0], x1: xs[1], z0: hall.z1 - FACE_DEPTH, z1: hall.z1 });
      if (Math.abs(hall.z0 - o.z1) < RECT_EPS) add({ x0: xs[0], x1: xs[1], z0: hall.z0, z1: hall.z0 + FACE_DEPTH });
    }
  }
  const s = hall.seams;
  if (s) {
    if (s.px) add({ x0: hall.x1 - SEAM_DEPTH, x1: hall.x1, z0: s.px.lo, z1: s.px.hi });
    if (s.nx) add({ x0: hall.x0, x1: hall.x0 + SEAM_DEPTH, z0: s.nx.lo, z1: s.nx.hi });
    if (s.pz) add({ x0: s.pz.lo, x1: s.pz.hi, z0: hall.z1 - SEAM_DEPTH, z1: hall.z1 });
    if (s.nz) add({ x0: s.nz.lo, x1: s.nz.hi, z0: hall.z0, z1: hall.z0 + SEAM_DEPTH });
  }
  for (const r of spawnGuards(plan, hall)) add(r);
  return out;
}

// the sub-rooms this slice makes real: one flat rectangle with one door
const flatRect = (s) => s.shape.type === 'rect-union' && s.shape.rects.length === 1 && s.elevation === undefined && s.portals.length === 1 && s.portals[0].type === 'door';

// One hall, all or nothing: the children and the cuts are made on the side, and the hall changes only when every one of them is sound
function prepareHall(world, plan, hall, reservations, planner, validator, firstId) {
  const parent = { x0: hall.x0, x1: hall.x1, z0: hall.z0, z1: hall.z1, lv: hall.lv, ceil: hall.ceil, floorY: 0 };
  const protect = protectFor(plan, hall, reservations);
  const sub = planner({ seed: world.seed, spaceId: hall.spaceId, parent, protect, special: isSpecialHall(plan, hall) });
  if (validator(sub, { parent, protect }).length) return null;
  const children = [], cuts = [];
  for (const s of sub.subrooms.filter(flatRect)) {
    const R = s.shape.rects[0], door = s.portals[0];
    if (!(s.ceil === hall.ceil) || !door.rect || !door.approach || ![R.x0, R.x1, R.z0, R.z1].every(Number.isFinite)) return null;
    cuts.push({ x0: R.x0, x1: R.x1, z0: R.z0, z1: R.z1 });
    children.push({
      id: firstId + children.length, kind: 's3-room', lv: hall.lv, nominalLevel: hall.lv, x0: R.x0, x1: R.x1, z0: R.z0, z1: R.z1, ceil: s.ceil,
      spaceId: `${s.subspaceId}@${plan.i},${plan.j}`, parentSpaceId: hall.spaceId, parentId: hall.id, s3Portal: structuredClone(door), lamps: [],
    });
  }
  return { cuts, children };
}

// The cell plan with the sub-rooms of its 1F halls made real. Returns a new plan; `plan` is not touched. A hall whose planning or checking fails, or
// has any child that is not sound, keeps its whole floor (plan.s3Rejected counts them). This function throws for nothing a hall can cause.
// planner and validator are the S3-1 ones; a test can swap them to inject a failure
export function applyS3Rects(world, plan, { reservations = [], planner = planSubdivision, validator = validateSubdivision } = {}) {
  const out = { ...plan, rooms: plan.rooms.map((o) => ({ ...o, lamps: o.lamps.map((l) => ({ ...l })) })), s3Rejected: 0 };
  const copyOf = new Map(out.rooms.map((o) => [o.id, o]));
  let nextId = Math.max(-1, ...plan.rooms.map((o) => o.id)) + 1;
  // every hall is planned against the plan as it came in, so the order of the halls changes nothing
  for (const hall of plan.rooms.filter((o) => o.kind === 'hall' && o.lv === 0 && o.elevation === undefined && !o.opening)) {
    let patch = null;
    try { patch = prepareHall(world, plan, hall, reservations, planner, validator, nextId); } catch { patch = null; }
    if (!patch) { out.s3Rejected++; continue; }
    if (!patch.children.length) continue;
    copyOf.get(hall.id).s3Cuts = patch.cuts;
    out.rooms.push(...patch.children);
    nextId += patch.children.length;
  }
  return out;
}

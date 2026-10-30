// S3 slice 2: the rectangular sub-rooms of the S3-1 planner become rooms of a World2 cell plan (option s3Rects, off by default). Pure data: this module
// imports the planner and nothing of gen2.js, so gen2.js can import it.
//
// Floor ownership. A hall that is cut keeps its rectangle and lists the footprints it gave away in `s3Cuts`; each footprint is a room of its own
// (kind 's3-room', the same lv, ceiling and floor as the hall). s3RoomContains is the one test of "is this point on this room's floor": the candidates,
// roomAt and cellRaster of World2 all ask it, so collision, drawing and lighting agree on who owns a cell.
//
// What is made real here: a flat rectangle with one door (shape rect-union of one rectangle, no elevation). Split levels stay in the planner's data
// (slice S3-3). The planner is asked for flat rooms only, and a hall whose plan still holds anything this slice cannot build is not cut at all: a
// cluster is never built in part, since a room left out could be the wall another room stands on.
//
// Walls. Each child is closed by PART_WALL thick wall boxes, solid from the floor to the ceiling, with a gap for the door that is open up to
// S3_DOOR_H and closed above it by a lintel. They are listed in plan.s3Walls as { x0, x1, z0, z1, y0, y1, side, lintel, parentId, childId } in
// absolute heights. s3SolidAt (a point) and s3SweptWallHit (a move) read them; World2 asks both. A side that lies on a wall of the hall, or on the
// wall of a longer neighbour (a room of a cluster shares a wall with it), gets no box of its own: that wall is there already, once.

import { planSubdivision, validateSubdivision, protectedRectsFor, isSpecialHall, s3Meet, PART_WALL } from './gen2-s3-plan.js';

const S3R_EPS = 1e-9;
export const S3_DOOR_H = 2.2;   // clear height of a doorway; above it the lintel
const SEAM_DEPTH = 6;      // floor kept open in front of a shared hall's seam (makeClusterPlan keeps 6 m too)
const FACE_DEPTH = 3;      // and along a wall that two halls share
const GUARD = 1;           // half the side of the square kept clear round each of restPoint's four candidates

const s3RectHit = (a, b) => a.x0 < b.x1 - S3R_EPS && b.x0 < a.x1 - S3R_EPS && a.z0 < b.z1 - S3R_EPS && b.z0 < a.z1 - S3R_EPS;
const s3ClipTo = (h, r) => {
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
function s3SpawnGuards(plan, hall) {
  if (plan.i !== 0 || plan.j !== 0 || hall.id !== plan.primaryHallId) return [];
  const cx = (hall.x0 + hall.x1) / 2, cz = (hall.z0 + hall.z1) / 2;
  return [[hall.x0 + 1.25, cz], [hall.x1 - 1.25, cz], [cx, hall.z0 + 1.25], [cx, hall.z1 - 1.25]].map(([x, z]) => ({ x0: x - GUARD, x1: x + GUARD, z0: z - GUARD, z1: z + GUARD }));
}

// every rectangle of `hall` that no sub-room may take: what the planner lists for a real hall, plus what a cell plan alone does not show it: S2's
// reservations, other halls of the same floor, the open stretch of every seam, and the spawn's squares
function s3ProtectFor(plan, hall, reservations) {
  const out = [...protectedRectsFor(plan, hall)], add = (r) => { const q = s3ClipTo(hall, r); if (q) out.push(q); };
  for (const r of reservations) add(r);
  for (const o of plan.rooms) {
    if (o === hall || o.lv !== hall.lv || o.elevation !== hall.elevation || o.kind !== 'hall') continue;
    add(o);                                                      // two halls laid over each other
    const zs = [Math.max(hall.z0, o.z0), Math.min(hall.z1, o.z1)], xs = [Math.max(hall.x0, o.x0), Math.min(hall.x1, o.x1)];
    if (zs[1] > zs[0]) {                                         // side by side: the wall they share keeps a strip open
      if (Math.abs(hall.x1 - o.x0) < S3R_EPS) add({ x0: hall.x1 - FACE_DEPTH, x1: hall.x1, z0: zs[0], z1: zs[1] });
      if (Math.abs(hall.x0 - o.x1) < S3R_EPS) add({ x0: hall.x0, x1: hall.x0 + FACE_DEPTH, z0: zs[0], z1: zs[1] });
    }
    if (xs[1] > xs[0]) {
      if (Math.abs(hall.z1 - o.z0) < S3R_EPS) add({ x0: xs[0], x1: xs[1], z0: hall.z1 - FACE_DEPTH, z1: hall.z1 });
      if (Math.abs(hall.z0 - o.z1) < S3R_EPS) add({ x0: xs[0], x1: xs[1], z0: hall.z0, z1: hall.z0 + FACE_DEPTH });
    }
  }
  const s = hall.seams;
  if (s) {
    if (s.px) add({ x0: hall.x1 - SEAM_DEPTH, x1: hall.x1, z0: s.px.lo, z1: s.px.hi });
    if (s.nx) add({ x0: hall.x0, x1: hall.x0 + SEAM_DEPTH, z0: s.nx.lo, z1: s.nx.hi });
    if (s.pz) add({ x0: s.pz.lo, x1: s.pz.hi, z0: hall.z1 - SEAM_DEPTH, z1: hall.z1 });
    if (s.nz) add({ x0: s.nz.lo, x1: s.nz.hi, z0: hall.z0, z1: hall.z0 + SEAM_DEPTH });
  }
  for (const r of s3SpawnGuards(plan, hall)) add(r);
  return out;
}

const s3Sound = (w) => [w.x0, w.x1, w.z0, w.z1, w.y0, w.y1].every(Number.isFinite) && w.x1 > w.x0 && w.z1 > w.z0 && w.y1 > w.y0;

// The sides of room i (of `rects`, the rooms of one hall) that lie on the wall of a neighbour: the room whose side is the shorter, or the later of two equal
// ones, leaves the shared wall to the other, so it is built once
function s3SharedSides(rects, i) {
  const R = rects[i], out = [];
  for (const [j, N] of rects.entries()) {
    if (j === i || s3Meet(R, N).kind !== 'wall') continue;
    const east = Math.abs(R.x1 - N.x0) < S3R_EPS, west = Math.abs(R.x0 - N.x1) < S3R_EPS, south = Math.abs(R.z1 - N.z0) < S3R_EPS;
    const [r0, r1, n0, n1] = east || west ? [R.z0, R.z1, N.z0, N.z1] : [R.x0, R.x1, N.x0, N.x1];
    if (r0 < n0 - S3R_EPS || r1 > n1 + S3R_EPS || (Math.abs(r0 - n0) < S3R_EPS && Math.abs(r1 - n1) < S3R_EPS && j > i)) continue;
    out.push(east ? 'x1' : west ? 'x0' : south ? 'z1' : 'z0');
  }
  return out;
}

// The wall boxes round rectangle R (its outer footprint, the wall inside it), `portal` the door in one side, floorY the floor and ceil the room's height.
// A side that lies on a wall of `parent`, or is listed in `shared` (a neighbour's wall), gets no box of its own: that wall is there, and the two sides
// that meet it run on up to it.
export function s3WallPieces(R, portal, floorY, ceil, parent, shared = []) {
  const T = PART_WALL, flush = { x0: Math.abs(R.x0 - parent.x0) < S3R_EPS || shared.includes('x0'), x1: Math.abs(R.x1 - parent.x1) < S3R_EPS || shared.includes('x1'), z0: Math.abs(R.z0 - parent.z0) < S3R_EPS || shared.includes('z0'), z1: Math.abs(R.z1 - parent.z1) < S3R_EPS || shared.includes('z1') };
  const top = floorY + ceil, lintelY = floorY + S3_DOOR_H;
  const xa = flush.x0 ? R.x0 : R.x0 + T, xb = flush.x1 ? R.x1 : R.x1 - T;
  const boxes = {
    x0: { x0: R.x0, x1: R.x0 + T, z0: R.z0, z1: R.z1 }, x1: { x0: R.x1 - T, x1: R.x1, z0: R.z0, z1: R.z1 },
    z0: { x0: xa, x1: xb, z0: R.z0, z1: R.z0 + T }, z1: { x0: xa, x1: xb, z0: R.z1 - T, z1: R.z1 },
  };
  const out = [];
  for (const side of ['x0', 'x1', 'z0', 'z1']) {
    if (flush[side]) continue;
    const b = boxes[side], piece = (r, y0, y1, lintel) => { if (r.x1 - r.x0 > S3R_EPS && r.z1 - r.z0 > S3R_EPS && y1 - y0 > S3R_EPS) out.push({ ...r, y0, y1, side, lintel }); };
    if (!portal || portal.side !== side) { piece(b, floorY, top, false); continue; }
    const along = side[0] === 'x' ? 'z' : 'x', d0 = portal.rect[along + '0'], d1 = portal.rect[along + '1'];
    piece({ ...b, [along + '1']: d0 }, floorY, top, false);                                  // the wall before the door
    piece({ ...b, [along + '0']: d1 }, floorY, top, false);                                  // and after it
    piece({ ...b, [along + '0']: d0, [along + '1']: d1 }, lintelY, top, true);               // the lintel over it
  }
  return out;
}

// does a body at (x, z) whose feet are at floorH and whose height is bodyH meet one of the wall boxes?
export function s3SolidAt(walls, x, z, floorH, bodyH) {
  if (!walls) return false;
  const top = floorH + bodyH;
  for (const w of walls) if (x >= w.x0 && x < w.x1 && z >= w.z0 && z < w.z1 && floorH < w.y1 - S3R_EPS && top > w.y0 + S3R_EPS) return true;
  return false;
}

// does the segment (ax, az) - (bx, bz) cross the open box? (the slab test: the stretch of the segment inside each axis' slab must overlap)
function s3SegmentCrossesBox(ax, az, bx, bz, box) {
  let enter = 0, exit = 1;
  for (const [start, delta, lo, hi] of [[ax, bx - ax, box.x0, box.x1], [az, bz - az, box.z0, box.z1]]) {
    if (Math.abs(delta) < 1e-12) { if (start <= lo || start >= hi) return false; continue; }
    const t0 = (lo - start) / delta, t1 = (hi - start) / delta;
    enter = Math.max(enter, Math.min(t0, t1)); exit = Math.min(exit, Math.max(t0, t1));
    if (enter >= exit) return false;
  }
  return true;
}

// does the body's square footprint (half side `radius`), moving from (fromX, fromZ) to (toX, toZ), meet one of the walls on the way? A step longer
// than a wall is thick cannot jump it. The walls are grown by the radius, so a body that only touches a wall's face (distance = radius) is not a hit
export function s3SweptWallHit(walls, fromX, fromZ, toX, toZ, radius, floorH, bodyH) {
  if (!walls) return false;
  const top = floorH + bodyH, r = radius - 1e-6;
  for (const w of walls) {
    if (floorH >= w.y1 - S3R_EPS || top <= w.y0 + S3R_EPS) continue;
    if (s3SegmentCrossesBox(fromX, fromZ, toX, toZ, { x0: w.x0 - r, x1: w.x1 + r, z0: w.z0 - r, z1: w.z1 + r })) return true;
  }
  return false;
}

// the sub-rooms this slice makes real: one flat rectangle with one door
const s3FlatRect = (s) => s.shape.type === 'rect-union' && s.shape.rects.length === 1 && s.elevation === undefined && s.portals.length === 1 && s.portals[0].type === 'door';

// One hall, all or nothing: the children and the cuts are made on the side, and the hall changes only when every one of them is sound
function s3PrepareHall(world, plan, hall, reservations, planner, validator, firstId) {
  const parent = { x0: hall.x0, x1: hall.x1, z0: hall.z0, z1: hall.z1, lv: hall.lv, ceil: hall.ceil, floorY: 0 };
  const protect = s3ProtectFor(plan, hall, reservations);
  const sub = planner({ seed: world.seed, spaceId: hall.spaceId, parent, protect, special: isSpecialHall(plan, hall), flatOnly: true });
  if (validator(sub, { parent, protect }).length || !sub.subrooms.every(s3FlatRect)) return null;
  const children = [], cuts = [], walls = [], floorY = world.Y[hall.lv], rects = sub.subrooms.map((s) => s.shape.rects[0]);
  for (const [k, s] of sub.subrooms.entries()) {
    const R = rects[k], door = s.portals[0];
    if (!(s.ceil === hall.ceil) || !door.rect || !door.approach || ![R.x0, R.x1, R.z0, R.z1].every(Number.isFinite)) return null;
    const id = firstId + children.length, pieces = s3WallPieces(R, door, floorY, s.ceil, hall, s3SharedSides(rects, k));
    if (!pieces.length || !pieces.every(s3Sound)) return null;
    for (const w of pieces) walls.push({ ...w, parentId: hall.id, childId: id });
    cuts.push({ x0: R.x0, x1: R.x1, z0: R.z0, z1: R.z1 });
    children.push({
      id, kind: 's3-room', lv: hall.lv, nominalLevel: hall.lv, x0: R.x0, x1: R.x1, z0: R.z0, z1: R.z1, ceil: s.ceil,
      spaceId: `${s.subspaceId}@${plan.i},${plan.j}`, parentSpaceId: hall.spaceId, parentId: hall.id, s3Portal: structuredClone(door), lamps: [],
    });
  }
  return { cuts, children, walls };
}

// The cell plan with the sub-rooms of its 1F halls made real. Returns a new plan; `plan` is not touched. A hall whose planning or checking fails, or
// has any child that is not sound, keeps its whole floor (plan.s3Rejected counts them). This function throws for nothing a hall can cause.
// planner and validator are the S3-1 ones; a test can swap them to inject a failure
export function applyS3Rects(world, plan, { reservations = [], planner = planSubdivision, validator = validateSubdivision } = {}) {
  const out = { ...plan, rooms: plan.rooms.map((o) => ({ ...o, lamps: o.lamps.map((l) => ({ ...l })) })), s3Walls: [], s3Rejected: 0 };
  const copyOf = new Map(out.rooms.map((o) => [o.id, o]));
  let nextId = Math.max(-1, ...plan.rooms.map((o) => o.id)) + 1;
  // every hall is planned against the plan as it came in, so the order of the halls changes nothing
  for (const hall of plan.rooms.filter((o) => o.kind === 'hall' && o.lv === 0 && o.elevation === undefined && !o.opening)) {
    let patch = null;
    try { patch = s3PrepareHall(world, plan, hall, reservations, planner, validator, nextId); } catch { patch = null; }
    if (!patch) { out.s3Rejected++; continue; }
    if (!patch.children.length) continue;
    copyOf.get(hall.id).s3Cuts = patch.cuts;
    out.rooms.push(...patch.children);
    out.s3Walls.push(...patch.walls);
    nextId += patch.children.length;
  }
  return out;
}

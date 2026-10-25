// v2 district planning core: pure geometry for a 128 × 128 m district of 2 × 2 cells (no world, no random draws, no imports of gen2.js).
// A district is a set of rooms (unions of Q2-grid rectangles on 1F) and passages between them. validateDistrictPlan accepts a source
// plan and returns a frozen copy; cutDistrictCell cuts it into the fragments one 64 m cell holds. Walls are implicit: floor exists in
// the union of same-level rectangles, so touching rectangles of one source have no wall between them (their shared face is a seam).

const CELL = 64;
const GRID = 0.5;
const DISTRICT = 128;
const EDGE_MIN = 12, EDGE_MAX = 24;   // an anchor's four outward faces stand 12–24 m from the district boundary; nothing but anchors reaches closer
const BAND = [24, 40];                // every anchor holds this much of its cell's middle both ways, where legacy corridors cross
const ROLES = ['anchor', 'room'];
const FACE_KEYS = ['px', 'nx', 'pz', 'nz'];
const OUTWARD = [['nx', 'nz'], ['px', 'nz'], ['nx', 'pz'], ['px', 'pz']];   // by the cell's position in the district: (0,0), (1,0), (0,1), (1,1)
const checked = new WeakSet();        // plans validateDistrictPlan returned: cutDistrictCell takes no others

const badPlan = () => new TypeError('Invalid district plan');
const badGeometry = () => new RangeError('Invalid district geometry');
const isIndex = (n) => Number.isSafeInteger(n);
const onGrid = (v) => Number.isFinite(v) && Number.isInteger(v / GRID);
const area = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const byRect = (p, q) => p.x0 - q.x0 || p.z0 - q.z0 || p.x1 - q.x1 || p.z1 - q.z1;
// positive-area overlap, and positive-length shared edge
const overlaps = (p, q) => Math.min(p.x1, q.x1) > Math.max(p.x0, q.x0) && Math.min(p.z1, q.z1) > Math.max(p.z0, q.z0);
const abuts = (p, q) => ((p.x1 === q.x0 || q.x1 === p.x0) && Math.min(p.z1, q.z1) > Math.max(p.z0, q.z0)) || ((p.z1 === q.z0 || q.z1 === p.z0) && Math.min(p.x1, q.x1) > Math.max(p.x0, q.x0));

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

// ---------- production builder (T3 replaces the body) ----------

export function buildClusterDistrict(seed, a, b, Y) {
  return null;
}

// ---------- fixtures ----------

// four 1F anchor rooms in the corners of district (a, b), each pair joined across a 0.5 m solid strip by a 3 m passage
export function fixtureCluster(a, b) {
  if (!isIndex(a) || !isIndex(b)) throw badPlan();
  const OX = DISTRICT * a, OZ = DISTRICT * b, rect = (x0, x1, z0, z1) => ({ x0: OX + x0, x1: OX + x1, z0: OZ + z0, z1: OZ + z1 });
  const id = (k) => `v2:space:${a},${b}:r${k}`;
  const room = (k, x0, x1, z0, z1) => ({ spaceId: id(k), lv: 0, rects: [rect(x0, x1, z0, z1)], ceil: 4, role: 'anchor', grid: { ox: OX + x0, oz: OZ + z0, step: 6 } });
  const link = (k, from, to, x0, x1, z0, z1) => ({ id: `v2:dlink:${a},${b}:${k}`, from: id(from), to: id(to), kind: 'passage', rects: [rect(x0, x1, z0, z1)], grid: { ox: OX + x0, oz: OZ + z0, step: 6 } });
  return {
    a, b,
    rooms: [room(0, 20, 63.5, 20, 63.5), room(1, 64, 108, 20, 63.5), room(2, 20, 63.5, 64, 108), room(3, 64, 108, 64, 108)],
    links: [link(0, 0, 1, 63, 64.5, 30.5, 33.5), link(1, 2, 3, 63, 64.5, 94.5, 97.5), link(2, 0, 2, 30.5, 33.5, 63, 64.5), link(3, 1, 3, 94.5, 97.5, 63, 64.5)],
    anchors: { [`${2 * a},${2 * b}`]: id(0), [`${2 * a + 1},${2 * b}`]: id(1), [`${2 * a},${2 * b + 1}`]: id(2), [`${2 * a + 1},${2 * b + 1}`]: id(3) },
  };
}

// fixtureCluster with A reaching across the cell boundary through a 4 m arm, and B cut into two rectangles that continue each other
export function fixtureSeamCluster(a, b) {
  const d = fixtureCluster(a, b), OX = DISTRICT * a, OZ = DISTRICT * b, rect = (x0, x1, z0, z1) => ({ x0: OX + x0, x1: OX + x1, z0: OZ + z0, z1: OZ + z1 });
  d.rooms[0].rects.push(rect(63.5, 66, 50, 54));
  d.rooms[1].rects = [rect(64, 108, 20, 49.5), rect(66, 108, 49.5, 63.5)];
  return d;
}

// ---------- validation ----------

function copyRect(r) {
  if (!r || typeof r !== 'object') throw badPlan();
  for (const k of ['x0', 'x1', 'z0', 'z1']) if (typeof r[k] !== 'number') throw badPlan();
  return { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 };
}

function copyGrid(g) {
  if (!g || typeof g !== 'object') throw badPlan();
  for (const k of ['ox', 'oz', 'step']) if (typeof g[k] !== 'number') throw badPlan();
  return { ox: g.ox, oz: g.oz, step: g.step };
}

function copyRects(list) {
  if (!Array.isArray(list) || !list.length) throw badPlan();
  return Array.from(list, copyRect);
}

// the structure of a raw plan as fresh objects; geometry is checked on the copy
function copyPlan(raw, a, b) {
  if (!raw || typeof raw !== 'object' || raw.a !== a || raw.b !== b) throw badPlan();
  if (!Array.isArray(raw.rooms) || !raw.rooms.length || !Array.isArray(raw.links) || !raw.anchors || typeof raw.anchors !== 'object' || Array.isArray(raw.anchors)) throw badPlan();
  const rooms = Array.from(raw.rooms, (o, k) => {
    if (!o || typeof o !== 'object' || o.spaceId !== `v2:space:${a},${b}:r${k}` || typeof o.lv !== 'number' || typeof o.ceil !== 'number' || !ROLES.includes(o.role)) throw badPlan();
    return { spaceId: o.spaceId, lv: o.lv, rects: copyRects(o.rects), ceil: o.ceil, role: o.role, grid: copyGrid(o.grid) };
  });
  const ids = new Set(rooms.map((o) => o.spaceId));
  const links = Array.from(raw.links, (l, k) => {
    if (!l || typeof l !== 'object' || l.id !== `v2:dlink:${a},${b}:${k}` || l.kind !== 'passage' || !ids.has(l.from) || !ids.has(l.to) || l.from === l.to) throw badPlan();
    return { id: l.id, from: l.from, to: l.to, kind: l.kind, rects: copyRects(l.rects), grid: copyGrid(l.grid) };
  });
  const keys = [[2 * a, 2 * b], [2 * a + 1, 2 * b], [2 * a, 2 * b + 1], [2 * a + 1, 2 * b + 1]].map(([i, j]) => `${i},${j}`);
  const given = Object.keys(raw.anchors);
  if (given.length !== keys.length || !keys.every((k) => given.includes(k))) throw badPlan();
  const anchors = {};
  for (const k of keys) {
    const o = rooms.find((q) => q.spaceId === raw.anchors[k]);
    if (!o || o.role !== 'anchor') throw badPlan();
    anchors[k] = o.spaceId;
  }
  return { a, b, rooms, links, anchors };
}

// the rectangles of one list reach one connected piece, by shared edge (and, for a passage, by overlap)
function connected(rects, byOverlap) {
  const seen = new Set([0]), stack = [0];
  while (stack.length) {
    const p = rects[stack.pop()];
    rects.forEach((q, k) => { if (!seen.has(k) && (abuts(p, q) || (byOverlap && overlaps(p, q)))) { seen.add(k); stack.push(k); } });
  }
  return seen.size === rects.length;
}

function checkGeometry(d) {
  const OX = DISTRICT * d.a, OZ = DISTRICT * d.b, parts = [...d.rooms, ...d.links];
  for (const o of parts) {
    const g = o.grid;
    if (!onGrid(g.ox) || !onGrid(g.oz) || !onGrid(g.step) || g.step < GRID) throw badGeometry();
    for (const r of o.rects) {
      if (![r.x0, r.x1, r.z0, r.z1].every(onGrid) || r.x1 <= r.x0 || r.z1 <= r.z0) throw badGeometry();
      if (r.x0 < OX + EDGE_MIN || r.x1 > OX + DISTRICT - EDGE_MIN || r.z0 < OZ + EDGE_MIN || r.z1 > OZ + DISTRICT - EDGE_MIN) throw badGeometry();
    }
    o.rects.sort(byRect);
  }
  for (const o of d.rooms) if (o.lv !== 0 || !onGrid(o.ceil) || o.ceil < 2) throw badGeometry();
  const roomOf = new Map(d.rooms.map((o) => [o.spaceId, o]));
  // rooms: no overlap inside or between them; one edge-connected union each
  d.rooms.forEach((o, k) => {
    if (!connected(o.rects, false)) throw badGeometry();
    for (const p of o.rects) {
      if (o.rects.some((q) => q !== p && overlaps(p, q))) throw badGeometry();
      if (d.rooms.some((m, n) => n > k && m.rects.some((q) => overlaps(p, q)))) throw badGeometry();
    }
  });
  // passages: one connected union each, overlapping only their own two rooms and no other passage, and reaching both
  d.links.forEach((l, k) => {
    if (!connected(l.rects, true)) throw badGeometry();
    for (const p of l.rects) {
      for (const m of d.rooms) if (m.spaceId !== l.from && m.spaceId !== l.to && m.rects.some((q) => overlaps(p, q))) throw badGeometry();
      if (d.links.some((m, n) => n > k && m.rects.some((q) => overlaps(p, q)))) throw badGeometry();
    }
    for (const end of [l.from, l.to]) if (!l.rects.some((p) => roomOf.get(end).rects.some((q) => overlaps(p, q)))) throw badGeometry();
  });
  // the rooms are one piece through the passages
  const reached = new Set([d.rooms[0].spaceId]);
  for (let grew = true; grew;) {
    grew = false;
    for (const l of d.links) if (reached.has(l.from) !== reached.has(l.to)) { reached.add(l.from); reached.add(l.to); grew = true; }
  }
  if (reached.size !== d.rooms.length) throw badGeometry();
}

// every cell's anchor holds its two middle bands and stands 12–24 m from the district boundary on its two outward faces; the cut also
// fails here on a face with two separate continuations
function checkAnchors(d) {
  const OX = DISTRICT * d.a, OZ = DISTRICT * d.b;
  [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([ci, cj], n) => {
    const i = 2 * d.a + ci, j = 2 * d.b + cj, hall = cutCell(d, i, j).fragments[0].rect;
    if (hall.x0 > CELL * i + BAND[0] || hall.x1 < CELL * i + BAND[1] || hall.z0 > CELL * j + BAND[0] || hall.z1 < CELL * j + BAND[1]) throw badGeometry();
    const gap = { px: OX + DISTRICT - hall.x1, nx: hall.x0 - OX, pz: OZ + DISTRICT - hall.z1, nz: hall.z0 - OZ };
    if (OUTWARD[n].some((f) => gap[f] < EDGE_MIN || gap[f] > EDGE_MAX)) throw badGeometry();
  });
}

// a frozen copy of a source plan, with each rectangle list in canonical order; throws for anything that is not a plan
export function validateDistrictPlan(raw, a, b) {
  if (!isIndex(a) || !isIndex(b)) throw badPlan();
  const d = copyPlan(raw, a, b);
  checkGeometry(d);
  checkAnchors(d);
  deepFreeze(d);
  checked.add(d);
  return d;
}

// ---------- cutting ----------

// the part of a rectangle inside cell (i, j) (half-open: a cell owns its low edges), or null
export function clipDistrictRect(rect, i, j) {
  if (!isIndex(i) || !isIndex(j)) throw badPlan();
  const ox = i * CELL, oz = j * CELL;
  const cut = { x0: Math.max(rect.x0, ox), x1: Math.min(rect.x1, ox + CELL), z0: Math.max(rect.z0, oz), z1: Math.min(rect.z1, oz + CELL) };
  return cut.x1 <= cut.x0 || cut.z1 <= cut.z0 ? null : cut;
}

// where a source reaches on past one face of a fragment: false, or the one { lo, hi } stretch of the face it continues over
function seamOf(face, f, rects) {
  const X = face === 'px' || face === 'nx', at = { px: f.x1, nx: f.x0, pz: f.z1, nz: f.z0 }[face], [t0, t1] = X ? [f.z0, f.z1] : [f.x0, f.x1];
  const spans = [];
  for (const r of rects) {
    const [a0, a1, c0, c1] = X ? [r.x0, r.x1, r.z0, r.z1] : [r.z0, r.z1, r.x0, r.x1];
    const beyond = face === 'px' || face === 'pz' ? a0 <= at && a1 > at : a0 < at && a1 >= at;
    const lo = Math.max(t0, c0), hi = Math.min(t1, c1);
    if (beyond && hi > lo) spans.push({ lo, hi });
  }
  spans.sort((p, q) => p.lo - q.lo || p.hi - q.hi);
  const merged = [];
  for (const s of spans) {
    if (merged.length && s.lo <= merged[merged.length - 1].hi) merged[merged.length - 1].hi = Math.max(merged[merged.length - 1].hi, s.hi);
    else merged.push({ ...s });
  }
  if (merged.length > 1) throw badGeometry();
  return merged[0] ?? false;
}

// every fragment of cell (i, j): the cell's anchor piece first, then the other room pieces, then the passage pieces
function cutCell(d, i, j) {
  const pieces = [];
  d.rooms.forEach((o) => o.rects.forEach((q, rectIndex) => {
    const rect = clipDistrictRect(q, i, j);
    if (rect) pieces.push({ sourceType: 'room', sourceId: o.spaceId, rectIndex, rect, lv: o.lv, kind: 'hall', ceil: o.ceil, role: o.role, src: o });
  }));
  let primary = null;
  for (const p of pieces) {
    if (p.sourceId !== d.anchors[`${i},${j}`]) continue;
    const better = !primary || area(p.rect) > area(primary.rect) || (area(p.rect) === area(primary.rect) && byRect(p.rect, primary.rect) < 0);
    if (better) primary = p;
  }
  if (!primary) throw badGeometry();
  const roomOf = (id) => d.rooms.find((o) => o.spaceId === id);
  const links = [];
  d.links.forEach((l) => l.rects.forEach((q, rectIndex) => {
    const rect = clipDistrictRect(q, i, j);
    if (rect) links.push({ sourceType: 'link', sourceId: l.id, rectIndex, rect, lv: 0, kind: 'corridor', ceil: Math.min(3, roomOf(l.from).ceil, roomOf(l.to).ceil), src: l });
  }));
  const fragments = [primary, ...pieces.filter((p) => p !== primary), ...links].map((p) => {
    const f = { sourceType: p.sourceType, sourceId: p.sourceId, rectIndex: p.rectIndex, rect: { ...p.rect }, lv: p.lv, kind: p.kind, ceil: p.ceil };
    if (p.role) f.role = p.role;
    f.seams = Object.fromEntries(FACE_KEYS.map((face) => [face, seamOf(face, p.rect, p.src.rects)]));
    f.grid = { ...p.src.grid };
    return f;
  });
  return { fragments, primaryFragmentIndex: 0 };
}

// a validated district's fragments in cell (i, j), frozen: { fragments: [{ sourceType, sourceId, rectIndex, rect, lv, kind, ceil, role,
// seams, grid }], primaryFragmentIndex }
export function cutDistrictCell(district, i, j) {
  if (!checked.has(district) || !isIndex(i) || !isIndex(j)) throw badPlan();
  if (Math.floor(i / 2) !== district.a || Math.floor(j / 2) !== district.b) throw new RangeError('Cell outside district');
  return deepFreeze(cutCell(district, i, j));
}

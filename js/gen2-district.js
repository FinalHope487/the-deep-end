// v2 district planning core: pure geometry for a 128 × 128 m district of 2 × 2 cells (no world, no random draws, no imports of gen2.js).
// A district is a set of rooms (unions of Q2-grid rectangles on 1F) and passages between them. validateDistrictPlan accepts a source
// plan and returns a frozen copy; cutDistrictCell cuts it into the fragments one 64 m cell holds. Walls are implicit: floor exists in
// the union of same-level rectangles, so touching rectangles of one source have no wall between them (their shared face is a seam).

import { hash2, mulberry32 } from './rng.js';

const CELL = 64;
const GRID = 0.5;
const DISTRICT = 128;
const EDGE_MIN = 12, EDGE_MAX = 24;   // an anchor's four outward faces stand 12–24 m from the district boundary; nothing but anchors reaches closer
const BAND = [24, 40];                // every anchor holds this much of its cell's middle both ways, where legacy corridors cross
const ROLES = ['anchor', 'room', 'small', 'medium', 'main', 'giant'];
const ANCHOR_ROLES = ['anchor', 'main', 'giant'];
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

// ---------- production builder ----------

// every cell holds one anchor (E, S and, in a four-room cell, T satellites beside it), all on the canonical NW cell and reflected into the other three
const CEILINGS = { small: [3, 3.5, 4], medium: [3.5, 4, 4.5], main: [4, 4.5, 5], giant: [4.5, 5, 5.5] };
const ANCHOR_BOX = { main: [16, 48, 16, 48], giant: [12, 48, 12, 48] };   // [x0, x1, z0, z1] in the NW cell
const SATELLITE_BOX = {
  E: { small: [48.5, 61.5, 27, 37], medium: [48.5, 63.5, 24.5, 39] },
  S: { small: [27, 37, 48.5, 61.5], medium: [24.5, 39, 48.5, 63.5] },
  T: { small: [48.5, 61.5, 41, 51], medium: [48.5, 63.5, 40, 54.5] },
};
const LOCAL_PASSAGE = { E: [47.5, 49, 30.5, 33.5], S: [30.5, 33.5, 47.5, 49], T: [47.5, 49, 44.5, 47.5] };   // 0.5 m into the anchor, over its 0.5 m wall, 0.5 m into the satellite
const CELL_FLIPS = [[false, false], [true, false], [false, true], [true, true]];   // NW, NE, SW, SE: reflect x, reflect z

const badCeilingRange = () => new RangeError('Invalid district ceiling range');

function boundsOfSourceRoom(room) {
  return {
    x0: Math.min(...room.rects.map((q) => q.x0)),
    x1: Math.max(...room.rects.map((q) => q.x1)),
    z0: Math.min(...room.rects.map((q) => q.z0)),
    z1: Math.max(...room.rects.map((q) => q.z1)),
  };
}

// an L-shaped satellite: its box minus a 3 x 3 m corner, as two rectangles (E and T lose the far low-z corner, S the far high-z, low-x one)
function lRects([x0, x1, z0, z1], slot) {
  return slot === 'S'
    ? [{ x0, x1, z0, z1: z1 - 3 }, { x0: x0 + 3, x1, z0: z1 - 3, z1 }]
    : [{ x0, x1: x1 - 3, z0, z1 }, { x0: x1 - 3, x1, z0: z0 + 3, z1 }];
}

// the production district: four cells of 3–4 rooms each from one 46-draw stream (2 for the giant, 11 per cell, absent satellites included)
export function buildClusterDistrict(seed, a, b, Y) {
  if (!isIndex(a) || !isIndex(b)) throw badPlan();
  if (!Y || typeof Y !== 'object' || !Number.isFinite(Y[1])) throw badCeilingRange();
  const cap = Y[1] - 1.5, eligible = {};
  for (const [role, list] of Object.entries(CEILINGS)) {
    eligible[role] = list.filter((h) => h <= cap);
    if (!eligible[role].length) throw badCeilingRange();
  }
  const r = mulberry32(hash2(seed >>> 0, a, b, 7710));
  const OX = DISTRICT * a, OZ = DISTRICT * b;
  const pick = (role) => eligible[role][Math.floor(r() * eligible[role].length)];
  const flip = (lo, hi, f) => (f ? [DISTRICT - hi, DISTRICT - lo] : [lo, hi]);
  const place = ([x0, x1, z0, z1], [fx, fz]) => {
    const [X0, X1] = flip(x0, x1, fx), [Z0, Z1] = flip(z0, z1, fz);
    return { x0: OX + X0, x1: OX + X1, z0: OZ + Z0, z1: OZ + Z1 };
  };
  const giant = r() < 0.125, giantCell = Math.floor(r() * 4);
  const rooms = [], links = [], anchors = {};
  const roomBySlot = { NW: { anchor: null, E: null, S: null, T: null }, NE: { anchor: null, E: null, S: null, T: null }, SW: { anchor: null, E: null, S: null, T: null }, SE: { anchor: null, E: null, S: null, T: null } };
  const names = ['NW', 'NE', 'SW', 'SE'];
  const grid = (rects) => ({ ox: Math.min(...rects.map((q) => q.x0)), oz: Math.min(...rects.map((q) => q.z0)), step: 6 });
  const addRoom = (rects, ceil, role) => {
    const room = { spaceId: `v2:space:${a},${b}:r${rooms.length}`, lv: 0, rects, ceil, role, grid: grid(rects) };
    rooms.push(room);
    return room;
  };
  const addLink = (from, to, rect) => links.push({ id: `v2:dlink:${a},${b}:${links.length}`, from: from.spaceId, to: to.spaceId, kind: 'passage', rects: [rect], grid: { ox: rect.x0, oz: rect.z0, step: 6 } });

  const kept = CELL_FLIPS.map((flips, n) => {
    const count = r() < 0.5 ? 3 : 4;
    const aRole = giant && giantCell === n ? 'giant' : 'main';
    const aCeil = pick(aRole);
    const satellite = () => { const role = r() < 0.6 ? 'small' : 'medium', L = r() < 0.25; return { role, L, ceil: pick(role) }; };
    return { n, flips, count, aRole, aCeil, E: satellite(), S: satellite(), T: satellite() };
  });

  for (const cell of kept) {
    const slots = roomBySlot[names[cell.n]], at = (box) => place(box, cell.flips);
    slots.anchor = addRoom([at(ANCHOR_BOX[cell.aRole])], cell.aCeil, cell.aRole);
    anchors[`${2 * a + (cell.flips[0] ? 1 : 0)},${2 * b + (cell.flips[1] ? 1 : 0)}`] = slots.anchor.spaceId;
    for (const slot of ['E', 'S', 'T']) {
      if (slot === 'T' && cell.count !== 4) continue;
      const s = cell[slot], box = SATELLITE_BOX[slot][s.role];
      slots[slot] = addRoom(s.L ? lRects(box, slot).map((q) => at([q.x0, q.x1, q.z0, q.z1])) : [at(box)], s.ceil, s.role);
    }
  }
  for (const cell of kept) {
    const slots = roomBySlot[names[cell.n]];
    for (const slot of ['E', 'S', 'T']) if (slots[slot]) addLink(slots.anchor, slots[slot], place(LOCAL_PASSAGE[slot], cell.flips));
  }
  const NW_E = boundsOfSourceRoom(roomBySlot.NW.E), NE_E = boundsOfSourceRoom(roomBySlot.NE.E);
  const NW_S = boundsOfSourceRoom(roomBySlot.NW.S), SW_S = boundsOfSourceRoom(roomBySlot.SW.S);
  const NE_S = boundsOfSourceRoom(roomBySlot.NE.S), SE_S = boundsOfSourceRoom(roomBySlot.SE.S);
  addLink(roomBySlot.NW.E, roomBySlot.NE.E, { x0: NW_E.x1 - 0.5, x1: NE_E.x0 + 0.5, z0: OZ + 30.5, z1: OZ + 33.5 });
  addLink(roomBySlot.NW.S, roomBySlot.SW.S, { x0: OX + 30.5, x1: OX + 33.5, z0: NW_S.z1 - 0.5, z1: SW_S.z0 + 0.5 });
  addLink(roomBySlot.NE.S, roomBySlot.SE.S, { x0: OX + 94.5, x1: OX + 97.5, z0: NE_S.z1 - 0.5, z1: SE_S.z0 + 0.5 });
  return validateDistrictPlan({ a, b, rooms, links, anchors }, a, b);
}

// ---------- cluster topology ----------

// Which source rooms of a cluster district touch which: a pure graph on the room descriptors, drawn before any link geometry exists.
// Every cell keeps anchor–E and anchor–S; the four perimeter edges AB, AC, BD, CD join satellites of neighbouring cells; T rooms (three-
// satellite cells only) hang off their anchor, their E, or both. One of five groups, picked by the first of two 8810 draws, sets which of
// those optional edges exist; the second draw names the perimeter edge the first four groups drop.
const SPEC_KEYS = ['spaceId', 'cell', 'slot', 'role', 'shape'];
const SPEC_SLOTS = ['anchor', 'E', 'S', 'T'];
const TOPOLOGY_GROUPS = [[0.25, 'tight-cluster'], [0.5, 'main-and-side'], [0.7, 'ring'], [0.85, 'nested'], [Infinity, 'gallery-grid']];
const PERIMETER_EDGES = [[[0, 'E'], [1, 'E']], [[0, 'S'], [2, 'S']], [[1, 'S'], [3, 'S']], [[2, 'E'], [3, 'E']]];   // AB, AC, BD, CD by cell and slot
const badTopology = () => new TypeError('Invalid cluster topology');
const dataValue = (o, key) => { const d = Object.getOwnPropertyDescriptor(o, key); if (!d || !('value' in d)) throw badTopology(); return d.value; };

// the descriptor array of one district, copied out of the caller's objects (no accessor runs, nothing is kept by reference)
function readRoomSpec(a, b, roomSpec) {
  if (!Array.isArray(roomSpec)) throw badTopology();
  const n = roomSpec.length;
  if (n < 12 || n > 16) throw badTopology();
  const keys = Reflect.ownKeys(roomSpec);
  if (keys.length !== n + 1 || keys[n] !== 'length' || keys.some((k, i) => i < n && k !== String(i))) throw badTopology();
  const list = [];
  for (let k = 0; k < n; k++) {
    const rec = dataValue(roomSpec, String(k));
    if (!isPlain(rec)) throw badTopology();
    const own = Reflect.ownKeys(rec);
    if (own.length !== SPEC_KEYS.length || SPEC_KEYS.some((key) => !own.includes(key))) throw badTopology();
    const r = {};
    for (const key of SPEC_KEYS) r[key] = dataValue(rec, key);
    if (r.spaceId !== `v2:space:${a},${b}:r${k}`) throw badTopology();
    list.push(r);
  }
  let k = 0, giants = 0;
  for (let cell = 0; cell < 4; cell++) {
    const start = k;
    for (const slot of SPEC_SLOTS) {
      if (k >= n || list[k].cell !== cell || list[k].slot !== slot) {
        if (slot === 'T') break;
        throw badTopology();
      }
      const r = list[k++];
      const anchor = slot === 'anchor';
      if (anchor ? r.role !== 'main' && r.role !== 'giant' : r.role !== 'small' && r.role !== 'medium') throw badTopology();
      if (anchor ? r.shape !== 'rect' : r.shape !== 'rect' && r.shape !== 'L') throw badTopology();
      if (r.role === 'giant') giants++;
    }
    if (k - start < 3 || k - start > 4) throw badTopology();
  }
  if (k !== n || giants > 1) throw badTopology();
  return list;
}

export function buildClusterTopology(seed, a, b, roomSpec) {
  if (!isIndex(seed) || !isIndex(a) || !isIndex(b)) throw badTopology();
  const list = readRoomSpec(a, b, roomSpec);
  const r = mulberry32(hash2(seed >>> 0, a, b, 8810));
  const typeDraw = r(), perimeterDraw = r();
  const groupType = TOPOLOGY_GROUPS.find(([below]) => typeDraw < below)[1];
  const omitted = Math.floor(perimeterDraw * 4);
  const at = new Map(list.map((room, k) => [`${room.cell}${room.slot}`, k]));
  const pairs = [];
  const link = (p, q) => pairs.push([Math.min(p, q), Math.max(p, q)]);
  for (let cell = 0; cell < 4; cell++) { link(at.get(`${cell}anchor`), at.get(`${cell}E`)); link(at.get(`${cell}anchor`), at.get(`${cell}S`)); }
  const keepsAll = groupType === 'ring' || groupType === 'gallery-grid';
  PERIMETER_EDGES.forEach(([[c0, s0], [c1, s1]], i) => { if (keepsAll || i !== omitted) link(at.get(`${c0}${s0}`), at.get(`${c1}${s1}`)); });
  for (let cell = 0; cell < 4; cell++) {
    if (!at.has(`${cell}T`)) continue;
    if (groupType !== 'nested') link(at.get(`${cell}anchor`), at.get(`${cell}T`));
    if (groupType !== 'main-and-side' && groupType !== 'ring') link(at.get(`${cell}E`), at.get(`${cell}T`));
  }
  if (groupType === 'gallery-grid') {
    if (at.has('0T') && at.has('1T')) link(at.get('0T'), at.get('1T'));
    if (at.has('2T') && at.has('3T')) link(at.get('2T'), at.get('3T'));
  }
  pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  return deepFreeze({
    groupType,
    roomIds: list.map((room) => room.spaceId),
    edges: pairs.map(([p, q]) => ({ from: list[p].spaceId, to: list[q].spaceId })),
    exterior: OUTWARD.map((faces, cell) => ({ cell, anchor: list[at.get(`${cell}anchor`)].spaceId, faces: [...faces] })),
  });
}

// ---------- shared openings ----------

// Two physical rooms of one district can face each other over a 0 or 0.5 m wall. A shared opening is the source link between them:
// one bridge rectangle per aperture, each reaching 0.5 m into both rooms (floor stays implicit, the wall is cut by the bridge's floor).
// Styles: open (0 m wall, the whole contact), doorway (one door), row (2–5 doors with 1 m piers). Pure: the five draws come from the
// district and link, never from a cell stream.
const OPENING_STYLES = ['open', 'doorway', 'row'];
const DOOR_WIDTHS = [1.5, 2, 2.5, 3, 4], DOOR_HEIGHTS = [2, 2.5, 3];
const MIN_SPAN = { open: 1.5, doorway: 3, row: 8 };
const SLOPE_KEYS = ['axis', 'a0', 'a1', 'b0', 'b1', 'd'];
const badOpening = () => new TypeError('Invalid shared opening');
const boxXZ = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });
const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o) && [Object.prototype, null].includes(Object.getPrototypeOf(o));
const cloneOpening = (o) => ({ ...o, apertures: o.apertures.map((p) => ({ ...p })) });

// the bridge over one aperture, and the two 0.5 m strips of it that must lie on the endpoint rooms
const bridgeRect = (axis, c0, c1, { lo, hi }) => (axis === 'x' ? boxXZ(c0 - 0.5, c1 + 0.5, lo, hi) : boxXZ(lo, hi, c0 - 0.5, c1 + 0.5));
const strips = (axis, c0, c1, { lo, hi }) => (axis === 'x' ? [boxXZ(c0 - 0.5, c0, lo, hi), boxXZ(c1, c1 + 0.5, lo, hi)] : [boxXZ(lo, hi, c0 - 0.5, c0), boxXZ(lo, hi, c1, c1 + 0.5)]);

// false for no slope (absent, undefined, null); true for a well-formed one; fail() for anything else
function slopeIsSet(s, fail) {
  if (s === undefined || s === null) return false;
  if (!isPlain(s)) throw fail();
  const keys = Object.keys(s);
  if (keys.length !== SLOPE_KEYS.length || !SLOPE_KEYS.every((k) => keys.includes(k))) throw fail();
  if ((s.axis !== 'x' && s.axis !== 'z') || ![s.a0, s.a1, s.b0, s.b1].every(onGrid) || !(s.a0 < s.a1 && s.a1 <= s.b0 && s.b0 < s.b1) || !Number.isFinite(s.d)) throw fail();
  return true;
}

// the structure of one endpoint room of buildSharedOpening: its source index, copied rectangles, ceiling, level and slope flag
function openingRoom(room, a, b) {
  if (!room || typeof room !== 'object') throw badOpening();
  const m = typeof room.spaceId === 'string' ? new RegExp(`^v2:space:${a},${b}:r(0|[1-9]\\d*)$`).exec(room.spaceId) : null;
  const index = m ? Number(m[1]) : NaN;
  if (!Number.isSafeInteger(index) || !Array.isArray(room.rects) || !room.rects.length) throw badOpening();
  const OX = DISTRICT * a, OZ = DISTRICT * b;
  const rects = Array.from(room.rects, (r) => {
    if (!r || typeof r !== 'object' || ![r.x0, r.x1, r.z0, r.z1].every(onGrid) || r.x1 <= r.x0 || r.z1 <= r.z0 || r.x0 < OX || r.x1 > OX + DISTRICT || r.z0 < OZ || r.z1 > OZ + DISTRICT) throw badOpening();
    return boxXZ(r.x0, r.x1, r.z0, r.z1);
  });
  const g = room.grid;
  if (!ROLES.includes(room.role) || !onGrid(room.ceil) || room.ceil < 2 || !g || typeof g !== 'object' || !onGrid(g.ox) || !onGrid(g.oz) || !onGrid(g.step) || g.step < GRID) throw badOpening();
  if (typeof room.lv !== 'number' || !Number.isInteger(room.lv) || room.lv < -1 || room.lv > 1) throw badOpening();
  return { id: room.spaceId, index, rects, ceil: room.ceil, lv: room.lv, sloped: slopeIsSet(room.slope, badOpening) };
}

// the stretches of `base` that no stretch of `cover` reaches (stretches are { lo, hi })
function minusStretches(base, cover) {
  let out = base;
  for (const c of cover) {
    out = out.flatMap((s) => {
      if (c.hi <= s.lo || c.lo >= s.hi) return [s];
      const parts = [];
      if (c.lo > s.lo) parts.push({ lo: s.lo, hi: c.lo });
      if (c.hi < s.hi) parts.push({ lo: c.hi, hi: s.hi });
      return parts;
    });
  }
  return out;
}

// where rectangle f of a source faces outward along an axis (high side when up): its stretch of that face minus what the source's other
// rectangles continue over, as the coordinate of the face and its exposed stretches (the same beyond rule as seamOf)
function exposedFace(rects, f, axis, up) {
  const X = axis === 'x', [n0, n1, t0, t1] = X ? [f.x0, f.x1, f.z0, f.z1] : [f.z0, f.z1, f.x0, f.x1];
  const at = up ? n1 : n0, cover = [];
  for (const r of rects) {
    if (r === f) continue;
    const [a0, a1, c0, c1] = X ? [r.x0, r.x1, r.z0, r.z1] : [r.z0, r.z1, r.x0, r.x1];
    const beyond = up ? a0 <= at && a1 > at : a0 < at && a1 >= at;
    if (beyond && Math.min(t1, c1) > Math.max(t0, c0)) cover.push({ lo: Math.max(t0, c0), hi: Math.min(t1, c1) });
  }
  return { at, stretches: minusStretches([{ lo: t0, hi: t1 }], cover) };
}

// every contact of two sources as { axis, c0, c1, s0, s1, low, high }: the lower source's face at c0 and the higher source's at c1 (0 or
// 0.5 m apart) share the stretch [s0, s1] that neither source continues over. Touching stretches of one face pair and direction merge. Longest first,
// then axis x before z, then ascending c0, c1, s0, s1. `low` and `high` are the two sources' rectangle lists
function openingContacts(P, Q) {
  const groups = new Map();
  for (const [low, high] of [[P, Q], [Q, P]]) for (const axis of ['x', 'z']) for (const f of low) for (const g of high) {
    const lf = exposedFace(low, f, axis, true), hf = exposedFace(high, g, axis, false), gap = hf.at - lf.at;
    if (gap !== 0 && gap !== 0.5) continue;
    for (const p of lf.stretches) for (const q of hf.stretches) {
      const lo = Math.max(p.lo, q.lo), hi = Math.min(p.hi, q.hi);
      if (hi <= lo) continue;
      const key = `${axis}|${lf.at}|${hf.at}|${low === P ? 0 : 1}`;
      if (!groups.has(key)) groups.set(key, { axis, c0: lf.at, c1: hf.at, low, high, spans: [] });
      groups.get(key).spans.push({ lo, hi });
    }
  }
  const found = [];
  for (const g of groups.values()) {
    const merged = [];
    for (const s of g.spans.sort((p, q) => p.lo - q.lo || p.hi - q.hi)) {
      if (merged.length && s.lo <= merged.at(-1).hi) merged.at(-1).hi = Math.max(merged.at(-1).hi, s.hi);
      else merged.push({ ...s });
    }
    for (const s of merged) found.push({ axis: g.axis, c0: g.c0, c1: g.c1, s0: s.lo, s1: s.hi, low: g.low, high: g.high });
  }
  return found.sort((p, q) => (q.s1 - q.s0) - (p.s1 - p.s0) || (p.axis === q.axis ? 0 : p.axis === 'x' ? -1 : 1) || p.c0 - q.c0 || p.c1 - q.c1 || p.s0 - q.s0 || p.s1 - q.s1);
}

// does the union of `rects` hold all of rectangle r? (Q2 cells, each tested at its centre)
function holds(rects, r) {
  for (let x = r.x0 + 0.25; x < r.x1; x += 0.5) for (let z = r.z0 + 0.25; z < r.z1; z += 0.5) if (!rects.some((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1)) return false;
  return true;
}

// the style, height and apertures one contact gives under the five draws d (or null when this contact cannot carry the style)
function shapeOpening(c, want, d, floor) {
  const gap = c.c1 - c.c0, span = c.s1 - c.s0;
  const style = want !== 'auto' ? want : gap === 0 ? 'open' : d[0] < 0.35 && span >= 8 ? 'row' : 'doorway';
  if ((style === 'open') !== (gap === 0) || span < MIN_SPAN[style]) return null;
  let height = floor, apertures = [{ lo: c.s0, hi: c.s1 }];
  if (style !== 'open') {
    height = Math.min(DOOR_HEIGHTS[Math.floor(d[2] * 3)], floor);
    let occupied, w, n;
    if (style === 'doorway') {
      const allowed = DOOR_WIDTHS.filter((v) => v <= span - 1);
      if (!allowed.length) return null;
      w = Math.min(DOOR_WIDTHS[Math.floor(d[1] * 5)], Math.max(...allowed));
      occupied = w;
    } else {
      n = Math.min(5, Math.floor(span / 3.5));
      if (n < 2) return null;
      occupied = n * 2.5 + (n - 1);
    }
    const min = c.s0 + 0.5, N = Math.floor((c.s1 - 0.5 - occupied - min) / 0.5) + 1;
    if (N < 1) return null;
    const start = min + 0.5 * Math.floor(d[3] * N);
    apertures = style === 'doorway' ? [{ lo: start, hi: start + w }] : Array.from({ length: n }, (_, q) => ({ lo: start + 3.5 * q, hi: start + 3.5 * q + 2.5 }));
  }
  if (height < 2) return null;
  for (const p of apertures) {
    const [onLow, onHigh] = strips(c.axis, c.c0, c.c1, p);
    if (!holds(c.low, onLow) || !holds(c.high, onHigh)) return null;
  }
  return { style, height, apertures };
}

// the shared-opening source link between two physical rooms of district (a, b), or null when they cannot carry one. Throws for a
// malformed argument; a valid level -1 or 1 or a valid slope is unsupported (null). Draws five numbers whatever the outcome
export function buildSharedOpening(seed, a, b, k, fromRoom, toRoom, style = 'auto') {
  if (![seed, a, b, k].every(isIndex) || k < 0 || (style !== 'auto' && !OPENING_STYLES.includes(style))) throw badOpening();
  const P = openingRoom(fromRoom, a, b), Q = openingRoom(toRoom, a, b);
  if (P.index === Q.index) throw badOpening();
  const r = mulberry32(hash2(hash2(seed >>> 0, a, b, 8800), k, Math.floor(k / 0x100000000), 8801));
  const d = [r(), r(), r(), r(), r()];   // style, width, height, offset, reserved
  if (P.lv !== 0 || Q.lv !== 0 || P.sloped || Q.sloped) return null;
  const [first, second] = P.index < Q.index ? [P, Q] : [Q, P], floor = Math.min(P.ceil, Q.ceil);
  for (const c of openingContacts(first.rects, second.rects)) {
    const shape = shapeOpening(c, style, d, floor);
    if (!shape) continue;
    const rects = shape.apertures.map((p) => bridgeRect(c.axis, c.c0, c.c1, p)).sort(byRect);
    return {
      id: `v2:dlink:${a},${b}:${k}`, from: first.id, to: second.id, kind: 'shared-opening', rects, grid: { ox: rects[0].x0, oz: rects[0].z0, step: 6 },
      opening: { style: shape.style, lv: 0, axis: c.axis, c0: c.c0, c1: c.c1, s0: c.s0, s1: c.s1, height: shape.height, apertures: shape.apertures },
    };
  }
  return null;
}

// the structure of an authored opening (types only; values are checked by checkOpening)
function copyOpening(o) {
  if (!o || typeof o !== 'object' || !OPENING_STYLES.includes(o.style) || (o.axis !== 'x' && o.axis !== 'z') || typeof o.lv !== 'number') throw badPlan();
  for (const k of ['c0', 'c1', 's0', 's1', 'height']) if (typeof o[k] !== 'number') throw badPlan();
  if (!Array.isArray(o.apertures) || !o.apertures.length) throw badPlan();
  const apertures = Array.from(o.apertures, (p) => {
    if (!p || typeof p !== 'object' || typeof p.lo !== 'number' || typeof p.hi !== 'number') throw badPlan();
    return { lo: p.lo, hi: p.hi };
  });
  return { style: o.style, lv: o.lv, axis: o.axis, c0: o.c0, c1: o.c1, s0: o.s0, s1: o.s1, height: o.height, apertures };
}

// the geometry of one authored shared opening against its two endpoint rooms (the third-room and other-link contacts are checked beside it)
function checkOpening(l, roomOf) {
  const o = l.opening, { axis, c0, c1, s0, s1, height, apertures } = o, count = apertures.length;
  if (o.lv !== 0 || ![c0, c1, s0, s1, height].every(onGrid) || !apertures.every((p) => onGrid(p.lo) && onGrid(p.hi))) throw badGeometry();
  const gap = c1 - c0, span = s1 - s0, from = roomOf.get(l.from), to = roomOf.get(l.to);
  if ((gap !== 0 && gap !== 0.5) || (o.style === 'open') !== (gap === 0) || span < MIN_SPAN[o.style]) throw badGeometry();
  const floor = Math.min(from.ceil, to.ceil);
  if (height < 2 || height > floor || (o.style === 'open' && height !== floor)) throw badGeometry();
  apertures.forEach((p, q) => { if (!(s0 <= p.lo && p.lo < p.hi && p.hi <= s1) || (q && p.lo < apertures[q - 1].hi)) throw badGeometry(); });
  const first = apertures[0], last = apertures[count - 1];
  if (o.style === 'open') {
    if (count !== 1 || first.lo !== s0 || first.hi !== s1) throw badGeometry();
  } else {
    if (first.lo - s0 < 0.5 || s1 - last.hi < 0.5) throw badGeometry();
    if (o.style === 'doorway') {
      if (count !== 1 || !DOOR_WIDTHS.includes(first.hi - first.lo) || first.hi - first.lo > span - 1) throw badGeometry();
    } else if (count < 2 || count !== Math.min(5, Math.floor(span / 3.5)) || apertures.some((p, q) => p.hi - p.lo !== 2.5 || (q && p.lo - apertures[q - 1].hi !== 1))) throw badGeometry();
  }
  const bridges = apertures.map((p) => bridgeRect(axis, c0, c1, p)).sort(byRect);
  if (l.rects.length !== bridges.length || bridges.some((r, q) => byRect(r, l.rects[q]) !== 0)) throw badGeometry();
  if (l.grid.step !== 6 || l.grid.ox !== l.rects[0].x0 || l.grid.oz !== l.rects[0].z0) throw badGeometry();
  // the faces really meet over [s0, s1], and each bridge reaches 0.5 m into both rooms
  const contact = openingContacts(from.rects, to.rects).find((c) => c.axis === axis && c.c0 === c0 && c.c1 === c1 && (o.style === 'open' ? c.s0 === s0 && c.s1 === s1 : c.s0 <= s0 && c.s1 >= s1));
  if (!contact) throw badGeometry();
  for (const p of apertures) {
    const [onLow, onHigh] = strips(axis, c0, c1, p);
    if (!holds(contact.low, onLow) || !holds(contact.high, onHigh)) throw badGeometry();
  }
}

// the 3 m mouths a validated district keeps clear in front of its shared openings: per aperture one on each side of the wall, in the
// endpoint room that owns that side (found from geometry, not from from/to) and clipped to that room's rectangles. Not cut to a cell
export function openingMouths(district) {
  const roomOf = new Map(district.rooms.map((o) => [o.spaceId, o])), out = [];
  for (const l of district.links) {
    if (!l.opening) continue;
    const { axis, c0, c1, apertures } = l.opening, ends = [roomOf.get(l.from), roomOf.get(l.to)];
    for (const { lo, hi } of apertures) for (const [n0, n1, probe] of [[c0 - 3, c0, c0 - 0.25], [c1, c1 + 3, c1 + 0.25]]) {
      const box = axis === 'x' ? boxXZ(n0, n1, lo, hi) : boxXZ(lo, hi, n0, n1);
      const [x, z] = axis === 'x' ? [probe, (lo + hi) / 2] : [(lo + hi) / 2, probe];
      const owner = ends.find((o) => o.rects.some((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1));
      if (!owner) continue;
      for (const q of owner.rects) {
        const piece = boxXZ(Math.max(box.x0, q.x0), Math.min(box.x1, q.x1), Math.max(box.z0, q.z0), Math.min(box.z1, q.z1));
        if (piece.x1 > piece.x0 && piece.z1 > piece.z0) out.push(piece);
      }
    }
  }
  return out;
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

// fixtureCluster with its four passages replaced, in place, by the shared openings the builder gives them under seed 42 (A–B, C–D, A–C,
// B–D). widen: A and C reach the cell edge (x 64), so A–B and C–D touch with no wall between
function fixtureOpenings(a, b, styles, widen) {
  const d = fixtureCluster(a, b);
  if (widen) for (const k of [0, 2]) d.rooms[k].rects[0].x1 = DISTRICT * a + 64;
  d.links = [[0, 1], [2, 3], [0, 2], [1, 3]].map(([from, to], k) => {
    const link = buildSharedOpening(42, a, b, k, d.rooms[from], d.rooms[to], styles[k]);
    if (!link) throw badGeometry();
    return link;
  });
  return d;
}

// four rooms joined by two doorways and two door rows
export function fixtureOpeningCluster(a, b) {
  return fixtureOpenings(a, b, ['doorway', 'row', 'doorway', 'row'], false);
}

// the same rooms with A–B and C–D open boundaries and A–C and B–D doorways
export function fixtureOpenBoundaryCluster(a, b) {
  return fixtureOpenings(a, b, ['open', 'open', 'doorway', 'doorway'], true);
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
    if (!l || typeof l !== 'object' || l.id !== `v2:dlink:${a},${b}:${k}` || (l.kind !== 'passage' && l.kind !== 'shared-opening') || !ids.has(l.from) || !ids.has(l.to) || l.from === l.to) throw badPlan();
    const link = { id: l.id, from: l.from, to: l.to, kind: l.kind, rects: copyRects(l.rects), grid: copyGrid(l.grid) };
    if (l.kind === 'shared-opening') link.opening = copyOpening(l.opening);
    return link;
  });
  // a shared opening is flat only: its endpoints may carry no slope (a malformed one is a structure error, a valid one a geometry error)
  let sloped = false;
  for (const l of links) if (l.kind === 'shared-opening') for (const end of [l.from, l.to]) sloped = slopeIsSet(raw.rooms[rooms.findIndex((o) => o.spaceId === end)].slope, badPlan) || sloped;
  const keys = [[2 * a, 2 * b], [2 * a + 1, 2 * b], [2 * a, 2 * b + 1], [2 * a + 1, 2 * b + 1]].map(([i, j]) => `${i},${j}`);
  const given = Object.keys(raw.anchors);
  if (given.length !== keys.length || !keys.every((k) => given.includes(k))) throw badPlan();
  const anchors = {};
  for (const k of keys) {
    const o = rooms.find((q) => q.spaceId === raw.anchors[k]);
    if (!o || !ANCHOR_ROLES.includes(o.role)) throw badPlan();
    anchors[k] = o.spaceId;
  }
  if (sloped) throw badGeometry();
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
  // a shared opening has its own checks (its aperture rectangles stay apart) and also keeps its edges off every other room and link
  d.links.forEach((l, k) => {
    const shared = l.kind === 'shared-opening';
    if (shared) checkOpening(l, roomOf);
    else if (!connected(l.rects, true)) throw badGeometry();
    for (const p of l.rects) {
      for (const m of d.rooms) if (m.spaceId !== l.from && m.spaceId !== l.to && m.rects.some((q) => overlaps(p, q) || (shared && abuts(p, q)))) throw badGeometry();
      if (d.links.some((m, n) => n > k && m.rects.some((q) => overlaps(p, q) || ((shared || m.kind === 'shared-opening') && abuts(p, q))))) throw badGeometry();
    }
    if (!shared) for (const end of [l.from, l.to]) if (!l.rects.some((p) => roomOf.get(end).rects.some((q) => overlaps(p, q)))) throw badGeometry();
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
    if (rect) links.push({ sourceType: 'link', sourceId: l.id, rectIndex, rect, lv: 0, kind: 'corridor', ceil: l.opening ? l.opening.height : Math.min(3, roomOf(l.from).ceil, roomOf(l.to).ceil), src: l });
  }));
  const fragments = [primary, ...pieces.filter((p) => p !== primary), ...links].map((p) => {
    const f = { sourceType: p.sourceType, sourceId: p.sourceId, rectIndex: p.rectIndex, rect: { ...p.rect }, lv: p.lv, kind: p.kind, ceil: p.ceil };
    if (p.role) f.role = p.role;
    if (p.src.opening) f.opening = cloneOpening(p.src.opening);
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

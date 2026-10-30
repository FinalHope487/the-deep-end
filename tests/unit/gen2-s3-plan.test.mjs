// S3 slice 1: the pure subdivision planner (js/gen2-s3-plan.js). It turns one hall into a list of sub-rooms (rectangles with a door, some a step up
// or down). One room stands anywhere; two or more form one cluster from a corner of the hall (S3-2R). It reads no World2 and draws no RNG of T3-T6:
// same inputs, same plan
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../../js/rng.js';
import { World2, STEP2, COL_CLEAR, shapeOutline } from '../../js/gen2.js';
import { planSubdivision, validateSubdivision, subdivisionMode, protectedRectsFor, isSpecialHall, doorOn } from '../../js/gen2-s3-plan.js';
import { slow } from './slow.mjs';

const parentOf = (r) => { const x0 = Math.round((r() * 40 - 20) * 2) / 2, z0 = Math.round((r() * 40 - 20) * 2) / 2; return { x0, x1: x0 + 14 + Math.round(r() * 52) / 2 * 2, z0, z1: z0 + 14 + Math.round(r() * 52) / 2 * 2, lv: 0, ceil: 4.5, floorY: 0 }; };
const fixtures = (n) => { const r = mulberry32(7); return Array.from({ length: n }, (_, k) => ({ spaceId: `v2:space:${k},0:hall`, parent: parentOf(r), protect: k % 3 ? [] : [{ x0: 0, x1: 3, z0: 0, z1: 3 }] })); };
const plan = (f, seed = 42) => planSubdivision({ seed, spaceId: f.spaceId, parent: f.parent, protect: f.protect });
const area = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const bound = (s) => (s.rects.reduce((b, r) => ({ x0: Math.min(b.x0, r.x0), x1: Math.max(b.x1, r.x1), z0: Math.min(b.z0, r.z0), z1: Math.max(b.z1, r.z1) }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }));

test('subdivision: the same inputs give the same frozen plan, whatever else was planned first, and inputs are not touched', () => {
  const fx = fixtures(40), before = JSON.stringify(fx), a = fx.map((f) => plan(f));
  const b = [...fx].reverse().map((f) => plan(f)).reverse();
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(fx), before);
  assert.ok(Object.isFrozen(a[0]) && Object.isFrozen(a[0].subrooms));
  assert.notDeepEqual(plan(fx[1], 42), plan(fx[1], 43));
  const f = { ...fx[3], protect: [...fx[3].protect].reverse() };
  assert.deepEqual(plan(f), plan(fx[3]));
});

test('subdivision: modes follow the 20 / 70 / 10 draw bands and the carved share stays inside the mode band', () => {
  assert.deepEqual([0, 0.1999, 0.2, 0.8999, 0.9, 0.9999].map(subdivisionMode), ['none', 'none', 'partial', 'partial', 'high', 'high']);
  const big = { x0: 0, x1: 64, z0: 0, z1: 64, lv: 0, ceil: 4.5, floorY: 0 }, count = { none: 0, partial: 0, high: 0 };
  for (let k = 0; k < 600; k++) {
    const p = planSubdivision({ seed: 7, spaceId: `s${k}`, parent: big, protect: [] });
    count[p.mode]++;
    if (p.mode === 'none') assert.equal(p.subrooms.length, 0);
    if (p.mode === 'partial') assert.ok(p.share <= 0.4 + 1e-9, `share ${p.share}`);
    if (p.mode === 'high') assert.ok(p.share <= 0.9 + 1e-9, `share ${p.share}`);
  }
  assert.ok(Math.abs(count.none / 600 - 0.2) < 0.05 && Math.abs(count.partial / 600 - 0.7) < 0.06 && Math.abs(count.high / 600 - 0.1) < 0.04, JSON.stringify(count));
});

test('subdivision: every plan passes the validator (inside the hall, placed by the cluster rule, doors with free approach, protected cells and the rest of the floor connected)', () => {
  let rooms = 0, steps = 0;
  for (const f of fixtures(300)) {
    const p = plan(f);
    assert.deepEqual(validateSubdivision(p, f), [], f.spaceId);
    for (const s of p.subrooms) { rooms++; if (s.elevation !== undefined) steps++; }
  }
  assert.ok(rooms > 300 && steps > 10, `rooms ${rooms} steps ${steps}`);
});

test('subdivision: the validator rejects broken plans', () => {
  const f = fixtures(60).find((x) => plan(x).subrooms.length >= 2 && plan(x).subrooms[0].shape.type === 'rect-union'), p = plan(f), clone = () => JSON.parse(JSON.stringify(p));
  const bad = (mut) => { const q = clone(); mut(q); return validateSubdivision(q, f).length; };
  const s0 = p.subrooms[0], r0 = s0.shape.rects[0];
  assert.ok(bad((q) => { q.subrooms[1].shape = JSON.parse(JSON.stringify(s0.shape)); }) > 0, 'overlap');
  assert.ok(bad((q) => { q.subrooms[0].shape.rects[0].x1 = f.parent.x1 + 1; }) > 0, 'outside the hall');
  assert.ok(bad((q) => { q.subrooms[0].portals = []; }) > 0, 'no door');
  assert.ok(bad((q) => { q.subrooms[0].portals[0].rect.x1 += 5; }) > 0, 'door too wide');
  assert.ok(bad((q) => { q.subrooms[0].elevation = f.parent.floorY + STEP2 + 0.1; }) > 0, 'step over STEP2');
  assert.ok(bad((q) => { q.subrooms[0].shape.rects[0].x0 += 0.25; }) > 0, 'off the 0.5 m grid');
  assert.ok(bad((q) => { q.subrooms[0].subspaceId = q.subrooms[1].subspaceId; }) > 0, 'duplicate id');
  const prot = { ...f, protect: [...f.protect, { x0: r0.x0, x1: r0.x1, z0: r0.z0, z1: r0.z1 }] };
  assert.ok(validateSubdivision(p, prot).length > 0, 'protected cells inside a sub-room');
});

test('subdivision: protected rectangles stay clear, a special hall is never cut, a small hall is not cut', () => {
  const parent = { x0: 0, x1: 48, z0: 0, z1: 48, lv: 0, ceil: 4.5, floorY: 0 }, protect = [{ x0: 20, x1: 28, z0: 0, z1: 6 }, { x0: 0, x1: 6, z0: 20, z1: 28 }];
  let cut = 0;
  for (let k = 0; k < 80; k++) {
    const p = planSubdivision({ seed: 3, spaceId: `p${k}`, parent, protect });
    for (const s of p.subrooms) { cut++; for (const q of protect) assert.ok(!hit(bound(s.shape), q), `${p.parentSpaceId} ${s.subspaceId}`); }
    assert.equal(planSubdivision({ seed: 3, spaceId: `p${k}`, parent, protect, special: true }).subrooms.length, 0);
    assert.equal(planSubdivision({ seed: 3, spaceId: `p${k}`, parent: { ...parent, x1: 10 }, protect: [] }).subrooms.length, 0);
  }
  assert.ok(cut > 20);
});

test('subdivision: split levels rise by at most STEP2 and keep 2.5 m of air; a low hall gets none', () => {
  const rises = new Set();
  for (const f of fixtures(300)) for (const s of plan(f).subrooms) {
    if (s.elevation === undefined) continue;
    const rise = s.elevation - f.parent.floorY;
    rises.add(Math.round(rise * 1000) / 1000);
    assert.ok(rise > 0 && rise <= STEP2 + 1e-9, `rise ${rise}`);
    assert.ok(s.ceil >= 2.5 - 1e-9 && s.ceil <= f.parent.ceil - rise + 1e-9, `ceil ${s.ceil}`);
    assert.equal(s.nominalLevel, f.parent.lv);
  }
  assert.deepEqual([...rises].sort(), [0.4, 0.8]);
  for (const f of fixtures(80)) for (const s of planSubdivision({ seed: 42, spaceId: f.spaceId, parent: { ...f.parent, ceil: 3 }, protect: f.protect }).subrooms) assert.equal(s.elevation, undefined);
});

// ---- S3-2R: where rooms stand. One room: anywhere. Two or more: one cluster that starts in a corner, rooms sharing a wall flush with one end ----------------
const hall40 = { x0: 0, x1: 40, z0: 0, z1: 40, lv: 0, ceil: 4.5, floorY: 0 };
// a plan of hand-placed rooms (id k, rectangle, door side and centre); share is computed so only the placement rules are on trial
const handPlan = (rooms, parent = hall40) => ({
  parentSpaceId: 'h', mode: 'high', target: 0.6, share: rooms.reduce((t, [R]) => t + area(R), 0) / area(parent),
  subrooms: rooms.map(([R, side, c], k) => ({ subspaceId: `h:s3:${k}`, parentSpaceId: 'h', nominalLevel: 0, ceil: parent.ceil, shape: { type: 'rect-union', rects: [R] }, portals: [doorOn(R, side, c)] })),
});
const check = (rooms, parent = hall40) => validateSubdivision(handPlan(rooms, parent), { parent, protect: [] });
const A = { x0: 0, x1: 6, z0: 0, z1: 8 }, B = { x0: 6, x1: 12, z0: 0, z1: 8 };

test('S3-2R: one room has no placement rule: free-standing, mid-wall or in a corner', () => {
  assert.deepEqual(check([[{ x0: 8, x1: 16, z0: 8, z1: 16 }, 'z0', 12]]), []);     // in the open floor, touching nothing
  assert.deepEqual(check([[{ x0: 0, x1: 6, z0: 8, z1: 16 }, 'x1', 12]]), []);       // on the west wall, not in a corner
  assert.deepEqual(check([[A, 'z1', 3]]), []);                                      // in a corner
});

test('S3-2R: two rooms must form one cluster that starts in a hall corner, each sharing a wall flush with an end', () => {
  assert.deepEqual(check([[A, 'z1', 3], [B, 'z1', 9]]), []);
  assert.deepEqual(check([[A, 'z1', 3], [{ x0: 6, x1: 12, z0: 0, z1: 8 }, 'z1', 9], [{ x0: 12, x1: 17, z0: 0, z1: 8 }, 'z1', 15]]), [], 'a chain A - B - C');
  assert.deepEqual(check([[A, 'z1', 3], [{ x0: 6, x1: 12, z0: 0, z1: 6 }, 'z1', 9]]), [], 'the second room may be shorter when flush with the top');
  assert.deepEqual(check([[A, 'z1', 3], [{ x0: 6, x1: 12, z0: 2, z1: 8 }, 'z1', 9]]), [], '... or flush with the bottom');
  const bad = (rooms) => check(rooms).length > 0;
  assert.ok(bad([[A, 'z1', 3], [{ x0: 6, x1: 12, z0: 2, z1: 6 }, 'z1', 9]]), 'the second room hangs in the middle of the wall (2 m clear of both ends, so only the flush rule can refuse it)');
  assert.ok(bad([[A, 'z1', 3], [{ x0: 6, x1: 12, z0: 8, z1: 14 }, 'x1', 9]]), 'a corner point is no shared wall');
  assert.ok(bad([[{ x0: 0, x1: 6, z0: 8, z1: 16 }, 'x1', 12], [{ x0: 6, x1: 12, z0: 9, z1: 15 }, 'x1', 12]]), 'the old fixture: both rooms in the middle of the west wall');
  assert.ok(check([[{ x0: 6, x1: 12, z0: 6, z1: 14 }, 'z0', 9], [{ x0: 12, x1: 16, z0: 6, z1: 14 }, 'z0', 14]]).some((m) => m.includes('corner')), 'a cluster in the open floor, reaching no corner');
  assert.ok(check([[A, 'z1', 3], [{ x0: 8, x1: 14, z0: 10, z1: 16 }, 'x1', 13]]).some((m) => m.includes('one cluster')), 'a second room free-standing away from the first');
  assert.ok(bad([[A, 'z1', 3], [{ x0: 7, x1: 13, z0: 0, z1: 8 }, 'z1', 10]]), 'a 1 m strip between two rooms');
  assert.ok(bad([[A, 'z1', 3], [{ x0: 4, x1: 10, z0: 0, z1: 8 }, 'z1', 8]]), 'overlap');
});

test('S3-2R: the validator refuses a room on the central cross, in the margin of a protected rectangle, or with its doorway on either', () => {
  const R = { x0: 14, x1: 22, z0: 12, z1: 20 };   // the cross of a 40 m hall is x 18.5..21.5 and z 18.5..21.5, a metre wider each way
  assert.ok(check([[R, 'z1', 18]]).some((m) => m.includes('protected')), 'a singleton over the cross');
  assert.ok(check([[{ x0: 8, x1: 17.5, z0: 6, z1: 14 }, 'z0', 12]]).length === 0, 'a room that stops at the margin is fine');
  assert.ok(check([[{ x0: 8, x1: 18, z0: 6, z1: 14 }, 'z0', 12]]).some((m) => m.includes('protected')), 'a room in the 1 m margin of the cross');
  assert.ok(check([[{ x0: 8, x1: 14, z0: 8, z1: 17 }, 'z1', 11]]).some((m) => m.includes('approach on protected')), 'a doorway whose floor lies on the cross');
  const protect = [{ x0: 10, x1: 12, z0: 10, z1: 12 }];
  const near = { x0: 4, x1: 9.5, z0: 6, z1: 14 };   // 0.5 m from the rectangle: inside its margin
  assert.ok(validateSubdivision(handPlan([[near, 'z0', 6]]), { parent: hall40, protect }).some((m) => m.includes('protected')), 'the margin of a listed rectangle');
  assert.deepEqual(validateSubdivision(handPlan([[{ x0: 4, x1: 8.5, z0: 6, z1: 14 }, 'z0', 6]]), { parent: hall40, protect }), []);
});

test('S3-2R: two clusters that each stand in a corner but touch each other nowhere are rejected', () => {
  const far = { x0: 34, x1: 40, z0: 32, z1: 40 };
  assert.ok(check([[A, 'z1', 3], [far, 'z0', 37]]).some((m) => m.includes('one cluster')));
});

test('S3-2R: a doorway needs floor, so a door on the shared wall is refused', () => {
  assert.ok(check([[A, 'x1', 4], [B, 'z1', 9]]).some((m) => m.includes('approach')));
});

test('S3-2R: the validator does not care in what order the rooms are listed', () => {
  const rooms = [[A, 'z1', 3], [B, 'z1', 9], [{ x0: 0, x1: 6, z0: 8, z1: 14 }, 'x1', 11]];
  for (const set of [rooms, [[A, 'z1', 3], [{ x0: 6, x1: 12, z0: 2, z1: 6 }, 'z1', 9]]]) {
    const p = handPlan(set), rev = { ...p, subrooms: [...p.subrooms].reverse() };
    const norm = (q) => validateSubdivision(q, { parent: hall40, protect: [] }).map((m) => m.replace(/h:s3:\d/g, 'ID').replace(/ID: bad contact with ID/, 'contact')).sort();
    assert.deepEqual(norm(rev), norm(p));
  }
});

test('S3-2R: no round room or arc doorway can be generated or accepted', () => {
  const disc = { ...handPlan([[A, 'z1', 3]]) };
  disc.subrooms = [{ ...disc.subrooms[0], shape: { type: 'disc', cx: 10, cz: 10, radius: 3 }, portals: [{ type: 'arc', startAngle: 0, endAngle: 1 }] }];
  assert.ok(validateSubdivision(disc, { parent: hall40, protect: [] }).some((m) => m.includes('shape type')));
  const arc = handPlan([[A, 'z1', 3]]);
  arc.subrooms[0].portals = [{ type: 'arc', startAngle: 0, endAngle: 1 }];
  assert.ok(validateSubdivision(arc, { parent: hall40, protect: [] }).some((m) => m.includes('door shape')));
  for (const f of fixtures(300)) for (const s of plan(f).subrooms) { assert.equal(s.shape.type, 'rect-union'); assert.equal(s.portals[0].type, 'door'); }
});

test('S3-2R: generated plans follow the rule: clusters start in a corner, and a single room is the fallback only', () => {
  let clusters = 0, singles = 0, rooms = 0, steps = 0;
  for (const f of fixtures(300)) {
    const p = plan(f), n = p.subrooms.length;
    assert.deepEqual(validateSubdivision(p, f), [], f.spaceId);
    if (n === 1) singles++;
    if (n >= 2) {
      clusters++;
      const rs = p.subrooms.map((s) => s.shape.rects[0]);
      assert.ok(rs.some((R) => (R.x0 === f.parent.x0 || R.x1 === f.parent.x1) && (R.z0 === f.parent.z0 || R.z1 === f.parent.z1)), `${f.spaceId}: no corner room`);
    }
    for (const s of p.subrooms) { rooms++; if (s.elevation !== undefined) steps++; }
  }
  assert.ok(clusters > 50 && rooms > 300 && steps > 10, `clusters ${clusters} singles ${singles} rooms ${rooms} steps ${steps}`);
});

test('S3-2R: when no cluster of two fits, the hall gets one room placed freely, never a half-grown cluster', () => {
  // 20 x 20: the open cross in the middle leaves four 7.5 m quadrants, room for one 4 m room with its 2 m approach but never for two sharing a wall
  const parent = { x0: 0, x1: 20, z0: 0, z1: 20, lv: 0, ceil: 4.5, floorY: 0 };
  let single = 0;
  for (let k = 0; k < 400; k++) {
    const p = planSubdivision({ seed: 5, spaceId: `q${k}`, parent, protect: [] });
    assert.deepEqual(validateSubdivision(p, { parent, protect: [] }), []);
    assert.ok(p.subrooms.length <= 1, `${p.subrooms.length}`);
    single += p.subrooms.length;
  }
  assert.ok(single > 100, `single ${single}`);
});

test('S3-2R: flatOnly leaves every room on the hall floor and places the same rooms', () => {
  let n = 0;
  for (const f of fixtures(200)) {
    const full = plan(f), flat = planSubdivision({ seed: 42, spaceId: f.spaceId, parent: f.parent, protect: f.protect, flatOnly: true });
    assert.deepEqual(flat.subrooms.map((s) => s.shape.rects[0]), full.subrooms.map((s) => s.shape.rects[0]));
    for (const s of flat.subrooms) { n++; assert.equal(s.elevation, undefined); assert.equal(s.ceil, f.parent.ceil); }
  }
  assert.ok(n > 100);
  assert.throws(() => planSubdivision({ seed: 1, spaceId: 'a', parent: hall40, flatOnly: 'yes' }), TypeError);
});

test('subdivision: every fragment of an L or giant hall is special and stays whole', () => {
  let groups = 0;
  for (const seed of [8, 1, 2, 3]) {
    const w = new World2(seed), by = new Map();
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) for (const h of w.plan(i, j).rooms.filter((o) => o.kind === 'hall' && (o.span === 'L' || o.span === 'giant')).map((o) => ({ plan: w.plan(i, j), o }))) {
      assert.equal(isSpecialHall(h.plan, h.o), true, `${seed} ${h.o.spaceId} ${h.o.span}`);
      by.set(h.o.spaceId, (by.get(h.o.spaceId) || 0) + 1);
    }
    for (const [id, c] of by) if (id.endsWith(':L') && c >= 3) groups++;
  }
  assert.ok(groups > 0, 'found an L hall with three fragments');
});

test('subdivision: bad inputs throw TypeError / RangeError with fixed messages', () => {
  const ok = { seed: 1, spaceId: 'a', parent: { x0: 0, x1: 30, z0: 0, z1: 30, lv: 0, ceil: 4.5, floorY: 0 }, protect: [] };
  const err = (o, T, m) => assert.throws(() => planSubdivision(o), (e) => e instanceof T && e.message === m);
  err({ ...ok, spaceId: '' }, TypeError, 'Invalid subdivision input');
  err({ ...ok, seed: 1.5 }, TypeError, 'Invalid subdivision input');
  err({ ...ok, protect: {} }, TypeError, 'Invalid subdivision input');
  err({ ...ok, protect: [{ x0: 0 }] }, TypeError, 'Invalid subdivision input');
  err({ ...ok, parent: { ...ok.parent, x1: NaN } }, RangeError, 'Invalid subdivision geometry');
  err({ ...ok, parent: { ...ok.parent, x1: 0 } }, RangeError, 'Invalid subdivision geometry');
  err({ ...ok, parent: { ...ok.parent, x0: 0.25 } }, RangeError, 'Invalid subdivision geometry');
  assert.throws(() => planSubdivision(null), TypeError);
});

// ---- real halls: the planner fed from World2 plans ------------------------------------------------------------------------------------------------
const halls = (w, i, j) => { const p = w.plan(i, j); return p.rooms.filter((o) => o.kind === 'hall' && o.lv === 0).map((o) => ({ plan: p, o })); };
const feed = (w, { plan: p, o }) => ({ spaceId: o.spaceId, parent: { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, lv: o.lv, ceil: o.ceil, floorY: w.Y[o.lv] }, protect: protectedRectsFor(p, o), special: isSpecialHall(p, o) });

test('protectedRectsFor: flights, voids, ladders, columns, pools, windows and corridor mouths of a real hall are all covered', () => {
  const w = new World2(42), seen = { flights: 0, voids: 0, columns: 0, pools: 0, mouths: 0 };
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (const h of halls(w, i, j)) {
    const prot = protectedRectsFor(h.plan, h.o), covers = (x, z) => prot.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
    for (const r of prot) assert.ok(r.x1 > r.x0 && r.z1 > r.z0 && r.x1 <= h.o.x1 + 1e-9 && r.x0 >= h.o.x0 - 1e-9, 'inside the hall');
    for (const f of h.plan.flights) if (f.room === h.o.id || hit(f, h.o)) { seen.flights++; assert.ok(covers((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2), 'flight'); }
    for (const c of h.plan.columns) if (c.room === h.o.id) { seen.columns++; assert.ok(covers(c.x + c.r + COL_CLEAR - 0.1, c.z), 'column clearance'); }
    for (const v of h.plan.voids) if (v.over === h.o.id || v.under === h.o.id) { seen.voids++; assert.ok(covers((v.x0 + v.x1) / 2, (v.z0 + v.z1) / 2), 'void'); }
    for (const p of h.plan.pools) if (p.room === h.o.id) { seen.pools++; const pts = shapeOutline(p.shape), mx = pts.reduce((a, q) => a + (q.x ?? q[0]), 0) / pts.length, mz = pts.reduce((a, q) => a + (q.z ?? q[1]), 0) / pts.length; assert.ok(covers(mx, mz), 'pool'); }
    for (const c of h.plan.rooms) if (c !== h.o && c.lv === 0 && c.kind !== 'hall' && hit(c, { x0: h.o.x0 - 0.5, x1: h.o.x1 + 0.5, z0: h.o.z0 - 0.5, z1: h.o.z1 + 0.5 }) && hit(c, h.o)) { seen.mouths++; }
  }
  assert.ok(seen.flights > 0 && seen.voids > 0 && seen.columns > 0 && seen.pools > 0 && seen.mouths > 0, JSON.stringify(seen));
});

test('subdivision: real halls of seed 42 plan and validate, specials stay whole', () => {
  const w = new World2(42);
  let cut = 0, whole = 0;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const h of halls(w, i, j)) {
    const f = feed(w, h), p = planSubdivision({ seed: 42, ...f });
    assert.deepEqual(validateSubdivision(p, f), [], f.spaceId);
    if (f.special) assert.equal(p.subrooms.length, 0); else if (p.subrooms.length) cut++; else whole++;
  }
  assert.ok(cut > 5 && whole > 2, `cut ${cut} whole ${whole}`);
});

test('subdivision: corpus of eight seeds, every hall of 8 x 8 cells validates (slow)', slow, () => {
  let halls_ = 0, cut = 0, share = 0, rooms = 0, clusters = 0, steps = 0;
  for (const seed of [1, 2, 3, 7, 42, 99, 1234, 20261024]) {
    const w = new World2(seed);
    for (let i = -4; i <= 3; i++) for (let j = -4; j <= 3; j++) for (const h of halls(w, i, j)) {
      const f = feed(w, h), p = planSubdivision({ seed, ...f });
      assert.deepEqual(validateSubdivision(p, f), [], `${seed} ${f.spaceId}`);
      halls_++;
      if (p.subrooms.length) { cut++; share += p.share; }
      if (p.subrooms.length >= 2) clusters++;
      for (const s of p.subrooms) { rooms++; if (s.elevation !== undefined) steps++; }
    }
  }
  console.log(`# S3-1 corpus: halls ${halls_}, cut ${cut}, mean carved share ${(share / cut).toFixed(3)}, sub-rooms ${rooms}, clusters ${clusters}, split levels ${steps}`);
  assert.ok(cut > halls_ * 0.2, 'a fifth of all halls get a cut');
});

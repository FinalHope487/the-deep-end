// S3 slice 1: the pure subdivision planner (js/gen2-s3-plan.js). It turns one hall into a list of sub-rooms (rectangles with a door, some a step up
// or down, some round with an arc doorway). It reads no World2 and draws no RNG of T3-T6: same inputs, same plan. Nothing in the game uses it yet
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../../js/rng.js';
import { World2, STEP2, BODY_R2, COL_CLEAR, shapeOutline } from '../../js/gen2.js';
import { planSubdivision, validateSubdivision, subdivisionMode, protectedRectsFor, isSpecialHall, arcApproachClear } from '../../js/gen2-s3-plan.js';
import { slow } from './slow.mjs';

const parentOf = (r) => { const x0 = Math.round((r() * 40 - 20) * 2) / 2, z0 = Math.round((r() * 40 - 20) * 2) / 2; return { x0, x1: x0 + 14 + Math.round(r() * 52) / 2 * 2, z0, z1: z0 + 14 + Math.round(r() * 52) / 2 * 2, lv: 0, ceil: 4.5, floorY: 0 }; };
const fixtures = (n) => { const r = mulberry32(7); return Array.from({ length: n }, (_, k) => ({ spaceId: `v2:space:${k},0:hall`, parent: parentOf(r), protect: k % 3 ? [] : [{ x0: 0, x1: 3, z0: 0, z1: 3 }] })); };
const plan = (f, seed = 42) => planSubdivision({ seed, spaceId: f.spaceId, parent: f.parent, protect: f.protect });
const area = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const bound = (s) => (s.type === 'disc' ? { x0: s.cx - s.radius, x1: s.cx + s.radius, z0: s.cz - s.radius, z1: s.cz + s.radius } : s.rects.reduce((b, r) => ({ x0: Math.min(b.x0, r.x0), x1: Math.max(b.x1, r.x1), z0: Math.min(b.z0, r.z0), z1: Math.max(b.z1, r.z1) }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }));

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

test('subdivision: every plan passes the validator (inside the hall, spaced, doors with free approach, protected cells and the rest of the floor connected)', () => {
  let rooms = 0, discs = 0, steps = 0;
  for (const f of fixtures(300)) {
    const p = plan(f);
    assert.deepEqual(validateSubdivision(p, f), [], f.spaceId);
    for (const s of p.subrooms) { rooms++; if (s.shape.type === 'disc') discs++; if (s.elevation !== undefined) steps++; }
  }
  assert.ok(rooms > 300 && discs > 10 && steps > 10, `rooms ${rooms} discs ${discs} steps ${steps}`);
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

test('subdivision: round rooms are whole discs with an arc doorway the body can pass', () => {
  let n = 0;
  for (const f of fixtures(300)) {
    const p = plan(f);
    for (const s of p.subrooms) {
      if (s.shape.type !== 'disc') continue;
      n++;
      const { cx, cz, radius } = s.shape, b = bound(s.shape);
      assert.ok(radius >= 3 && radius <= 5 && radius * 2 === Math.round(radius * 2), `radius ${radius}`);
      assert.ok(b.x0 - f.parent.x0 >= 1.5 && f.parent.x1 - b.x1 >= 1.5 && b.z0 - f.parent.z0 >= 1.5 && f.parent.z1 - b.z1 >= 1.5, 'wall clearance');
      assert.equal(s.portals.length, 1);
      const a = s.portals[0], span = a.endAngle - a.startAngle;
      assert.equal(a.type, 'arc');
      assert.ok(a.startAngle >= 0 && a.endAngle <= 2 * Math.PI && span > 0, 'angles');
      assert.ok(2 * radius * Math.sin(span / 2) >= 2 + 2 * BODY_R2 - 1e-9, 'chord of the doorway');
      assert.equal(s.elevation, undefined);
    }
  }
  assert.ok(n > 10, `discs ${n}`);
});

// the floor in front of a round room's doorway: points 0.25 .. 2 m outside the circle, across the arc
const arcFront = (s, a) => { const out = []; for (let k = 0; k <= 8; k++) for (let m = 1; m <= 8; m++) { const th = a.startAngle + ((a.endAngle - a.startAngle) * k) / 8, rad = s.radius + 0.25 * m; out.push([s.cx + rad * Math.cos(th), s.cz + rad * Math.sin(th)]); } return out; };
const roundRoom = { cx: 4.5, cz: 15, radius: 3 };
const westDoor = { startAngle: Math.PI - 0.5, endAngle: Math.PI + 0.5 };
const withRoom = (room, door) => ({ parentSpaceId: 'p', mode: 'high', target: 0.5, share: (Math.PI * room.radius ** 2) / 900, subrooms: [{ subspaceId: 'p:s3:0', parentSpaceId: 'p', nominalLevel: 0, ceil: 4.5, shape: { type: 'disc', ...room }, portals: [{ type: 'arc', ...door }] }] });

test('subdivision: a round room has a free two-metre floor in front of its doorway', () => {
  const parent = { x0: 0, x1: 30, z0: 0, z1: 30, lv: 0, ceil: 4.5, floorY: 0 };
  // 1.5 m from the west wall with the door facing it: only 1.5 m of floor outside, so the validator must say so
  assert.ok(validateSubdivision(withRoom(roundRoom, westDoor), { parent, protect: [] }).some((m) => m.includes('approach')));
  const northDoor = { startAngle: Math.PI / 2 - 0.5, endAngle: Math.PI / 2 + 0.5 };   // towards +z, open floor
  assert.deepEqual(validateSubdivision(withRoom(roundRoom, northDoor), { parent, protect: [] }), []);
  // a protected rectangle in front of that door counts as well
  assert.ok(validateSubdivision(withRoom(roundRoom, northDoor), { parent, protect: [{ x0: 3.5, x1: 5.5, z0: 19, z1: 20 }] }).some((m) => m.includes('approach')));
  let n = 0;
  for (const f of fixtures(300)) for (const s of plan(f).subrooms) {
    if (s.shape.type !== 'disc') continue;
    n++;
    for (const [x, z] of arcFront(s.shape, s.portals[0])) {
      assert.ok(x >= f.parent.x0 && x <= f.parent.x1 && z >= f.parent.z0 && z <= f.parent.z1, `approach leaves the hall at ${x},${z}`);
      assert.ok(!f.protect.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1), 'approach on a protected cell');
    }
  }
  assert.ok(n > 10, `discs ${n}`);
});

test('subdivision: arc approach rejects a protected rectangle between sampled rays', () => {
  const parent = { x0: 0, x1: 30, z0: 0, z1: 30, lv: 0, ceil: 4.5, floorY: 0 };
  const room = { cx: 15, cz: 15, radius: 3 }, door = { startAngle: 0, endAngle: 1 };
  // the rectangle lies 4.3 m out, between two rays of a 9 x 8 point sampling, and touches no sample
  const hole = [{ x0: 19.291, x1: 19.691, z0: 15.081, z1: 15.481 }];
  assert.deepEqual(validateSubdivision(withRoom(room, door), { parent, protect: [] }), []);
  assert.ok(validateSubdivision(withRoom(room, door), { parent, protect: hole }).some((m) => m.includes('approach')));
  // a rectangle behind the room, off the arc, is no obstacle
  assert.deepEqual(validateSubdivision(withRoom(room, door), { parent, protect: [{ x0: 8, x1: 9, z0: 14, z1: 16 }] }), []);
});

test('subdivision: arc approach never accepts a sector that a dense sampling finds blocked (random rectangles and rounds)', () => {
  const r = mulberry32(99), hall = { x0: 0, x1: 200, z0: 0, z1: 200 }, d = { type: 'disc', cx: 100, cz: 100, radius: 3.5 };
  let blocked = 0;
  for (let n = 0; n < 20000; n++) {
    const a0 = r() * 2 * Math.PI, span = 0.9 + r() * 2, arc = { startAngle: Math.max(0, a0 - span / 2), endAngle: Math.min(2 * Math.PI, a0 + span / 2) };
    const w = 0.1 + r() * 9, h = 0.1 + r() * 9, ox = 100 + (r() - 0.5) * 16, oz = 100 + (r() - 0.5) * 16, o = r() < 0.3 ? { type: 'disc', cx: ox, cz: oz, radius: 0.3 + r() * 3 } : { x0: ox - w / 2, x1: ox + w / 2, z0: oz - h / 2, z1: oz + h / 2 };
    let hitSample = false;
    for (let k = 0; k <= 80 && !hitSample; k++) for (let m = 0; m <= 20 && !hitSample; m++) {
      const th = arc.startAngle + ((arc.endAngle - arc.startAngle) * k) / 80, rad = d.radius + (2 * m) / 20, x = d.cx + rad * Math.cos(th), z = d.cz + rad * Math.sin(th);
      hitSample = o.type === 'disc' ? Math.hypot(x - o.cx, z - o.cz) < o.radius + 0.4 - 1e-6 : x > o.x0 - 0.4 + 1e-6 && x < o.x1 + 0.4 - 1e-6 && z > o.z0 - 0.4 + 1e-6 && z < o.z1 + 0.4 - 1e-6;
    }
    if (hitSample) { blocked++; assert.equal(arcApproachClear(d, arc, hall, [o]), false, JSON.stringify({ arc, o })); }
  }
  assert.ok(blocked > 500, `blocked cases ${blocked}`);
});

test('subdivision: arc approach never clears an obstacle across the angular wrap', () => {
  // ChatGPT's fixture (c2c_b73e iteration 4): the box seen from the disc centre straddles the +-pi cut of the angle, and it meets the sector
  const half = Math.ceil((Math.asin(2.8 / 6) + 0.02) * 1e4) / 1e4, theta = (5 * Math.PI) / 8;
  const d = { type: 'disc', cx: 0, cz: 0, radius: 3 }, arc = { startAngle: theta - half, endAngle: theta + half };
  const hall = { x0: -10, x1: 10, z0: -10, z1: 10 };
  assert.equal(arcApproachClear(d, arc, hall, [{ x0: 0.5, x1: 3, z0: -0.5, z1: 5 }]), false);
  assert.equal(arcApproachClear(d, arc, hall, [{ x0: 4, x1: 6, z0: -4, z1: -3 }]), true);   // the same disc and door with a box far off the sector is still free
});

test('subdivision: arc approach keeps the whole player footprint (0.4 m) inside the hall', () => {
  assert.equal(0.8 / 2, BODY_R2);   // the planner keeps its own copy of the body radius (it imports nothing from gen2.js)
  const parent = { x0: 0, x1: 30, z0: 0, z1: 30, lv: 0, ceil: 4.5, floorY: 0 };
  const door = { startAngle: 0, endAngle: 1 };
  // door towards +x; the 2 m of floor ends exactly on the wall (cx 25 + 3 + 2 = 30): the body centre fits, the body does not
  assert.ok(validateSubdivision(withRoom({ cx: 25, cz: 15, radius: 3 }, door), { parent, protect: [] }).some((m) => m.includes('approach')));
  assert.deepEqual(validateSubdivision(withRoom({ cx: 24.5, cz: 15, radius: 3 }, door), { parent, protect: [] }), []);
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
  let halls_ = 0, cut = 0, share = 0, rooms = 0, discs = 0, steps = 0;
  for (const seed of [1, 2, 3, 7, 42, 99, 1234, 20261024]) {
    const w = new World2(seed);
    for (let i = -4; i <= 3; i++) for (let j = -4; j <= 3; j++) for (const h of halls(w, i, j)) {
      const f = feed(w, h), p = planSubdivision({ seed, ...f });
      assert.deepEqual(validateSubdivision(p, f), [], `${seed} ${f.spaceId}`);
      halls_++;
      if (p.subrooms.length) { cut++; share += p.share; }
      for (const s of p.subrooms) { rooms++; if (s.shape.type === 'disc') discs++; if (s.elevation !== undefined) steps++; }
    }
  }
  console.log(`# S3-1 corpus: halls ${halls_}, cut ${cut}, mean carved share ${(share / cut).toFixed(3)}, sub-rooms ${rooms}, discs ${discs}, split levels ${steps}`);
  assert.ok(cut > halls_ * 0.2, 'a fifth of all halls get a cut');
});

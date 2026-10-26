// T4 shared-wall openings, core: the pure builder, contact search, source schema, validation, cut metadata and the two forced fixtures.
// The namespace import keeps a missing export a failing assertion in each test, not a link error that hides all of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../../js/gen2.js';
import * as D from '../../js/gen2-district.js';
import { hash2, mulberry32 } from '../../js/rng.js';

const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 20261024];
const DISTRICTS = [[1, 1], [-1, -1]];
const WIDTHS = [1.5, 2, 2.5, 3, 4], HEIGHTS = [2, 2.5, 3];

const isB = (e) => e instanceof TypeError && e.message === 'Invalid shared opening';
const isT = (e) => e instanceof TypeError && e.message === 'Invalid district plan';
const isR = (e) => e instanceof RangeError && e.message === 'Invalid district geometry';
const q2 = (v) => Number.isInteger(v / 0.5);
const rect = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });
const byRect = (p, q) => p.x0 - q.x0 || p.z0 - q.z0 || p.x1 - q.x1 || p.z1 - q.z1;
const clone = (o) => JSON.parse(JSON.stringify(o));
const overlapArea = (p, q) => Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0));
const unionArea = (rooms, r) => rooms.reduce((s, m) => s + m.rects.reduce((t, q) => t + overlapArea(q, r), 0), 0);

// a room whose rectangle is given in district-local metres
function room(a, b, k, [x0, x1, z0, z1], ceil = 4, role = 'main') {
  const r = rect(128 * a + x0, 128 * a + x1, 128 * b + z0, 128 * b + z1);
  return { spaceId: `v2:space:${a},${b}:r${k}`, lv: 0, rects: [r], ceil, role, grid: { ox: r.x0, oz: r.z0, step: 6 } };
}

// two rooms face to face over a normal gap, sharing the transverse stretch [t0, t1]
function pair({ a = 1, b = 1, axis = 'x', gap = 0.5, t0 = 40, t1 = 80, aCeil = 4, bCeil = 4 } = {}) {
  const make = (k, n0, n1, ceil) => room(a, b, k, axis === 'x' ? [n0, n1, t0, t1] : [t0, t1, n0, n1], ceil);
  return [make(0, 20, 60, aCeil), make(1, 60 + gap, 100, bCeil)];
}

// the five draws of a link, read independently of the builder
function draws(seed, a, b, k) {
  const districtHash = hash2(seed >>> 0, a, b, 8800);
  const r = mulberry32(hash2(districtHash, k, Math.floor(k / 0x100000000), 8801));
  return Array.from({ length: 5 }, () => r());
}

// the expected style, height and apertures of one contact { gap, s0, s1 }
function expected(d, { gap, s0, s1, ceilA, ceilB, style = 'auto' }) {
  const span = s1 - s0, floor = Math.min(ceilA, ceilB);
  const kind = style !== 'auto' ? style : gap === 0 ? 'open' : d[0] < 0.35 && span >= 8 ? 'row' : 'doorway';
  if (kind === 'open') return { style: kind, height: floor, apertures: [{ lo: s0, hi: s1 }] };
  const height = Math.min(HEIGHTS[Math.floor(d[2] * 3)], floor);
  let occupied, w, n;
  if (kind === 'doorway') {
    w = Math.min(WIDTHS[Math.floor(d[1] * 5)], Math.max(...WIDTHS.filter((v) => v <= span - 1)));
    occupied = w;
  } else {
    n = Math.min(5, Math.floor(span / 3.5));
    occupied = n * 2.5 + (n - 1);
  }
  const min = s0 + 0.5, max = s1 - 0.5 - occupied, N = Math.floor((max - min) / 0.5) + 1, start = min + 0.5 * Math.floor(d[3] * N);
  const apertures = kind === 'doorway' ? [{ lo: start, hi: start + w }] : Array.from({ length: n }, (_, q) => ({ lo: start + 3.5 * q, hi: start + 3.5 * q + 2.5 }));
  return { style: kind, height, apertures };
}

const bridgeOf = (axis, c0, c1, { lo, hi }) => (axis === 'x' ? rect(c0 - 0.5, c1 + 0.5, lo, hi) : rect(lo, hi, c0 - 0.5, c1 + 0.5));

test('opening: dimensions and Q2 grid', () => {
  assert.equal(typeof D.buildSharedOpening, 'function');
  const widthsSeen = new Set(), heightsSeen = new Set();
  for (const [a, b] of DISTRICTS) for (const axis of ['x', 'z']) {
    const OX = 128 * a, OZ = 128 * b, N0 = axis === 'x' ? OX : OZ, T0 = axis === 'x' ? OZ : OX;
    for (const [style, gap, t0, t1] of [['open', 0, 40, 70], ['doorway', 0.5, 40, 60], ['row', 0.5, 30, 100]]) {
      for (let k = 0; k < 60; k++) {
        const [A, B] = pair({ a, b, axis, gap, t0, t1, aCeil: 5, bCeil: 3.5 });
        const link = D.buildSharedOpening(7, a, b, k, A, B, style);
        assert.ok(link, `${style} ${axis} k${k}`);
        const o = link.opening, d = draws(7, a, b, k), exp = expected(d, { gap, s0: T0 + t0, s1: T0 + t1, ceilA: 5, ceilB: 3.5, style });
        assert.equal(link.id, `v2:dlink:${a},${b}:${k}`);
        assert.equal(link.from, A.spaceId);
        assert.equal(link.to, B.spaceId);
        assert.equal(link.kind, 'shared-opening');
        assert.deepEqual([o.style, o.lv, o.axis, o.c0, o.c1, o.s0, o.s1], [style, 0, axis, N0 + 60, N0 + 60 + gap, T0 + t0, T0 + t1]);
        assert.ok(o.c0 <= o.c1 && o.c1 - o.c0 === gap);
        assert.deepEqual(o.apertures, exp.apertures, `${style} apertures`);
        assert.equal(o.height, exp.height);
        assert.ok(o.height >= 2 && o.height <= Math.min(A.ceil, B.ceil) && q2(o.height));
        assert.equal(link.rects.length, o.apertures.length);
        assert.deepEqual(link.rects, o.apertures.map((p) => bridgeOf(axis, o.c0, o.c1, p)).sort(byRect));
        assert.deepEqual(link.grid, { ox: link.rects[0].x0, oz: link.rects[0].z0, step: 6 });
        for (const r of link.rects) assert.ok([r.x0, r.x1, r.z0, r.z1].every(q2));
        // each bridge reaches 0.5 m into both rooms across its whole aperture
        link.rects.forEach((r, q) => {
          const w = o.apertures[q].hi - o.apertures[q].lo;
          assert.equal(unionArea([A], r), 0.5 * w);
          assert.equal(unionArea([B], r), 0.5 * w);
        });
        o.apertures.forEach((p, q) => {
          assert.ok(o.s0 <= p.lo && p.lo < p.hi && p.hi <= o.s1 && q2(p.lo) && q2(p.hi));
          if (q) assert.ok(p.lo >= o.apertures[q - 1].hi);
        });
        assert.equal('lamps' in link, false);
        if (style === 'open') {
          assert.deepEqual(o.apertures, [{ lo: o.s0, hi: o.s1 }]);
          assert.equal(o.height, Math.min(A.ceil, B.ceil));
        } else if (style === 'doorway') {
          const p = o.apertures[0];
          assert.equal(o.apertures.length, 1);
          assert.ok(WIDTHS.includes(p.hi - p.lo) && p.lo - o.s0 >= 0.5 && o.s1 - p.hi >= 0.5);
          widthsSeen.add(p.hi - p.lo);
          heightsSeen.add(o.height);
        } else {
          assert.ok(o.apertures.length >= 2 && o.apertures.length <= 5);
          o.apertures.forEach((p, q) => {
            assert.equal(p.hi - p.lo, 2.5);
            if (q) assert.equal(p.lo - o.apertures[q - 1].hi, 1);
          });
          assert.ok(o.apertures[0].lo - o.s0 >= 0.5 && o.s1 - o.apertures.at(-1).hi >= 0.5);
        }
      }
    }
  }
  assert.deepEqual([...widthsSeen].sort((p, q) => p - q), WIDTHS, 'every door width is reached');
  assert.ok(heightsSeen.size > 0 && [...heightsSeen].every((h) => HEIGHTS.includes(h)), 'heights come from the list');
  // the three door heights, each forced by a link whose height draw falls in its bin, with ceilings high enough
  for (const want of HEIGHTS) {
    const k = Array.from({ length: 200 }, (_, i) => i).find((i) => HEIGHTS[Math.floor(draws(7, 1, 1, i)[2] * 3)] === want);
    const [A, B] = pair({ aCeil: 5, bCeil: 5 });
    assert.equal(D.buildSharedOpening(7, 1, 1, k, A, B, 'doorway').opening.height, want);
  }
  // a low ceiling caps the height at the lower ceiling, and a 2 m ceiling still gives a 2 m door
  const [lowA, lowB] = pair({ aCeil: 2, bCeil: 5 });
  assert.equal(D.buildSharedOpening(7, 1, 1, 0, lowA, lowB, 'doorway').opening.height, 2);
  // a three metre stretch leaves jambs of 0.5 m beside a 2 m door and is the narrowest doorway
  const [nA, nB] = pair({ t0: 40, t1: 43 });
  const narrow = D.buildSharedOpening(7, 1, 1, 0, nA, nB, 'doorway');
  assert.ok(narrow.opening.apertures[0].hi - narrow.opening.apertures[0].lo <= 2);
  // the endpoints come out in ascending source-index order whatever order they are passed in
  const [fA, fB] = pair();
  const rev = D.buildSharedOpening(7, 1, 1, 0, fB, fA, 'doorway');
  assert.equal(rev.from, fA.spaceId);
  assert.equal(rev.to, fB.spaceId);
});

test('opening: deterministic draws and endpoint reversal', () => {
  assert.equal(typeof D.buildSharedOpening, 'function');
  for (const seed of SEEDS) for (const [a, b] of DISTRICTS) for (let k = 0; k < 4; k++) {
    const d = draws(seed, a, b, k);
    for (const [gap, style, t0, t1] of [[0.5, 'auto', 30, 100], [0.5, 'auto', 40, 46], [0, 'auto', 40, 80], [0.5, 'doorway', 30, 100], [0.5, 'row', 30, 100], [0, 'open', 40, 80]]) {
      const [A, B] = pair({ a, b, gap, t0, t1 });
      const T0 = 128 * b, link = D.buildSharedOpening(seed, a, b, k, A, B, style);
      const exp = expected(d, { gap, s0: T0 + t0, s1: T0 + t1, ceilA: 4, ceilB: 4, style });
      assert.ok(link, `${seed} ${a},${b} k${k} ${style}`);
      assert.equal(link.opening.style, exp.style);
      assert.equal(link.opening.height, exp.height);
      assert.deepEqual(link.opening.apertures, exp.apertures);
      const again = D.buildSharedOpening(seed, a, b, k, A, B, style);
      assert.equal(JSON.stringify(again), JSON.stringify(link), 'repeat call');
      const reversed = D.buildSharedOpening(seed, a, b, k, B, A, style);
      assert.equal(JSON.stringify(reversed), JSON.stringify(link), 'endpoints reversed');
    }
  }
  // k above 2**32 reads the high word: its hash differs from k = 0 and the builder follows it
  const dh = hash2(42, 1, 1, 8800);
  assert.notEqual(hash2(dh, 0, 0, 8801), hash2(dh, 2 ** 32, 1, 8801));
  assert.notEqual(JSON.stringify(draws(42, 1, 1, 0)), JSON.stringify(draws(42, 1, 1, 2 ** 32)));
  const [A, B] = pair();
  const high = D.buildSharedOpening(42, 1, 1, 2 ** 32, A, B, 'doorway');
  assert.equal(high.id, 'v2:dlink:1,1:4294967296');
  assert.deepEqual(high.opening.apertures, expected(draws(42, 1, 1, 2 ** 32), { gap: 0.5, s0: 128 + 40, s1: 128 + 80, ceilA: 4, ceilB: 4, style: 'doorway' }).apertures);
  // a negative seed is read as its unsigned 32-bit value
  assert.equal(JSON.stringify(D.buildSharedOpening(-5, 1, 1, 0, A, B, 'doorway')), JSON.stringify(D.buildSharedOpening((-5) >>> 0, 1, 1, 0, A, B, 'doorway')));
  // the explicit style does not move the other four draws: the offset draw is the fourth in every style
  const sa = D.buildSharedOpening(1, 1, 1, 0, A, B, 'doorway'), sb = D.buildSharedOpening(1, 1, 1, 0, A, B, 'auto');
  if (sb.opening.style === 'doorway') assert.deepEqual(sa.opening.apertures, sb.opening.apertures);
});

test('opening: contact choice and infeasibility', () => {
  assert.equal(typeof D.buildSharedOpening, 'function');
  const build = (A, B, style = 'auto', k = 0) => D.buildSharedOpening(42, 1, 1, k, A, B, style);
  // gaps 0, 0.5 and 1 m on both axes; 1 m is no contact
  for (const axis of ['x', 'z']) {
    assert.equal(build(...pair({ axis, gap: 0 })).opening.style, 'open');
    assert.ok(['doorway', 'row'].includes(build(...pair({ axis, gap: 0.5 })).opening.style));
    assert.equal(build(...pair({ axis, gap: 1 })), null);
    assert.equal(build(...pair({ axis, gap: 1.5 }), 'open'), null);
  }
  // corner contact is not a contact, and neither is a disjoint transverse stretch
  const corner = [room(1, 1, 0, [20, 60, 20, 60]), room(1, 1, 1, [60.5, 100, 60, 100])];
  assert.equal(build(...corner), null);
  const disjoint = [room(1, 1, 0, [20, 60, 20, 40]), room(1, 1, 1, [60.5, 100, 50, 70])];
  assert.equal(build(...disjoint), null);
  // minimum spans: open 1.5, doorway 3, row 8, and auto picks no style under 3 across a 0.5 m gap
  for (const [style, gap, span] of [['open', 0, 1.5], ['doorway', 0.5, 3], ['row', 0.5, 8]]) {
    assert.ok(build(...pair({ gap, t0: 40, t1: 40 + span }), style), `${style} at its minimum`);
    assert.equal(build(...pair({ gap, t0: 40, t1: 40 + span - 0.5 }), style), null, `${style} below its minimum`);
  }
  assert.equal(build(...pair({ gap: 0.5, t0: 40, t1: 42.5 })), null);
  // incompatible explicit styles
  assert.equal(build(...pair({ gap: 0 }), 'doorway'), null);
  assert.equal(build(...pair({ gap: 0 }), 'row'), null);
  assert.equal(build(...pair({ gap: 0.5 }), 'open'), null);
  // a thin endpoint still gives its 0.5 m of overlap
  const thin = [room(1, 1, 0, [59.5, 60, 40, 80]), room(1, 1, 1, [60.5, 61, 40, 80])];
  assert.ok(build(...thin, 'doorway'));
  // the longest contact wins; equal spans go to the x axis, then to the lower stretch
  const tieAxes = [room(1, 1, 0, [20, 60, 20, 60]), { ...room(1, 1, 1, [60.5, 80, 30, 50]), rects: [rect(128 + 60.5, 128 + 80, 128 + 30, 128 + 50), rect(128 + 30, 128 + 50, 128 + 60.5, 128 + 80)] }];
  assert.equal(build(...tieAxes, 'doorway').opening.axis, 'x');
  const tieLow = [room(1, 1, 0, [20, 60, 20, 60]), { ...room(1, 1, 1, [60.5, 80, 22, 32]), rects: [rect(128 + 60.5, 128 + 80, 128 + 40, 128 + 50), rect(128 + 60.5, 128 + 80, 128 + 22, 128 + 32)] }];
  assert.equal(build(...tieLow, 'doorway').opening.s0, 128 + 22);
  // the first feasible contact, not the longest: the longest has gap 0 and a doorway needs 0.5
  const mixed = [room(1, 1, 0, [20, 60, 20, 80]), { ...room(1, 1, 1, [60, 100, 20, 60]), rects: [rect(128 + 60, 128 + 100, 128 + 20, 128 + 60), rect(128 + 60.5, 128 + 100, 128 + 62, 128 + 72)] }];
  assert.equal(build(...mixed, 'auto').opening.style, 'open');
  const mixedDoor = build(...mixed, 'doorway');
  assert.deepEqual([mixedDoor.opening.c0, mixedDoor.opening.c1, mixedDoor.opening.s0, mixedDoor.opening.s1], [128 + 60, 128 + 60.5, 128 + 62, 128 + 72]);
  // a rectangle of the same source beyond the face hides that stretch of it (an L shape's inner face)
  const hidden = [{ ...room(1, 1, 0, [20, 60, 20, 50]), rects: [rect(128 + 20, 128 + 60, 128 + 20, 128 + 50), rect(128 + 60, 128 + 70, 128 + 30, 128 + 40)] }, room(1, 1, 1, [60.5, 100, 20, 50])];
  const seen = build(...hidden, 'doorway');
  assert.deepEqual([seen.opening.s0, seen.opening.s1], [128 + 20, 128 + 30]);
  // collinear touching stretches of the same faces merge
  const merged = [{ ...room(1, 1, 0, [20, 60, 20, 50]), rects: [rect(128 + 20, 128 + 60, 128 + 20, 128 + 50), rect(128 + 40, 128 + 60, 128 + 50, 128 + 70)] }, room(1, 1, 1, [60.5, 100, 20, 70])];
  const whole = build(...merged, 'doorway');
  assert.deepEqual([whole.opening.s0, whole.opening.s1], [128 + 20, 128 + 70]);
  // levels -1 and 1 are valid and unsupported
  for (const lv of [-1, 1]) {
    const [A, B] = pair();
    assert.equal(build({ ...A, lv }, B), null);
    assert.equal(build(A, { ...B, lv }), null);
  }
  // absent, undefined and null slopes are flat; every valid slope object is unsupported, whatever its d
  const [A, B] = pair();
  for (const slope of [undefined, null]) assert.ok(build({ ...A, slope }, { ...B, slope }, 'doorway'));
  for (const d of [-0.5, 0, 0.5]) {
    const slope = { axis: 'x', a0: 0, a1: 1, b0: 2, b1: 3, d };
    assert.equal(build({ ...A, slope }, B), null);
    assert.equal(build(A, { ...B, slope: { ...slope, axis: 'z' } }), null);
  }
  // the structure of lv and slope is checked before the level is
  assert.throws(() => build({ ...A, lv: 1, slope: false }, B), isB);
  assert.throws(() => build({ ...A, lv: 1, slope: { axis: 'q', a0: 0, a1: 1, b0: 2, b1: 3, d: 0.5 } }, B), isB);
});

test('opening: malformed metadata rejected', () => {
  assert.equal(typeof D.buildSharedOpening, 'function');
  const [A0, B0] = pair();
  const call = (over = {}) => {
    const A = { ...clone(A0), ...(over.A ?? {}) }, B = { ...clone(B0), ...(over.B ?? {}) };
    return D.buildSharedOpening(over.seed ?? 42, over.a ?? 1, over.b ?? 1, over.k ?? 0, A, B, 'style' in over ? over.style : 'doorway');
  };
  assert.ok(call(), 'the base call is valid');
  const bad = [
    ['style', { style: 'bogus' }], ['style case', { style: 'Open' }], ['style type', { style: 5 }], ['style null', { style: null }],
    ['equal endpoints', { B: { spaceId: A0.spaceId } }],
    ['seed fraction', { seed: 1.5 }], ['seed NaN', { seed: NaN }], ['seed string', { seed: '1' }], ['seed unsafe', { seed: 2 ** 53 }],
    ['a fraction', { a: 1.5 }], ['b NaN', { b: NaN }], ['k negative', { k: -1 }], ['k fraction', { k: 0.5 }], ['k string', { k: '0' }], ['k NaN', { k: NaN }],
    ['prefix', { A: { spaceId: 'v2:space:2,1:r0' } }], ['prefix word', { A: { spaceId: 'x:space:1,1:r0' } }], ['index zero-padded', { A: { spaceId: 'v2:space:1,1:r00' } }],
    ['index negative', { A: { spaceId: 'v2:space:1,1:r-1' } }], ['index fraction', { A: { spaceId: 'v2:space:1,1:r1.5' } }], ['id type', { A: { spaceId: 7 } }],
    ['rects empty', { A: { rects: [] } }], ['rects sparse', { A: { rects: new Array(1) } }], ['rects type', { A: { rects: null } }], ['rect NaN', { A: { rects: [rect(NaN, 188, 168, 208)] } }],
    ['rect off-grid', { A: { rects: [rect(148.25, 188, 168, 208)] } }], ['rect flat', { A: { rects: [rect(148, 148, 168, 208)] } }],
    ['rect outside', { A: { rects: [rect(100, 188, 168, 208)] } }], ['rect field', { A: { rects: [{ x0: 148, x1: 188, z0: 168 }] } }],
    ['ceil NaN', { A: { ceil: NaN } }], ['ceil low', { A: { ceil: 1.5 } }], ['ceil off-grid', { A: { ceil: 3.25 } }], ['ceil string', { A: { ceil: '4' } }],
    ['grid missing', { A: { grid: null } }], ['grid NaN', { A: { grid: { ox: NaN, oz: 0, step: 6 } } }], ['grid off-grid', { A: { grid: { ox: 148.25, oz: 168, step: 6 } } }],
    ['grid step', { A: { grid: { ox: 148, oz: 168, step: 0.25 } } }], ['role', { A: { role: 'bogus' } }], ['role missing', { A: { role: undefined } }],
    ['lv missing', { A: { lv: undefined } }], ['lv null', { A: { lv: null } }], ['lv string', { A: { lv: '0' } }], ['lv NaN', { A: { lv: NaN } }],
    ['lv fraction', { A: { lv: 0.5 } }], ['lv high', { A: { lv: 2 } }], ['lv low', { B: { lv: -2 } }],
    ...[false, true, 0, 1, '', [], {}].map((slope) => [`slope ${JSON.stringify(slope)}`, { A: { slope } }]),
    ['slope axis', { A: { slope: { axis: 'q', a0: 0, a1: 1, b0: 2, b1: 3, d: 0.5 } } }],
    ['slope breaks', { A: { slope: { axis: 'x', a0: 2, a1: 1, b0: 3, b1: 4, d: 0.5 } } }],
    ['slope NaN', { A: { slope: { axis: 'x', a0: 0, a1: 1, b0: 2, b1: 3, d: NaN } } }],
    ['slope Infinity', { B: { slope: { axis: 'x', a0: 0, a1: 1, b0: 2, b1: 3, d: Infinity } } }],
    ['slope missing key', { A: { slope: { axis: 'x', a0: 0, a1: 1, b0: 2, b1: 3 } } }],
    ['slope extra key', { A: { slope: { axis: 'x', a0: 0, a1: 1, b0: 2, b1: 3, d: 0.5, e: 1 } } }],
    ['slope unequal run', { A: { slope: { axis: 'x', a0: 0, a1: 1, b0: 0.5, b1: 3, d: 0.5 } } }],
  ];
  for (const [name, over] of bad) assert.throws(() => call(over), isB, name);
  // the call never mutates its inputs
  const [A, B] = pair(), before = JSON.stringify([A, B]);
  D.buildSharedOpening(42, 1, 1, 0, Object.freeze(A), Object.freeze(B), 'doorway');
  assert.equal(JSON.stringify([A, B]), before);

  // authored plans: the validator separates structure (T) from geometry (R)
  assert.equal(typeof D.fixtureOpeningCluster, 'function');
  const base = D.fixtureOpeningCluster(1, 1);
  const edit = (fn) => { const p = clone(base); fn(p); return p; };
  const door = (p) => p.links[0].opening;
  const typeErrors = {
    'apertures deleted': (p) => { delete door(p).apertures; },
    'apertures empty': (p) => { door(p).apertures = []; },
    'aperture not an object': (p) => { door(p).apertures = [7]; },
    'style auto': (p) => { door(p).style = 'auto'; },
    'style type': (p) => { door(p).style = 3; },
    'opening deleted': (p) => { delete p.links[0].opening; },
    'axis': (p) => { door(p).axis = 'y'; },
    'height string': (p) => { door(p).height = '2'; },
    'link id': (p) => { p.links[0].id = 'v2:dlink:1,1:9'; },
    'kind': (p) => { p.links[0].kind = 'doorway'; },
    'equal endpoints': (p) => { p.links[0].to = p.links[0].from; },
    'dangling endpoint': (p) => { p.links[0].to = 'v2:space:1,1:r9'; },
    'endpoint slope axis': (p) => { p.rooms[0].slope = { axis: 'q', a0: 0, a1: 1, b0: 2, b1: 3, d: 0.5 }; },
    'endpoint slope primitive': (p) => { p.rooms[1].slope = false; },
  };
  for (const [name, fn] of Object.entries(typeErrors)) assert.throws(() => D.validateDistrictPlan(edit(fn), 1, 1), isT, name);
  const geometryErrors = {
    'NaN': (p) => { door(p).c0 = NaN; },
    'Infinity': (p) => { door(p).s1 = Infinity; },
    'off-grid 0.25': (p) => { door(p).c0 += 0.25; },
    'rectangle mismatch': (p) => { p.links[0].rects[0].z0 += 0.5; },
    'rectangle count': (p) => { p.links[0].rects.push(clone(p.links[0].rects[0])); },
    'height 1.5': (p) => { door(p).height = 1.5; },
    'height excessive': (p) => { door(p).height = 4.5; },
    'wrong gap': (p) => { door(p).c1 = door(p).c0 + 1; },
    'open style on a 0.5 gap': (p) => { door(p).style = 'open'; },
    'wrong width': (p) => { door(p).apertures[0].hi = door(p).apertures[0].lo + 5; },
    'jamb under 0.5': (p) => { door(p).apertures[0].lo = door(p).s0; },
    'row count': (p) => { p.links[1].opening.apertures.length = 1; p.links[1].rects.length = 1; },
    'row pier': (p) => { const o = p.links[1].opening; o.apertures[1].lo += 0.5; o.apertures[1].hi += 0.5; },
    'insufficient overlap': (p) => { p.rooms[0].rects[0].x1 -= 0.5; },
    'nonzero endpoint level': (p) => { p.rooms[0].lv = 1; },
    'valid endpoint slope': (p) => { p.rooms[0].slope = { axis: 'x', a0: 0, a1: 1, b0: 2, b1: 3, d: 0.5 }; },
    'grid origin': (p) => { p.links[0].grid.ox += 0.5; },
    'grid step': (p) => { p.links[0].grid.step = 4; },
    'different link over the bridge': (p) => { p.links[2].rects[0] = clone(p.links[0].rects[0]); },
  };
  for (const [name, fn] of Object.entries(geometryErrors)) assert.throws(() => D.validateDistrictPlan(edit(fn), 1, 1), isR, name);
  // a fifth room sits in the 0.5 m solid strip beside the A–B bridge and hangs off A by a passage, so nothing but the third-room check can
  // reject it: it overlaps no room, and every room, link and contact stays valid. `reach` metres of it lie along the bridge's top edge
  const strip = (reach) => edit((p) => {
    const r = p.links[0].rects[0], x = r.x0 + 0.5, top = r.z1 - reach;
    p.rooms.push({ spaceId: 'v2:space:1,1:r4', lv: 0, rects: [rect(x, x + 0.5, top, top + 6)], ceil: 4, role: 'anchor', grid: { ox: x, oz: top, step: 6 } });
    const pass = rect(r.x0, x + 0.5, r.z1 + 2, r.z1 + 4);
    p.links.push({ id: 'v2:dlink:1,1:4', from: p.rooms[0].spaceId, to: 'v2:space:1,1:r4', kind: 'passage', rects: [pass], grid: { ox: pass.x0, oz: pass.z0, step: 6 } });
  });
  assert.ok(D.validateDistrictPlan(strip(-0.5), 1, 1), 'a fifth room 0.5 m clear of the bridge is valid');
  assert.throws(() => D.validateDistrictPlan(strip(0), 1, 1), isR, 'third room abutting the bridge');
  assert.throws(() => D.validateDistrictPlan(strip(1), 1, 1), isR, 'third room under the bridge');
  // a rejected plan reaches no cache, and validation never touches its input
  const rejected = edit(geometryErrors['wrong gap']), snapshot = JSON.stringify(rejected);
  let armed = false;
  const world = new World2(42, { cluster: (a, b) => (armed && a === 1 && b === 1 ? rejected : null) });
  armed = true;
  assert.throws(() => world.districtPlan(1, 1), isR);
  assert.equal(world.districts.has('1,1'), false);
  assert.equal(JSON.stringify(rejected), snapshot);
  // valid endpoint overlap passes, and so does corner-only contact between two links
  const okay = edit((p) => {
    p.links[0].opening.apertures = [{ lo: 128 + 60, hi: 128 + 63 }];
    p.links[0].rects = [rect(128 + 63, 128 + 64.5, 128 + 60, 128 + 63)];
    p.links[0].grid = { ox: 128 + 63, oz: 128 + 60, step: 6 };
    p.links[2].opening.apertures = [{ lo: 128 + 60, hi: 128 + 63 }];
    p.links[2].rects = [rect(128 + 60, 128 + 63, 128 + 63, 128 + 64.5)];
    p.links[2].grid = { ox: 128 + 60, oz: 128 + 63, step: 6 };
  });
  assert.ok(D.validateDistrictPlan(okay, 1, 1));
  // the open boundary fixture: an AC bridge ending flush with the AB bridge shares a positive-length edge with it; one 0.5 m short does not
  const flush = (hi) => {
    const p = clone(D.fixtureOpenBoundaryCluster(1, 1));
    p.links[2].opening.apertures = [{ lo: 128 + hi - 3, hi: 128 + hi }];
    p.links[2].rects = [rect(128 + hi - 3, 128 + hi, 128 + 63, 128 + 64.5)];
    p.links[2].grid = { ox: 128 + hi - 3, oz: 128 + 63, step: 6 };
    return p;
  };
  assert.throws(() => D.validateDistrictPlan(flush(63.5), 1, 1), isR, 'edge contact between two openings');
  assert.ok(D.validateDistrictPlan(flush(63), 1, 1));
  assert.ok(Object.isFrozen(D.validateDistrictPlan(clone(base), 1, 1).links[0].opening));
  // an open link covers its whole contact: a shorter authored span is rejected
  const shortOpen = clone(D.fixtureOpenBoundaryCluster(1, 1)), o = shortOpen.links[0].opening;
  assert.ok(D.validateDistrictPlan(clone(shortOpen), 1, 1));
  o.s0 += 0.5;
  o.apertures[0].lo += 0.5;
  shortOpen.links[0].rects[0] = bridgeOf(o.axis, o.c0, o.c1, o.apertures[0]);
  shortOpen.links[0].grid = { ox: shortOpen.links[0].rects[0].x0, oz: shortOpen.links[0].rects[0].z0, step: 6 };
  assert.throws(() => D.validateDistrictPlan(shortOpen, 1, 1), isR, 'open span shorter than its contact');
  // two contacts on one line, one per direction, never merge: a checkerboard pair has 40 m contacts, not one false 80 m contact (the two z = 40 faces meet different sides)
  const checker = (k, spans) => ({ ...room(1, 1, k, [20, 60, 20, 40]), rects: spans.map(([x0, x1, z0, z1]) => rect(128 + x0, 128 + x1, 128 + z0, 128 + z1)) });
  const cp = checker(0, [[20, 60, 20, 40], [60, 100, 40, 60]]), cq = checker(1, [[20, 60, 40, 60], [60, 100, 20, 40]]);
  const joined = D.buildSharedOpening(42, 1, 1, 0, cp, cq, 'open');
  assert.ok(joined);
  assert.equal(joined.opening.s1 - joined.opening.s0, 40);
});

test('opening: four-link direct share', () => {
  assert.equal(typeof D.fixtureOpeningCluster, 'function');
  assert.equal(typeof D.fixtureOpenBoundaryCluster, 'function');
  const t2 = JSON.stringify(D.fixtureCluster(1, 1)), seam = JSON.stringify(D.fixtureSeamCluster(1, 1));
  const styles = { fixtureOpeningCluster: ['doorway', 'row', 'doorway', 'row'], fixtureOpenBoundaryCluster: ['open', 'open', 'doorway', 'doorway'] };
  for (const name of Object.keys(styles)) {
    const f = D[name](1, 1), t = D.fixtureCluster(1, 1);
    assert.equal(f.rooms.length, 4);
    assert.deepEqual(f.anchors, t.anchors);
    assert.deepEqual(f.rooms.map((r) => [r.spaceId, r.ceil, r.role, r.grid]), t.rooms.map((r) => [r.spaceId, r.ceil, r.role, r.grid]));
    assert.deepEqual(f.links.map((l) => l.id), [0, 1, 2, 3].map((k) => `v2:dlink:1,1:${k}`));
    assert.deepEqual(f.links.map((l) => l.opening.style), styles[name]);
    assert.deepEqual(f.links.map((l) => [l.from, l.to]), t.links.map((l) => [l.from, l.to]));
    const sharedOpeningLinkCount = f.links.filter((l) => l.kind === 'shared-opening').length, totalSourceLinkCount = f.links.length;
    assert.equal(sharedOpeningLinkCount, 4);
    assert.equal(totalSourceLinkCount, 4);
    assert.equal(sharedOpeningLinkCount / totalSourceLinkCount, 1);
    assert.ok(D.validateDistrictPlan(clone(f), 1, 1), `${name} validates`);
    assert.equal(JSON.stringify(D[name](1, 1)), JSON.stringify(f), 'independent calls agree');
    f.rooms[0].rects[0].x0 += 1;   // a fresh object each call: editing one never reaches the next
    assert.notEqual(JSON.stringify(D[name](1, 1)), JSON.stringify(f));
    for (const [q, l] of D[name](1, 1).links.entries()) {
      const rebuilt = D.buildSharedOpening(42, 1, 1, q, D[name](1, 1).rooms[t.links[q].from.slice(-1)], D[name](1, 1).rooms[t.links[q].to.slice(-1)], styles[name][q]);
      assert.ok(rebuilt, `link ${q} builds`);
      assert.equal(JSON.stringify(rebuilt), JSON.stringify(l));
    }
  }
  // the open-boundary fixture is the opening fixture with A and C widened to the cell edge
  const open = D.fixtureOpenBoundaryCluster(1, 1), door = D.fixtureOpeningCluster(1, 1);
  assert.equal(open.rooms[0].rects[0].x1, 128 + 64);
  assert.equal(open.rooms[2].rects[0].x1, 128 + 64);
  assert.equal(open.rooms[1].rects[0].x0, 128 + 64);
  assert.deepEqual(open.rooms[1], door.rooms[1]);
  assert.deepEqual(open.rooms[3], door.rooms[3]);
  // the T2 fixtures are untouched
  assert.equal(JSON.stringify(D.fixtureCluster(1, 1)), t2);
  assert.equal(JSON.stringify(D.fixtureSeamCluster(1, 1)), seam);
  assert.deepEqual(D.fixtureCluster(1, 1).links.map((l) => l.kind), ['passage', 'passage', 'passage', 'passage']);
});

// S2 slice 2: the bridge compiler on the real base World2, over the S1 plan of four planning tiles. The numbers are a measure, not a target
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2, flightH } from '../../js/gen2.js';
import { flightWalk } from '../../js/gen2-routes.js';
import { buildZoningPlan } from '../../js/gen2-zoning.js';
import { tileId, tileCells, tileInputs } from '../../js/gen2-zoning-runtime.js';
import { compilePlan, bridgeContext, physicalRatioPrefilter } from '../../js/gen2-bridge-world.js';
import { compileBridge } from '../../js/gen2-bridge.js';
import { slow } from './slow.mjs';

const SEED = 42, overlap = (a, b, m = 0) => a.x0 - m < b.x1 && b.x0 - m < a.x1 && a.z0 - m < b.z1 && b.z0 - m < a.z1;

test('physical ratio bounds reject only proved impossible intervals',()=>{
  assert.equal(physicalRatioPrefilter({groundLower:126.5,groundUpper:259.903,allLower:126.5,allUpper:223.751,drawn:2.57246}).status,'impossible-low');
  assert.equal(physicalRatioPrefilter({groundLower:500,groundUpper:Infinity,allLower:100,allUpper:120,drawn:3}).status,'impossible-high');
  assert.equal(physicalRatioPrefilter({groundLower:100,groundUpper:Infinity,allLower:100,allUpper:Infinity,drawn:3}).status,'possible-unproven');
  assert.equal(physicalRatioPrefilter({groundLower:285,groundUpper:315,allLower:100,allUpper:100,drawn:3}).status,'possible-unproven');
  assert.throws(()=>physicalRatioPrefilter({groundLower:200,groundUpper:100,allLower:100,allUpper:200,drawn:3}),RangeError);
});

test('candidate soft blockers contain pools and columns while structural blockers stay hard',()=>{
  const hall={id:1,spaceId:'hall',kind:'hall',lv:0,x0:10,x1:50,z0:10,z1:50};
  const window={x0:44,x1:48,z0:20,z1:23},flight={x0:12,x1:16,z0:20,z1:35,hallEntry:{x0:12,x1:16,z0:18,z1:20}};
  const p={ox:0,oz:0,rooms:[hall],pools:[{lv:0,shape:{cx:25,cz:25,hw:2,hd:2}}],columns:[{lv:0,x:40,z:40,r:1}],flights:[flight],voids:[],windows:[{front:window}]};
  const w={plan:()=>p,hallOf:()=>hall,diagonalOf:()=>null},ctx=bridgeContext(w,{Y:{'-1':-6,0:0,1:6},graph:{nodes:new Map()}},[[0,0]]);
  const hard=ctx.hardBlockers('hall'),soft=ctx.softBlockers('hall');
  assert.equal(soft.length,2);assert.ok(hard.some(r=>r.x0===window.x0&&r.z0===window.z0));
  assert.ok(hard.some(r=>r.x0===flight.x0&&r.z1===flight.z1));
  const sorted=rs=>rs.map(r=>JSON.stringify(r)).sort();
  assert.deepEqual(sorted(ctx.blockers('hall')),sorted([...hard,...soft]));
  soft[0].x0=-999;assert.notEqual(ctx.softBlockers('hall')[0].x0,-999);
});

test('split bridge endpoints retain only their own physical floor and every split bit', () => {
  const hall = { id: 1, spaceId: 'hall', kind: 'hall', lv: 0, x0: 10, x1: 50, z0: 10, z1: 50 };
  const voids = [
    { kind: 'split', over: 1, lv: -1, run: 'x', x0: 10, x1: 50, z0: 20, z1: 24 },
    { kind: 'split', over: 1, lv: -1, run: 'z', x0: 30, x1: 34, z0: 10, z1: 50 },
  ];
  const plan = { ox: 0, oz: 0, rooms: [hall], pools: [], flights: [], voids, columns: [], windows: [] };
  const world = { plan: () => plan, hallOf: () => hall, diagonalOf: () => null };
  const ctx = bridgeContext(world, { Y: { '-1': -6, 0: 0, 1: 6 }, graph: { nodes: new Map() } }, [[0, 0]]);
  const expected = {
    '00': { x0: 10, x1: 30, z0: 10, z1: 20 }, '01': { x0: 34, x1: 50, z0: 10, z1: 20 },
    '10': { x0: 10, x1: 30, z0: 24, z1: 50 }, '11': { x0: 34, x1: 50, z0: 24, z1: 50 },
  };
  for (const [bits, rect] of Object.entries(expected)) {
    assert.deepEqual(ctx.rects(`hall#split:${bits}`), [rect]);
    assert.ok(ctx.blockers(`hall#split:${bits}`).length >= 2, 'pit blockers must remain');
  }
  assert.deepEqual(ctx.rects('hall'), [{ x0: 10, x1: 50, z0: 10, z1: 50 }]);
  assert.throws(() => ctx.rects('hall#split:0'), TypeError);
  assert.throws(() => ctx.rects('hall#split:0x'), TypeError);
  const copy = ctx.rects('hall#split:01');
  copy[0].x0 = -100;
  assert.deepEqual(ctx.rects('hall#split:01'), [expected['01']]);
});

test('seed42 S1 split endpoint has physical floor instead of an empty adapter', () => {
  const tile = tileId(0, 0), cells = tileCells(tile), inputs = tileInputs(SEED, tile);
  const border = buildZoningPlan(inputs).borders.find((b) => b.id === 'db:z:3,1');
  assert.ok(border);
  const ctx = bridgeContext(new World2(SEED), inputs, cells);
  const id = [border.pair.a, border.pair.b].find((id) => id.includes('#split:'));
  assert.ok(id);
  const rects = ctx.rects(id);
  assert.ok(rects.length > 0, id);
  assert.ok(rects.every((q) => q.x1 > q.x0 && q.z1 > q.z0));
  assert.ok(ctx.blockers(id).length > 0);
});

test('upper bridge blockers occupy the requested floor instead of every horizontal projection', () => {
  const hall = { id: 1, spaceId: 'hall', kind: 'hall', lv: 0, x0: 10, x1: 50, z0: 10, z1: 50 };
  const low = { x0: 12, x1: 15, z0: 12, z1: 25 }, high = { x0: 30, x1: 33, z0: 12, z1: 25 };
  const lowVoid = { x0: 12, x1: 20, z0: 30, z1: 35 }, highVoid = { x0: 30, x1: 38, z0: 30, z1: 35 };
  const plan = { rooms: [hall], pools: [], flights: [{ ...low, lo: -1, hi: 0 }, { ...high, lo: 0, hi: 1 }],
    voids: [{ ...lowVoid, lv: -1 }, { ...highVoid, lv: 0 }], columns: [] };
  const ctx = bridgeContext({ plan: () => plan, hallOf: () => hall, diagonalOf: () => null }, { Y: {}, graph: { nodes: new Map() } }, [[0, 0]]);
  assert.deepEqual(ctx.upper(1), [high, highVoid]);
  assert.deepEqual(ctx.upper(-1), [low, lowVoid]);
  assert.deepEqual(ctx.upper(0), [{ x0: 10, x1: 50, z0: 10, z1: 50 }, low, high, lowVoid, highVoid]);
});

test('bridge search corpus preserves prior bridges and geometry across eight seeds', slow, () => {
  const before = new Set([
    '1 zt:1,-1 db:x:5,-4', '1 zt:-1,0 db:z:-3,0', '3 zt:-1,-1 db:z:-2,-4',
    '42 zt:-1,0 db:x:-3,0', '99 zt:1,-1 db:z:7,-4', '1234 zt:0,0 db:x:0,0',
    '1234 zt:0,0 db:z:3,1', '1234 zt:-1,0 db:x:-4,3', '20261024 zt:-1,0 db:z:-3,0',
  ]);
  const counts = {}, accepted = new Set();
  for (const seed of [1, 2, 3, 7, 42, 99, 1234, 20261024]) {
    for (const tile of [tileId(0, 0), tileId(-1, -1), tileId(1, -1), tileId(-1, 0)]) {
      const cells = tileCells(tile), inputs = tileInputs(seed, tile), world = new World2(seed);
      const plan = buildZoningPlan(inputs), ctx = bridgeContext(world, inputs, cells);
      const results = compilePlan(world, inputs, cells, plan).results;
      for (const r of results) {
        const kind = r.status === 'accepted' ? 'accepted' : r.reason;
        counts[kind] = (counts[kind] ?? 0) + 1;
        if (r.status !== 'accepted') continue;
        accepted.add(`${seed} ${tile} ${r.borderId}`);
        const upper = ctx.upper(r.floor), [a, passage, b] = r.parts;
        for (const part of [a, b]) {
          assert.ok(ctx.rects(part.room).some((q) => part.flight.x0 >= q.x0 && part.flight.x1 <= q.x1 && part.flight.z0 >= q.z0 && part.flight.z1 <= q.z1));
          assert.ok(!ctx.blockers(part.room).some((q) => overlap(part.flight, q, 1 - 1e-9)));
          assert.ok(!upper.some((q) => overlap(part.flight, q)));
        }
        assert.ok(!overlap(a.flight, b.flight));
        assert.ok(!passage.rects.some((q) => upper.some((u) => overlap(q, u, 1 - 1e-9))));
        assert.ok(r.length.physical >= r.length.window[0] - 1e-9 && r.length.physical <= r.length.window[1] + 1e-9);
      }
    }
  }
  for (const id of before) assert.ok(accepted.has(id), `lost prior bridge ${id}`);
  assert.ok(accepted.size > before.size, 'the corpus must gain a legal bridge');
  console.log(`# bridge search corpus ${JSON.stringify(counts)}`);
});

test('bridge diagnostics are deterministic and do not change compilation', () => {
  const tile = tileId(-1, 0), inputs = tileInputs(SEED, tile), cells = tileCells(tile);
  const ctx = bridgeContext(new World2(SEED), inputs, cells);
  for (const border of buildZoningPlan(inputs).borders) {
    const a = {}, b = {}, plain = compileBridge(border, ctx);
    assert.deepEqual(compileBridge(border, ctx, a), plain);
    assert.deepEqual(compileBridge(border, ctx, b), plain);
    assert.deepEqual(a, b);
    assert.ok(a.a.scanned >= a.a.legal1F);
    assert.ok(a.b.scanned >= a.b.legal1F);
    assert.ok(a.clearLines >= 0 && a.pairs >= 0);
  }
});

test('every accepted S1 border compiles or is refused with a named reason; an accepted one is clear and inside its rooms', () => {
  const total = { accepted: 0 };
  let borders = 0;
  const built = [];
  for (const tile of [tileId(0, 0), tileId(-1, -1), tileId(1, -1), tileId(-1, 0)]) {
    const world = new World2(SEED), cells = tileCells(tile), inputs = tileInputs(SEED, tile), plan = buildZoningPlan(inputs);
    const ctx = bridgeContext(world, inputs, cells), { results, counts } = compilePlan(world, inputs, cells, plan);
    borders += plan.borders.length;
    assert.equal(results.length, plan.borders.length);
    for (const [k, v] of Object.entries(counts)) total[k] = (total[k] ?? 0) + v;
    for (const r of results) {
      if (r.status === 'accepted') built.push(`${tile} ${r.borderId}`);
      if (r.status !== 'accepted') { assert.ok(['geometry-conflict', 'ratio-unbuildable'].includes(r.reason), r.reason); continue; }
      const [pa, pp, pb] = r.parts, upper = ctx.upper(r.floor);
      for (const [part, room] of [[pa, pa.room], [pb, pb.room]]) {
        assert.ok(ctx.rects(room).some((q) => part.flight.x0 >= q.x0 && part.flight.x1 <= q.x1 && part.flight.z0 >= q.z0 && part.flight.z1 <= q.z1), `${r.borderId}: flight inside ${room}`);
        assert.ok(!ctx.blockers(room).some((b) => overlap(part.flight, b, 1 - 1e-9)), `${r.borderId}: flight clear of the blockers`);
      }
      for (const part of [pa, pb]) {   // review F1, F2: the stair reads as a game stair, and stands clear of the upper floor
        const w = flightWalk(part.flight);
        assert.ok(Math.abs(flightH(part.flight, ...w.from) - world.Y[0]) < 1e-9 && Math.abs(flightH(part.flight, ...w.exit) - world.Y[r.floor]) < 1e-9, `${r.borderId}: stair heights`);
        assert.ok(!upper.some((u) => overlap(part.flight, u)), `${r.borderId}: stair clear of the ${r.floor} floor`);
      }
      assert.ok(!pp.rects.some((q) => upper.some((u) => overlap(q, u, 1 - 1e-9))), `${r.borderId}: passage clear of the ${r.floor} floor`);
      assert.ok(r.length.physical >= r.length.window[0] - 1e-9 && r.length.physical <= r.length.window[1] + 1e-9);
      assert.ok(Math.abs(r.length.ratio - plan.borders.find((b) => b.id === r.borderId).ratio) <= 0.15 + 1e-6);
    }
  }
  console.log(`# S1 accepted borders over 4 tiles: ${borders}; compiled ${JSON.stringify(total)}`);
  // review F3: the walk over the borders must not pass with no bridge built. This border is the one that builds on seed 42; the others may change with the geometry
  assert.ok(built.includes('zt:-1,0 db:x:-3,0'), `built: ${built.join('; ')}`);
  assert.equal(Object.values(total).reduce((t, n) => t + n, 0), borders);
});

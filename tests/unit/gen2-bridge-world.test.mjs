// S2 slice 2: the bridge compiler on the real base World2, over the S1 plan of four planning tiles. The numbers are a measure, not a target
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../../js/gen2.js';
import { buildZoningPlan } from '../../js/gen2-zoning.js';
import { tileId, tileCells, tileInputs } from '../../js/gen2-zoning-runtime.js';
import { compilePlan, bridgeContext } from '../../js/gen2-bridge-world.js';

const SEED = 42, overlap = (a, b, m = 0) => a.x0 - m < b.x1 && b.x0 - m < a.x1 && a.z0 - m < b.z1 && b.z0 - m < a.z1;

test('every accepted S1 border compiles or is refused with a named reason; an accepted one is clear and inside its rooms', () => {
  const total = { accepted: 0 };
  let borders = 0;
  for (const tile of [tileId(0, 0), tileId(-1, -1), tileId(1, -1), tileId(-1, 0)]) {
    const world = new World2(SEED), cells = tileCells(tile), inputs = tileInputs(SEED, tile), plan = buildZoningPlan(inputs);
    const ctx = bridgeContext(world, inputs, cells), { results, counts } = compilePlan(world, inputs, cells, plan);
    borders += plan.borders.length;
    assert.equal(results.length, plan.borders.length);
    for (const [k, v] of Object.entries(counts)) total[k] = (total[k] ?? 0) + v;
    for (const r of results) {
      if (r.status !== 'accepted') { assert.ok(['geometry-conflict', 'ratio-unbuildable'].includes(r.reason), r.reason); continue; }
      const [pa, pp, pb] = r.parts, upper = ctx.upper(r.floor);
      for (const [part, room] of [[pa, pa.room], [pb, pb.room]]) {
        assert.ok(ctx.rects(room).some((q) => part.flight.x0 >= q.x0 && part.flight.x1 <= q.x1 && part.flight.z0 >= q.z0 && part.flight.z1 <= q.z1), `${r.borderId}: flight inside ${room}`);
        assert.ok(!ctx.blockers(room).some((b) => overlap(part.flight, b, 1 - 1e-9)), `${r.borderId}: flight clear of the blockers`);
      }
      assert.ok(!pp.rects.some((q) => upper.some((u) => overlap(q, u, 1 - 1e-9))), `${r.borderId}: passage clear of the ${r.floor} floor`);
      assert.ok(r.length.physical >= r.length.window[0] - 1e-9 && r.length.physical <= r.length.window[1] + 1e-9);
      assert.ok(Math.abs(r.length.ratio - plan.borders.find((b) => b.id === r.borderId).ratio) <= 0.15 + 1e-6);
    }
  }
  console.log(`# S1 accepted borders over 4 tiles: ${borders}; compiled ${JSON.stringify(total)}`);
  assert.equal(Object.values(total).reduce((t, n) => t + n, 0), borders);
});

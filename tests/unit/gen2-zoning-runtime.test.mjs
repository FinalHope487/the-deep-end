// S2 slice 1: the fixed planning domain. A border decision is a function of (seed, border id) alone (js/gen2-zoning-runtime.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../../js/gen2.js';
import { borderId, parseBorderId, borderDrawn, buildZoningPlan, collectZoningInputs, validateZoningPlan } from '../../js/gen2-zoning.js';
import {
  TILE_DISTRICTS, tileId, parseTileId, districtTile, tileOf, isTileEdge, tileCells,
  planTile, tileInputs, zoningDecision, clearZoningCache, createZoningProvider,
} from '../../js/gen2-zoning-runtime.js';

const SEED = 42;
// every border (both axes) named by districts -4..7: crosses tiles -1..1 in both directions, tile edges included
const ids = [];
for (let b = -4; b <= 7; b++) for (let a = -4; a <= 7; a++) ids.push(borderId('x', a, b), borderId('z', a, b));
const decideAll = (order, decide = (id) => zoningDecision(SEED, id)) => new Map(order.map((id) => [id, JSON.stringify(decide(id))]));
// a fixed shuffle (no Math.random: a failing order must repeat)
const shuffled = (xs) => { const out = [...xs]; let s = 12345; for (let k = out.length - 1; k > 0; k--) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; const j = s % (k + 1); [out[k], out[j]] = [out[j], out[k]]; } return out; };

let reference;
const ref = () => (reference ??= (clearZoningCache(), decideAll(ids)));

test('tileOf: floor division, right for negative districts', () => {
  assert.equal(TILE_DISTRICTS, 4);
  assert.equal(tileOf(borderId('x', 0, 0)), tileId(0, 0));
  assert.equal(tileOf(borderId('x', 2, 3)), tileId(0, 0));
  assert.equal(tileOf(borderId('x', 4, 0)), tileId(1, 0));
  assert.equal(tileOf(borderId('x', -1, 0)), tileId(-1, 0));
  assert.equal(tileOf(borderId('x', -4, -4)), tileId(-1, -1));
  assert.equal(tileOf(borderId('x', -5, -1)), tileId(-2, -1));
  assert.equal(tileOf(borderId('z', -1, -5)), tileId(-1, -2));
  assert.equal(tileOf(borderId('z', 7, 8)), tileId(1, 2));
  assert.deepEqual(parseTileId(tileId(-3, 5)), { ti: -3, tj: 5 });
  assert.throws(() => parseTileId('db:x:0,0'), TypeError);
  assert.deepEqual(districtTile(-1, -4), { ti: -1, tj: -1 });
  assert.deepEqual(districtTile(-5, 3), { ti: -2, tj: 0 });
});

test('tileCells: the 8 x 8 cells of the tile, whole districts, negative tiles included', () => {
  for (const [ti, tj] of [[0, 0], [-1, -1], [2, -3]]) {
    const cells = tileCells(tileId(ti, tj));
    assert.equal(cells.length, 64);
    assert.equal(new Set(cells.map(([i, j]) => i + ',' + j)).size, 64);
    for (const [i, j] of cells) assert.deepEqual(districtTile(Math.floor(i / 2), Math.floor(j / 2)), { ti, tj });
  }
});

test('isTileEdge: a border whose two districts lie in two tiles', () => {
  assert.equal(isTileEdge(borderId('x', 3, 0)), true);
  assert.equal(isTileEdge(borderId('x', -1, 2)), true);
  assert.equal(isTileEdge(borderId('x', 2, 3)), false);   // the z index does not matter for an x border
  assert.equal(isTileEdge(borderId('x', 0, 0)), false);
  assert.equal(isTileEdge(borderId('z', 0, 3)), true);
  assert.equal(isTileEdge(borderId('z', -4, -1)), true);
  assert.equal(isTileEdge(borderId('z', 3, 2)), false);
});

test('owner: both districts of a border are in the owner tile, or the owner holds the first one and the border is a tile edge', () => {
  for (const id of ids) {
    const { axis, a, b } = parseBorderId(id);
    const first = districtTile(a, b), second = axis === 'x' ? districtTile(a + 1, b) : districtTile(a, b + 1);
    const owner = tileOf(id);
    assert.equal(owner, tileId(first.ti, first.tj), id);
    if (isTileEdge(id)) assert.notEqual(owner, tileId(second.ti, second.tj), id);
    else assert.equal(owner, tileId(second.ti, second.tj), id);
  }
});

test('a decision names its owner, and a tile edge or an undrawn border is never accepted', () => {
  let seen = { accepted: 0, rejected: 0, 'tile-edge': 0, undrawn: 0 };
  for (const id of ids) {
    const d = JSON.parse(ref().get(id));
    assert.equal(d.borderId, id);
    assert.equal(d.owner, tileOf(id), id);
    seen[d.status]++;
    if (isTileEdge(id)) assert.equal(d.status, 'tile-edge', id);
    else if (!borderDrawn(SEED, id)) assert.equal(d.status, 'undrawn', id);
    else assert.ok(['accepted', 'rejected'].includes(d.status), `${id}: ${d.status}`);
    if (d.status === 'accepted') { assert.equal(d.record.id, id); assert.equal(d.reason, undefined); }
    else assert.equal(d.record, undefined);
    if (d.status === 'rejected') assert.equal(typeof d.reason, 'string');
  }
  assert.ok(seen.accepted > 0 && seen.rejected > 0 && seen['tile-edge'] > 0 && seen.undrawn > 0, JSON.stringify(seen));
});

test('the same decision in every query order and cache state', () => {
  const base = ref();
  clearZoningCache();
  assert.deepEqual(decideAll([...ids].reverse()), new Map([...base].reverse()), 'reverse order, fresh cache');
  assert.deepEqual(decideAll(shuffled(ids)), new Map(shuffled(ids).map((id) => [id, base.get(id)])), 'shuffled, warm cache');
  clearZoningCache();
  assert.deepEqual(decideAll(shuffled(ids).reverse()), new Map(shuffled(ids).reverse().map((id) => [id, base.get(id)])), 'shuffled the other way, fresh cache');
  for (const id of ids.filter((_, k) => k % 6 === 0)) { clearZoningCache(); assert.equal(JSON.stringify(zoningDecision(SEED, id)), base.get(id), `${id} alone, cleared cache`); }
});

test('a cache that holds one tile gives the same decisions as one that holds all', () => {
  const tiny = createZoningProvider((seed) => new World2(seed), { maxTiles: 1 });
  const some = shuffled(ids).filter((_, k) => k % 3 === 0);   // every query may rebuild a tile: keep the run short
  assert.deepEqual(decideAll(some, (id) => tiny.zoningDecision(SEED, id)), new Map(some.map((id) => [id, ref().get(id)])));
  assert.ok(tiny.cacheSize() <= 1);
});

test('another seed gives its own decisions', () => {
  const other = ids.filter((id) => !isTileEdge(id)).map((id) => JSON.stringify(zoningDecision(SEED + 1, id)));
  const same = ids.filter((id) => !isTileEdge(id)).map((id) => ref().get(id));
  assert.notDeepEqual(other, same);
});

test('undrawn and tile-edge borders are answered without building a world', () => {
  const none = createZoningProvider(() => { throw new Error('no world needed'); });
  let n = 0;
  for (const id of ids) {
    if (!isTileEdge(id) && borderDrawn(SEED, id)) continue;
    assert.equal(JSON.stringify(none.zoningDecision(SEED, id)), ref().get(id), id);
    n++;
  }
  assert.ok(n > 100);
  assert.equal(none.cacheSize(), 0);
});

test('a bad border id is refused', () => {
  assert.throws(() => zoningDecision(SEED, 'db:x:1'), TypeError);
  assert.throws(() => tileOf('nope'), TypeError);
});

test('an accepted record is the tile plan border and passes validateZoningPlan on that tile\'s inputs', () => {
  for (const tile of [tileId(0, 0), tileId(-1, -1), tileId(1, -1), tileId(-1, 0)]) {
    const { plan } = planTile(SEED, tile), inputs = tileInputs(SEED, tile);
    assert.deepEqual(validateZoningPlan(inputs, plan), { ok: true, problems: [] }, tile);
    assert.equal(inputs.borders.length, 24, tile);
    assert.ok(inputs.borders.every((b) => tileOf(b.id) === tile && !isTileEdge(b.id)), tile);
    const accepted = ids.filter((id) => tileOf(id) === tile).map((id) => JSON.parse(ref().get(id))).filter((d) => d.status === 'accepted');
    const byId = (x, y) => (x.id < y.id ? -1 : 1);
    assert.deepEqual(accepted.map((d) => d.record).sort(byId), [...plan.borders].sort(byId), tile);
  }
});

// S2 slice 1 review F1: a caller must not be able to change what the cache answers
test('the cached entry is frozen and the inputs a caller gets are its own copy', () => {
  const tile = tileId(0, 0), mine = ids.filter((id) => tileOf(id) === tile);
  const answers = () => JSON.stringify(mine.map((id) => zoningDecision(SEED, id)));
  clearZoningCache();
  const before = answers(), entry = planTile(SEED, tile);
  assert.throws(() => { entry.plan = { borders: [], rejected: [] }; }, TypeError);
  assert.throws(() => { entry.plan.borders.push({}); }, TypeError);
  assert.throws(() => { entry.inputs = null; }, TypeError);
  const inputs = tileInputs(SEED, tile), nodes = inputs.graph.nodes.size;
  inputs.graph.nodes.clear(); inputs.graph.edges.length = 0; inputs.borders.length = 0;
  const again = tileInputs(SEED, tile);
  assert.equal(again.graph.nodes.size, nodes);
  assert.ok(again.graph.edges.length > 0 && again.borders.length === 24);
  assert.equal(answers(), before);
  clearZoningCache();
  assert.equal(answers(), before);
});

test('a tile plan is the S1 plan of its 8 x 8 cells of the base world', () => {
  const tile = tileId(-1, 1), world = new World2(SEED), inputs = collectZoningInputs(world, tileCells(tile));
  assert.equal(JSON.stringify(planTile(SEED, tile).plan), JSON.stringify(buildZoningPlan(inputs)));
});

test('one tile builds in well under 10 s (the measure for docs/decisions)', () => {
  clearZoningCache();
  const t = performance.now();
  planTile(SEED, tileId(5, -7));
  const ms = performance.now() - t;
  console.log(`# one tile (4 x 4 districts, 8 x 8 cells), World2 + inputs + plan: ${ms.toFixed(0)} ms`);
  assert.ok(ms < 10000, `${ms} ms`);
});

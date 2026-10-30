// S1 cross-floor topology plan: border choice, ratio sampling, cut and bridge on the route graph (js/gen2-zoning.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../../js/gen2.js';
import { CORPUS } from '../../js/gen2-measure.js';
import { graphDistances, routePairs, routeGraph3D, summarizePairs } from '../../js/gen2-routes.js';
import {
  ZONING, borderId, parseBorderId, sampleRatio, borderDrawn, drawFloor, stairExcess, shortestPath,
  collectZoningInputs, buildZoningPlan, applyZoningPlan, validateZoningPlan, summarizeZoning, measureZoningCorpus, formatZoning, zoningPairVariants,
} from '../../js/gen2-zoning.js';

const node = (x, z, floor = 0) => ({ anchor: [x, z], floor });
const edge = (a, b, length) => ({ id: `${a}-${b}`, a, b, length });
const Y = { '-1': -7, 0: 0, 1: 7 };
const always = { drawn: () => true, ratioFor: () => 3, floorFor: () => 1 };

// Two districts side by side, the border at x = 100 and z from 0 to 200 (border "db:x:0,0"). A and B stand 80 m apart across it and
// are joined by the one link `AB` through the border. Their sides are also joined to P and Q (a way round 300 m long: 110 + 80 + 110)
// that stand off the line A to B, so the way round lies outside the fan.
const ring = (extra = {}) => ({
  seed: 5,
  Y,
  graph: {
    nodes: new Map(Object.entries({ A: node(60, 100), B: node(140, 100), P: node(60, 210), Q: node(140, 210), ...extra })),
    edges: [edge('A', 'B', 80), edge('A', 'P', 110), edge('P', 'Q', 80), edge('Q', 'B', 110)],
  },
  borders: [{ id: borderId('x', 0, 0), axis: 'x', a: 0, b: 0, line: 100, span: [0, 200], edgeIds: ['A-B'] }],
});
const plan1 = (inputs, options = {}) => buildZoningPlan(inputs, { ...always, ...options });

test('S2 pair variants preserve the S1 draw and cut and rebuild valid joint records', () => {
  const inputs=ring(),s1=plan1(inputs),before=structuredClone(s1);
  const variants=[...zoningPairVariants(inputs,s1.borders[0])];
  assert.ok(variants.length>=2);
  for(const v of variants){
    assert.equal(v.borderId,s1.borders[0].id);assert.equal(v.graphRecord.ratio,s1.borders[0].ratio);
    assert.deepEqual(v.graphRecord.closedPorts,s1.borders[0].closedPorts);
    assert.deepEqual(v.graphRecord.closedNodes,s1.borders[0].closedNodes);
    assert.deepEqual(validateZoningPlan(inputs,{version:1,seed:inputs.seed,borders:v.jointRecords}),{ok:true,problems:[]});
  }
  assert.deepEqual(s1,before);
  assert.deepEqual([...zoningPairVariants(inputs,s1.borders[0])],variants);
  assert.throws(()=>[...zoningPairVariants(inputs,s1.borders[0],[],{maxPairs:0})],TypeError);
});

test('S2 pair enumeration reports its budget instead of claiming all pairs were exhausted',()=>{
  const inputs=ring({C:node(59,100)});inputs.graph.edges.push(edge('C','A',1));
  const record=plan1(inputs).borders[0],job=zoningPairVariants(inputs,record,[],{maxPairs:1});
  let end;
  for(;;){const n=job.next();if(n.done){end=n.value;break;}}
  assert.equal(end?.status,'pair-budget');assert.equal(end.tried,1);
});

test('borderId: one name from either side, and it reads back', () => {
  assert.equal(borderId('x', 2, -3), 'db:x:2,-3');
  assert.deepEqual(parseBorderId('db:z:4,0'), { axis: 'z', a: 4, b: 0 });
  assert.throws(() => borderId('y', 0, 0), TypeError);
  assert.throws(() => parseBorderId('db:x:1'), TypeError);
});

test('sampleRatio: always 2 to 4, the same for the same seed and border, mean and mode near 3', () => {
  const xs = [];
  for (let a = 0; a < 80; a++) for (let b = 0; b < 50; b++) xs.push(sampleRatio(42, borderId('x', a, b)));
  assert.ok(xs.every((r) => r >= ZONING.ratioMin && r <= ZONING.ratioMax));
  assert.equal(sampleRatio(42, 'db:x:3,4'), sampleRatio(42, 'db:x:3,4'));
  assert.notEqual(sampleRatio(42, 'db:x:3,4'), sampleRatio(43, 'db:x:3,4'));
  const mean = xs.reduce((t, r) => t + r, 0) / xs.length;
  assert.ok(Math.abs(mean - 3) < 0.03, `mean ${mean}`);
  const bins = new Array(8).fill(0);
  for (const r of xs) bins[Math.min(7, Math.floor((r - 2) * 4))]++;
  assert.ok(bins[3] + bins[4] > bins[0] + bins[7] + bins[1] + bins[6], `bins ${bins}`);
});

test('borderDrawn and drawFloor: about 20% of borders, floors split evenly, each a function of seed and border only', () => {
  let drawn = 0, up = 0, n = 0;
  for (let a = 0; a < 80; a++) for (let b = 0; b < 50; b++, n++) {
    if (borderDrawn(7, borderId('z', a, b))) drawn++;
    if (drawFloor(7, borderId('z', a, b)) === 1) up++;
  }
  assert.ok(Math.abs(drawn / n - ZONING.borderShare) < 0.03, `drawn ${drawn / n}`);
  assert.ok(Math.abs(up / n - 0.5) < 0.03, `up ${up / n}`);
  assert.equal(borderDrawn(7, 'db:x:1,1'), borderDrawn(7, 'db:x:1,1'));
  assert.ok([-1, 1].includes(drawFloor(7, 'db:x:1,1')));
});

test('stairExcess: more climb, more extra walk, none for no climb', () => {
  assert.equal(stairExcess(0), 0);
  assert.ok(stairExcess(8) > stairExcess(6) && stairExcess(6) > 0);
});

test('shortestPath: the edges of the shortest walk, the same length as graphDistances', () => {
  const g = ring().graph;
  const p = shortestPath(g, 'A', 'B');
  assert.deepEqual(p.edges, ['A-B']);
  assert.equal(p.length, graphDistances(g, 'A').get('B'));
  const cut = { ...g, edges: g.edges.filter((e) => e.id !== 'A-B') };
  assert.deepEqual(shortestPath(cut, 'A', 'B').edges, ['A-P', 'P-Q', 'Q-B']);
  assert.equal(shortestPath(cut, 'A', 'B').length, 300);
  assert.equal(shortestPath(cut, 'A', 'Z'), null);
});

test('cut with detour: the link through the border is closed, a 2F bridge takes its place, 1F still joins A and B', () => {
  const inputs = ring(), plan = plan1(inputs);
  assert.equal(plan.borders.length, 1);
  assert.deepEqual(plan.rejected, []);
  const b = plan.borders[0], g = applyZoningPlan(inputs.graph, plan);
  assert.deepEqual(b.closedPorts.map((c) => c.edgeIds), [['A-B']]);
  assert.equal(b.floor, 1);
  assert.equal(b.ratio, 3);
  const [p] = routePairs(g).filter((q) => q.a === 'A' && q.b === 'B');
  assert.equal(p.l1f, 300);
  assert.ok(Math.abs(p.ratio - 3) <= ZONING.tolerance, `ratio ${p.ratio}`);
  assert.equal(p.cone1F, false);
  assert.equal(p.coneAll, true);
  assert.equal(p.shortcut, true);
  assert.equal(b.verification.l1f, p.l1f);
  assert.equal(b.verification.lAll, p.lAll);
  const witness = shortestPath(g, 'A', 'B');
  assert.deepEqual(witness.edges, b.addedEdges.map((e) => e.id));
  assert.ok(g.nodes.get(b.addedNodes[0].id).floor === 1);
  assert.deepEqual(validateZoningPlan(inputs, plan), { ok: true, problems: [] });
});

test('cut with detour: a basement bridge when the floor draw says so, with the longer climb counted', () => {
  const inputs = ring(), up = plan1(inputs, { floorFor: () => 1 }).borders[0], down = plan1(inputs, { floorFor: () => -1 }).borders[0];
  assert.equal(down.floor, -1);
  assert.ok(down.addedNodes[0].floor === -1);
  assert.equal(up.lengthMin, 80 + 2 * stairExcess(7));
  assert.equal(down.lengthMin, up.lengthMin);
  const tall = { ...inputs, Y: { '-1': -7, 0: 0, 1: 9 } };
  assert.ok(plan1(tall, { floorFor: () => 1 }).borders[0].lengthMin > up.lengthMin);
});

test('the bridge length is the 1F way over the drawn ratio, never a number made up to fit', () => {
  const inputs = ring(), plan = plan1(inputs, { ratioFor: () => 2.5 }), b = plan.borders[0];
  assert.ok(Math.abs(b.lengthBudget - 300 / 2.5) < 1e-9);
  assert.ok(b.lengthBudget >= b.lengthMin && b.lengthBudget - b.lengthMin <= ZONING.slackMax);
  assert.ok(Math.abs(b.addedEdges.reduce((t, e) => t + e.length, 0) - b.lengthBudget) < 1e-9);
});

test('no island: a cut that leaves part of 1F cut off is refused', () => {
  const inputs = ring();
  inputs.graph.edges = inputs.graph.edges.filter((e) => e.id === 'A-B');   // no way round at all
  const plan = plan1(inputs);
  assert.deepEqual(plan.borders, []);
  assert.equal(plan.rejected[0].reason, 'island');
});

test('ratio feasibility: a way round too short for the drawn ratio is refused, not given a shorter bridge than the stairs allow', () => {
  const inputs = ring();
  inputs.graph.edges = inputs.graph.edges.map((e) => (e.id === 'A-P' || e.id === 'Q-B' ? { ...e, length: 50 } : e));   // way round 180 m: needs a 60 m bridge, the stairs need 84 m
  const plan = plan1(inputs);
  assert.deepEqual(plan.borders, []);
  assert.equal(plan.rejected[0].reason, 'ratio-low');
});

test('slack: a way round so long that the bridge would have to wind further than the budget is refused', () => {
  const inputs = ring();
  inputs.graph.edges = inputs.graph.edges.map((e) => (e.id === 'A-P' || e.id === 'Q-B' ? { ...e, length: 250 } : e));   // 580 m round: a 193 m bridge for a 84 m minimum
  const plan = plan1(inputs);
  assert.deepEqual(plan.borders, []);
  assert.equal(plan.rejected[0].reason, 'slack');
});

test('a border with no link in the graph, or none between rooms 64 m apart, gets no bridge', () => {
  const empty = ring();
  empty.borders[0].edgeIds = [];
  assert.equal(plan1(empty).rejected[0].reason, 'no-link');
  const near = ring();   // every room within 64 m of every other: one passage, not a route
  near.graph = { nodes: new Map(Object.entries({ A: node(80, 100), B: node(120, 100), P: node(80, 120), Q: node(120, 120) })), edges: [edge('A', 'B', 40), edge('A', 'P', 30), edge('P', 'Q', 40), edge('Q', 'B', 30)] };
  const plan = plan1(near);
  assert.deepEqual(plan.borders, []);
  assert.equal(plan.rejected[0].reason, 'no-pair');
});

test('a way inside the fan that stays open after the cut means the border is no design', () => {
  const inputs = ring({ R: node(100, 100) });   // R stands on the line A to B, in the fan, and joins both
  inputs.graph.edges.push(edge('A', 'R', 40), edge('R', 'B', 40));
  const plan = plan1(inputs);
  assert.deepEqual(plan.borders, []);
  assert.equal(plan.rejected[0].reason, 'cone-open');
});

test('a connector room goes with the link it was the middle of, and is no end of a pair', () => {
  const k = 'v2:space:x:0,0:connector';
  const inputs = ring({ [k]: node(100, 100) });
  inputs.graph.edges = inputs.graph.edges.filter((e) => e.id !== 'A-B').concat({ id: 'v2:edge:x:0,0:a', a: 'A', b: k, length: 40 }, { id: 'v2:edge:x:0,0:b', a: k, b: 'B', length: 40 });
  inputs.borders[0].edgeIds = ['v2:edge:x:0,0:a', 'v2:edge:x:0,0:b'];
  const plan = plan1(inputs), b = plan.borders[0];
  assert.deepEqual(b.closedNodes, [k]);
  assert.deepEqual(b.closedPorts, [{ connection: 'v2:edge:x:0,0', edgeIds: ['v2:edge:x:0,0:a', 'v2:edge:x:0,0:b'] }]);
  assert.ok(![b.pair.a, b.pair.b].includes(k));
  const g = applyZoningPlan(inputs.graph, plan);
  assert.equal(g.nodes.has(k), false);
  assert.equal(validateZoningPlan(inputs, plan).ok, true);
});

test('a connector room is not the end of a pair: with only it across the border there is no pair to bridge', () => {
  const k = 'v2:space:x:0,0:connector';
  const inputs = ring({ [k]: node(150, 100), B: node(110, 100), P: node(0, 200), Q: node(110, 200) });   // A to B is 50 m: no route; A to the connector is 90 m
  inputs.graph.edges = [{ id: 'v2:edge:x:0,0:a', a: 'A', b: k, length: 40 }, { id: 'v2:edge:x:0,0:b', a: k, b: 'B', length: 40 }, edge('A', 'P', 110), edge('P', 'Q', 50), edge('Q', 'B', 110)];
  inputs.borders[0].edgeIds = ['v2:edge:x:0,0:a', 'v2:edge:x:0,0:b'];
  const plan = plan1(inputs);
  assert.deepEqual(plan.borders, []);
  assert.equal(plan.rejected[0].reason, 'no-cone');
});

test('a pair whose line crosses the border outside its span belongs to another border', () => {
  const inputs = ring();
  inputs.borders[0].span = [300, 400];
  const plan = plan1(inputs);
  assert.deepEqual(plan.borders, []);
  assert.equal(plan.rejected[0].reason, 'no-pair');
});

test('adjacent borders: each fine alone, but both cut 1F in two, so the second is refused as a conflict', () => {
  const g = {
    nodes: new Map(Object.entries({ A: node(60, 100), B: node(140, 100), C: node(60, 300), D: node(140, 300) })),
    edges: [edge('A', 'B', 80), edge('C', 'D', 80), edge('A', 'C', 110), edge('B', 'D', 110)],
  };
  const inputs = {
    seed: 5, Y, graph: g,
    borders: [
      { id: 'db:x:0,0', axis: 'x', a: 0, b: 0, line: 100, span: [0, 200], edgeIds: ['A-B'] },
      { id: 'db:x:0,1', axis: 'x', a: 0, b: 1, line: 100, span: [200, 400], edgeIds: ['C-D'] },
    ],
  };
  for (const border of inputs.borders) assert.equal(plan1({ ...inputs, borders: [border] }).borders.length, 1, border.id);
  const plan = plan1(inputs);
  assert.deepEqual(plan.borders.map((b) => b.id), ['db:x:0,0']);
  assert.equal(plan.rejected.length, 1);
  assert.equal(plan.rejected[0].id, 'db:x:0,1');
  assert.equal(plan.rejected[0].reason, 'conflict');
  assert.equal(validateZoningPlan(inputs, plan).ok, true);
});

test('a later border that lengthens the 1F way of an accepted one breaks its ratio, so it is a conflict', () => {
  // border 1 (A-B) has the way round A-C-D-B (300 m) over border 2's link C-D. With C-D cut as well, 1F still joins everything
  // (round V), but the way round of A and B grows to 470 m: ratio 4.7 against the drawn 3
  const g = {
    nodes: new Map(Object.entries({ A: node(60, 100), B: node(140, 100), C: node(60, 300), D: node(140, 300), V: node(100, 400) })),
    edges: [edge('A', 'B', 80), edge('C', 'D', 80), edge('A', 'C', 110), edge('B', 'D', 110), edge('C', 'V', 125), edge('V', 'D', 125)],
  };
  const borders = [
    { id: 'db:x:0,0', axis: 'x', a: 0, b: 0, line: 100, span: [0, 200], edgeIds: ['A-B'] },
    { id: 'db:x:0,1', axis: 'x', a: 0, b: 1, line: 100, span: [200, 400], edgeIds: ['C-D'] },
  ];
  const inputs = { seed: 5, Y, graph: g, borders }, ratioFor = (id) => (id === 'db:x:0,0' ? 3 : 2.5);
  for (const border of borders) assert.equal(plan1({ ...inputs, borders: [border] }, { ratioFor }).borders.length, 1, border.id);
  const plan = plan1(inputs, { ratioFor });
  assert.deepEqual(plan.borders.map((b) => b.id), ['db:x:0,0']);
  assert.deepEqual(plan.rejected.map((r) => [r.id, r.reason]), [['db:x:0,1', 'conflict']]);
});

test('a bridge that the preferred floor cannot make short enough is tried on the other floor', () => {
  const inputs = ring();
  inputs.Y = { '-1': -5, 0: 0, 1: 20 };   // the climb up is 20 m: its stairs need 91 m of bridge, the climb down needs 83 m
  const plan = plan1(inputs, { ratioFor: () => 3.5, floorFor: () => 1 });   // the 300 m way round over 3.5 is 85.7 m
  assert.equal(plan.borders.length, 1);
  assert.equal(plan.borders[0].floor, -1);
  assert.equal(plan1(inputs, { ratioFor: () => 3.5, floorFor: () => -1 }).borders[0].floor, -1);
});

test('validateZoningPlan: two borders that were fine alone, put in one plan, cut 1F in two', () => {
  const g = {
    nodes: new Map(Object.entries({ A: node(60, 100), B: node(140, 100), C: node(60, 300), D: node(140, 300) })),
    edges: [edge('A', 'B', 80), edge('C', 'D', 80), edge('A', 'C', 110), edge('B', 'D', 110)],
  };
  const borders = [
    { id: 'db:x:0,0', axis: 'x', a: 0, b: 0, line: 100, span: [0, 200], edgeIds: ['A-B'] },
    { id: 'db:x:0,1', axis: 'x', a: 0, b: 1, line: 100, span: [200, 400], edgeIds: ['C-D'] },
  ];
  const inputs = { seed: 5, Y, graph: g, borders }, one = plan1({ ...inputs, borders: [borders[0]] }), two = plan1({ ...inputs, borders: [borders[1]] });
  const both = { ...one, borders: [...one.borders, ...two.borders] };
  const v = validateZoningPlan(inputs, both);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes('more pieces')), v.problems.join('; '));
});

test('validateZoningPlan: a border whose own bridge the shortest walk does not use is refused, even if another bridge gives the same ratio', () => {
  const inputs = ring(), plan = plan1(inputs), copy = JSON.parse(JSON.stringify(plan));
  const [one] = copy.borders, two = JSON.parse(JSON.stringify(one));
  two.id = 'db:x:9,9';
  two.closedPorts = [];
  two.addedNodes[0].id = 'db:x:9,9:bridge';
  two.addedEdges = two.addedEdges.map((e, k) => ({ ...e, id: `db:x:9,9:bridge:${'ab'[k]}`, a: e.a === 'A' ? 'A' : 'db:x:9,9:bridge', b: e.b === 'B' ? 'B' : 'db:x:9,9:bridge' }));
  one.addedEdges.forEach((e) => { e.length *= 10; });   // border 1's own bridge is long: unused
  const more = { ...inputs, borders: [...inputs.borders, { id: 'db:x:9,9', axis: 'x', a: 9, b: 9, line: 900, span: [0, 200], edgeIds: [] }] };
  const v = validateZoningPlan(more, { ...copy, borders: [one, two] });
  assert.equal(v.ok, false);
  assert.ok(v.problems.includes('db:x:0,0: the shortest walk does not use the bridge'), v.problems.join('; '));   // the stretched edges break the recorded budget too
});

test('determinism: the same plan whatever the order of nodes, edges and borders, and the inputs stay as they were', () => {
  const inputs = ring(), before = JSON.stringify([[...inputs.graph.nodes], inputs.graph.edges, inputs.borders]);
  const a = plan1(inputs);
  assert.equal(JSON.stringify([[...inputs.graph.nodes], inputs.graph.edges, inputs.borders]), before);
  const shuffled = { ...inputs, graph: { nodes: new Map([...inputs.graph.nodes].reverse()), edges: [...inputs.graph.edges].reverse() }, borders: [...inputs.borders].reverse() };
  assert.equal(JSON.stringify(plan1(shuffled)), JSON.stringify(a));
  assert.equal(JSON.stringify(plan1(inputs)), JSON.stringify(a));
});

test('an empty plan leaves the graph alone', () => {
  const inputs = ring(), plan = buildZoningPlan(inputs, { drawn: () => false });
  assert.deepEqual(plan.borders, []);
  assert.deepEqual(plan.rejected, []);
  const g = applyZoningPlan(inputs.graph, plan);
  assert.deepEqual([...g.nodes], [...inputs.graph.nodes]);
  assert.deepEqual(g.edges, inputs.graph.edges);
});

test('validateZoningPlan: a plan whose ratio, closed link or bridge was changed is refused', () => {
  const inputs = ring(), plan = plan1(inputs), copy = () => JSON.parse(JSON.stringify(plan));
  const slow = copy(); slow.borders[0].addedEdges[0].length *= 3;
  assert.equal(validateZoningPlan(inputs, slow).ok, false);
  const open = copy(); open.borders[0].closedPorts = [];
  assert.equal(validateZoningPlan(inputs, open).ok, false);
  const lie = copy(); lie.borders[0].verification.lAll = 1;
  assert.equal(validateZoningPlan(inputs, lie).ok, false);
  assert.throws(() => applyZoningPlan(inputs.graph, { borders: [{ closedPorts: [{ edgeIds: ['nope'] }], addedNodes: [], addedEdges: [] }] }), TypeError);
});

test('validateZoningPlan: the numbers and names a border records are checked against the graph, not trusted (S1 review F1)', () => {
  const inputs = ring(), plan = plan1(inputs), copy = () => JSON.parse(JSON.stringify(plan));
  assert.equal(validateZoningPlan(inputs, plan).ok, true);
  const tamper = {
    'recorded ratio': (p) => { p.borders[0].verification.ratio = 999; },
    'length budget': (p) => { p.borders[0].lengthBudget = 1; },
    'length minimum': (p) => { p.borders[0].lengthMin = 1; },
    'slack': (p) => { p.borders[0].slack = 0; },
    'floor of the border': (p) => { p.borders[0].floor = -1; },
    'seed': (p) => { p.seed = 6; },
    'border name': (p) => { p.borders[0].a = 3; },
    'stair climb': (p) => { p.borders[0].stair.dy = 1; },
    // S1 review round 2: the legs of the bridge, not only their sum
    'bridge node a little off the middle': (p) => { p.borders[0].addedNodes[0].anchor = [100, 100.5]; },
    'bridge node far off the middle': (p) => { p.borders[0].addedNodes[0].anchor = [70, 100]; },
    'one leg shorter, the other longer, same sum': (p) => { p.borders[0].addedEdges[0].length -= 30; p.borders[0].addedEdges[1].length += 30; },
    'a leg too short for its climb, same sum': (p) => { p.borders[0].addedEdges[0].length -= 9; p.borders[0].addedEdges[1].length += 9; },   // 41 m for a 40 m run and a 1.9 m climb excess
    'edge direction swapped (same walk)': (p) => { const e = p.borders[0].addedEdges[0]; [e.a, e.b] = [e.b, e.a]; },
    'edge kind': (p) => { p.borders[0].addedEdges[0].kind = 'teleport'; },
    'edge name': (p) => { p.borders[0].addedEdges[0].id = 'some-edge'; },
    'a second bridge node': (p) => { p.borders[0].addedNodes.push({ id: 'extra', floor: 1, anchor: [0, 0] }); },
    'a bridge with one edge only': (p) => { p.borders[0].addedEdges.pop(); },
    'an edge between nodes that are not there': (p) => { p.borders[0].addedEdges.push({ id: 'db:x:0,0:bridge:c', a: 'ghost1', b: 'ghost2', length: 0, kind: 'stair' }); },
  };
  for (const [what, f] of Object.entries(tamper)) {
    const p = copy();
    f(p);
    assert.equal(validateZoningPlan(inputs, p).ok, false, what);
  }
  // a room that is no connector room must not leave the graph with the links of a border
  const room = ring({ X: node(130, 40) });
  room.graph.edges.push(edge('X', 'B', 20));
  room.borders[0].edgeIds = ['A-B', 'X-B'];
  const real = JSON.parse(JSON.stringify(plan1(ring())));
  real.borders[0].closedPorts.push({ connection: 'X-B', edgeIds: ['X-B'] });
  real.borders[0].closedNodes = ['X'];
  assert.equal(validateZoningPlan(room, real).ok, false, 'a real room closed as if it were a connector room');
});

test('stats: borders with a link, borders that can host a bridge, and the draws, drawn or not (S1 review F2)', () => {
  const ok = plan1(ring()).stats;
  assert.deepEqual([ok.linked, ok.eligible, ok.drawn, ok.drawnEligible, ok.accepted], [1, 1, 1, 1, 1]);
  assert.deepEqual(ok.drawnRatios, [3]);
  const island = ring();
  island.graph.edges = island.graph.edges.filter((e) => e.id === 'A-B');
  const s = plan1(island).stats;
  assert.deepEqual([s.linked, s.eligible, s.drawn, s.drawnEligible, s.accepted], [1, 0, 1, 0, 0]);
  const low = ring();
  low.graph.edges = low.graph.edges.map((e) => (e.id === 'A-P' || e.id === 'Q-B' ? { ...e, length: 50 } : e));
  const l = plan1(low).stats;
  assert.deepEqual([l.eligible, l.drawnEligible, l.accepted], [1, 1, 0]);
  assert.deepEqual(l.drawnRatios, [3], 'the draw of a refused border is kept');
  const idle = buildZoningPlan(ring(), { drawn: () => false }).stats;
  assert.deepEqual([idle.eligible, idle.drawn, idle.drawnEligible], [1, 0, 0]);
  assert.deepEqual(idle.drawnRatios, []);
});

test('summarizeZoning: what a plan does to the pairs, and no NaN for an empty plan', () => {
  const inputs = ring(), plan = plan1(inputs), r = summarizeZoning(inputs, plan);
  assert.equal(r.accepted, 1);
  assert.equal(r.shortcutBefore, 0);
  assert.equal(r.shortcut, 1);
  assert.equal(r.cutOff1F, 0);
  assert.deepEqual(r.drawnRatio, [3]);
  assert.ok(Math.abs(r.builtRatio[0] - 3) <= ZONING.tolerance);
  const none = summarizeZoning(inputs, buildZoningPlan(inputs, { drawn: () => false }));
  assert.equal(none.accepted, 0);
  assert.equal(none.shortcut, 0);
  assert.deepEqual(none.slack, []);
});

test('formatZoning: one line per measure, an empty corpus prints zeros', () => {
  const r = measureZoningCorpus({ seeds: [], cells: [] }, () => { throw new Error('no world'); });
  const text = formatZoning(r);
  assert.ok(!/NaN|undefined/.test(text), text);
  assert.equal(text.split('\n').length, 9);
});

// ---- the real world ----
const worldInputs = (seed) => collectZoningInputs(new World2(seed), CORPUS.cells);

test('World2: the plan does not depend on the order of the sample cells or on a warm district cache', () => {
  const cold = JSON.stringify(buildZoningPlan(worldInputs(42)));
  const w = new World2(42);
  for (const [i, j] of [...CORPUS.cells].reverse()) w.plan(i, j);   // plans built in the other order first
  const warm = JSON.stringify(buildZoningPlan(collectZoningInputs(w, [...CORPUS.cells].reverse())));
  assert.equal(warm, cold);
});

test('World2 adapter: every district border inside the sample, named once, with the links through it', () => {
  const inputs = worldInputs(1);
  assert.equal(inputs.borders.length, 24);
  assert.equal(new Set(inputs.borders.map((b) => b.id)).size, 24);
  for (const b of inputs.borders) {
    assert.ok(b.edgeIds.length <= 4, b.id);
    for (const id of b.edgeIds) assert.ok(inputs.graph.edges.some((e) => e.id === id), id);
  }
  assert.ok(inputs.borders.some((b) => b.edgeIds.length > 0));
  const again = worldInputs(1);
  assert.deepEqual(again.borders, inputs.borders);
});

test('World2: at least one border of the corpus gets a cross-floor shortcut, and the plan checks out on the real graph', () => {
  let accepted = 0;
  for (const seed of CORPUS.seeds.slice(0, 3)) {
    const inputs = worldInputs(seed), plan = buildZoningPlan(inputs), g = applyZoningPlan(inputs.graph, plan);
    assert.deepEqual(validateZoningPlan(inputs, plan), { ok: true, problems: [] }, `seed ${seed}`);
    accepted += plan.borders.length;
    const base = summarizePairs(routePairs(inputs.graph)), now = summarizePairs(routePairs(g));
    assert.equal(base.shortcut, 0);
    assert.equal(now.cutOff1F, 0, `seed ${seed}: 1F still joins every pair`);
    if (plan.borders.length) assert.ok(now.shortcut > 0, `seed ${seed}`);
  }
  assert.ok(accepted > 0);
});

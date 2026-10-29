# S2 bridge slot search

## Decision

- Scan flight positions at Q2 (0.5 m), not 1 m.
- Reject stairs that intersect the target floor before the candidate limit.
- Keep the nearest 24 unique exits. Add at most 24 exits across four orientation groups and distance quantiles.
- Keep the existing stair, entry, clearance, passage, and ratio rules.
- Add optional diagnostic counters to compileBridge. Diagnostics do not change its result.
- Clip split hall floors to every region bit, in routeGraph3D cell and void order. Keep pit blockers.
- Include existing flights and voids in upper-floor blockers only on floors they occupy.
- Do not enable the compiler in the game.

## Evidence

The baseline command `npm run test:unit` passed 403 tests, failed zero, and skipped 17 slow tests.
Two new regressions failed before the search change. They cover a sole half-metre lane and upper-floor blockers over the nearest slots. Both pass after the change.

The fixed sample uses seeds 1, 2, 3, 7, 42, 99, 1234, and 20261024. Each seed uses tiles (0,0), (-1,-1), (1,-1), and (-1,0).

| Compiler result | Before | Slot search | With adapter fixes |
|---|---:|---:|---:|
| S1 candidates | 86 | 86 | 86 |
| Compiled | 9 | 13 | 14 |
| Geometry conflict | 65 | 60 | 51 |
| Ratio unbuildable | 12 | 13 | 21 |

All nine prior compiled borders still compile. Each bridge is checked alone. This does not prove that bridges can coexist or that a Player can walk them.

Seed 42 remains at one compiled bridge out of ten. The remaining results are:

| Tile | Border | Remaining limit |
|---|---|---|
| (0,0) | z:1,0 | Clear paths exceed the ratio window |
| (0,0) | z:2,2 | No clear straight slot in either endpoint |
| (0,0) | z:3,1 | Split floor is 210 square metres; all 408 sampled straight slots hit 1F blockers |
| (-1,-1) | x:-2,-4 | Clear paths exceed the ratio window |
| (-1,-1) | x:-3,-1 | Small endpoint has no straight slot |
| (-1,-1) | x:-4,-2 | 483 square metre hall has no clear straight slot |
| (1,-1) | x:6,-3 | Small endpoint has no straight slot |
| (1,-1) | z:6,-4 | Small endpoint has no straight slot |
| (-1,0) | x:-4,1 | Neither endpoint has a clear straight slot |

The bounded search does not prove that every possible passage fails. The compiler still supports straight flights in single rectangles and a fixed set of passage bends.

The split adapter tests failed before the fix. The tests cover a real seed 42 endpoint and all four regions of two perpendicular cuts. Invalid region bits fail explicitly. Returned rectangles cannot mutate later results.

The floor blocker test failed before the fix. It checks B1, 1F, and 2F with separate stairs and voids. A void occupies lv and lv+1. A flight occupies lo through hi.

The scratch report calls its old capped 1F slot count nearest1FSlots. The compiler counters include the upper-floor prefilter. Do not confuse the two counts.

Final verification on 2026-10-30:
- npm run test:fast: 409 unit tests passed, zero failed, 18 slow tests skipped; 12 smoke tests passed. Exit 0.
- node --env-file=tests/slow.env --test tests/unit/gen2-bridge-world.test.mjs: six tests passed. Exit 0.
- All 86 descriptors and diagnostic records match with reversed seed, tile, and cell query order.
- Full unit, full desktop e2e, FPS, and physical-device tests were not run. The game does not load the bridge compiler.

Two old test fixtures depended on the former candidate limit. The impossible-length fixture now uses 10,000 m, beyond its two 30 m rooms and 40 m jogs. The bidirectional height fixture requests orientation coverage. Their rejection and height assertions remain.

## Cost to reverse

Revert the search change and its tests. No saved data or default world layout changes.

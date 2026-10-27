# v2 cross-floor topology plan (S1) · 2026-10-28

Code: `js/gen2-zoning.js`. Report: `node tools/gen2-zoning.mjs` (add `--json`; about 8 s). Tests: `tests/unit/gen2-zoning.test.mjs` (31, all fast tier).
S1 builds a blueprint on the S0 route graph (`docs/gen2-route-baseline.md`). It adds no floor, stair, door or collision. It is not loaded by the game, and `World2` does not read it. Stage S2 builds the blueprint.

## What a plan says

On some district borders, the 1F link between two far rooms A and B is closed and a bridge through 2F or B1 takes its place. For that pair:

- The line A to B and the fan of ±25° round it have no 1F way.
- A way inside the fan exists on another floor, and it is the shortest way.
- 1F still joins A and B by a longer way round, and 1F stays in the same pieces as before.
- The 1F way over the any-floor way (`l1f / lAll`) is a drawn ratio from 2 to 4 (triangular, mode 3). The bridge length is a target budget: the 1F way over that ratio. S1 checks a lower bound from stair physics. S1 does not prove that this length can be built. S2 must build the bridge and measure the real walk.

## How a border is chosen

| Step | Rule |
|---|---|
| Border | A border between two districts of 2 × 2 cells. `db:x:a,b` is the border of districts (a, b) and (a + 1, b). `db:z:a,b` is the border of (a, b) and (a, b + 1). The sample holds 24 borders per seed |
| Draw | A border draws a bridge with probability `ZONING.borderShare` (0.20). The draws for the draw, the ratio and the floor use their own salts (9101 to 9104). They depend on seed and border only, so no planning order moves them |
| Cut | All links through the border close (its two cell edges; a connector room closes with them) |
| Pair | A 1F room before the border and one after it, 64 to 160 m apart, with the line between them crossing the border inside its span. A connector room is no end of a pair. Pairs go in an order drawn from seed and ids |
| Checks | Before the cut a 1F way exists inside the fan. After the cut 1F has the same pieces, the pair is still joined on 1F, and no 1F way inside the fan remains |
| Bridge | A node on 2F or B1 at the middle of A and B, two stair edges. Length `l1f / ratio`. The lower bound is the Manhattan distance A to B plus two stair excesses (`stairExcess`, slope 0.6). Below that the pair is refused (`ratio-low`). More than `slackMax` (40 m) above it the pair is refused (`slack`); the slack is reserved length, not a built corridor. The other floor is tried when the drawn one fails |
| Order | Borders go in id order. An accepted border changes the graph the next one sees. A border that fails after an accepted one, but works alone, is a `conflict`. An accepted border whose ratio moves by more than 0.15 is also a conflict |

`validateZoningPlan` checks a plan again on its graph and does not trust what the plan records. It checks: the seed and the border name; every link exists; a closed node is a connector room; 1F pieces are the same; the ratio of each pair is within 0.15 of its draw; no fan way on 1F; a fan way on any floor; the shortest any-floor walk uses the border's own bridge. It also works out again the floor of the bridge nodes, the climb, the lower bound, the length budget, the slack and the recorded verification (including its ratio). A bridge must be one node at the middle of A and B and two stair edges (`<id>:bridge:a`, `<id>:bridge:b`), and each edge must be at least as long as its horizontal run plus the stair excess. A plan with an edge to a missing node is refused, not thrown on.

## Result (seeds 1, 2, 3, 7, 42, 99, 1234, 20261024; 4 × 4 districts each)

| Measure | Value |
|---|---|
| Borders in the sample | 192, all with a link |
| Eligible (some pair across the border passes the cut and fan checks on the base graph, whatever ratio is drawn) | 192 (100%) |
| Drawn | 35 (18.2%); all 35 eligible |
| Accepted | 26 (13.5% of the eligible and of all borders, 74.3% of the drawn) |
| Rejected | 9: 7 `ratio-low`, 2 `conflict` |
| Bridge floor | 2F 9, B1 17 |
| Ratio drawn, every drawn border | min 2.06 · p25 2.53 · median 2.88 · p75 3.27 · max 3.78 |
| Ratio drawn, accepted borders | min 2.06 · p25 2.45 · median 2.77 · p75 3.10 · max 3.56 |
| Bridge slack beyond its lower bound | min 0.3 · median 18.8 · max 38.9 m |
| Route pairs after the plan | 17,043 (S0: 18,232). The closed connector rooms are gone, and each was an end of many pairs |
| Shortcut pairs | 0 before, 187 after (1.1% of the pairs) |
| Ratio over all 187 shortcut pairs | min 1.01 · median 2.02 · p75 2.45 · max 3.56 |
| Pairs cut off on 1F | 0 |

Every border is eligible, so the loss is not structural. It comes from the ratio check (7 of 9 refusals) and from conflicts between borders (2 of 9). The accepted share (13.5%) is below the aim of about 20%, so S1 does not meet its target. The share of draws does not fix this: with `borderShare` 0.25, 0.30 and 0.35 the accepted share was 15.1%, 17.2% and 17.2%, because more draws mean more conflicts.

## What S1 does not show

- The accepted ratios lean low against the draws (median 2.77 against 2.88, max 3.56 against 3.78). The stairs refuse the high draws: such a draw needs a bridge shorter than its stairs allow. The 1F way round is too short for large ratios. A larger ratio needs a longer 1F detour (S2 and S3 can cut more links or lengthen the way).
- B1 gets 17 of 26 bridges, 2F gets 9. The floor draw is 50/50. The B1 climb is shorter (Y of B1 is 6 to 8 m, of 2F 6.5 to 9 m), so the fallback takes B1 more often. The floor shares of S4 may need a weight here.
- The ratio is computed on room anchors and straight hops. S2 must show it with a walk that uses the real body.
- The sample is finite (4 × 4 districts). A border at the sample edge is not in the plan, because both districts must be in the sample. The plan does not prove connectivity of the unbounded world.
- The lengths are budgets, not built corridors (see "What a plan says"). The 40 m slack is reserved, and a corridor may not fit it.
- 187 shortcut pairs are 1.1% of the pairs. The pairs of a border with a bridge use it, and the count follows the 26 bridges.

## What S2 must build

- The closed links (`closedPorts`): seal the corridor, or the connector room (`closedNodes`) with it, so no door leads to a wall.
- The bridge: an entry stair, a corridor of length `lengthBudget` (it may wind up to `slack` m), an exit stair. A stair uses the real flight geometry (`flightWalk`) and must not cut a pool, a hall or a flight that exists.
- Every closed link and bridge must leave 1F joined and the bridge walkable by the real body (`Player`) both ways. If the geometry does not fit, report the border as refused. Do not keep a graph edge that no body can walk.

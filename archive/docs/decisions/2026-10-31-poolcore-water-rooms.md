# 2026-10-31 · Poolcore water rooms for v2

## Decision

The user ruled on ten items, one by one. All apply to the v2 generator (`?gen=v2`) only.

| # | Ruling |
|---|---|
| 1 | Remove the random ellipse from the ordinary pool shapes. Keep the ellipse geometry for item 2. |
| 2 | Add a round-pool hall: a true circle pool at the exact centre of a big rectangular hall. The user's condition: the generator must have a method that makes sure this room can be generated. A chance draw that skips on failure is not enough. |
| 3 | Add a `fullFlood` room type. First version: B1 basement only. |
| 4 | Full-flood water, pool floor and collision use one dedicated geometry. No dry rim, no widened ordinary pool. |
| 5 | Straight stairs and switchback stairs end directly in the water. |
| 6 | The existing round columns may stand in full-flood water. No new organic columns. |
| 7 | Bright tile lighting for Poolcore rooms only. The rest of B1 stays dark. |
| 8 | Flooded corridors: B1, same 64 m cell only. |
| 9 | A real spiral stair into the shallow room. Special column room only. Do it after the core water work. |
| 10 | Solid railings with collision on named deep-pool rooms only. |

Plan and phases: `docs/handoff/poolcore-water-plan.md`. Authorization covers planning and this record. The user has not started implementation.

## Basis

- Reference images from the user (Poolcore halls) and the ChatGPT research chat of 2026-10-31.
- Code facts checked: `js/gen2.js:351,360` (ellipse in `makeShape2`), `js/gen2.js:23` (`POOL_MARGIN` 2.5), `js/gen2.js:1326` (columns refuse a pool), `js/gen2.js:1409` (`railHit`), `js/gen2.js:620-624` (`ownHall`: half sides 10 to 25 m).

## Choices made for the user (not ruled by the user)

- The method for item 2 is a ChatGPT proposal: a fixed 16-cell search, a hash-ordered pick, one fixed fallback hall at cell (2,0), and a hard reserve against S2 and S3. Hall minimum 32 x 32 m and radius 6 m are first guesses. The user asked for the guarantee, not for these numbers.
- The user's earlier idea gave a radius of 4 to 8 m. The plan fixes 6 m first.
- The 10 % rate for `fullFlood` and the depth 0.35 to 0.55 m are first values. Measure, then tune.

## Cost to reverse

- Nothing is built yet. Cost now: delete this file and the plan file.
- After building: each phase is its own commit. `git revert` the phase. Item 2 changes one fixed district (1,0) in the fallback case, so a revert restores that district. No save format changes.

## Phase A built (items 1 and 2)

The user authorized Phase A only ("開始 Phase A", 2026-10-31). Phases B to E stay unauthorized.

| Point | What was built |
|---|---|
| Item 1 | `withoutEllipse(k)` in `js/gen2.js` maps the old ellipse band [0.48, 0.7) onto rect 20 : rrect 28 : blob 16 : L 14. A pool that drew rect, rrect, blob or L keeps its shape. |
| Item 2 | `World2.roundHall()` orders the 16 cells (i 2..5, j 0..3) by `hash2(seed, i, j, 7900)`. The first plain own hall with both sides at least `roundHallMin` (32 m) wins. The pick draws nothing from any cell stream. |
| Fallback | No natural hall: the fixed hall x 144..176, z 16..48 in cell (2,0). District (1,0) becomes legacy (no giant hall, no L hall, no cluster). |
| Pool | One true circle, radius 6 m, depth 0.6 m, at the exact hall centre. Flag `landmark: true`. |
| Reserve | A 18 m square (pool plus 3 m ring) is free of flights, voids, windows, ladders, columns and other rooms. S3 never cuts the hall (`isSpecialHall`). S2 bridges treat the square as a hard blocker (`js/gen2-bridge-world.js`). An S2 reservation never removes the pool. Injected `bridgeParts` whose ground-floor room, flight or hall entry take the square make `plan()` throw `RoundPoolReserveError` (found by the Codex adversarial review). |
| Option | `roundHallMin` (World2 constructor) sets the hall minimum. Tests use 1000 to force the fallback. |

Review: Codex adversarial review (2026-10-31) returned one finding, the missing `RoundPoolReserveError`. It was real; the test was written first and failed, then the guard was added. No other finding.

Measured: seeds 1..256 all have a round-pool hall; at least 180 find a natural one (test floor). Tests: `tests/unit/gen2-round-hall.test.mjs`, 7 tests.

### Choices made for the user

- The remap in `withoutEllipse` keeps every non-ellipse pool unchanged. The user ruled "remove the ellipse", not how to share its odds.
- Depth 0.6 m is a first value.
- The guarantee does not hold when the caller injects a `cluster` factory. `roundHall()` then returns `null`. The factory owns the districts, so the generator cannot promise a hall.
- "Other cells stay unchanged" is not true: the fallback changes district (1,0) for the seeds that use it.

### Lost bridge

Seed 1234 puts its round pool in the middle of the hall of bridge `zt:0,0 db:x:0,0`. A pool blocks the walk, so S2 refuses that bridge (`ratio-unbuildable`). It left the pin list in `tests/unit/gen2-bridge-world.test.mjs`. The corpus still gains legal bridges (16 accepted).

### Baseline re-pin

Removing the ellipse and adding the landmark change the plan of 271 of 512 sampled cells. The old fixture `tests/fixtures/gen2-district-baseline.json` was re-pinned on purpose. The report text also changed. Older tests that pinned incidental layouts were rewritten to assert the public contract (level filters, option off, fallback district counted as legacy).

### Cost to reverse

`git revert` the Phase A commit. The fixture goes back with it. The save format does not change (`js/main.js:313`: seed, position, visited). A v2 save re-draws the world from its seed, so a saved position can land in a changed layout; v2 is not the default generator.

## Phase B built (items 3 and 4)

The user authorized Phase B only ("開始 Phase B", 2026-10-31). Phases C to E stay unauthorized.

| Point | What was built |
|---|---|
| Item 3 | `World2.addFlood(plan)` runs at the end of `addHallFeatures`. A B1 basement floods when its own stream `hash2(seed, i, j, 7600 + id)` draws below `FLOOD_SHARE` (0.1). Option `floodShare` (World2 constructor) sets the share; 0 turns the feature off. |
| Eligibility | `kind: 'basement'`, `lv: -1`, no `slope`, `opening`, `span`, `elevation`, and no shaft room overlapping. |
| Record | The room gets `fullFlood: { depth, floor, water }`. `depth` is 0.35 to 0.55 m (2 decimals). `water = Y[-1] - WATER_DROP`, `floor = water - depth`. Only a plan with a flooded room has `plan.floods` (room ids). Other plan hashes do not change. |
| Override | A flood removes the pools and columns of level -1 that overlap the room. A pool-shaped flood leaves a dry rim because `poolBox` is widened by `Q2`; the flood is its own geometry. |
| Collision | `World2.floodAt(x, z)` and `candidates()` return `{ h: floor, wl: water }` inside the room. Walk, wade and swim code read it with no other change. |
| Render | `js/mesh2.js` `floodCells()` lowers the floor of every cell of the room, extends the walls down to it, adds risers between flooded and dry or flight cells, and adds one water plane at `water`. |
| Measure | `measurePlan` lists the flooded room as a pool with `shape: 'flood'`. |
| Tests | `tests/unit/gen2-full-flood.test.mjs`, 7 tests: data and share, plan hash unchanged at share 0, determinism, collision grid, real `Player` walk, mesh coverage with no dry floor, measure. |

Measured: 10 seeds, 6 250 cells, 1 781 B1 basements, 192 flooded (10.8 %). Depth range 0.36 to 0.55 m.

### Choices made for the user

- Share 0.1 and depth 0.35 to 0.55 m are first values. The user ruled "about 10 %", not the depth.
- The flood removes corridor pools and columns in the room instead of keeping them. Phase C owns "column stands in water".
- The stair end still steps down about 0.5 m into the water. Phase C owns "stairs go into water".
- The baseline oracle worlds (`gen2-district-baseline.test.mjs`, the explicit-zero test in `gen2-cluster-rooms.test.mjs`, the child process in `gen2-legacy-report.mjs`) run with `floodShare: 0`, so the fixture `tests/fixtures/gen2-district-baseline.json` stays as Phase A left it. The alternative was another re-pin. A re-pin would hide plan changes that are not floods.
- Old tests that assumed a dry basement floor or sampled pools by index were changed to the public contract: the wade test skips showcase rooms (they hold a pool by design), the voids, B1 maze and reach tests read `floodAt(x, z)?.floor`.

### Review (ChatGPT, cold adversarial, 2026-10-31)

Five findings, each checked against the code:

| Finding | Verdict | What was done |
|---|---|---|
| F1 S2 bridge passage injected into a flooded basement | Not reachable. `bridgeContext.upper(floor)` (`js/gen2-bridge-world.js:86`) lists every room of that floor, and the compiler keeps a passage off `upper`. A basement is a B1 room, so no accepted B1 passage overlaps it. Only hand-injected geometry could. | No guard. A caller that injects rooms by hand owns the overlap. |
| F2 `floodAt` is a footprint test; flights win in `candidates()`, mesh and measure | True, and by design. All three skip flight cells. | Comment on `floodAt`. Phase C must not read `floodAt` alone to decide "water here". |
| F3 a flood deletes a whole pool that only touches the room | True. Over 10 seeds at share 1: 826 B1 pools removed, 140 stick out of the flooded room, 238 belong to another room (maze corridors). | Kept: the pool goes whole. Cutting a pool at the room edge leaves a pool and a flood in one cell, which `mesh2.js` has no code for. The test pins the rule. |
| T1 share 0 against 1 strips B1 pools and columns | True. | The test now also checks that B1 pools and columns that do not touch a flooded room stay equal. Mutation (delete all B1 pools) turns it red. |
| T2 no switchback and no S2 overlap test | True. | Open. Phase C changes the stair end, so it adds the switchback case. |

Not found: any change of random draws at `floodShare` 0.

### Cost to reverse

`git revert` the Phase B commit. Set `FLOOD_SHARE` to 0 to switch the feature off without a revert. No save format changes; a v2 save re-draws the world from its seed.

## Rounded-rectangle corner (2026-10-31, user ruling)

The user ruled: the corner of every rounded-rectangle pool is a quarter circle of radius 1 m, for now ("暫定"). `POOL_CORNER_R = 1` in `js/gen2.js`; `makeShape2` sets `s.r` to it.

- The old radius draw stays (only its value is dropped), so no later draw of the cell moves. A check against HEAD over 1 183 cells (7 seeds) showed the plans equal once `r` was set to 1; 471 rounded-rectangle pools changed, nothing else.
- The stadium shape (radius = the short half side) no longer exists. A pool with a short side of 2 m is a rectangle with 1 m corners.
- No test was added: the user ruled "不寫測試直接改". The district baseline fixture was re-pinned (209 of 512 plan hashes; pool area up, walkable area down in the report) because the pinned plans contain the radius.
- Cost to reverse: `git revert` the commit, which brings back the old fixture. Set `POOL_CORNER_R` to another value to retune.

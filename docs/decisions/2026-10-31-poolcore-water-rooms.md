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

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

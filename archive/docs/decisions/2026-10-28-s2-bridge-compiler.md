# S2 slice 2: physical bridge compiler (2026-10-28)

Code: `js/gen2-bridge.js` (pure core), `js/gen2-bridge-world.js` (World2 adapter). Tests: `tests/unit/gen2-bridge.test.mjs` (8), `tests/unit/gen2-bridge-world.test.mjs` (1). The game does not load either file.

## Decision

- `compileBridge(record, ctx)` turns one accepted S1 border into three parts: an entry flight in A, a passage on 2F or B1, an exit flight in B. It returns the descriptor or `{ status: 'refused', reason }` with `geometry-conflict` or `ratio-unbuildable`.
- A flight is a stair of the game: `up`, `lo`, `hi`, `y0 = Y[lo]`, `y1 = Y[hi]` (the `flightH` contract; B1 has `y0 = Y[-1]`). Flights are straight (`flightRun`, `flightWalk`), 3.5 m wide, with 2 m open floor in front of the entry end, 1 m clear of every blocker. A switchback is not tried.
- The passage is an L or a Z with a sideways jog (4 to 40 m). The passage leaves each exit face straight for 1.5 m (half its width) before it may turn. A jog adds twice its size only when it goes away from the shortest path; if both ends share a coordinate it adds nothing on that axis. This is the only winding; a corridor that is too short cannot be wound more.
- Length is a planned geometric walk estimate of the parts, not a walk proved with `Player`. The window is `l1f / (ratio ± 0.15)`, the S1 tolerance. No length is made up.
- A passage is clear when it keeps 1 m from every room, flight and void on its floor, in the sampled cells only. Both new stairs must not overlap any of them (no margin). A passage must not run over a stair along its whole length (`passageHitsFlight`), not at its corners only.
- The walk from an anchor to a flight entry (`reach`) is a Manhattan distance; pools and columns in the room are not routed round.

## What the real world says (seed 42, tiles (0,0) (-1,-1) (1,-1) (-1,0))

S1 accepted 10 borders. After review fixes F1 to F3 the compiler still built 1 (`zt:-1,0 db:x:-3,0`, floor B1, pinned by `tests/unit/gen2-bridge-world.test.mjs`), refused 7 as `geometry-conflict` and 2 as `ratio-unbuildable`.

| Cause | Borders | Note |
|---|---|---|
| Small cluster room as an end (121 to 218 m²) | 4 | 3.5 m by 15 m with 1 m clear and 3 m round every corridor mouth does not fit |
| End in a split hall region | 1 | The adapter gives these regions no rects; the pit is not modelled |
| Large hall as an end | 2 | One giant hall (2,158 m²) and one hall (483 m²) with no slot, though they hold 22 to 24 blockers. Cause not yet found |
| Ratio window | 2 | No clear passage with a walk in the window |

S2 will not reach the S1 share (13.5%) with straight flights placed after the fact. Choices for later slices, not decided here: place the bridge flight before the pools and columns of a room, let S1 pick ends by room size, add a switchback slot, or accept a low share and say so in `docs/gen2-zoning-s2.md`.

## Limits

- The blockers are a model: pools by bounding box, flights with entry, voids, columns, windows, and every non-hall 1F room grown by 3 m. Slice 5 must check the same rules against the real body.
- The upper floor is checked against the sampled cells only. A passage across a cell that is not in the sample is not checked. Slice 6 must plan with all the cells a bridge crosses.
- The new files have no red-first history: the tests were written after the first run of the module.

## Review (ChatGPT, 2026-10-28)

F1 (stair descriptor lacked `up/lo/hi`), F2 (stairs not checked against the upper floor; corner-only test) and F3 (world test could pass with no bridge) were fixed with red tests first.

## Cost to reverse

Two new files and their tests. `git revert` removes them; nothing else imports them.

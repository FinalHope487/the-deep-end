# S2 slice 3: rooms with their own floor height (2026-10-28)

Code: `js/gen2.js` (`roomKey`, `roomFloor`, `candidates`, `headBlockedAt`, `roomAt`, `cellRaster`), `js/mesh2.js` (`buildCell2`), `js/player.js` (`canStand`). Tests: `tests/unit/gen2-elevation.test.mjs`.

## Decision

- A room may have `elevation` (absolute floor height), `nominalLevel` and `clearHeight`. A room without them keeps its floor at `Y[lv]`: all old worlds are unchanged.
- Rooms that share a level and have no elevation share one floor. Each distinct elevation is a floor of its own (`roomKey`).
- Pools, flights, voids, columns and cross-cell steps belong to the floor of their level (no elevation). A room with an elevation is not cut by them, and they are drawn once.
- `buildCell2` draws one pass per `[lv, elevation]`. `roomAt(lv, x, z, elevation)` matches the same floor height, so a neighbour at another height does not open a cell-edge wall.
- `headBlockedAt(x, z, h)` is true when a room with an elevation has its floor above `h` by less than `BODY_H2` (a slab over the head), or when the room of floor `h` has `ceil < BODY_H2`.
- `Player.canStand` picks the landing surface first and tests head room at the landing height, so a step up of less than `STEP2` is walkable.
- `ceil` is the one ceiling height. `clearHeight` is the planner's note of it and no code reads it.

## Limits

- A column does not stand on an elevated floor. Slice 5 must keep the bridge parts clear of columns and pools by planning, not by this code.
- A wall between two floor heights at a cell edge exists on both sides. A door between them is not modelled.

## Review (ChatGPT, 2026-10-28)

S3-F1 (head room tested at the old height), S3-F2 (level-wide pool, flight and void masks reached elevated rooms) and S3-F3 (cross-cell wall ignored elevation) were fixed with red tests first.

## Cost to reverse

`git revert` of the slice 3 commits. Nothing writes `elevation` yet, so no world changes.

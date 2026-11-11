# S2 slice 4: sealing the links a bridge replaces (2026-10-28)

Code: `js/gen2.js` (`World2` option `sealed`, `connectionOf(i, j, axis, raw)`, `diagonalOf`), `js/gen2-seal.js` (`sealOutcome`). Tests: `tests/unit/gen2-seal.test.mjs`.

## Decision

- `new World2(seed, { sealed })` takes a `Set` of connection ids (`v2:edge:<axis>:<i>,<j>`). A sealed corridor or connector room is a `closed` link to `connectionOf` callers. The plan builder builds it like any other link and `dropSealed` takes its rooms out when the plan is done. So the plan stream, the features of the hall, the columns and the slope seeds of the other corridors are the same as without the seal (review S4-F1). The hall keeps a wall where the mouth was.
- Without `sealed` (an empty set) every plan is the same as before.
- `sealOutcome(world, id)` says `sealed`, or refuses with `seam`, `district`, `already-closed` or `unknown-link`. A seam is one shared hall with no wall to close; a district link is a cluster's own passage.
- `diagonalOf` reads the raw links (`connectionOf(..., true)`). Sealing a link does not move or remove a diagonal.

## Limits

- `World2` takes a copy of the set at construction (private field; `world.sealed` returns a copy). Plans are cached, so a set changed later must not reach a built world (review S4-F2).
- Sealing does not check that the two halls stay connected. Slice 6 decides that, with the S1 graph and the bridge together.

## Cost to reverse

`git revert` of the slice 4 commit. Nothing passes `sealed` yet.

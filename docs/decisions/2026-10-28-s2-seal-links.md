# S2 slice 4: sealing the links a bridge replaces (2026-10-28)

Code: `js/gen2.js` (`World2` option `sealed`, `connectionOf(i, j, axis, raw)`, `diagonalOf`), `js/gen2-seal.js` (`sealOutcome`). Tests: `tests/unit/gen2-seal.test.mjs`.

## Decision

- `new World2(seed, { sealed })` takes a `Set` of connection ids (`v2:edge:<axis>:<i>,<j>`). A sealed corridor or connector room is a `closed` link: the same wall the district prune already makes (`closedOf`). Cells build no corridor, mouth or connector-room part there.
- Without `sealed` (an empty set) every plan is the same as before.
- `sealOutcome(world, id)` says `sealed`, or refuses with `seam`, `district`, `already-closed` or `unknown-link`. A seam is one shared hall with no wall to close; a district link is a cluster's own passage.
- `diagonalOf` reads the raw links (`connectionOf(..., true)`). Sealing a link does not move or remove a diagonal.

## Limits

- Sealing a corridor changes the corridor count of a cell, so the slope seed of a later corridor in the same cell changes (`mouths.length` is in its hash). The same holds for the district prune.
- Sealing does not check that the two halls stay connected. Slice 6 decides that, with the S1 graph and the bridge together.

## Cost to reverse

`git revert` of the slice 4 commit. Nothing passes `sealed` yet.

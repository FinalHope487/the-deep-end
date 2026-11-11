# T3 exceptions to the handoff file lists

Source: `docs/handoff/T3-rooms-per-cell.md` sections 2.2 and 5.6.

Cause: `CLUSTER_SHARE=0.5` makes half of the v2 districts production clusters. Two existing tests assumed the all-legacy layout. Section 5.5 needs every verification command to exit 0, so both tests needed a change.

| # | File | Change | Evidence |
|---|---|---|---|
| 1 | `tests/unit/gen2-measure.test.mjs` (not in section 5.6) | Pin `new World2(seed)` to `{ clusterShare: 0 }`. Replace `measureWorld(CORPUS)` with `legacyReport(CORPUS)`. | Without the change, 2 tests fail with `TypeError ... reading 't'` at `js/gen2-measure.js:318`. `roomGraph` reads `gaps` of every link. District-mode links have none by design (section 6.19). |
| 2 | `tests/e2e/gen2.spec.js` (section 2.2 forbidden) | The L hall test boots seed 10 instead of seed 8. Comment updated. | `gen2L` in `js/main.js` found no L hall with an ordinary way in within 8 districts for seed 8 and seed 42. The only seed 8 candidate (district 1,3) has a cluster neighbour now. A Node copy of `gen2L` finds seed 10 at ring 6 (corridor 3.5 m). The test passes with seed 10. |

## Why not other fixes

- `js/main.js` is forbidden too. A wider ring search or a test-only URL option would change shipped code for a test.
- Dropping the L hall e2e test would lose coverage. A new seed keeps the same walk and the same assertions.

## Reversal cost

Low. Both changes touch test inputs only. T1 integration (section 7.4) removes change 1 when `roomGraph` supports district-mode links. Any later change of `CLUSTER_SHARE` or of the cluster layout can move the seed 10 result. Re-run the Node copy of `gen2L` to pick a new seed.

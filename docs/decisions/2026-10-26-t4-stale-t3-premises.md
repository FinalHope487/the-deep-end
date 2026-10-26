# T4 deviations from the handoff premises

Source: `docs/handoff/T4-shared-openings.md` sections 3, 4.1, 4.6 and 6.14. Plan review: ChatGPT, task `c2c_t4a7`.

Cause: the handoff was written before T3 shipped. Four of its premises no longer match `HEAD` (`12da273`).

| # | Handoff text | Fact at `HEAD` | Decision |
|---|---|---|---|
| C1 | Keep `CLUSTER_SHARE=0` and the `null` builder (section 3). | `js/gen2.js:50` is `0.5`. `buildClusterDistrict` returns a real district (`js/gen2-district.js:66`). | Keep T3. T4 adds `buildSharedOpening` and two forced fixtures only. No production selection of openings. |
| C2 | Builder roles are `anchor` or `room` (section 4.1). | The validator accepts `anchor, room, small, medium, main, giant` (`js/gen2-district.js:13`). | Accept the T3 role set in `buildSharedOpening`. Reject any other value. Section 4.1 allows T3 extensions once the validator supports them. |
| C3 | Keep the 512 T2 default hashes (section 6.14). | The T2 oracle already pins `clusterShare:0` (`tests/unit/gen2-district-baseline.test.mjs:19`). Default worlds changed in T3. | The legacy gate is the existing `clusterShare:0` oracle. Do not regenerate it from `new World2(seed)`. |
| C4 | Extend the validator for `shared-opening` beside `passage` (section 4.6). | `checkGeometry` requires one connected rectangle union per link (`js/gen2-district.js:227`). A row has separate aperture rectangles. | `shared-opening` links take their own check branch. The `passage` path stays unchanged. |

## Why not other fixes

- Reverting T3 to satisfy C1 would remove shipped production clusters and break the `clusterShare` tests.
- Relaxing `connected()` for all links (C4) would weaken the T2 `passage` contract.

## Reversal cost

Low. All four decisions are additive. If T5 or T6 changes the share or the role set, update the matching row and its test.

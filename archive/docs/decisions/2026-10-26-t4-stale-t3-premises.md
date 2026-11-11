# T4 deviations from the handoff premises

Source: `docs/handoff/T4-shared-openings.md` sections 3, 4.1, 4.6 and 6.14. Plan review: ChatGPT, task `c2c_t4a7`.

Cause: C1 to C4 come from the handoff being written before T3 shipped (they no longer match `HEAD` `12da273`). C5 and C6 are errors in the handoff text found while building.

| # | Handoff text | Fact at `HEAD` | Decision |
|---|---|---|---|
| C1 | Keep `CLUSTER_SHARE=0` and the `null` builder (section 3). | `js/gen2.js:50` is `0.5`. `buildClusterDistrict` returns a real district (`js/gen2-district.js:66`). | Keep T3. T4 adds `buildSharedOpening` and two forced fixtures only. No production selection of openings. |
| C2 | Builder roles are `anchor` or `room` (section 4.1). | The validator accepts `anchor, room, small, medium, main, giant` (`js/gen2-district.js:13`). | Accept the T3 role set in `buildSharedOpening`. Reject any other value. Section 4.1 allows T3 extensions once the validator supports them. |
| C3 | Keep the 512 T2 default hashes (section 6.14). | The T2 oracle already pins `clusterShare:0` (`tests/unit/gen2-district-baseline.test.mjs:19`). Default worlds changed in T3. | The legacy gate is the existing `clusterShare:0` oracle. Do not regenerate it from `new World2(seed)`. |
| C4 | Extend the validator for `shared-opening` beside `passage` (section 4.6). | `checkGeometry` requires one connected rectangle union per link (`js/gen2-district.js:227`). A row has separate aperture rectangles. | `shared-opening` links take their own check branch. The `passage` path stays unchanged. |
| C5 | Boundary and step faces have the normal "toward the lower sample" (sections 4.8, 6.10, 6.11). | A step face is the wall above the lower ceiling. Only the higher room sees it, and the renderer culls the back. `js/mesh2.js:159` and `tests/unit/gen2-mesh.test.mjs` ("no hole above a corridor mouth") already face it into the higher room. | Face the higher-ceiling room. Ownership stays with the lower-ceiling cell. The mesh tests assert this direction. |
| C6 | `Player.canStand(world,x,z,h)` (section 6.6). | `canStand` is an instance method (`js/player.js:39`). | Tests call `new Player().canStand(...)`. |

## Why not other fixes

- Reverting T3 to satisfy C1 would remove shipped production clusters and break the `clusterShare` tests.
- Relaxing `connected()` for all links (C4) would weaken the T2 `passage` contract.
- Facing the step toward the lower room (C5) would leave a visible hole above every doorway in the taller room.

## Reversal cost

Low. All four decisions are additive. If T5 or T6 changes the share or the role set, update the matching row and its test.

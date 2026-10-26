# T5 deviations from the handoff

Source: `docs/handoff/T5-cluster-topology.md` sections 4.6, 4.7, 5 and 6. Plan review: ChatGPT, task `c2c_t5k2`.

Cause: the handoff fixes private function shapes and black-box tests that cannot all hold together. Each row keeps the contract and changes the smallest detail.

| # | Handoff text | Decision |
|---|---|---|
| D1 | `topologyAnchorMouths(hall,protectedMouths,districtLinks,i,j)` (section 4.7). | Add a sixth argument `cellIds`, the spaceIds of the cell's own source rooms. The caller already builds this set (`js/gen2.js`, `makeClusterPlan`). Without it the function cannot test "owning-cell satellite" from links alone. |
| D2 | Selected-link preflight lists 18 checks (section 4.6). | `assertTopologyLinkGeometry` runs checks 1 to 14 and the connectivity part of 18. Checks 15 to 17 (T4 contact, T4 metadata, T2 seams) stay in `validateDistrictPlan`, which runs next and throws the same classes. |
| D3 | The preflight and the face checks of `topologyAnchorMouths` throw `RangeError('Invalid cluster topology geometry')`. | Both are private. No public input reaches them: `validateDistrictPlan` already rejects every plan they would reject. The handoff bans test-only exports, so no test asserts these throws. Mutation runs prove only the reachable paths. |
| D4 | `protection and error boundaries` derives strips from opening metadata and asserts feature exclusion (section 6.4). | The test does this for all 120 non-start corpus districts (3480 strips) and walks each centreline. Mutants that flip the face side of a strip survive: the generator rarely places a feature on a half-hall strip. The centre-line legs equal the T3 spines, so dropping them is an equivalent mutant. Removing the call is caught by the walk. |
| D5 | `topology: planning order and eviction`, `real body reaches every source` and `eight outer edges and mixed component` are red-first tests. | T2 and T3 already satisfy them, so they pass on arrival. They are regression gates. Red-first evidence exists for the protection test only. |
| D6 | `cluster rooms: selected topology graph` repeats the independent 8810 oracle (section 6.6). | The test checks the graph gates only. The 8810 oracle lives once, in `tests/unit/gen2-cluster-topology.test.mjs`. |

## Reversal cost

Low. D1 and D2 touch two private functions. D3 to D6 change tests only.

**Pinned by**: `topology: protection and error boundaries`, `topology: all selected link geometry`.

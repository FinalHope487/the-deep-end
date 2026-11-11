# 2026-10-28 · S2 plans bridges on fixed 4 x 4 district tiles

Code: `js/gen2-zoning-runtime.js`. Test: `tests/unit/gen2-zoning-runtime.test.mjs`. Source: `work/s2-plan-c2c_5b2e.md` slice 1.

**Decision**
- The world is cut into fixed planning tiles of 4 x 4 districts (8 x 8 cells, the S1 corpus size). Tile id: `zt:<ti>,<tj>`, with `ti = floor(a / 4)`.
- A tile plan is `buildZoningPlan(collectZoningInputs(World2(seed), cellsOfTile))` on the base world. No S2 change is applied before the plan.
- `zoningDecision(seed, borderId)` returns `accepted`, `rejected`, `undrawn` or `tile-edge`, and the owner tile. It depends on seed and border id only.
- A border with its two districts in two tiles (`tile-edge`) is never bridged. Its owner is the tile of district (a, b), so both sides name one owner.
- `undrawn` and `tile-edge` answers build no tile. The cache is bounded (16 tiles, least recently used goes first); an evicted tile is built again with the same result.
- `createZoningProvider(makeWorld)` gives the game a provider by injection. `js/gen2.js` does not import any `gen2-zoning*.js` file.

**Basis**
- S1 `collectZoningInputs` keeps a border only when both districts are in the sample (`js/gen2-zoning.js:344`). A fixed sample is therefore a fixed set of borders.
- S1 draws depend on seed and border only (`js/gen2-zoning.js:45`). The only order-dependent part of S1 is the sequential plan, so the plan needs a fixed domain.
- The cache holds a frozen `{ seed, tile, plan }` only. `tileInputs(seed, tile)` builds a new route graph on every call (a Map and an array cannot be frozen), so slice 2 may change it without touching a decision. Slice 2 caches the graph it needs (review F1).
- Cost per tile (measured 2026-10-28, `World2` + inputs + plan, 24 borders): 110 to 210 ms for inputs and 35 to 90 ms for the plan; one cold tile 140 to 160 ms. The tile test is in the fast tier.

**Limit**
- A plan sees the routes inside its tile only. A route that leaves the tile is unknown here. The S1 ratio and "1F stays joined" hold for the tile, not for the unbounded world.
- Tile-edge borders never get a bridge: 8 of the 32 borders a tile owns (25%). Bridge density is lower near tile lines.
- Slice 6 (atomic acceptance) re-verifies each candidate by walking the real world and refuses it when the real ratio or connectivity fails.

**Cost to reverse**
- A larger tile or a halo changes which borders are bridged for every seed. It touches this file and its test only until slice 7 enables the bridges; after that it changes the world.
- No saved data holds a decision before slice 7.

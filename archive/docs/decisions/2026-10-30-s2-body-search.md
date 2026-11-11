# S2 physical path search

## Decision

- Use `bodyPath` on a real `World2` snapshot.
- Use `Player.canStand` and `Player.step` for each horizontal move.
- Sweep a 0.5 m lattice edge at intervals of at most 0.1 m.
- Keep the actual surface height in each state.
- Use three-dimensional distance for costs and the A* lower bound.
- Check ladder transfers against the same direction constraint.
- Require seven ordered bridge stages. A touched stair is not a crossing.
- Keep only paired split ladders and their narrow bottom crossing in logical 1F.
- Reject an endpoint at the wrong physical height before search.
- Report budget exhaustion and an unproved search boundary separately from unreachable.
- Do not run this synchronous search in the render loop.

## Evidence

- `node --env-file=tests/slow.env --test tests/unit/gen2-bridge-walk.test.mjs`: 12 passed, 0 failed.
- Removing the ladder direction filter makes its regression fail. The source was restored byte for byte.
- The split footprint regression returned `found` before the restriction. It returns `invalid-start` after the restriction.
- The paired split crossing remains reachable. Adjacent ordinary B1 floor is excluded.
- Seed 42 `db:x:-3,0` crosses its full physical bridge independently in both directions.
- A bridge crossing is not atomic acceptance. Final measured ratio, cone, connectivity, and coexistence checks are still required.

## Reversal

Remove the isolated search module and its tests. No default generator or saved data uses this module.

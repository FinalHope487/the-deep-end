# Atomic S2 acceptance

## Decision

- Keep all original S1 border IDs, cuts, and ratio draws.
- Rebuild pair variants through the existing S1 graph checks.
- Apply candidate seals before collecting its physical geometry context.
- Compile against measured 1F distance. Keep the old compiler call unchanged.
- Search cone-compatible slots before candidate truncation.
- Reserve only conflicting 1F pools and columns in a private tentative snapshot.
- Keep room outlines, existing stairs, voids, windows, and open connection mouths.
- Publish seals, bridge fragments, and reservations together. Preserve the old snapshot on refusal.
- Recheck every accepted bridge when a new bridge is proposed.
- Keep both ordinary Player directions and their measured ratios.
- Preserve the original S1 cone rule: neither 1F direction is reachable; at least one all-floor direction is reachable.
- Store both cone results. Do not require a new two-cone rule.

## Global certificate

- Keep physical geometry at least 1 m inside its owner tile.
- Prove the shortest path inside the owner tile.
- Bound every outside route by same-side reflection distances and different-side boundary distances.
- Require the outside lower bound to be no shorter than each measured path.
- Require both complete cone triangles to stay inside the owner tile.
- Return inconclusive when these proofs fail. Do not depend on neighbor activation order.

## Connectivity

- Check surviving entrances assigned to the actual split-region graph node.
- Check the lateral sides of each new stair. Do not select a point under the new stair as an old 1F representative.
- Restrict side representatives to their original half-plane and a 3 m local band.
- Choose the nearest baseline standable point first. Do not retreat to a different island after a failed tentative check.
- Require an unaffected component hub. Use a real Player flood before and after the change.
- Use explicit lv0 pool provenance for wading representatives. Pair the same x/z with each world's own physical height.
- Keep pool depth finite and within 0 to `WADE_MAX`. Never select an arbitrary nearby B1 floor.

## Seed 42 evidence

Fixed corpus: 10 original S1 borders over four tiles.

| Border | Floor | 1F / all-floor, both directions | Ratio | Draw | Outside lower bound | Connectivity points |
|---|---|---|---|---|---|---|
| `db:z:6,-4` | B1 | 208 / 73.034 m | 2.84801 | 2.71887 | 255.5 m | 17 |
| `db:x:-3,0` | B1 | 200 / 76.034 m | 2.63042 | 2.57246 | 200.05311794620948 m | 13 |

Both snapshots passed the owner-bounded verifier. The second uses a pool reservation.
Game wiring and browser acceptance remain separate checks.

## Execution

- Run heavy tile planning in module Workers.
- Send only completed snapshots to the game.
- Package Worker source modules in `dist/js`. Keep the default v1 merged entry unchanged.
- Gate cell activation on completed tile decisions.
- Treat cold preparation time as loading time. Do not claim a frame-rate improvement without browser measurements.

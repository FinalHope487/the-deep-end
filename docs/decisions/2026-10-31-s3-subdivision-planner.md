# S3-1 subdivision planner

## Decision

- Plan sub-rooms in a pure module, `js/gen2-s3-plan.js`. The module does not read World2, the game, or the T3-T6 random streams.
- Seed the planner from (seed, spaceId) with salt 9900. Plan order does not change a result.
- Pick the mode from one draw: below 0.2 none, below 0.9 partial (10-40 % of the hall), else high (60-90 %). This is the 20/70/10 split.
- Do not cut a special hall: any fragment of an L-shaped or giant hall (`span` L or giant), a hall that leaves its cell, a giant-hall (mega) hall, a hall shorter than 14 m on one side.
- Keep every protected rectangle and a 3 m cross through the hall middle clear, with a 1 m margin. `protectedRectsFor` lists the rectangles of a real hall.
- Keep the floor that remains as one connected piece. Drop a candidate that breaks this. The plan may cut less than its mode asks.
- Give each sub-room one portal: a 2 m door with a free 2 m x 2 m approach.
- Do not plan round rooms. The user removed them on 2026-10-31 (see `2026-10-31-s3-2-rect-rooms.md`). Arc doors and disc shapes are rejected by the validator.
- A split-level room rises 0.4 m or 0.8 m (never more than STEP2). It needs a parent ceiling of at least 3.5 m and keeps at least 2.5 m of air.
- `ceil` of a sub-room is the height over the sub-room's own floor. A later slice that uses `headBlockedAt` must add `elevation` to it.
- Keep the data runtime-only. Do not change the save format or the T6 schema. Enable S3 later through a World2 option that is off by default (slice S3-6).

## Evidence and limits

- `tests/unit/gen2-s3-plan.test.mjs`: the S3-1 corpus (8 seeds, 887 halls, 216 cut, mean carved share 0.110); S3-2R changed the placement rules and the numbers.
- The validator is separate from the planner and rejects overlap, outside placement, bad doors, free-standing clusters, over-high steps, off-grid values, and cut protected cells.
- The 887-hall corpus cut rate (24 %) is lower than 80 % because special and small halls stay whole.
- Slices S3-2 to S3-6 need their own authorization. They are not in this decision.
- The user authorized slice S3-1 only, with cylinder rooms in the overall S3, and the ratio and protection rules above (2026-10-31).

## Cost to reverse

- Delete the two files. No runtime code imports them yet. No save data is involved.
- **Pinned**: `tests/unit/gen2-s3-plan.test.mjs`.

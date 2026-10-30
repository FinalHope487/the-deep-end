# S3-1 subdivision planner

## Decision

- Plan sub-rooms in a pure module, `js/gen2-s3-plan.js`. The module does not read World2, the game, or the T3-T6 random streams.
- Seed the planner from (seed, spaceId) with salt 9900. Plan order does not change a result.
- Pick the mode from one draw: below 0.2 none, below 0.9 partial (10-40 % of the hall), else high (60-90 %). This is the 20/70/10 split.
- Do not cut a special hall: any fragment of an L-shaped or giant hall (`span` L or giant), a hall that leaves its cell, a giant-hall (mega) hall, a hall shorter than 14 m on one side.
- Keep every protected rectangle and a 3 m cross through the hall middle clear, with a 1 m margin. `protectedRectsFor` lists the rectangles of a real hall.
- Keep the floor that remains as one connected piece. Drop a candidate that breaks this. The plan may cut less than its mode asks.
- Give each sub-room one portal. A rectangle gets a 2 m door with a free 2 m x 2 m approach. A disc gets one arc whose chord is at least 2.8 m and a free ring sector 2 m deep in front of it, checked in closed form with the 0.4 m body radius (`arcApproachClear`).
- Model cylinder rooms as discs (radius 3 to 5 m, steps of 0.5 m) in the same data. Meshing them is slice S3-4.
- A split-level room rises 0.4 m or 0.8 m (never more than STEP2). It needs a parent ceiling of at least 3.5 m and keeps at least 2.5 m of air.
- `ceil` of a sub-room is the height over the sub-room's own floor. A later slice that uses `headBlockedAt` must add `elevation` to it.
- Keep the data runtime-only. Do not change the save format or the T6 schema. Enable S3 later through a World2 option that is off by default (slice S3-6).

## Evidence and limits

- `tests/unit/gen2-s3-plan.test.mjs`: 17 tests with the slow corpus (8 seeds, 887 halls, 216 cut, mean carved share 0.110).
- The validator is separate from the planner and rejects overlap, outside placement, bad doors, over-high steps, off-grid values, and cut protected cells.
- The 887-hall corpus cut rate (24 %) is lower than 80 % because special and small halls stay whole.
- Slices S3-2 to S3-6 need their own authorization. They are not in this decision.
- The user authorized slice S3-1 only, with cylinder rooms in the overall S3, and the ratio and protection rules above (2026-10-31).

## Cost to reverse

- Delete the two files. No runtime code imports them yet. No save data is involved.
- **Pinned**: `tests/unit/gen2-s3-plan.test.mjs`.

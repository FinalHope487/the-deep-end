# 2026-10-27 · Test tiers

- **Decision**: The default test run is a fast tier. Slow sweeps, visual checks and frame-rate tests leave the default run. No test is deleted. The tier rules live in `docs/testing.md`. AGENTS.md only points there.
- **Reason**: One full verification took about 23 min (unit 9 min, e2e 13.5 min, measured 2026-10-27). Four unit files held 66% of the unit time. Each e2e test costs about 14 s for the page boot. The 16 most recent `fix` commits show that the user found visual bugs in play. Tests were added after, not before.
- **Change**:
  - 17 slow unit cases in 7 files take the `slow` marker (`tests/unit/slow.mjs`). The default run skips them. `npm run test:unit:full` runs them.
  - 12 e2e tests take the `@smoke` tag. The new `smoke` Playwright project runs only those. The `desktop` project still runs all of them.
  - AGENTS.md "Verification" line "run the full suite unless marked" now points to `docs/testing.md`.
- **Measured result**: Fast unit run 83 s (303 passed, 17 skipped). Smoke e2e run 110 s (12 passed). Full runs before the change: unit 548 s, desktop e2e 810 s.
- **Deviation from an earlier decision**: `docs/decisions/2026-10-20-test-cleanup.md` kept W1–W4, B6-1 to B6-5, the UI-inside-screen test and the FPS tests. The user approved the tier plan on 2026-10-27. Those tests now run in the full tier only. They still exist and still pass.
- **What the fast tier does not cover**: Visual look, view-ray checks, long generator walks, frame rate. The user finds these in play. Run the full tier at delivery.
- **Reversal cost**: Low. Remove the `slow` argument and the `@smoke` filter, or run `npm run test:unit:full` and `npm run test:e2e:full`. No product code or save format changed.
- **Open follow-up**: The 17-case list uses a 10 s threshold from one parallel run. Cases in other files that reach 10 s under load were not moved. Re-measure when the fast tier grows past 2 min.

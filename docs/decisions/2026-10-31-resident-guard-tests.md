# Decision: Resident Guard Tests

Date: 2026-10-31
Workspace: dreamcore-explorer
Task: c2c_cs02
Base commit: de4f52e
Status: Approved policy. Execution results are pending.

## Context

The base suite contains:

- 469 Node unit tests in 47 test files.
- 448 fast Node passes and 21 slow skips.
- 67 desktop browser cases, with 65 passes and two skips.
- 12 smoke cases within the browser suite.

Most tests verify a completed feature, a fixed layout, a draw rule, or a specific implementation detail.

These tests are useful during feature development. Many do not have enough future detection value to justify permanent execution.

Large suites slow agent work and make old design choices harder to change.

A green test can still miss a physical, visual, or cross-system defect.

## Decision

Keep nine Node tests and one Chromium test as resident guards.

Retire other permanent tests after feature acceptance.

A resident guard must detect a fault that can make the game unusable, block core play, lose valid progress, or break a release.

The guard must check an observable result.

Do not retain permanent tests for exact room counts, draw shares, decorative values, or completed feature details.

The former N01-N26 permanent retention rule is retired.

## Resident Unit Scope

Seven unit test files contain nine tests.

They protect:

1. Required release build modules.
2. Safe build output paths.
3. Bounded chunk loading.
4. V1 seed and query-order stability.
5. Required v1 objective reachability.
6. Valid save recovery.
7. Default v2 seed stability and safe spawn.
8. V1 and v2 player collision.
9. S2 Planner failure rejection and retry.

The v2 world test uses the production default `CLUSTER_SHARE = 0.5`.

The collision test uses real v1 and v2 worlds.

## Resident Browser Scope

The single Chromium test uses a fresh release build.

It checks:

1. The fresh merged HTML exists.
2. Required release Worker files exist.
3. Chromium can load the merged v1 application.
4. The application reaches its ready state.
5. The player can start the game.
6. Real keyboard input moves the player.
7. Required chunks are loaded.
8. No unhandled page or console errors occur.

The resident browser test does not start v2.

It does not prove that a real v2 Worker can complete cold activation.

This is an accepted reduction to meet the fast commit-check budget.

## Cold Startup and Time Budget

The first consolidated browser test failed before the first v1 ready state.

The observed error was a 15-second `page.waitForFunction` timeout.

That result alone does not distinguish a slow cold startup from a real startup fault.

The original browser helper used a 60-second wait.

The corrected resident browser test waits for the initial HTTP response without waiting for every resource.

It then allows up to 27 seconds for the v1 ready state.

The full browser test still has a 35-second limit.

The resident budgets are:

- Unit: 15 seconds.
- Browser: 35 seconds.
- Combined fast command: 60 seconds.

All limits include process startup and required build work.

The execution owner must record actual wall-clock times.

A timeout or a failed guard is not an accepted result.

Do not increase these limits without a new decision.

## Conditional V2 Browser Acceptance

Real v2 browser activation is not a permanent fast check.

Run a focused real-browser acceptance when a change affects:

- Worker creation, loading, or requests.
- S2 Planner activation.
- V2 chunk or bridge activation.
- V2 game startup.
- V2 save continuation.
- Release paths used by v2 modules.

The acceptance must confirm a ready game, loaded chunks, real input, and no unhandled runtime error.

It can use a longer timeout than the resident browser test.

Remove the test after feature acceptance unless a new decision makes it resident.

## Mutation Evidence

The consolidation requires ten isolated mutations.

They cover:

- Missing release Worker modules.
- Unsafe build output.
- Chunk queue failure.
- V1 query-order instability.
- Blocked v1 objective routes.
- Lost save progress.
- Invalid default v2 spawn.
- Player collision bypass.
- S2 Planner failure handling.
- V1 browser release startup failure.

Each mutation must fail its target test.

Each mutation must be restored.

A mutation result is valid only with its test output and clean source check.

This decision does not claim that pending mutations passed.

## Build Isolation

The browser test builds with an explicit `--out` path.

Each run uses a unique directory under:

    work/.resident-release-*

The existing static server provides HTTP access.

The test does not overwrite `dist/index.html`.

It removes only its test-owned temporary directories.

The shared `work/` directory must remain intact.

The source repository may contain unrelated user changes. Those changes are not part of this decision.

## One-Time Acceptance Policy

A new feature can use temporary unit tests, browser tests, stress tests, or manual checks.

Keep the tests during development and acceptance.

After acceptance, remove them unless they meet all resident guard criteria.

Keep the execution results and Git history.

Do not require full historical regression suites after unrelated changes.

## Known Risks

The resident suite does not give continuous automated coverage for:

1. Long routes across many generated worlds.
2. Mesh gaps, wrong normals, and missing faces.
3. Long-running Worker and cache races.
4. Real v2 browser startup and activation.
5. Special stair, ladder, slide, and water movement.
6. Long-session memory use and frame rate.

Use focused acceptance checks when a change can affect these areas.

Ten green tests do not prove that all generated worlds are valid.

## Reversal Cost

The old tests remain in Git history.

To restore the old suite:

- Restore the retired files.
- Restore the required helpers, fixtures, and scripts.
- Check compatibility with the current world design.
- Update the test policy.
- Run acceptance again.

Old tests may depend on obsolete layouts or options.

Restoring files does not guarantee that they pass.

## Scope and Ownership

Only test files, test configuration, and policy documents may change during consolidation.

Production JavaScript and `tools/build.mjs` stay unchanged.

The existing user files stay unchanged:

- `AGENTS.md`
- `.gitignore`
- `dist/index.html`
- `claude-decisions.json`
- `docs/handoff/T6-link-by-distance.md`
- `docs/handoff/picture-scenes-plan-summary.md`

Claude executes approved content.

ChatGPT writes replacement files and patches.

Claude does not author corrections when a test fails.

## Final Acceptance

Acceptance requires:

- Seven unit test files.
- Exactly nine unit tests.
- One browser test file with exactly one test.
- Ten killed mutations.
- No production mutation left in either working tree.
- All required tests pass.
- Actual timing within the approved limits.
- No references to deleted runtime helpers.
- No change to protected user files.
- No more than two local commits.
- No push.

If any condition fails, report the execution as incomplete.

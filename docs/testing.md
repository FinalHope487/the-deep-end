# Test Policy

This file defines resident guard tests, one-time acceptance tests and retained phase tests.

`AGENTS.md` uses this file for test scope and run commands.

The decision record is `docs/decisions/2026-10-31-resident-guard-tests.md`.

## Resident Guard Criteria

Put a test in the resident guard suite only when all conditions are true.

1. One failure can stop the game, block core play, lose valid progress, or break a release.
2. A change in shared code can cause the failure without a direct edit to the affected feature.
3. The test detects the failure through an observable result.
4. The test meets the commit guard time budget.

Do not put a test in the resident guard suite only because its feature is important.

Do not keep resident guards for exact room shapes, random draw shares, decorative values, visual details, or old implementation choices.

A green test that cannot detect its target fault is not a valid guard.

## Resident Test Inventory

The resident set contains nine Node tests and one Chromium test.

| File | Cases | Protected failure |
|---|---:|---|
| `tests/unit/build.test.mjs` | 2 | Release build loses required modules or overwrites source files |
| `tests/unit/chunks.test.mjs` | 1 | Required chunks never finish loading |
| `tests/unit/world.test.mjs` | 2 | V1 generation changes with query order or required objectives are unreachable |
| `tests/unit/save.test.mjs` | 1 | Valid saved progress is lost or an invalid position is trusted |
| `tests/unit/gen2.test.mjs` | 1 | The default v2 world changes with query order or its spawn is blocked |
| `tests/unit/player.test.mjs` | 1 | A v1 or v2 player enters solid geometry |
| `tests/unit/gen2-s2-client.test.mjs` | 1 | Failed Worker requests cannot reject and recover |
| `tests/e2e/core-release.spec.js` | 1 | A fresh single-file v1 release fails to start or accept player input |

Total: nine Node tests and one Chromium test.

The browser resident test covers the v1 release.

It does not cover v2 browser activation or a real v2 Worker startup.

This is an explicit time-budget reduction.

The unit tests still cover the default v2 spawn, v2 collision, and S2 Planner failure recovery.

Do not describe these unit tests as a substitute for real browser Worker activation.

## Run Commands and Limits

Run the resident suite before each commit:

    npm run test:fast

The command runs:

    npm run test:unit
    npm run test:e2e

The limits include process startup, build time, and browser startup.

| Command | Maximum wall-clock time |
|---|---:|
| `npm run test:unit` | 15 seconds |
| `npm run test:e2e` | 35 seconds |
| `npm run test:fast` | 60 seconds |

The expected result is:

- Node: nine passed, zero failed, zero skipped.
- Chromium: one passed, zero failed, zero skipped.
- Total: ten tests.

For a commit that changes code or behavior covered by a retained phase test, run every affected retained test through its official acceptance command before the commit. Do not commit when a required test fails or has not run.

Before push, confirm that the last green `test:fast` run covers the final source state. Confirm that every affected retained phase test ran after the last code or behavior change that could affect its guarded goal. Run a test again if its evidence is stale. Do not push with a failed or unrun required test. Record actual commands, results and elapsed times. Complete any review the project requires before push. Do not run unrelated slow tests solely for the push.

Do not increase a timeout to hide slow tests.

The browser test uses a fresh release build.

It waits for the real page to become ready.

A page that has not become ready is not a passed browser test.

If the release cannot start within the required time, report the failure.

Do not replace a real boot check with an assertion that only checks the HTML file or HTTP status.

Do not claim compliance without measured wall-clock results.

## One-Time Acceptance Tests

Use a one-time test when a feature change needs proof.

Examples include:

- A new room form.
- A special stair, ladder, or slide.
- A new S2 bridge or S3 room connection.
- A mesh face or visual effect.
- A multi-seed world corpus.
- A GPU or memory performance target.
- A changed save or load flow.
- A v2 browser Worker startup or activation change.

Choose the smallest test that can detect the expected error.

Run it during feature acceptance.

For phase work that adopts the Phase Tests section, follow that section.

For all other work, remove a one-time test after acceptance unless it meets all four Resident Guard Criteria.

Keep the test result and Git history.

Do not require one permanent test for each former N01-N26 invariant.

## Phase Tests

Apply this section to each phase of work whose approved spec or user decision names this section.

Each phase test guards a goal of the approved spec. Keep the test while that goal remains valid. Remove obsolete tests only during the approved phase transition described below.

### Test authorship

Before development of each step, fix the current spec goal and its observable test contract.

Have an independent reviewer write the test before the implementer builds the step. The reviewer is a person or agent other than the implementer.

Require the reviewer to deliver the full test file, the acceptance check identifiers it guards and its SHA-256 hash.

List the guarded check identifiers in each reviewer-written test file.

Save the file exactly as delivered. Verify its SHA-256 before the first run and before the final commit.

Run the test and record the output. Show that the test detects its intended failure.

Do not let the implementer edit a reviewer-written test.

If a test is wrong or unclear, send its check identifier, spec reference and failing output to the reviewer.

Only the reviewer may deliver a corrected test file and new SHA-256. Save that replacement exactly as delivered and verify it before use. Do not remove test coverage to fix an incorrect test.

If the spec rules conflict, stop the affected step and ask the user. Do not change a test to avoid the conflict.

### Retention and execution

Keep each phase test while its guarded goal remains in the effective spec, including goals inherited from earlier phases.

Do not remove a phase test after phase acceptance or because it fails the resident guard criteria.

Put a test in the resident suite only when it meets all four Resident Guard Criteria above and the command time limits above.

Retain other phase tests outside the resident suite. Run them through a separate official acceptance command.

Add that command when the tests are created.

Before phase acceptance, run all applicable retained phase tests and record their results. Follow the Run Commands and Limits section for commit and push checks.

Do not omit a required test because it is slow. Do not increase the resident limits to include it.

Record each test file, check identifier, command, result, elapsed time and execution output.

Keep frame-rate, network-speed and real-browser checks as separate acceptance procedures when they do not meet all four resident criteria. Keep their evidence in the phase report.

### Removal at a phase transition

Do not delete a phase test during a phase or immediately after its acceptance.

Use this order at every transition:

1. Finish the current phase and obtain the user's acceptance.
2. Obtain the user's approval of the changes to the next phase spec.
3. Have the independent reviewer compare every resident and retained phase test with the full approved goals of the next phase, including goals inherited from earlier phases.
4. Have the reviewer identify each test whose guarded goal was removed or contradicted. Keep tests whose goals remain valid. Do not treat an inherited protection as removed only because it is not a new feature.
5. Delete all identified tests before development of the next phase. Do not allow a grace period.
6. Commit the deletions. Record each deleted test and its last run log in a dated decision file.
7. Start the next phase only after the deletions and record are complete.

If a file holds both obsolete and valid test cases, have the reviewer deliver a full replacement file and SHA-256 that keeps the valid cases. Save it as delivered during the phase transition. Record the removed test cases, guarded check identifiers and last run logs. Do not let the implementer author a test change.

## Conditional V2 Browser Acceptance

The resident browser test does not boot v2.

A cold v2 Worker activation can exceed the resident time budget.

Run a separate one-time v2 browser acceptance when a change affects:

- `js/gen2-s2-client.js` or its Worker protocol.
- Worker file paths or module loading.
- The v2 activation and loading flow.
- V2 player movement or chunk loading.
- The release build of v2 modules.
- Save continuation into v2.

Use the real release or source page, as appropriate to the change.

Confirm that v2 becomes ready, can enter play, loads required chunks, and accepts actual movement.

Use a timeout based on the feature acceptance requirements. Do not force this slow acceptance into the 35-second resident browser limit.

Record the actual elapsed time and result.

Remove the one-time test after acceptance.

## Mutation Validation

A resident guard must fail for a representative critical fault.

A mutation audit must:

1. Apply one fault in an isolated worktree.
2. Run the target test.
3. Confirm that the target test fails for the intended reason.
4. Restore the source.
5. Confirm that the target test passes again.
6. Confirm that no production source diff remains.

Do not run two mutations at once.

A killed mutation proves sensitivity to that fault. It does not prove full coverage of all related faults.

The initial consolidation uses ten mutations, M01-M10.

Future commits run the resident suite. They do not repeat all mutations unless a guard changes.

## Safe Release Build Testing

Do not rebuild the user's `dist/index.html` during a Playwright test.

The resident browser test calls `tools/build.mjs` with an explicit `--out` path.

Each run uses a new directory under:

    work/.resident-release-*

The existing `tools/serve.mjs` provides HTTP access.

The test checks the fresh HTML and required Worker files.

It runs the v1 application in real Chromium.

On completion, it removes only its own output directory.

At startup, it may remove old test-owned directories with this prefix directly under `work/`.

The `work/` directory is shared with other project tasks.

Do not remove the entire `work/` directory.

Do not remove unrelated files or directories under `work/`.

Do not move, reset, overwrite, or delete the user's existing `dist/index.html`.

Do not use a Playwright global setup that rebuilds the default `dist/` directory.

## Failure and Recovery

If a resident guard fails, do not commit the result as accepted.

If a browser boot times out, collect page errors, console errors, resource failures, and page state.

Distinguish a real startup error from a slow cold startup when the evidence permits.

Do not claim that a timeout alone proves either cause.

If a test uses an API that does not exist, report the exact error.

Do not skip a resident guard.

Do not change production code to make a test consolidation pass.

Do not silently remove a failure condition.

When execution and planning roles are split, only the planning owner writes corrected test content.

## Manual and Conditional Acceptance

Resident guards do not cover every game feature.

Run a focused acceptance check when a change can affect:

- Long-distance world connections.
- Special stairs, ladders, slides, or water movement.
- Mesh geometry and visible surfaces.
- Long-play resource use.
- Worker races across seed changes.
- Real v2 browser activation.
- Save compatibility beyond the core format.
- Physical-device frame rate and touch input.

Use a real browser for interactive behavior.

Use a real device for physical-device performance claims.

Do not treat a fixed-seed green test as proof that all generated worlds are valid.

## Change and Reporting Rules

Report the commands and actual outputs.

Report pass, fail, and skip counts.

Record the three wall-clock measurements.

Record mutation results and the clean source check.

Record deleted test files and the retained inventory.

Do not report a test as passed unless it ran.

Do not claim v2 browser coverage from the v1 resident test.

Do not modify unrelated user files.

Keep the resident policy small. Any expansion needs a specific game-wide failure and a test that can detect it.

## Retired Test Policy

The former N01-N26 retention rule is retired.

The old smoke, full unit, full desktop, and automatic performance tiers are retired.

Historical test names and results may remain in Git history, handoff documents, and older devlog entries.

Historical references do not make old tests active.

# Decision: V3 Phase Test Policy

Date: 2026-11-05
Workspace: dreamcore-explorer
Status: User-authorized v3 test policy update (2026-11-05)

## Source

The user approved the v3 test lifecycle on 2026-11-05.

The decisions are D10 and D11 in `docs/decisions/2026-11-05-v3-p0-acceptance.md`.

The acceptance rules are CP-25 to CP-27 in `docs/handoff/v3-acceptance-02-early-phases-2026-11-05.md`.

The user then requested an update to `docs/testing.md`.

## Decision

Use the Phase Tests section of `docs/testing.md` as the operating procedure for v3 phase tests.

Apply these approved requirements:

1. Have an independent reviewer write each test from the current spec before implementation.
2. Do not let the implementer edit reviewer-written tests.
3. Retain each test while its guarded goal remains valid.
4. Remove conflicting tests only at an approved phase transition, before development of the next phase.

Keep the existing resident guard criteria and command time limits.

Use two test execution groups:

- Resident tests meet all four resident guard criteria and run through the fast test entry.
- Retained phase tests guard valid v3 goals but do not meet the resident criteria. Run them through a separate official acceptance entry.

Treat this separation as an execution decision, not permission to delete a test.

## Test provenance

Require each reviewer-written test file to name its guarded acceptance check IDs.

Require the reviewer to supply the complete file and its SHA-256 hash.

Verify the delivered bytes before use and before the final commit.

Return an incorrect test to the reviewer with the spec reference and failure output.

Only the reviewer may deliver a corrected test file.

Do not change an acceptance rule to make a test pass.

## Policy compatibility

Keep `docs/decisions/2026-10-31-resident-guard-tests.md` and `docs/decisions/2026-10-27-test-tiers.md` as historical decisions.

Apply the 2026-10-31 one-time removal rule only outside the v3 phases. The later 2026-10-31 consolidation replaces the old 2026-10-27 test tiers.

For v3 phases, the later user decisions D10 and D11 take precedence.

Do not edit the historical decision.

The later user instruction permits the `docs/testing.md` update and the related consistency edits. Record that authorization in D19.

Keep D10, D11 and `AGENTS.md` unchanged. Keep CP-25 to CP-27 as short references to the operating procedure in `docs/testing.md`.

Keep the V2 browser acceptance policy unchanged.

Treat `checks.sh` as a historical test-consolidation check. Do not use it to reject new v3 tests based only on the old test counts.

## Change scope

Update `docs/testing.md` and this decision record. Make only consistency edits to File 02 (CP-25 to CP-27, CP-30, the command legend, P0 allowed paths and P0-R01), File 04 (RG-01, DT-17, DT-31 and test lifecycle), D19 in the P0 decision file, and `README.md` line 35.

Do not change production code, test files, `package.json`, `checks.sh`, `AGENTS.md`, D10, D11 or the historical decision files.

Keep the current test inventory and count unchanged.

Add a separate npm acceptance entry when retained v3 tests are first created.

Do not raise the 15/35/60-second resident test limits.

## Reason

The former one-time removal rule can delete a test while its v3 goal is still valid.

The resident criteria alone do not provide a way to retain a slow but required phase test.

The new policy separates test retention from test execution frequency.

It protects the user's test lifecycle decision without expanding the fast resident suite beyond its time limits.

## Return cost

To restore the former policy, revert the commit or commits that update `docs/testing.md`, this decision record and the related consistency references.

That revert would restore the old after-acceptance removal rule.

It would also remove the v3 reviewer-authorship and phase-transition instructions from the operating procedure.

Do not make that change without a new user decision.

Any retained v3 test files created after this policy must be reviewed separately before removal.

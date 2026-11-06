# V3 P1: user decisions on the plan review

Date: 2026-11-06. Source: the user's answers in chat after ChatGPT review round 7 of the P1 plan returned `VERDICT: NO_ISSUES`.

## Decisions

| ID | Decision | Source rule |
|---|---|---|
| USER-1 | P1-S02 (NP approval) is a P1 to P2 entry gate. P1 can freeze without it. P2 cannot start without it. | P1-S02, Foundation section 7 |
| USER-2 | An NP metric with no v1 or v2 equivalent is labeled "no equivalent". Record a local v3 baseline only. Add phone numbers later. | P1-S01, CP-02, CP-19, CP-29 |
| USER-3 | SC-01B (diagnostic view) has camera fields N/A. SC-01A (v1 page) keeps the camera fields. | CP-02, CP-17, Foundation section 9 |
| USER-5 | Human acceptance of P1 covers the diagnostic view only. Check it once on a computer and once on iPhone Safari. Record the user's own words, date and artifact ID. | CP-13, CP-21, CP-28 |
| USER-4 | P1 may change only the paths in the list below. Any other path is a boundary conflict. | CP-06, CP-09 |

## P1 allowed paths

- `js/v3/core/`, `js/v3/modules/`, `js/v3/entry/`, `js/v3/diagnostic/`, `js/v3/workers/`, `js/v3/package.json`
- `tools/` (extend the existing build and package tools)
- `tests/phase/p1-playwright.config.js`, `tests/fixtures/v3/`
- `docs/phase-reports/p1-report.md`, `docs/measurements/p1/`, `docs/acceptance/p1/`
- `docs/decisions/`, `docs/devlog.md`, `ROADMAP.md` (existing baseline section only)

CP-09 protected paths stay untouched even inside this list.

## Consequences

- P1 freeze no longer waits for NP approval (reverses the rev4 line that made it wait).
- The NP "no equivalent" label needs a one-line note in the P1 report. It is not a PASS (CP-29).
- Reversal cost: low. Each decision changes one gate, one label or one path list.

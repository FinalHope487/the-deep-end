# v3 P1: user check result and NP limits (P1-U01, P1-S02)

Date: 2026-11-07. Source: the user's answers in chat (question by question), then one independent ChatGPT assessment of every click-chosen answer (fresh chat, read-only: `https://chatgpt.com/c/6aee3032-e140-83ee-b4fa-9f48c48aa9e2`; request file `work/c2c_p1npdec-request.md`, git-ignored). Spec: `docs/handoff/v3-acceptance-02-early-phases-2026-11-05.md` section 3 (P1-S02, P1-U01), `docs/decisions/2026-11-06-v3-p1-user-decisions.md` (USER-1, USER-5).

Rule used for the ChatGPT result (user instruction): where ChatGPT gave a clear reason that differs from a click, the agent adopted ChatGPT unless the agent found a check against the code that outweighs it. The agent checked each difference against the code.

## 1. Candidate checked (P1-U01)

| Item | Value |
|---|---|
| Artifact | `p1-r1` |
| Source commit | `602dd180e9f7012d57ee0ed7e5e290d5db882860` |
| Payload hash | `a3f96cb19dde9f6ee5b30bd7351405bf3303f7dc070c2573f9e01230211ec354` |
| URL checked | `https://finalhope487.github.io/the-deep-end/?gen=v3&phase=p1-r1&seed=61` and `https://finalhope487.github.io/the-deep-end/?seed=42` |
| Devices | The user reports one computer check and one iPhone Safari check (USER-5). The agent did not see them |
| Result | PASS (user answer: "通過"). ChatGPT was not asked about this item: it cannot see the pages |
| SC-01A, SC-01B | NOT recorded. The user captures both from the real URLs on the user's own devices and sends them. Freeze of `p1` waits for them |

## 2. NP limits (P1-S02)

Grade A = measured baseline. B = baseline with a margin. C = design value. Baselines: `docs/phase-reports/p1-report.md` section 3. "Basis" shows who set the value: USER = the user's click, ChatGPT = adopted from the ChatGPT assessment.

| ID | Decision | Grade | Basis |
|---|---|---|---|
| NP-01 | Start click to first movement: at most 500 ms on the implementer PC. Phone value needs a phone run | B | USER, ChatGPT agrees |
| NP-02 | Safe start area of at least 900 m2 (30 m by 30 m) of verified walkable tiles. A design floor, not a v1 match | C | USER, ChatGPT agrees |
| NP-03 | No number now. The limit is set from a per-unit p95 after the P2 planner has a loading unit and a measure hook. The limit MUST exist before the P2 check passes. It is a deferred limit, not a waiver | C | USER, ChatGPT agrees. The deadline text is the agent's addition from the ChatGPT conflict note |
| NP-04 | Frame CPU work at most 2 ms mean. Frame duration p99 at most 25 ms. GB-02 (at most 2% of frames above 40 ms) and GB-05 stay in force | B | ChatGPT. The user clicked "no single frame over 25 ms". See section 4 |
| NP-05 | P2 GPU proxy at most 16 MiB. The proxy is not GPU memory | B | USER, ChatGPT agrees |
| NP-06 | Final GPU proxy at most 32 MiB. Each content phase (water, stairs, landmarks) gets its own measured ceiling later | B | ChatGPT. The user clicked "not now" |
| NP-07 | JS heap after `gc()` at most 64 MiB after travel | B | USER, ChatGPT agrees |
| NP-08 | After 3 away and return cycles: same geometry and texture count as the first return, heap growth at most 1 MiB per cycle. v2 does not meet this limit and is not required to; the limit applies to v3 | A for v1, B for v2 | USER, ChatGPT agrees |
| NP-09 | Fixed list of 9 seeds: 1, 2, 3, 7, 42, 99, 1234, 20261024, 61. No re-draw | B | USER, ChatGPT agrees |
| NP-10 | 30 minutes on the PC, 10 minutes on the phone, heap growth under 10% after the first 2 minutes. The run must include repeated passes through the same area with unload and reload. Growth from first visits to new areas is recorded apart | C | ChatGPT. The user clicked "not now" |
| NP-11 | At most 2 Workers on mobile. Adjust after a phone run | B | USER, ChatGPT agrees |

## 3. Other decisions

| ID | Decision | Effect |
|---|---|---|
| A02 | `MAX_QUERY_CELLS` stays 4096 owner cells per `queryWorld` call (`js/v3/core/world.js:110`, check at `:306`) | No code change. See section 4 |
| A03 | The landmark anchor formula stays (`js/v3/core/journey.js:47-49`: landmark i of n at `x = total * (i + 1) / (n + 1)`, `y = 0`, `z = 0`) | No code change. See section 4 |
| Fifth region | A fifth region may change the new region file, `registry-config.js` and `journey-config.js`. These are config and new files, not shared generator code. P1-A06 is met | No code change. ChatGPT agrees |
| Screenshots | The user captures SC-01A and SC-01B on the user's own devices | ChatGPT chose agent capture. See section 4 |

## 4. Where ChatGPT differs from the user, and the outcome

| ID | ChatGPT said | Outcome | Reason |
|---|---|---|---|
| NP-04 | p99 at most 25 ms, not "no frame over 25 ms" | ADOPTED | One bad frame per 60 s is a browser stall and the report itself says one frame per run is too few for a percentile (`docs/phase-reports/p1-report.md` section 4, NP-04). COST: a single stall (the v1 117 to 150 ms frame is 0.03% of frames) passes this limit, because it is below p99. GB-02 still caps frames above 40 ms at 2% |
| NP-06 | Keep 32 MiB plus per-phase ceilings | ADOPTED | Same value as the proposal in the report. Reason is clear and cheap to reverse |
| NP-10 | Keep 30 min and 10 min with a repeat-area run | ADOPTED | Design value (grade C). It adds one test rule. No code depends on it |
| A02 | Change to 512 | NOT ADOPTED | ChatGPT states 512 has no performance baseline. The guard counts cells in the requested range (`js/v3/core/world.js:306`). No P2 query pattern exists to size it. A change needs a new candidate and a new user check. Revisit when the P2 planner has real query sizes |
| A03 | Change to a per-landmark segment and fraction placement | NOT ADOPTED NOW | The n-dependence is real (`js/v3/core/journey.js:47-49`): adding a landmark moves the others. P1 has no landmark placement and no saved progress, so no data is wrong today. A change needs a schema change and a new candidate. The ChatGPT point about identity is real and is recorded in ROADMAP: `anchorsVersion: 1` exists only in the journey result (`js/v3/core/journey.js:50`) and is not in Save or Snapshot. Fix it before P2M saves landmark progress |
| Screenshots | The agent captures both in its built-in browser | NOT ADOPTED | SC-01B is approved at 390x844 and DPR 3. The built-in browser tool has no DPR setting (not tested), and ChatGPT says to mark NOT DONE when the approved conditions cannot be met. The user's iPhone meets them |

## 5. Reversal cost

- A changed NP limit is a new dated decision file. No code depends on these values yet.
- A change to A02 or A03 means new code, a new candidate (`p1-r2`) and a new user check. Freeze `p1` first and the change needs a new revision ID and a new decision file (TR-04).

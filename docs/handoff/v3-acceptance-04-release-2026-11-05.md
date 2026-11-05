# The Deep End — v3 Acceptance: Release, Traps, Report, Open Decisions

Status: PROPOSED. Part 4 of 4. Read Parts 1 to 3 first.
Date: 2026-11-05.

## 1. P4 — Release candidate

Goal: one build that passes the full set, ready for the user's final decision. P4 adds no features.

Allowed paths (PROPOSED): bug fixes in `js/v3/`, `tools/`, `docs/`, `test/`.
Forbidden: new features, new regions, content changes without a decision file.

| ID | Check | Pass condition |
|---|---|---|
| RG-01 | Full regression | `TF` green, plus the full corpus run (NP-09) |
| RG-02 | Route | Scripted direct route reaches the exit on every corpus seed |
| RG-03 | Real play | The user completes the route at least once and gives PASS |
| RG-04 | Performance | GB-01 to GB-04 hold on the physical target device (GB-12) for the full route |
| RG-05 | Endurance | NP-10 run: no memory growth beyond NP-07/NP-08 limits |
| RG-06 | First load | Start available within 5 s on the 4G profile (GB-07) |
| RG-07 | Audio size | At most 3 MB (GB-08) |
| RG-08 | Save | Every save path works: new, continue, corrupt, play again |
| RG-09 | v1 save | OD-08 handled as the user decides. Until then no v1 save is read, moved or deleted (Q36) |
| RG-10 | Preview set | Every phase URL p0 to p4 loads its frozen artifact (VP-01 to VP-11) |
| RG-11 | Default route | The default entry is changed to v3 only after a separate user decision |
| RG-12 | Mobile | Both orientations on a physical phone (Q39) |
| RG-13 | Accessibility | Settings in P3U-I03 work in the final build |
| RG-14 | Safety | No flash above the agreed rate, no sudden loud sound |
| RG-15 | Errors | Error handling follows OD-06 once decided |
| RG-16 | Docs | README, SOP, ROADMAP baseline and devlog updated. Each Markdown file under 32 KiB |
| RG-17 | Decisions | Every deviation has a file in `docs/decisions/` |
| RG-18 | Screenshots | All SC manifests have the user's PASS |
| RG-19 | Cold review | Whole-diff cold review done and findings handled |
| RG-20 | Open items | `QUESTIONS.md` has no unresolved blocking question |

Screenshots: SC-09A, SC-09B.

## 2. Coverage remap

INFERENCE: the 100-point v2 coverage list in `staged-delivery-2026-11-05.md` is remapped by phase. The old IDs (P01.., A01.., B01.., D01..) were copied from that file and not re-verified here. Re-check them against the file before P2.

| Old group | v3 phase that owns it |
|---|---|
| Build and routing | P0 |
| Contracts and architecture | P1 |
| Structure, collision, reachability | P2 |
| Journey, progress, result, save | P2M |
| Water | P3W |
| Vertical space | P3V |
| Special architecture, wonders | P3S |
| Regions and landmarks | P3M |
| Atmosphere, figures, light | P3A |
| Audio, interface, controls, accessibility | P3U |
| Whole-route performance, release | P4 |

Core-answer ownership (from `core-aspect-answers-2026-11-05.md`): E1 P1; E2 P3M; E3 P2M; E4 P2M; D1 P3A; D3 P3S; Q10, Q45 P1 and P3M; Q29 P3U; Q31 P2M and P3A; Q33, Q34 P3U; Q35, Q36, Q37, Q38 P2M; Q39, Q40, Q42, Q43 P3U; Q44 P2.

## 3. Drift traps (DT)

Each trap is a way the work moves away from this plan. An observer can check each one.

| ID | Trap | Check |
|---|---|---|
| DT-01 | Regeneration-on-arrival creeps in | Zone and exit positions do not change after arrival (P2M-G03) |
| DT-02 | Placeholder logic leaks into journey code | P2M-G04 grep and swap test |
| DT-03 | P3M rewrites the main line | P3M-M01 diff check |
| DT-04 | Region count hard-coded in the generator | P1-A07 |
| DT-05 | UI or audio imported into the generator | P1-A01 |
| DT-06 | NP number invented to fit a result | NP limits come from a dated decision file only |
| DT-07 | GPU cap guessed | A cap without a measured baseline is invalid |
| DT-08 | Lower the 50 fps floor to pass | Floor stays (GB-01) |
| DT-09 | Camera moved to hide a defect | Frozen manifest only (Part 1, section 9) |
| DT-10 | Screenshot marked PASS without the user | CP-21 |
| DT-11 | Old artifact modified | VP-02, VP-11 hash check |
| DT-12 | v1 default changed early | P0-G01, RG-11 |
| DT-13 | v1 save touched | P0-SV01, RG-09 |
| DT-14 | Shared save between phases | VP-07 |
| DT-15 | Feature of a later phase leaks into an earlier one | Scope list per phase |
| DT-16 | N/A used for a current-phase feature | Part 1, section 10 |
| DT-17 | Test deleted to turn red into green | Core tests are not removed without a decision (AGENTS.md) |
| DT-18 | Silent catch hides a failure | CP-05 |
| DT-19 | Mock-heavy test for a small rule | Extract the pure function instead (AGENTS.md) |
| DT-20 | Atmosphere changes structure | P3A-T04 |
| DT-21 | Hint strength rises when lost | P2M-J11, P3A-T08 |
| DT-22 | Time cap added | P2M-J10 |
| DT-23 | Fifth region shipped | P1-A06, P3M-M06 |
| DT-24 | New dependency added without approval | AGENTS.md rule |
| DT-25 | Doc over 32 KiB | `wc -c` check |
| DT-26 | Rule or heading added to SOP/ROADMAP/QUESTIONS unasked | CP-15 |
| DT-27 | Unmeasured number reported as measured | CP-04 |
| DT-28 | Reachability checked on one seed only | NP-09 corpus |
| DT-29 | Fixture shot passed off as natural | CP-20 |
| DT-30 | Phase declared done by the agent | The user's PASS is required (CP-13) |

## 4. Phase report template

Write the report in this order (AGENTS.md). Use ASD-STE100 English.

1. Done: what the phase delivered. Add check IDs with command output or `file:line`.
2. Evidence: test counts as run, performance numbers with device and conditions.
3. Screenshots: file path, commit, artifact ID, seed, camera, quality, fixture or natural.
4. "Chosen for the user": each decision made, with the reason.
5. `QUESTIONS.md` full text, or "None".
6. Not done: what could not be verified and why.
7. What the user must check first: the three most likely drift points for this phase.
8. Agents used: count, cost, tasks.

## 5. Change control

- A change to this plan needs a user request and a dated file in `docs/decisions/`.
- A change to a PROPOSED number needs a measured baseline in the file.
- A change to a DECISION item needs the user's explicit new instruction.
- A check never changes during its own phase to make it pass. If a check is wrong, stop and report (CP-17).

## 6. Open decisions

| ID | Status | Item | When needed |
|---|---|---|---|
| OD-01 | OPEN | NP-01 to NP-11 numbers and per-phase GPU caps, from measured baselines | Before P2 |
| OD-02 | DECIDED (2026-11-05) | Keep every accepted phase as an independent static artifact | — |
| OD-03 | OPEN | Screenshot camera coordinates, from a survey of each phase | Before each phase |
| OD-04 | OPEN | Granularity of visual sign-off: per screenshot or per set | Before P2 |
| OD-05 | DECIDED (2026-11-05) | Progress saves separate per phase version. Settings shared | — |
| OD-06 | OPEN | Error handling policy (Q19) | Before P2M |
| OD-07 | OPEN | Atmosphere band numbers | Before P3A |
| OD-08 | OPEN | How v1 saves are handled when v3 replaces v1 (Q36 fixes only WHEN) | Before the v1 replacement stage |
| OD-09 | DECIDED (2026-11-05) | Phase structure approved. New numbers remain PROPOSED | — |
| OD-10 | OPEN | Regeneration on arrival (a structural rewrite): adopt only if the user states scope and save behaviour (Part 1, section 3) | Only if the user wants it |

## 7. What the user checks first, per phase

| Phase | Check first |
|---|---|
| P0 | Open the default URL, then `?gen=v3&phase=p0`. Both load. The default is still v1 |
| P1 | Read the contract list and the NP table. Approve or change the numbers |
| P2 | Walk 5 minutes. Look for grid seams, thin walls, getting stuck |
| P2M | Walk start to exit. Check progress marks, result screen, Continue, Play Again warning |
| P3W | Find deep water. Check you can always get out |
| P3V | Climb stairs, cross a walkway, stand at a void edge |
| P3S | Find a ceiling opening and a sun beam. Check they look built, not painted |
| P3M | Visit all four landmarks. Check each has its own identity |
| P3A | Compare an early and a late area for mood. Check the walls did not change |
| P3U | Play on your phone in both orientations. Change text size and contrast |
| P4 | Play the whole route once. Open each phase URL |

End of Part 4.

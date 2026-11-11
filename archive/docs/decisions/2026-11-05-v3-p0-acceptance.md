# Decision: v3 P0 acceptance details (2026-11-05)

Source: the user's answers on 2026-11-05 after six rounds of independent ambiguity review. Spec: `docs/handoff/v3-acceptance-02-early-phases-2026-11-05.md` section 2 and rules CP-25 to CP-30.

| ID | Decision | Reason |
|---|---|---|
| D1 | `js/save.js` takes a namespace parameter. It changes only the progress key. With no parameter the key stays `deepend.save.v1` | The key is fixed at `js/save.js:2`. The user chose to edit the file instead of rewriting the key at packaging |
| D2 | The settings key `deepend.settings.v1` is not changed, so settings are shared | `js/save.js:3` keeps settings apart from progress |
| D3 | P0-B09 uses a minimal test entry in `tests/fixtures/`. A real browser must run it. The router lookup is proven with two test phases | The real v3 core starts in P1 |
| D4 | The version label shows in the game corner and in the page title. Format `<phase>｜<game version>｜<7-char SHA>`. Shots come from the real archived URL | The user must see the label in the screenshot |
| D5 | P0 performance: 5 baseline runs on a fixed v1 commit before P0, then 5 runs after. Not below 90% of the baseline minimum (PROPOSED). The 4G profile is the DevTools "Fast 4G" preset and is recorded only | No v1 baseline exists yet |
| D6 | Archived artifacts are committed under `versions/`. `pages.yml` copies them into the published folder. The user approved the change to `pages.yml` | Git keeps bytes fixed. CI toolchain drift cannot change an old artifact |
| D7 | Router: extend the inline script in `index.html`. Syntax `?gen=v3&phase=pN` only. No `?ver=` alias. `?v=pre-column` stays | One mechanism. The pre-column case already uses this place |
| D8 | Process: `docs/devlog.md` (73,362 bytes) is exempt from 32 KiB. STE applies to new text. `QUESTIONS.md` is an allowed path. The decision file gets an adversarial review. CP-18 includes DECISION. A contradiction in an acceptance rule stops the work and goes to the user. Checks use Node scripts | Six rule conflicts found by the review |
| D9 | Human acceptance: the user plays on a computer and on an iPhone with Safari. The judgement is whole-experience (smooth play, expected buildings, hints in place). The evidence is the user's own words with date and artifact ID | The user wants to judge the combined result, not single features |
| D10 | Tests are written by the independent reviewer from the spec before the step is built. The implementer saves them as given and never edits them. Tests guard only goals of the current spec | Tests must not follow the implementer's code |
| D11 | Test deletion happens only at a phase transition: the phase is done, the user approved the spec changes, the reviewer reads all resident tests against the full new goals, and every conflicting test is deleted before next-phase development starts | The user's rule. A test stays while its goal stays |
| D12 | Fixed technical rules TR-01 to TR-08 apply (hash, manifest, atomic packaging, no overwrite, whitelist, committed source only, official npm entry) | Mechanical details. The agent decides |
| D13 | RG-09 limits "do not read a v1 save" to v3 preview and migration steps. v1 reads its own save as before | P0-G01 needs v1 to behave as before |
| D15 | `js/main.js` is allowed in P0 for the save, clear and load call sites only, to pass the namespace (user, 2026-11-05) | `js/main.js:313,380,516` call `saveGame` and `clearGame` without a parameter |
| D16 | The pinned Three.js 0.170.0 is copied into each archived artifact. The artifact import map is relative (user, 2026-11-05) | `index.html:118-120` loads it from a CDN, which can change after freeze |
| D17 | Candidates use `pN-rK`. The frozen `pN` is packaged from the accepted commit (agent decision) | Separates redo from overwrite. Reversible |
| D18 | Agent decisions, reversible: P0 sign-off is one whole-experience confirmation; paired v1/p0 comparison evidence; same-platform reproducibility; deployed-bytes check and rollback proof; P01 stays PROPOSED | Listed for the user to change |
| D19 | The user's later instruction authorizes this `docs/testing.md` policy update and related consistency edits. Keep `AGENTS.md`, D10 and D11 unchanged. Use `docs/testing.md` as the operating procedure for CP-25 to CP-27 | The later instruction supersedes the earlier no-edit limit for this policy update only |
| D14 | Audio size limit removed from v3 acceptance (GB-08, RG-07, P3U-A01). The IDs are not reused | User request |

## Open for later phases

| Item | When |
|---|---|
| OD-01 NP numbers and GPU caps | Before P2 |
| OD-03 camera coordinates | Before each phase. P0 is frozen by the agent when P0 starts |
| OD-04 sign-off granularity | Before P2 |
| OD-06, OD-07, OD-08 | As listed in Part 4 |

## Return cost

D1 and D6 change shared files (`js/save.js`, `pages.yml`). Revert by reverting the P0 commits. A frozen artifact stays in `versions/` unless a new decision removes it.

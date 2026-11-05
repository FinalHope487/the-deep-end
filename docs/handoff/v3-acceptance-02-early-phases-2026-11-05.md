# The Deep End — v3 Acceptance: Early Phases (P0, P1, P2, P2M)

Status: PROPOSED. Part 2 of 4. Read Part 1 first (`v3-acceptance-01-foundation-2026-11-05.md`). IDs `AR-*`, `GB-*`, `NP-*`, `VP-*`, `SC-*` are defined there.
Date: 2026-11-05.

## 1. Common rules for every phase

| ID | Rule |
|---|---|
| CP-01 | Each check has an ID, a command or procedure, an expected result, and recorded evidence |
| CP-02 | A check that cannot run is FAIL, not skipped, unless this file marks it N/A for the phase |
| CP-03 | Run the project test entry points in `docs/testing.md`. Do not invent lower-level commands. The agent runs every technical command. The user only plays and judges. Checks that need a shell use Node scripts, not `wc` or other Unix-only tools |
| CP-04 | Report the real command and the real count. A count not run is marked "expected" |
| CP-05 | Fix a red test to the smallest change that keeps the public contract. Never hide it with a silent catch |
| CP-06 | A phase may touch only its "Allowed paths". Any other changed path is a boundary conflict, to be reported |
| CP-07 | Do not edit frozen artifacts of earlier phases |
| CP-08 | Do not change the v1 default entry |
| CP-09 | Do not touch these existing uncommitted paths: `.gitignore`, `AGENTS.md`, `claude-decisions.json`, `dist/index.html`, `docs/handoff/T6-link-by-distance.md`, `docs/handoff/picture-scenes-plan-summary.md`, `pictures/`. Before a phase starts, record the state and content hash of each. Stage only named paths (never `git add -A`). Never commit `work/.v3-accept-*`. Delete only the directories this phase created |
| CP-10 | Commit in Conventional Commits format. One commit per green step |
| CP-11 | Before push, run a cold review of the whole phase diff (see `docs/codex-collaboration.md`). Use the adversarial review type when the phase adds a decision file. Check each finding against code before acting |
| CP-12 | After acceptance, freeze the artifact (VP-01 to VP-11) and write the phase report (Part 4) |
| CP-13 | The user plays the phase and gives PASS/FAIL on the screenshot set before the next phase starts. Record each PASS or FAIL with the user's own words, the date and the artifact ID. A summary written by the agent is not a record |
| CP-14 | Record the measured numbers in `ROADMAP.md` baseline. Record the device |
| CP-15 | Update only the existing structure of SOP/ROADMAP/QUESTIONS. A new rule line, heading or field needs a user request. A blocking question may go into `QUESTIONS.md` in its existing format |
| CP-16 | Write new Markdown text in ASD-STE100 English. A new document stays under 32 KiB. FACT: `docs/devlog.md` is 73,362 bytes and is exempt. Add only the new section to it. The review step checks STE by reading, not by a tool |
| CP-17 | If a check shows the plan itself is wrong, or two acceptance rules contradict, stop that step and ask the user. The agent never rewrites an acceptance rule. Only implementation details that do not change an acceptance rule are the agent's choice |
| CP-18 | Keep the FACT / DECISION / INFERENCE / PROPOSED labels in all phase reports. Each DECISION names its source |
| CP-19 | Unapproved NP limits: MEASURE-AND-RECORD only |
| CP-20 | A fixture shot must say it is a fixture |
| CP-21 | Never mark a screenshot PASS on behalf of the user |
| CP-22 | Compare any new behaviour with v1 on the same seed where the same feature exists |
| CP-23 | A failed required check is not waived by a good screenshot |
| CP-24 | Record every "代 user 選的" decision in the report |
| CP-25 | Test authorship: the independent reviewer writes each v3 test from the current spec before implementation. The implementer saves and runs the delivered file without editing it. Follow `docs/testing.md` for check IDs, delivery hashes and corrections |
| CP-26 | Test scope: keep each v3 test while its guarded goal remains valid, including inherited goals. Follow `docs/testing.md` for resident and retained test execution |
| CP-27 | Phase transition: only after the user accepts the phase and approves the next spec, the reviewer checks all resident and retained tests. Remove every test whose goal is gone or contradicted before next-phase development. Commit the changes and record the removed tests and last run logs in a decision file. Follow the order in `docs/testing.md`; do not allow a grace period |
| CP-28 | Human acceptance is a whole-experience judgement, not a feature checklist. The user plays on a computer and on an iPhone with Safari. The user compares with what they expect: smooth play, generated buildings they want to see, hints in place. The agent supplies an acceptance summary: automatic checks passed, checks waiting for the user, checks not done, and clickable URLs |
| CP-29 | Status words: PASS and FAIL are for required checks. N/A is only what this file marks. PROPOSED is a value without approval. MEASURE-AND-RECORD means numbers are recorded and no verdict is made. MEASURE-AND-RECORD never counts as PASS. A phase passes only when every required check is PASS and the user gave PASS |
| CP-30 | Test report: map each check ID to its test or procedure, official command, output and result. Count suites, tests, passes, failures and skips separately. After the last code change, confirm TF and every affected retained v3 test are green. Bind the logs to the final source commit and artifact ID. Follow `docs/testing.md` for execution rules |

### Command legend

| Code | Command (from `package.json` / `docs/testing.md`) | Time |
|---|---|---|
| TU | `npm run test:unit` | about 15 s |
| TE | `npm run test:e2e` | about 35 s |
| TF | `npm run test:fast` | about 60 s |
| B | `node tools/build.mjs` | seconds |
| BS | `node tools/build.mjs --out work/.v3-accept-<phase>` | seconds |

INFERENCE: use TF for P0. Use TU for pure-core resident tests. Use TF at phase end. FACT (`package.json:9`): `test:unit` lists 7 test files by name and does not auto-discover new ones. Add a new test to `test:unit` only if it meets the resident criteria and time limits. Otherwise, add a separate official npm acceptance entry. Before implementation, prove the assigned entry detects the target fault and returns a failure. The 7 files versus 9 resident tests is a file count versus a test count, not a conflict. Record real suite, test, pass and skip counts from runner output. Follow `docs/testing.md` for commit, push and phase-acceptance runs.

---

## 2. P0 — Build routing and frozen artifacts

Goal: let the user open any accepted phase by URL, without changing the default game. Decisions: `docs/decisions/2026-11-05-v3-p0-acceptance.md`.

Allowed paths: `tools/` (packaging script, builder change for nested v3 modules), `versions/` (new), `index.html` (router segment and version label only), `js/save.js` (progress-key parameter only), `js/main.js` (the save, clear and load call sites that pass the namespace; no other line), `.github/workflows/pages.yml` (copy `versions/` into the published folder only), `package.json` (test lists and official acceptance entry), `tests/`, `docs/testing.md` (counts only; the v3 policy text is already in place), `ROADMAP.md` (existing baseline section), `QUESTIONS.md` (existing format), `docs/handoff/`, `docs/decisions/`, `docs/devlog.md`.
Forbidden: any other change to `js/` (a change to game logic, rendering or input in `js/main.js` is forbidden), any change to `dist/index.html`, the settings key, the behaviour of v1 when no parameter is given.

Fixed technical rules (DECISION, the agent applies them, no further question):

| ID | Rule |
|---|---|
| TR-01 | Hash: SHA-256 over the build output bytes, sorted by normalised relative path with `/`. The manifest is not in the hash. Paths that differ only by letter case are an error. Reproducibility is required on the same platform and the same Node version, both recorded in the decision file. Cross-platform equality is not required |
| TR-02 | Manifest: phase ID, source commit SHA (the commit that was built), payload hash, build time in ISO 8601 UTC. Time fields are not in the hash |
| TR-03 | Packaging writes to a temporary directory, checks it, then publishes in one step. On failure remove the temporary directory and leave `versions/` unchanged |
| TR-04 | A frozen phase `pN` is never overwritten. A candidate has the ID `pN-rK` (K = 1, 2, ...) and may be rebuilt as a new `rK`. After the user PASS, the frozen `pN` is packaged from the same commit and its payload hash must equal the accepted candidate. A repair of a frozen phase gets a new revision ID and a new decision file |
| TR-05 | Packaging fails when a required Worker or asset file is missing. A built artifact has no external CDN dependency. DECISION (2026-11-05): the pinned Three.js build (0.170.0, same as `index.html`) is copied into the artifact and the artifact import map points to the relative file. This is the same dependency, not a new one |
| TR-06 | Phase IDs come from the whitelist `p0 p1 p2 p2m p3w p3v p3s p3m p3a p3u p4`, with an optional `-rK` revision suffix. Reject any other value. Paths are normalised and must stay inside `versions/` |
| TR-07 | Source is packaged from a committed revision. Uncommitted files are never packaged |
| TR-08 | Official entry: an npm script for packaging, with the phase ID as argument. A bad argument or a failed check exits non-zero. The CLI contract (script name, arguments, exit codes, output path) is written in the P0 decision file before the reviewer writes tests |

| ID | Check | Pass condition |
|---|---|---|
| P0-B01 | `BS` from a clean snapshot of a named commit (`--root`, `--out`, a new empty directory each run) | Default build succeeds. Do NOT run plain `B` in the working tree (it writes `dist/index.html`, CP-09). Compared with the build of the commit before P0, the only differences are the router segment and the version label in `index.html`, and the namespace wiring (`js/save.js`, the call sites in `js/main.js`). No other byte differs |
| P0-B02 | `BS` with isolated output | Output goes only to the named directory. `dist/` content is unchanged (compare bytes) |
| P0-B03 | Packaging step (TR-01 to TR-08) | Builds a named revision into `versions/<phase>/` with a manifest. A failure leaves `versions/` unchanged |
| P0-B04 | Second packaging run of the same commit in a new empty directory | Same payload hash. The run builds again and reuses nothing from the first |
| P0-B05 | Packaging a second version | A test packs a second, simulated version in a temporary directory. Earlier files stay byte-identical. Re-packing an accepted phase is refused |
| P0-B06 | Worker and audio assets | Copied into each artifact, with the pinned Three.js build. Paths resolve inside it. A real browser with the external CDN blocked loads the archived page, and the network log shows no request to another host. Audio packaging stays required. Only audio features are N/A |
| P0-B07 | Build rules | No dynamic import, no cycles, no name clashes. Negative tests: an injected cycle, a name clash and an unsupported import each make the build fail |
| P0-B08 | First-load time | MEASURE-AND-RECORD in P0 for the default URL and the p0 URL, with the Chrome DevTools "Fast 4G" profile. There is no numeric gate in P0. The 5 s limit of GB-07 gets a verdict from P4 |
| P0-B09 | v3 entry builds | A minimal test entry in `tests/fixtures/` with nested modules builds. A real browser runs it, a ready signal appears and no uncaught error is logged. HTTP 200 alone is not enough |
| P0-S01 | Router with `?gen=v3&phase=pN` | `p0` loads `versions/p0/`. At least two test phases prove the lookup is generic. Adding a version needs no change in the router code |
| P0-S02 | Router with a missing, unknown or unreleased phase | The same clear error page for all three. Plain HTML. v1 is never loaded silently. Illegal IDs such as `../` are rejected |
| P0-S03 | Direct URL | Paste, reload, back button and new tab all work. Resources resolve under the GitHub Pages project sub-path, not only at a domain root. A normal reload gets the correct version. No service worker serves another version |
| P0-G01 | No parameter | Loads the v1 game as before (VP-10). `?v=pre-column` keeps its behaviour. `?gen=v2` keeps its behaviour and its save key (regression test) |
| P0-L01 | In-game label | The archived page shows `P0｜v1 封存版｜<7-char SHA>` in a corner of the game screen and in the page title |
| P0-P01 | Performance | Before P0, measure 5 runs on a fixed v1 commit: title screen plus a fixed 60 s scripted play sequence. Record median, min and max. After P0 repeat with the same sequence. Required: not below 90% of the baseline minimum (PROPOSED, approval after measuring). The 50 fps floor of GB-01 is recorded only in P0 |
| P0-D01 | Decision file | Records the routing design, the builder choice, the packaging method, v1 compatibility, the rollback plan, the test lifecycle and every item of this section |
| P0-SV01 | Save | `js/save.js` accepts a namespace parameter that changes only the progress key. With no parameter the key is `deepend.save.v1`. Tests: raw bytes of an existing v1 save are unchanged after a preview run; the preview saves, reloads and resumes; the preview does not import progress from another version |
| P0-V01 | Settings | The settings key `deepend.settings.v1` is not changed. A volume or quality change in `p0` is visible on the default URL |
| P0-U01 | User check | See CP-28. The user plays the default URL and the p0 URL on a computer and on an iPhone with Safari, and compares them with the expected v1 experience. Evidence: the user's own words, date, artifact ID. The user gives one whole-experience confirmation for P0, linked to SC-00A and SC-00B. The agent also records a paired comparison of the default v1 and the archived p0 (load, first minutes of play, save, settings) |
| P0-R01 | Regression | `TF` green after the last code change. Keep new goal-guarding tests while their goals remain valid. Put only tests that meet the four resident criteria and time limits into `TF`; run other retained tests through a separate official npm acceptance entry. Update `docs/testing.md` counts only when resident tests change. Keep real-browser Worker, FPS and 4G procedure evidence in the phase report |
| P0-T01 | Test authorship | Tests for P0 are written by the independent reviewer from this section before the step is built (CP-25). A table maps every check ID to its test or procedure |
| P0-D02 | Deployment | `pages.yml` copies `versions/` into the published folder. Flow: candidate artifact, push, automatic publish, user opens the URL, user gives PASS, then package the frozen `p0` from the same commit (TR-04) and tag it. A failed candidate is rebuilt as the next `rK` |
| P0-D03 | Deployed bytes and rollback | After publish, fetch the deployed files and compare the payload hash with `versions/`. Rollback proof: run a dry run or a test-branch run with the `pages.yml` change reverted, and record that the default URL still loads v1. Record both in the decision file |

Screenshots: SC-00A, SC-00B (Part 1, section 9).

N/A in P0: all generator, water, UI and NP checks, and all audio features. AR rules that apply: AR-11 (default stays v1) and the static-packaging rules. Other AR rules start in P1. GB-01 to GB-06 are recorded in P0, with no verdict.

---

## 3. P1 — Core contracts and module boundaries

Goal: freeze the minimum types and boundaries (AR-01 to AR-12) before the generator exists.

Allowed paths (PROPOSED): `js/v3/core/` (new), `js/v3/modules/` (stubs), `tests/`, `package.json` (test list), `ROADMAP.md` (existing baseline section only), `docs/decisions/`, `docs/devlog.md`.
Forbidden: v1 files under `js/` outside `js/v3/`, `tools/build.mjs` (unless a decision allows it), `dist/`.

| ID | Check | Pass condition |
|---|---|---|
| P1-A01 | Import graph | Generator code imports none of UI, audio, save (AR-01). A test fails if one is added |
| P1-A02 | Contract set | World, Space, Traversal, Module, Journey, Snapshot, Save, Render, Worker contracts exist with IDs and a format version |
| P1-A03 | ID rules | World, region, landmark, space and find IDs are stable strings or numbers with one documented format (AR-06) |
| P1-A04 | Determinism harness | A pure-function test calls the same query in two orders and gets equal results (AR-07) |
| P1-A05 | Replace test | A test swaps one stub landmark module. Edits stay inside its own folder and the registry file (AR-10) |
| P1-A06 | Add-region test | A test registers a fifth stub region. No shared generator code changes (AR-05, AR-10). The fifth region is not shipped |
| P1-A07 | Region count | The generator does not assume four regions. The fifth-region injection test (P1-A06) is the proof. Do not grep for the digit 4 |
| P1-A08 | Static composition | No runtime plugin loader (AR-12) |
| P1-A09 | Build | FACT (`tools/build.mjs`): the builder reads a flat `js/` directory and accepts only `./file.js` imports. `BS` from the real v3 entry must compile and the output must load. A green `BS` of the old game proves nothing. The decision file records the builder change |
| P1-G01 | Legacy game | v1 plays as before |
| P1-G02 | Budget | GB-* values unchanged for v1 |
| P1-D01 | Doc | Decision file lists each contract and owner |
| P1-S01 | Baseline | Capture v1 and v2 baselines for NP-01 to NP-11 on the target device. Propose limits (Part 1, section 7). Walking speed and journey length are NOT measured here: P1 has no controller (see P2-W01, P2M-J13) |
| P1-S02 | NP approval | The user approves NP limits and GPU caps in a dated decision file. Without it P2 cannot start |
| P1-U01 | User check | The user reads the contract list and the proposed NP table and answers |
| P1-SV01 | Save | Save format version field exists. No v1 save is read or changed |
| P1-V01 | Preview | `?gen=v3&phase=p1` shows the diagnostic view built from the v3 entry |
| P1-R01 | Regression | `TU` and `TE` green |

Screenshots: SC-01A, SC-01B.

TDD note: contracts are Functional Core. Use heavy unit tests with boundary cases (zero, negative, tile-edge, determinism, serialization symmetry).

---

## 4. P2 — Playable continuous dry space

Goal: a first-person dry interior with no grid seams, thick filler walls, natural passages, collision, and safe start. No water, no stairs, no landmarks.

Allowed paths (PROPOSED): `js/v3/` (generator, render, worker), `tests/`, the v3 entry, `docs/`.
Forbidden: v1 `js/` files, the P0 router behavior, frozen `versions/`.

| ID | Check | Pass condition |
|---|---|---|
| P2-S01 | Start tile | Safe dry start with at least NP-02 walkable area and a bright far view (Q44) |
| P2-S02 | Continuity | Walk 200 m in several directions: no visible chunk or grid seam, no gaps in walls |
| P2-S03 | Walls | Filler walls are thick. No zero-thickness wall visible from either side |
| P2-S04 | Passages | Passages look natural. No straight corridor longer than the agreed limit (to be proposed with NP) |
| P2-S05 | Collision | Player cannot pass through walls or fall outside the world |
| P2-S06 | Reachability | Canonical data marks each space traversable or scenic (visible, not enterable; Q6). A test proves every traversable space connects to the start by a walkable path (fixed seeds, NP-09). Another test proves scenic volumes are visible and cannot be entered |
| P2-G01 | Determinism | Same seed gives same structure after reload and after different walk orders (AR-07) |
| P2-G02 | Different seeds | Different seeds give different structure |
| P2-G03 | No NaN | Fuzz test: random seeds and positions give no NaN, no infinity, no exception |
| P2-G04 | Unload and return | After walking away and back, structure is identical (Part 1, section 3 point 4) |
| P2-G05 | Invariants | Adjacent spaces share legal boundaries. No overlapping solid and open volume |
| P2-G06 | Fixed corpus | The agreed seed corpus passes all structural tests (NP-09) |
| P2-G07 | Consumers | Drawing, traversal and collision read the same world facts (AR-02) |
| P2-D01 | Doc | Decision file for the generator method and loading unit (GB-06) |
| P2-D02 | Doc | Devlog updated |
| P2-L01 | Loading | Generation work runs without breaking GB-05 (4 ms main thread) |
| P2-M01 | Memory | Walk far and return: tracked GPU and cache memory stays under the approved NP-05/NP-07/NP-08 limits |
| P2-P01 | Performance | GB-01 to GB-04 hold on the target device |
| P2-U01 | User check | The user plays 5 minutes and answers the SC-02A/B set |
| P2-U02 | Controls | Keyboard + mouse, touch (portrait and landscape per Q39) basic movement works |
| P2-W01 | Walk speed | Default `WALK_SPEED = 3.3` m/s (v1, `js/player.js:7`). It is a single shared constant, not a pass limit. A test checks the v3 controller moves at the constant on flat floor, stairs and shallow water. A change to the value follows P2M-J16 |
| P2-U03 | Pause | Return from background pauses the game (Q40) |
| P2-U04 | Safety | No sudden loud sound or flash |
| P2-SV01 | Save | Position saves and restores in the P2 namespace (VP-07) |
| P2-SV02 | Isolation | P2 save does not touch v1 save |
| P2-V01 | Preview | `?gen=v3&phase=p2` loads the frozen artifact |

Screenshots: SC-02A, SC-02B.

N/A in P2: water, stairs, voids, special architecture, final landmarks, atmosphere bands, full audio, journey progress.

---

## 5. P2M — Minimal complete main line

Goal: the user can walk a whole game from start to exit and see a result screen. Placeholder geometry stands in for the four zones. Progress and save work.

Main-line form (user choice, v1-style): see Part 1, section 3. Do NOT add a structural rewrite on arrival.

Allowed paths (PROPOSED): `js/v3/journey/`, `js/v3/modules/` (placeholder region and landmark modules), `js/v3/ui/` (progress, result screen), `js/v3/save/`, `tests/`, `package.json` (test list), `ROADMAP.md` (existing baseline section only), `docs/`.
Forbidden: P2 generator internals (changes allowed only through the contracts), v1 files, frozen `versions/`.

| ID | Check | Pass condition |
|---|---|---|
| P2M-J01 | Four zones | The journey places four required zones from the seed, each as a placeholder module |
| P2M-J02 | Distances | Start values (DECISION, user, 2026-11-05): straight-line 2–3 km from start through the four zones to the exit. They are DEFAULTS, not pass limits. The real walking path is much longer than the straight line. Propose the split over start→zone 1, three zone gaps and zone 4→exit after P2-W01. The v1 values in `docs/spec.md` §2.2 (about 500–600 m) are NOT the v3 values |
| P2M-J03 | Exit | An exit exists beyond the fourth zone and ends the main line |
| P2M-J04 | Order | Zones can be visited in any order the player finds them. Progress counts each once |
| P2M-J15 | Exit lock | FACT (`js/main.js:416,440`): v1 unlocks the exit only when `visitedCount() === 4`. State tests: early exit locked; unlock at four visited; ending, close, Continue, reload resumes at the last free-explore position (Q18); exit again shows the result screen (Q38) |
| P2M-F01 | Finds | `docs/spec.md` section 4: 3 finds per zone, 12 in total, pick-up by click or E, explore score = zones/4 x 60% + finds/12 x 40%. Contract: stable find IDs, placement in traversable space, pick-up, score, save, reload. Tests: fixed seeds, double pick-up, pick-up on another level, unload and return |
| P2M-J05 | Progress | The progress indicator updates on first entry to each zone |
| P2M-J06 | Result screen | Entering the exit shows the result screen (E3, Q38) |
| P2M-J07 | Continue | "Continue Exploring" resumes in the same world at the player position (Q18) |
| P2M-J08 | Exit again | Entering the exit again shows the result screen again |
| P2M-J09 | Play Again | Warns the old world is replaced, then creates a new seed (Q35) |
| P2M-J10 | No time cap | No timer ends the run (E4) |
| P2M-J11 | Guide strength | Hint strength does not rise when the player lingers (Q31) |
| P2M-J12 | Reachability | A test proves all four zones and the exit are reachable from the start on the fixed corpus |
| P2M-J13 | Direct travel | NOT a pass/fail limit (DECISION, user, 2026-11-05: the specific time is not an important acceptance standard). MEASURE-AND-RECORD on the NP-09 corpus: shortest walkable path from start to exit through all four zones, its ratio to the straight line, and the elapsed time of a scripted run at the default speed (loading waits reported separately). Report the numbers to the user in the phase report. E4 "about 15–25 min" stays as a design aim. INFERENCE: at 3.3 m/s that aim means a path of about 3–5 km |
| P2M-J16 | Tuning | DECISION (user, 2026-11-05): changing the distance between places or the walking speed must need only a few lines of code in one place. Distances live in the journey configuration. Speed lives in one shared constant. Test: change each value, rebuild, and show that (a) the diff touches at most one config file per value, (b) no generator, UI, save or test code changes, (c) all P2M tests still pass, (d) the new values show in the measured path length and run time. A change in spacing must not break reachability (P2M-J12) |
| P2M-J14 | Placeholder replace | A test swaps one placeholder module without editing journey code (AR-04, AR-10) |
| P2M-G01 | Zone identity | Zone positions are a pure function of seed and journey configuration |
| P2M-G02 | Unload and return | After leaving a zone far away and returning, the zone is identical and still counted as visited |
| P2M-G03 | No re-plan | Arriving at a zone does not change the position of other zones or the exit |
| P2M-G04 | Module isolation | Journey code contains no placeholder geometry names |
| P2M-G05 | No NaN | Fuzz test of the journey over random seeds |
| P2M-G06 | Fixed corpus | NP-09 corpus passes all journey tests |
| P2M-S01 | Placeholder look | Each zone is visibly distinct (marker light or shape). It may be crude. It is not final art |
| P2M-S02 | Exit look | The exit is visible from a short distance |
| P2M-S03 | Compare v1 | Zone count, progress rule and exit-unlock rule match the v1 form. Do not require two separate play-throughs to visit zones in the same order |
| P2M-D01 | Doc | Decision file records the v1-style main-line choice and what was not adopted |
| P2M-SV01 | Save | Save stores seed, position, visited zones, found items, exit state |
| P2M-SV02 | Reload | Reload restores the same state |
| P2M-SV03 | Corrupt save | A bad save shows a clear message and offers a new game. It never crashes |
| P2M-SV04 | Version field | Save contains format version and phase ID |
| P2M-SV05 | Isolation | P2M save stays in the P2M namespace (VP-07) |
| P2M-U01 | User check | The user plays the full route and answers SC-02M-A/B |
| P2M-U02 | Title | Title screen stays simple Start / Continue (Q37) |
| P2M-U03 | First hints | Short first-use hints only (Q43) |
| P2M-L01 | Loading | GB-05 holds during zone approach |
| P2M-P01 | Performance | GB-01 to GB-04 hold on the target device, full route |
| P2M-V01 | Preview | `?gen=v3&phase=p2m` loads the frozen artifact |
| P2M-R01 | Regression | All P2 checks stay green |

Screenshots: SC-02M-A, SC-02M-B.

N/A in P2M: water, vertical space, final landmarks, final atmosphere, full audio.

End of Part 2.

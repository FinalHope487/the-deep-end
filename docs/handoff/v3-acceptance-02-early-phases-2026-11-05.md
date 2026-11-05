# The Deep End — v3 Acceptance: Early Phases (P0, P1, P2, P2M)

Status: PROPOSED. Part 2 of 4. Read Part 1 first (`v3-acceptance-01-foundation-2026-11-05.md`). IDs `AR-*`, `GB-*`, `NP-*`, `VP-*`, `SC-*` are defined there.
Date: 2026-11-05.

## 1. Common rules for every phase

| ID | Rule |
|---|---|
| CP-01 | Each check has an ID, a command or procedure, an expected result, and recorded evidence |
| CP-02 | A check that cannot run is FAIL, not skipped, unless this file marks it N/A for the phase |
| CP-03 | Run the project test entry points in `docs/testing.md`. Do not invent lower-level commands |
| CP-04 | Report the real command and the real count. A count not run is marked "expected" |
| CP-05 | Fix a red test to the smallest change that keeps the public contract. Never hide it with a silent catch |
| CP-06 | A phase may touch only its "Allowed paths". Any other changed path is a boundary conflict, to be reported |
| CP-07 | Do not edit frozen artifacts of earlier phases |
| CP-08 | Do not change the v1 default entry |
| CP-09 | Do not touch these existing uncommitted paths: `.gitignore`, `AGENTS.md`, `claude-decisions.json`, `dist/index.html`, `docs/handoff/T6-link-by-distance.md`, `docs/handoff/picture-scenes-plan-summary.md`, `pictures/` |
| CP-10 | Commit in Conventional Commits format. One commit per green step |
| CP-11 | Before push, run a cold review of the whole phase diff (see `docs/codex-collaboration.md`). Check each finding against code before acting |
| CP-12 | After acceptance, freeze the artifact (VP-01 to VP-11) and write the phase report (Part 4) |
| CP-13 | The user plays the phase and gives PASS/FAIL on the screenshot set before the next phase starts |
| CP-14 | Record the measured numbers in `ROADMAP.md` baseline. Record the device |
| CP-15 | Update only the existing structure of SOP/ROADMAP/QUESTIONS. A new rule line, heading or field needs a user request |
| CP-16 | Write Markdown documents in ASD-STE100 English, each under 32 KiB |
| CP-17 | If a check shows the plan itself is wrong, stop that step and report the conflict. Do not change the definition of "done" |
| CP-18 | Keep the FACT / INFERENCE / PROPOSED labels in all phase reports |
| CP-19 | Unapproved NP limits: MEASURE-AND-RECORD only |
| CP-20 | A fixture shot must say it is a fixture |
| CP-21 | Never mark a screenshot PASS on behalf of the user |
| CP-22 | Compare any new behaviour with v1 on the same seed where the same feature exists |
| CP-23 | A failed required check is not waived by a good screenshot |
| CP-24 | Record every "代 user 選的" decision in the report |

### Command legend

| Code | Command (from `package.json` / `docs/testing.md`) | Time |
|---|---|---|
| TU | `npm run test:unit` | about 15 s |
| TE | `npm run test:e2e` | about 35 s |
| TF | `npm run test:fast` | about 60 s |
| B | `node tools/build.mjs` | seconds |
| BS | `node tools/build.mjs --out work/.v3-accept-<phase>` | seconds |

INFERENCE: use TF for P0. Use TU for pure-core steps. Use TF at phase end. FACT (`package.json:9`): `test:unit` lists 7 test files by name and does not auto-discover new ones. Each phase that adds tests must add them to `package.json`, then prove the entry runs them: make the new test fail once and see TU go red. The 7 files versus 9 resident tests is a file count versus a test count, not a conflict. Record real suite, test, pass and skip counts from runner output.

---

## 2. P0 — Build routing and frozen artifacts

Goal: let the user open any accepted phase by URL, without changing the default game.

Allowed paths (PROPOSED): `tools/` (packaging script, builder change for nested v3 modules), `versions/` (new), a small router entry, `package.json` (test list), `tests/`, `ROADMAP.md` (existing baseline section only), `docs/handoff/`, `docs/decisions/`, `docs/devlog.md`.
Forbidden: `js/` game logic, `dist/index.html`, the v1 save keys.

| ID | Check | Pass condition |
|---|---|---|
| P0-B01 | `BS` from a clean source snapshot (`--root`, `--out`) | Default build succeeds. Do NOT run plain `B` in the working tree: it writes `dist/index.html`, a protected path (CP-09). Output hash is unchanged apart from the version label, if any |
| P0-B02 | `BS` with isolated output | Output goes to the named directory. `dist/` is untouched |
| P0-B03 | Packaging step | Builds a named revision into `versions/<phase>/` and writes a manifest (phase ID, commit SHA, content hash, build time) |
| P0-B04 | Second packaging run of the same commit | Same hash of the immutable payload. Manifest time fields are excluded from the payload hash. Check payload and manifest separately |
| P0-B05 | Packaging a later phase | Earlier `versions/` files stay byte-identical |
| P0-B06 | Worker and audio assets | Copied into each artifact. Paths resolve inside it |
| P0-B07 | Build rules | No dynamic import, no cycles, no name clashes (existing builder checks stay green) |
| P0-B08 | Size and time | Audio bytes at most 3 MB (GB-08). First-load time is a separate 4G measurement (GB-07). Any total artifact size limit is PROPOSED and needs approval |
| P0-B09 | v3 entry builds | The build path can compile nested v3 modules (Part 1, section 8.1). A test builds the real v3 entry and loads the output |
| P0-S01 | Router with `?gen=v3&phase=p0` | Loads `versions/p0/` |
| P0-S02 | Router with unknown phase | Shows a clear error. Does not load v1 silently |
| P0-G01 | No parameter | Loads the v1 game as before (VP-10) |
| P0-L01 | Legacy label | The archived page shows its phase ID and commit SHA (VP-04) |
| P0-P01 | Performance | v1 start time and fps are not worse than the v1 baseline, within recorded variance |
| P0-D01 | Doc | Decision file records the routing design and the alias rule |
| P0-SV01 | Save | FACT: `js/save.js:2` uses the fixed key `deepend.save.v1`, so an archived v1 page would share it. Give each preview its own namespace (VP-07). A test checks the raw bytes of an existing v1 save are unchanged after a preview run |
| P0-U01 | User check | The user opens the p0 URL and the default URL and sees both work |
| P0-R01 | Regression | `TF` green |

Screenshots: SC-00A, SC-00B.

N/A in P0: all generator, water, UI, audio and NP checks.

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

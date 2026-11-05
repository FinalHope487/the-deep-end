# The Deep End — v3 Acceptance: Foundation

Status: PROPOSED baseline. Phase structure APPROVED by the user on 2026-11-05. New numeric limits stay PROPOSED until measured and approved.
Date: 2026-11-05. Draft: ChatGPT (task `c2c_a7b3`, read-only). Assembled and checked by Claude.
Part 1 of 4. Other parts: `v3-acceptance-02-early-phases-2026-11-05.md`, `v3-acceptance-03-content-phases-2026-11-05.md`, `v3-acceptance-04-release-2026-11-05.md`.
This file is a plan. It does not change the game. It replaces the v2-based execution plan in `staged-delivery-2026-11-05.md`.

## 1. Purpose and authority

Deliver a v3 game in closed, playable phases. Keep each accepted phase available for comparison.

Acceptance rule: A phase passes only when all applicable checks in all four parts pass. A failed or unmeasured required check blocks acceptance. The user must approve the required visual evidence.

Evidence labels:

| Label | Meaning |
|---|---|
| FACT | Verified in the repository or by a measured test |
| DECISION | Explicitly selected by the user |
| INFERENCE | Engineering interpretation, not a user decision |
| PROPOSED | New requirement or number awaiting approval |

Source precedence:

1. Later explicit user decisions.
2. Immutable user answers (`core-aspect-answers-2026-11-05.md`) and their amendments.
3. Applicable `docs/decisions/2026-11-05-*.md`.
4. Applicable `docs/spec.md` requirements.
5. Earlier decisions that nothing replaced.
6. Historical staged plans and current code, as evidence only.

`staged-delivery-2026-11-05.md` describes a v2 extension. It is superseded as an execution plan. Keep its outcome matrix and release-gate concepts.

## 2. Confirmed product rules

| ID | Rule |
|---|---|
| E1 | Rewrite the generator as v3. Port an older design only when it serves the same function |
| E2 | Deliver four main regions. Use weighted spatial traits, not one fixed room type per region |
| E3 | After the exit, offer Continue Exploring and Play Again. Keep the world and the save. Keep the final atmosphere value |
| E4 | No main-line time limit. Direct travel targets about 15–25 minutes |
| D1 | Use descending region-specific atmosphere bands. Stop at each floor until the next region |
| D3 | Show about one or two wonders on a normal main-line journey |
| Q10, Q45 | Add regions or replace landmarks without large edits to unrelated modules |
| Q29 | Directional music must not lead to the next main region |
| Q31 | Do not increase hint strength because the player is lost |
| Q33, Q34 | Require no puzzle. Support no gamepad |
| Q39, Q40, Q42, Q43 | Support both phone orientations. Pause on return. Readable settings. Short first-use hints |
| Q44 | Start on safe dry tile with a bright water or column view |
| Q35, Q36 | One world per play slot. Warn before replacing it. Do not handle existing v1 saves before the replacement stage |

Keep all other valid scene, water, vertical-space, sound, safety and accessibility decisions.

## 3. v1-style main line: verified interpretation

User words (2026-11-05): follow the v1 form. Expectation: after reaching a main region the later map regenerates fully. Far old chunks are deleted, including earlier main regions. Claude must verify.

| Label | Statement |
|---|---|
| FACT | `js/world.js` places four seeded landmark zones and an exit by seed |
| FACT | `js/chunks.js` (`update`, keep radius) disposes far render chunks. Returning rebuilds them |
| FACT | Arriving at a region does not re-plan the rest of the world |
| FACT | v1 generation also depends on the tension value (`js/world.js` about lines 299–305, 512–545), and the layout cache evicts entries above 800 (about line 493–500). v1 is NOT a pure function of seed and coordinates |
| INFERENCE | Structural determinism (same seed, any query order, any atmosphere value, after cache eviction) is a NEW v3 guarantee. v3 does not inherit it from v1 |
| INFERENCE | "Old chunks deleted" most likely means distance unload. "Regenerate later map" most likely means new unexplored space keeps generating |

ADOPTED for v3:

1. Plan four required zones and the exit from a stable seed and journey definition.
2. Generate nearby space on demand.
3. Dispose far render meshes and transient caches.
4. Rebuild unloaded structure from the same world identity on return.
5. Keep zone ownership, progress and exit state across unloading.
6. Visiting a region never replaces future walls, routes or landmarks.
7. Reversible atmosphere effects may change. Structural identity may not.

NOT ADOPTED: a milestone-triggered structural rewrite of the world.
It conflicts with same-seed determinism, E3, Q35 and the save format (seed + position).
To adopt it, the user must state which parts change (unexplored space only, or visited rooms too) and how return visits and saves behave. Then record a new decision file and revise P2M, P3M and the drift traps.

## 4. Phase map

| ID | Accepted output |
|---|---|
| P0 | Static build routing and frozen phase artifacts |
| P1 | Core data contracts, module boundaries, architecture tests |
| P2 | Playable continuous dry-space generator |
| P2M | Complete minimal four-zone route, exit, progress, save |
| P3W | Pool and water-space system added to P2M |
| P3V | Floors, stairs, bridges, slides, voids, multilevel travel |
| P3S | Reusable special architecture and photograph traits |
| P3M | Final region themes and landmark modules replace the placeholders |
| P3A | Atmosphere, figures, local effects, visual navigation |
| P3U | Full audio, interface, controls, accessibility |
| P4 | Release candidate and cross-phase verification |

Complete each phase before the next. Several small green commits are allowed inside one phase.

Why P2M comes right after P2 (user choice, INFERENCE on benefit): the user can walk the whole route early, and later phases add content to a game that already ends. Cost: progress, UI, exit and save work moves earlier. The placeholder modules must be replaceable, or P3M becomes a second main-line rewrite.

## 5. Core architecture limits

| ID | Rule |
|---|---|
| AR-01 | The world generator must not import the UI, audio or save systems |
| AR-02 | Drawing, traversal and collision use the same canonical world facts |
| AR-03 | Use small consumer interfaces. Do not expose one giant mutable world interface |
| AR-04 | Register region and landmark modules through an explicit composition boundary |
| AR-05 | Do not hard-code four regions in the shared generator. Four is the current journey configuration |
| AR-06 | Use stable world, region, landmark, space and find IDs |
| AR-07 | Same seed, configuration and location give the same structure, whatever the query order |
| AR-08 | Keep transient visual change separate from canonical geometry |
| AR-09 | Give GPU resources, caches and asynchronous tasks clear owners |
| AR-10 | Test replacing one landmark and adding a test fifth region. Do not ship the fifth region |
| AR-11 | Preserve v1 and v2 unless an explicit decision changes them |
| AR-12 | Use a static composition model. Build no runtime plugin platform |
| AR-13 | Zone spacing and walking speed are tunable by editing a few lines in one place each (P2M-J16). Do not scatter them across generator, UI or tests |

Freeze the minimum World, Space, Traversal, Module, Journey, Snapshot, Save, Render and Worker contracts before P2.
A shared core file may hold universal units, axes, ID rules and format versions. Keep feature settings and contracts in their owning modules.

## 6. Existing budgets (inherited from `docs/spec.md` and the test policy)

| ID | Requirement |
|---|---|
| GB-01 | Target 60 fps. Acceptance floor 50 fps during active play |
| GB-02 | At most 2% of measured frames above 40 ms |
| GB-03 | At most 100 draw calls in the active view |
| GB-04 | At most 150,000 visible triangles |
| GB-05 | At most 4 ms of main-thread map generation per frame |
| GB-06 | The old "one chunk per frame" rule needs a v3 loading-unit mapping before enforcement. Do not equate a v3 space with a v1 chunk |
| GB-07 | On the specified 4G profile, Start is available within 5 s of first load |
| GB-09 | No real-time shadows, reflections, refraction or bloom |
| GB-10 | Standard lighting: one hemisphere light and one directional light. Local light effects are baked or faked |
| GB-11 | Generated textures at most 512 × 512 each, with mipmaps where fitting |
| GB-12 | Final performance and touch claims need a physical target device |

Measure separately: network-to-Start, Start-to-playable, background planning, main-thread mesh work, GPU upload.
Record device, browser, viewport, quality and procedure. Name any display-limited or power-limited device. Do not lower the 50 fps floor to fit it.

## 7. New numeric limits: not yet approved

DECISION (OD-09): the user approved the phase structure, not these values.

Every value below is PROPOSED. Measure a baseline and obtain user confirmation BEFORE P2.

| ID | Measurement that needs a limit |
|---|---|
| NP-01 | Start-to-first-playable-movement time |
| NP-02 | Minimum verified walkable starting area |
| NP-03 | Background planning time per agreed unit and percentile |
| NP-04 | Main-thread publication cost per frame and per loading unit |
| NP-05 | P2 tracked GPU geometry and texture memory |
| NP-06 | Final tracked GPU geometry and texture memory |
| NP-07 | Retained world-cache and JavaScript data memory |
| NP-08 | Resource release after travelling away and unloading |
| NP-09 | Fixed-seed corpus size and seed-selection rule |
| NP-10 | Continuous loading and exploration endurance time |
| NP-11 | Mobile Worker count and scheduling policy |

Each content phase also needs a measured GPU memory ceiling. The earlier guessed 96/112/120/132/140/144 MiB values are NOT targets.

Until a limit is approved, its check is MEASURE-AND-RECORD, not PASS/FAIL. P0 and P1 can pass without NP limits. P2 and later cannot pass with an applicable NP limit unresolved.

Before P2:

1. Capture v1 and v2 baselines on a representative device and build.
2. Run a minimal v3 contract workload where possible.
3. Record device, conditions, variance and method.
4. Propose NP limits and per-phase GPU caps.
5. Obtain explicit user approval. Record it in a dated decision file.
6. Freeze the method and thresholds.

If GPU memory has no reliable reading, name a measurable proxy and its limits. Do not call JavaScript heap size GPU memory.

## 8. Frozen phase preview contract

DECISION (OD-02): keep every accepted phase as an independent static artifact, openable by URL parameter.

Syntax (PROPOSED): `?gen=v3&phase=p2m`. Alias `?ver=p2m`.
Phase IDs: `p0 p1 p2 p2m p3w p3v p3s p3m p3a p3u p4`.

| ID | Requirement |
|---|---|
| VP-01 | Archive each accepted phase's complete runnable output |
| VP-02 | A later build must not alter an older accepted artifact |
| VP-03 | The phase URL runs the archived code, not the latest code with hidden features |
| VP-04 | Show the artifact version in a diagnostic label or the title |
| VP-05 | Test the direct URL on the real static site |
| VP-06 | Archive Worker and audio assets with each artifact |
| VP-07 | Keep progress saves independent per phase version |
| VP-08 | Share non-world settings: volume, quality, text size, contrast, show FPS |
| VP-09 | A preview never overwrites a valid v1 save |
| VP-10 | The default entry stays on v1 until separately authorised |
| VP-11 | Check each artifact's source revision and content hash |

### 8.1 Build boundary

FACT: `tools/build.mjs` merges modules reachable from `js/main.js` into one `dist/index.html`. It accepts single-line named local imports, limits export forms, checks cycles and top-level name clashes, and copies Worker sources under `dist/js`. It has `--out DIR`. It does not keep old builds.

PROPOSED: add a packaging step that builds each accepted revision in an isolated directory, records a manifest and freezes the output. A small static router selects that directory before the game loads.

- Do not put all versions in one bundle.
- The router must not start the wrong game first.
- A separate v3 entry is allowed. Builder changes must keep the v1 default build contract. Test new import forms before use.
- Do not rely on runtime `import()`.
- FACT: the builder reads one flat `js/` directory and accepts only single-line `./file.js` imports (`tools/build.mjs`, `join(JS, name)`). Nested folders such as `js/v3/core/` do not build today. P0 must deliver a build path for nested v3 modules (builder change with a decision file, or a flat v3 layout) and P1 must build from the real v3 entry.
- Worker URLs resolve inside the selected artifact. A frozen page never loads the latest Worker.
- Use isolated outputs. Do not overwrite the user's `dist/index.html` during acceptance.

### 8.2 Save isolation (DECISION, OD-05)

- Each phase has its own progress save namespace.
- Settings are shared across all previews.
- A phase does not load another phase's progress by default.
- Old previews stay playable after newer saves exist.
- Do not migrate or clear v1 saves in this work.

## 9. Fixed screenshot protocol

DECISION: every phase has a fixed screenshot list. The user approves the full visual set.

PROPOSED: use deterministic fixed-seed scenarios and the real game renderer. Automated checks verify structure and numbers. Only the user judges beauty and poolcore feel.

Do not invent camera coordinates before the world exists. Before each phase:

1. Survey the accepted predecessor or the new fixture.
2. Find valid camera positions and sight lines.
3. Record X/Y/Z, yaw, pitch, viewport, DPR, seed, quality.
4. Check the camera is safe and sees the feature.
5. Freeze the manifest before the phase starts. Get user approval of the list.
6. Never move a failed camera to hide a defect.

A rare scene may use a deterministic fixture built with production geometry code. A fixture shot does not prove natural frequency.

### 9.1 Manifest

Coordinates, yaw, pitch, viewport and DPR: TO BE FROZEN BEFORE THE PHASE. Seeds 42 and 61 are PROPOSED.

| ID | Phase | Seed | Intent | Quality |
|---|---|---|---|---|
| SC-00A | P0 | 42 | Legacy title, appearance unchanged | High |
| SC-00B | P0 | 61 | Archived legacy preview with version label | Low |
| SC-01A | P1 | 42 | Legacy fallback during contract stage | High |
| SC-01B | P1 | 61 | Minimal v3 contract or diagnostic view | Low |
| SC-02A | P2 | 42 | Continuous open interior, no grid seams | High |
| SC-02B | P2 | 61 | Thick filler walls and natural passages | Low |
| SC-02M-A | P2M | 42 | Placeholder region and progress feedback | High |
| SC-02M-B | P2M | 61 | Exit, result screen, Continue flow | Medium |
| SC-03A | P3W | 42 | Shallow flooded interior and dry platform | High |
| SC-03B | P3W | 61 | Deep pool boundary and safe passage | Low |
| SC-04A | P3V | 42 | Stairs entering water | High |
| SC-04B | P3V | 61 | Upper walkway above lower space | High |
| SC-05A | P3S | 42 | Real ceiling opening with visible structure | High |
| SC-05B | P3S | 61 | Sunlight in a dark pool building | High |
| SC-06A | P3M | 42 | Final Region 1 landmark | High |
| SC-06B | P3M | 61 | Final Region 4 landmark | High |
| SC-07A | P3A | 42 | Early bright, calm atmosphere | High |
| SC-07B | P3A | 61 | Late cool, oppressive atmosphere | High |
| SC-08A | P3U | 42 | Portrait UI and readable settings | Medium |
| SC-08B | P3U | 61 | Landscape UI and reduced effects | Low |
| SC-09A | P4 | 42 | Full route, beginning | High |
| SC-09B | P4 | 61 | Full route, final approach | High |

Add real-world captures when a listed shot cannot show a relevant feature.
Each capture states commit, artifact ID, seed, camera, quality, file path and the user's PASS/FAIL.
Automated image comparison never replaces the user's visual decision.

## 10. Scope inheritance

- Each phase inherits the applicable earlier checks.
- A feature of a later phase is `N/A — NOT YET IN SCOPE`. Never mark a current-phase feature N/A.
- Placeholder geometry in P2M is not final landmark acceptance. P3M owns that.
- After acceptance, later work keeps both the frozen artifact and the accepted public behaviour, unless a new user decision changes it.

End of Part 1.

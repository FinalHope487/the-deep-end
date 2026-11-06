# V3 P1: contracts, owners, build change and screenshot manifest

Status: APPROVED by the user on 2026-11-06 (sections 1 to 3 as written; section 4: SC-01A uses the v1 title screen as it appears, the rest as proposed). Source: ChatGPT plan review rounds 1 to 7 (final `VERDICT: NO_ISSUES`) and `docs/decisions/2026-11-06-v3-p1-user-decisions.md`. Spec: `docs/handoff/v3-acceptance-02-early-phases-2026-11-05.md` section 3 (P1-D01, P1-A09, P1-V01) and Part 1 section 9.

## 1. Contracts and owners (P1-D01)

All contracts are plain JSON data with `formatVersion: 1`. All live under `js/v3/core/`. A validator returns `{ok:true, value}` or `{ok:false, code, path}`. A call whose argument is not an object where an object is required throws `TypeError`.

| Contract | File | P1 content | Later owner |
|---|---|---|---|
| World | `world.js` | Descriptor (pure JSON) and runtime `WorldContext` (never serialized). `composeWorld` and `queryWorld(context, bounds)` | P2 generator |
| Space | `space.js` | Levels, volumes, portals, features. Shapes `box`, `prism`, `cylinder`, `arch` are injected adapters | P2 generator, P3 adapters |
| Traversal | `traversal.js` | Nodes, surfaces (support references), links `{from,to}` with `{spaceId,nodeId}` | P2 generator |
| Module | `modules/registry.js` | JSON descriptor plus separate implementation. Registry rejects duplicate ids | P2M, P3M modules |
| Journey | `journey.js` | `journeyConfig` with ordered `segments`. `resolveJourneyAnchors(context)` | P2M placement |
| Snapshot | `snapshot.js` | `structuralDigest`. Excludes query bounds, `requestId`, atmosphere, player position | P2 cache |
| Save | `save.js` | Codec only. `lineageId`, `visitedSlotIds`, `foundKeys`, `progress.ext` | P2M save adapter |
| Render | `render.js` | Description only. Never edits canonical data | P2 renderer |
| Worker | `worker.js` | Request variants `init`, `query`, `cancel`. Pure `beginRequest`, `applyCancel`, `acceptReply` | P2 scheduler |

Resource owners (names only, built later): canonical facts have no state; generation cache = P2 cache owner; worker tasks = P2 scheduler (epoch checked); GPU buffers = P2 renderer; save storage = P2M save adapter.

## 2. Fixed rules

| Topic | Rule |
|---|---|
| ID | `<kind>:v1:<8hex seed>-<12hex fingerprint>:<localKey>`. Kinds `w r l s f`. Seed is an integer 0 to 4294967295 |
| Fingerprint | First 12 hex of SHA-256 over canonical JSON of `{seed, generatorFormat, structuralConfig, journeyConfig, modules, adapters}`. Atmosphere and query order never enter it |
| Config owner | `cellSize` and `maxSpaceExtent` exist only in `structuralConfig`. Defaults in `js/v3/modules/world-config.js` (64 m and 64 m, PROPOSED). `maxSpaceExtent` limits X and Z only |
| Module change | A change to what `generate()` returns needs a new `moduleVersion` |
| Schema evolution | A defined field never changes meaning within one `formatVersion`. Extensions go in an optional `ext` object keyed by namespace |
| Import layers | Pure core imports only core. Generation modules import core only. Four composition files (`registry-config.js`, `adapters.js`, `world-config.js`, `journey-config.js` under `js/v3/modules/`) are the only files that import generation modules. `entry/` may import `diagnostic/`; the reverse is forbidden. No runtime plugin loader |
| Worker URL | `new URL('js/v3/workers/<name>.js', document.baseURI)` |
| Save across worlds | Equal `lineageId` with a different `worldId` is compatible. P1 fixes only the result contract. P2M adds `loadOwnProgress()` and an explicit `importCompatibleProgress(sourcePhase, rawSave, targetWorld)`. No phase reads another phase key by default (VP-07) |
| Photo scenes | P1 reserves schema room only. P3 approves each scene |

## 3. Build change record (P1-A09)

| Item | Decision |
|---|---|
| Tools | Extend `tools/build.mjs` and `tools/package-version.mjs`. The default build stays byte-identical to the P0 freeze commit in `versions/p0/manifest.json` |
| New options | `--entry <path>` and `--html <path>`, each at most once. Bad usage exits 2. Build failure exits 1 |
| Output rule | Protect input files, not their folders. `--out <root>/dist` is allowed. `--out` equal to the root, or inside the real `js/` or `audio/`, fails |
| Worker copy | In v3 mode, copy `js/` when the entry names a Worker file under `js/v3/` |
| Packager | Explicit phase map. `p1` maps to the v3 diagnostic page. Artifacts stay full-site snapshots |
| Byte identity | Release byte identity compares two trees built from git blobs. A working-tree comparison is labeled "normalized source compatibility" |

## 4. Screenshot manifest (approved; viewport and DPR may change once at candidate time to match the user's devices; CP-02, CP-17, Part 1 section 9)

| ID | Seed | URL (real `p1-rK` artifact) | Intent | Quality | Viewport and DPR | Camera |
|---|---|---|---|---|---|---|
| SC-01A | 42 | `<artifact>/?seed=42` | v1 title screen, appearance unchanged (same method as SC-00A) | High | 1280x720, DPR 1 | v1 title orbit. The title screen has no generated world, so the seed is only recorded |
| SC-01B | 61 | `<artifact>/?gen=v3&phase=p1` | Diagnostic view built from the v3 entry | Low | 390x844, DPR 3 | N/A (approved by the user) |

Open points for the approval:
- FACT: the v1 title camera in a local run was x 8, y 1.6, z 8, with yaw drifting slowly (`js/main.js:644`). A fixed yaw is therefore not available. SC-01A records position and quality, not a frozen yaw.
- PROPOSED: the viewport and DPR values above. They are not measured on the user's devices.
- Capture rule: take each shot from the real archived URL in a real browser and record the artifact hash. A fixture shot says it is a fixture (CP-20). The agent never marks PASS for the user (CP-21).

## 5. Return cost

All items here are decisions on paper. No code depends on them yet. To change one, edit this file before slice 1 starts. After slice 1, a change to a contract needs a `formatVersion` review.

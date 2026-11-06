# V3 P1 slice 3: builder options, registry and landmarks

Status: implementer choices inside the approved contract (`2026-11-06-v3-p1-contracts-and-screenshots.md`). Items marked PROPOSED need the user to confirm before the P1 freeze.

## 1. Builder (P1-A09)

| Item | Rule |
|---|---|
| Flags | `--root`, `--out`, `--entry`, `--html`. Each takes one value and appears at most once. Any other argument is a usage error |
| Exit codes | 2 = usage error (unknown, repeated or valueless flag). 1 = source, path or template error |
| `--entry` | POSIX path `js/<path>.js`. No `..`, no backslash, no drive letter. Default `js/main.js` |
| `--html` | POSIX path relative to `--root`. Must be a file. Default `index.html` |
| Entry tag | The template must contain the entry tag exactly once, counted across both accepted forms together: `<script type="module">import './<entry>';</script>` and `<script type="module" src="<entry>"></script>`. Two tags, even of different forms, fail |
| Real paths | The template, the `js/` folder, the entry and every imported module resolve (`realpath`) inside the real root and the real `js/`. A junction or symlink that leaves them fails |
| `--out` | Allowed inside `<root>/dist`. The check compares real paths: the nearest existing ancestor of `--out` is resolved, then the missing tail is appended. It fails when `--out` equals or contains the root, lies inside `js/` or `audio/`, or `--out` is not outside the template (see the template rule below). The template may sit in a folder that contains `--out`, or inside `--out`, as long as it is not a build-owned entry (rev5 s1). A link that points `--out` at one of these fails. The check runs before any write |
| v3 mode | Starts when `--entry` or `--html` is given. Copies the whole `js/` tree beside the merged page, so Workers load from it. A symlink or junction anywhere under `js/` fails before the copy, because the copy would ship a link |
| Default mode | Copies `js/` without `js/v3/`. The default output stays byte-identical to the P0 freeze |

Implementer choice: v3 mode always copies `js/`. The contract said "when the entry names a Worker file". The copy is a superset and needs no source scan.

## 2. Registry (P1-A05, P1-A06, P1-A07)

| Item | Rule |
|---|---|
| `createRegistry({regions, landmarks})` | `js/v3/modules/registry.js`. Returns `Result<frozen {regions, landmarks}>`. Each entry is `{descriptor, generate}` |
| Error order | Per entry: bad type, descriptor error (`BAD_VERSION` for `formatVersion` 2), missing `generate` (`BAD_TYPE`), wrong kind for the list (`BAD_FIELD`), duplicate slot (`DUP_SLOT`), duplicate module ID (`DUP_MODULE`) |
| Slot scope | A slot belongs to one module across both lists. Region `region01` and landmark `region01` give `DUP_SLOT` |
| Composition files | `registry-config.js` exports `createDefaultRegistry()`. `adapters.js` exports `createDefaultAdapters()`. `world-config.js` exports `DEFAULT_STRUCTURAL_CONFIG`. `journey-config.js` exports `DEFAULT_JOURNEY_CONFIG`. PROPOSED names |
| Default values | `cellSize` 64, `maxSpaceExtent` 64, `segments` `[40,40,40,40,40]`, regions `region01` to `region04`, landmark `landmark01`, exit `exit01`. PROPOSED |
| Stub modules | `regions/stub-region.js` and `landmarks/stub-landmark.js`. Each is self-contained because generation modules import core only |
| Fifth region | A fifth region needs one new folder file and the edit of `registry-config.js` and `journey-config.js`. The repository ships no fifth region |

## 3. Landmarks (PROPOSED)

| Item | Rule |
|---|---|
| Generation | Landmarks use the same cell-owned `generate(ctx)` as regions. Their Spaces use `ownerKind: 'landmark'` and an `l`-kind `ownerId` |
| Config check | Every `landmarkSlotIds` entry needs a pinned `modules` entry and a registry landmark with the same `moduleId` and `moduleVersion`. A landmark slot must not equal a region slot (`DUP_ID`) |
| Identity | A landmark `moduleVersion` change changes `worldId`. It keeps the local keys of all other slots |
| Journey | Landmarks add no segment. `resolveJourneyAnchors` appends `kind: 'landmark'` anchors after `exit`, in `landmarkSlotIds` order. Landmark i of n sits at `x = total * (i + 1) / (n + 1)`, `y = 0`, `z = 0`, where `total` is the sum of `segments` |

## 4. Slice 2 parameters now recorded

| Item | Rule |
|---|---|
| Query cap | `MAX_QUERY_CELLS` is 4096 owner cells per `queryWorld` call. A larger range fails with `BAD_RANGE`. Implementer choice, PROPOSED |

## 5. Cold review fixes (before the first push)

| Item | Rule |
|---|---|
| Save `phaseId` | One of `p0 p1 p2 p2m p3w p3v p3s p3m p3a p3u p4` (`BASE_PHASE_IDS`). A revision id such as `p1-r1` fails (rev3:67) |
| Missing `formatVersion` | A record that requires `formatVersion` and lacks it fails with `BAD_VERSION` at `/formatVersion` (rev3:25) |
| Sorted arrays | Space `levels`, `volumes`, `portals`, `features` and Traversal `nodes`, `surfaces`, `links` must be in ascending id order. `blockedVolumeIds` must be sorted and unique. Failure is `BAD_FIELD` at the first out-of-order index (rev3:76) |
| Adapter tables | `composeWorld` copies and freezes the shape, feature and surface tables and each adapter. Adapters must be plain objects. Later edits by the caller have no effect |
| `surfaceAdapters` | Optional third table, default frozen `{}`. The context reserves it; no code dispatches to it yet. Adapter-face dispatch waits for a defined resolver signature (rev5 s4) |
| Space ownership | `queryWorld` fails with `BAD_REF` when a generated Space has an `ownerKind` other than the module kind, or an `ownerId` whose local key is not the module slot. A module cannot publish `filler` Spaces; no filler module exists in P1. PROPOSED |
| Output entries (round 3, replaces the round 2 link check) | Before any write, the builder removes `<out>/index.html`, `<out>/js` and `<out>/audio`. Removing a link, a hard link or a folder that holds links deletes the entry and never follows it. No stale entry can redirect a write, and nested links below `<out>/js` no longer matter |
| Template and owned entries (round 4, replaces the round 3 rule) | The builder fails only when the template's real path is `<out>/index.html` or lies inside `<out>/js` or `<out>/audio`, because the removal above would delete it. A template elsewhere, including inside `--out` or beside it, is allowed (rev5 s1: protect input files, not their parent folders) |
| `js/` link (round 2) | `js/` itself must be a real folder in both modes. A link that stays inside the root passed the real-path check before |
| Adapter data (round 2) | The copy of each adapter is deep. Nested plain objects and arrays are frozen. A value that is not plain data or a function (Map, class instance, Symbol, bigint) fails with `BAD_TYPE` |
| Query range (round 2) | `queryWorld` fails with `BAD_RANGE` when a cell index is not a safe integer. Above 2^53, `ix++` does not advance and the loop would not end |
| Adapter data (round 3) | The deep copy rejects cycles, accessors, symbol keys, array holes and extra array properties with `BAD_TYPE`. A shared reference that is not a cycle is allowed. Keys such as `__proto__` stay own properties (`setOwn`) |
| Link endpoints (round 3) | A Traversal link endpoint `spaceId` must belong to this world (`BAD_REF` at `/links/<i>/<end>/spaceId`). The target Space may sit in a Space that is not loaded (rev4 s3) |
| Elevations (round 3) | A non-finite adapter elevation is not an elevation: a walk link then fails with `UNKNOWN_SURFACE` |
| Numbers (round 3) | `encodeCoordinate` and `decodeCoordinate` accept safe integers only. Journey anchors that overflow to a non-finite value fail with `BAD_RANGE` |
| Reserved keys (round 3) | A request id or a Save extension key of `__proto__` is stored as an own entry (worker pending table, Save `ext` copy) |
| Local ids (round 3) | Local ids (Space, Traversal, slot and exit ids) must match `/^[A-Za-z0-9_.~-]+$/` (rev4:48). `BAD_FIELD`, or `BAD_TYPE` for a non-string |
| Stub modules (round 3) | The stub room and offsets are clamped to the owner cell for any `cellSize`. At `cellSize` 64 the output is unchanged |
| Node surface (round 4, B4 reinstated) | A node's `surfaceId` must name a surface whose `supportRef.volumeId` equals the node's `volumeId`, else `BAD_REF` at `/nodes/<i>/surfaceId` (rev6:36). Round 3 refuted this claim in error: the implementer had read rev5 only and missed rev6:36 |
| Traversal pairing (round 4) | In one `generate` call, each Space pairs with exactly one Traversal of the same `spaceId`; a Traversal without its Space or a repeated one is `BAD_REF` or `DUP_ID`. Two modules cannot publish the same Space id. A module can no longer replace another module's Traversal |
| Snapshot digest (round 4) | `structuralDigest` covers the validated Spaces and Traversals. `queryWorld` validates before hashing, so a generator's NaN is a failed Result, not a thrown error. `validateSnapshot` checks the digest over its own validated output |
| World elevation (round 4) | A walk link needs a finite world elevation: origin plus local elevation must be finite, else `UNKNOWN_SURFACE` |
| Local ids (round 4) | `ModuleDescriptor.slotId` and `Save.progress.visitedSlotIds` also use the localKey charset |
| Shape version (round 4) | `Shape.v` is an integer of at least 1 (rev3:42). An adapter validates the versions it lists in `versions` (default `[1]`). Transport mode keeps any well-formed `{kind, v, p}`; strict mode rejects an unlisted kind or version with `UNKNOWN_SHAPE` |
| `extAdapters` (round 4) | Optional fourth table (`{namespace: {validate}}`), default frozen `{}`, carried in `context.adapters` and passed to Snapshot, Space and Traversal validation. Without it a generated `Space.ext` is `UNKNOWN_FIELD` in strict mode |
| World adapter order (round 4) | `World.adapters` is sorted by `adapterId` (rev5:48): `composeWorld` sorts, `validateWorld` rejects unsorted order with `BAD_FIELD` |
| Records (round 4) | `record()` accepts only enumerable string-keyed data properties. A getter is `BAD_TYPE`; a symbol or hidden key is `UNKNOWN_FIELD`. JSON copies reject cycles with `BAD_TYPE` and allow shared references |

## 6. Return cost

| Change | Cost to undo |
|---|---|
| Builder flags and checks | Low. One file (`tools/build.mjs`). No saved data depends on it |
| Landmark anchor formula | Low before P2M placement exists. Later changes need a new `anchorsVersion` |
| Composition export names | Low now. Each rename touches the four composition files, the entry and the registry test |

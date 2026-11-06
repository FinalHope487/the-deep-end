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
| `--out` | Allowed inside `<root>/dist`. The check compares real paths: the nearest existing ancestor of `--out` is resolved, then the missing tail is appended. It fails when `--out` equals or contains the root, lies inside `js/` or `audio/`, or overlaps the template folder (when that folder is not the root). A link that points `--out` at one of these fails. The check runs before any write |
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
| Output links (round 2) | Before any write, the builder rejects a link (symlink or junction) at `<out>/index.html`, `<out>/js` or `<out>/audio`. A link left by an earlier run would redirect the write, the copy or the wipe |
| `js/` link (round 2) | `js/` itself must be a real folder in both modes. A link that stays inside the root passed the real-path check before |
| Adapter data (round 2) | The copy of each adapter is deep. Nested plain objects and arrays are frozen. A value that is not plain data or a function (Map, class instance, Symbol, bigint) fails with `BAD_TYPE` |
| Query range (round 2) | `queryWorld` fails with `BAD_RANGE` when a cell index is not a safe integer. Above 2^53, `ix++` does not advance and the loop would not end |

## 6. Return cost

| Change | Cost to undo |
|---|---|
| Builder flags and checks | Low. One file (`tools/build.mjs`). No saved data depends on it |
| Landmark anchor formula | Low before P2M placement exists. Later changes need a new `anchorsVersion` |
| Composition export names | Low now. Each rename touches the four composition files, the entry and the registry test |

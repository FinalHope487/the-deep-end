# V3 P1 slice 3: builder options, registry and landmarks

Status: implementer choices inside the approved contract (`2026-11-06-v3-p1-contracts-and-screenshots.md`). Items marked PROPOSED need the user to confirm before the P1 freeze.

## 1. Builder (P1-A09)

| Item | Rule |
|---|---|
| Flags | `--root`, `--out`, `--entry`, `--html`. Each takes one value and appears at most once. Any other argument is a usage error |
| Exit codes | 2 = usage error (unknown, repeated or valueless flag). 1 = source, path or template error |
| `--entry` | POSIX path `js/<path>.js`. No `..`, no backslash, no drive letter. Default `js/main.js` |
| `--html` | POSIX path relative to `--root`. Must be a file. Default `index.html` |
| Entry tag | The template must contain the tag `<script type="module">import './<entry>';</script>` exactly once. The default entry also accepts the `src="js/main.js"` form |
| Real paths | Template, entry and every imported module resolve (`realpath`) inside the real root and the real `js/`. A junction or symlink that leaves them fails |
| `--out` | Allowed inside `<root>/dist`. Fails when it equals or contains the root, lies inside `js/` or `audio/`, or overlaps the template folder (when that folder is not the root). The check runs before any write |
| v3 mode | Starts when `--entry` or `--html` is given. Copies the whole `js/` tree beside the merged page, so Workers load from it |
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

## 5. Return cost

| Change | Cost to undo |
|---|---|
| Builder flags and checks | Low. One file (`tools/build.mjs`). No saved data depends on it |
| Landmark anchor formula | Low before P2M placement exists. Later changes need a new `anchorsVersion` |
| Composition export names | Low now. Each rename touches the four composition files, the entry and the registry test |

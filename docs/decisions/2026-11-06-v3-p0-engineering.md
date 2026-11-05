# V3 P0 Engineering Decisions (2026-11-06)

Status: agent decisions under `docs/decisions/2026-11-05-v3-p0-acceptance.md` (D18). The user authorized the js/main.js wiring (D15) and the vendored Three.js (D16).

Scope: build routing and frozen artifacts (P0). Check IDs refer to `docs/handoff/v3-acceptance-02-early-phases-2026-11-05.md`.

## 1. Routing design

| Item | Decision |
|---|---|
| Place | The existing inline head script in `index.html` gets one more branch. No change to `js/` is needed for routing |
| Trigger | Query `gen=v3`. Other values of `gen` and the `v` parameter keep their current behavior |
| Phase ID check | Regular expression `^(p0\|p1\|p2\|p2m\|p3w\|p3v\|p3s\|p3m\|p3a\|p3u\|p4)(-r[1-9][0-9]*)?$` (TR-06). No other value reaches a URL |
| Lookup | Fetch `versions/<id>/manifest.json` relative to the page URL. Accept only HTTP 200 with valid JSON, a `phase` equal to the requested full ID, a 40-character commit SHA and a 64-character lowercase payload hash. Treat a missing, invalid or mismatched manifest and any network failure as unavailable. The router has no list of released phases (P0-S01) |
| Success | Use `location.replace()` to open `versions/<id>/index.html`. Remove `gen`, `phase` and `v` from the forwarded query. Keep other query parameters and the hash. The v3 request takes priority over `v=pre-column` |
| Failure | Missing, unknown, unreleased and illegal IDs show the same plain HTML error page. The page never echoes the input. v1 never starts (P0-S02) |
| Stopping v1 | For a v3 request the router prevents every v1 boot script from running before the asynchronous lookup. It calls `window.stop()`, then shows a standalone loading text that works while `document.body` does not exist. On success or failure v1 never initializes. Tests check this in Chromium, including a slow and a failed lookup. The user checks Safari in P0-U01 |
| Sub-path | All URLs are relative to the page URL, so a GitHub Pages project sub-path works (P0-S03) |
| Archived page | The archived page defines `window.__deependVersion`. The router returns at once when it exists, so an archived page never redirects again |
| Service worker | None is registered. None is added |

## 2. Builder choice

| Item | Decision |
|---|---|
| Choice | Extend `tools/build.mjs`. Do not add a bundler or a new dependency |
| Nested modules | Static imports of the forms `./a.js`, `./dir/a.js` and `../a.js` are accepted. The module ID is the POSIX path relative to `js/`. A resolved path must stay inside `js/` and end with `.js` |
| Checks kept | Import cycle, top-level name clash across modules, unsupported import form, unsupported export form, engine parse check |
| Check added | A dynamic `import(` call fails the build (P0-B07) |
| Entry | Unchanged: `index.html` loads `js/main.js`. A fixture folder with the same layout is built with `--root` (P0-B09) |
| Reason | The change is small and keeps the zero-dependency rule. A bundler needs a user decision (new dependency) |

## 3. Packaging method

Official entry (TR-08), repo root:

    npm run package:version -- <phase> [--commit <rev>] [--versions-dir <dir>] [--match <phase>]

| Part | Contract |
|---|---|
| npm script | `package:version` = `node tools/package-version.mjs` |
| `<phase>` | Required. Passes the TR-06 check |
| `--commit` | Git revision. Default `HEAD` when `--match` is absent. When `--match` is present and `--commit` is omitted, use the commit recorded in the matched manifest. Resolve the revision with `git rev-parse --verify <rev>^{commit}` to a 40-character SHA |
| `--versions-dir` | Output parent folder. Default `<repo>/versions`. The folder is created when needed |
| `--match` | Optional existing candidate or frozen phase ID. Require the new artifact's source commit SHA and payload hash to equal both values in the matched manifest (TR-04). Exit 1 on either mismatch. Do not publish on mismatch |
| Output path | `<versions-dir>/<phase>/` with `index.html`, `js/`, `audio/`, `vendor/three-0.170.0.module.min.js`, `manifest.json` |
| stdout | Last line on success: `package: <phase> <payloadHash> <path>` |
| Exit 0 | Success |
| Exit 1 | A check failed: git or build failure, missing Worker or asset file, unresolved Worker import, external CDN reference, hash mismatch with `--match`, vendored Three.js hash mismatch |
| Exit 2 | Usage error: missing or bad phase ID, unknown option, `--versions-dir` or output path that leaves its folder, bad `--commit` |
| Exit 3 | Refused: `<versions-dir>/<phase>/` already exists (TR-04, P0-B05) |
| Failure effect | `<versions-dir>` content is unchanged (TR-03) |
| Argument rules | Accept each option at most once. A missing option value, an unknown option, a malformed phase ID or an invalid Git revision gives exit 2. Resolve relative paths from the repository root. `--versions-dir` may point outside the repository (isolated tests); the artifact target must stay inside it. `--match` is resolved inside the same versions folder and accepts an existing candidate or frozen phase ID; a missing or invalid match manifest gives exit 1. An existing target gives exit 3 before any file changes |

Steps:

1. Check arguments (exit 2). Refuse an existing target (exit 3).
2. Export the revision with `git archive <sha>` into a new temporary folder. Uncommitted files are never used (TR-07).
3. Build with the `tools/build.mjs` of the exported revision into a temporary output folder.
4. Verify `tools/vendor/three-0.170.0.module.min.js` of the exported revision against the pinned SHA-256 below. Copy it to `vendor/`.
5. Rewrite the import map of the built `index.html` to `./vendor/three-0.170.0.module.min.js`.
6. Inject one script before the first `<script>`: `window.__deependVersion = {phase, base, ns, sha7, label}`. Set `<title>` to the label. The script adds a fixed corner element with the label (P0-L01). In the injected object, `phase`, `base` and `ns` are all the base phase ID without a revision suffix. `sha7` comes from the source commit. All asset paths are relative to the artifact folder. Candidate `p0-r1` and frozen `p0` built from the same commit are byte-identical except for `manifest.json`, whose `phase` keeps the full ID.
7. Run the checks of exit 1. Write `manifest.json`: `phase` (full ID), `commit`, `payloadHash`, `builtAt` (ISO 8601 UTC). Publish with one `rename` of a temporary sibling folder to `<phase>` (TR-03).

Freeze command: after the user accepts `p0-r1`, run `npm run package:version -- p0 --match p0-r1`. It uses the commit recorded in the candidate manifest. It rejects a different explicit `--commit` with exit 1, even when the payload hash would match. The candidate and frozen artifacts keep separate manifests and identical payload files.

Label text (P0-L01): `P0｜v1 封存版｜<sha7>`. For later phases the kind text is `v3 封存版`.

Payload hash (TR-01):

- File set: every file in the artifact folder except `manifest.json`.
- Order: paths relative to the artifact folder, separator `/`, sorted by code point. Two paths that differ only by letter case are an error.
- Input: for each file in order, the UTF-8 path, one `\n`, the decimal byte length, one `\n`, the file bytes.
- Algorithm: SHA-256, 64 lowercase hex characters.

Reproducibility: same platform and same Node version. This decision was made on Windows 11 with Node v24.14.0. `.github/workflows/pages.yml` uses Node 22 on Linux. The published bytes are compared with `versions/` by payload hash after fetch (P0-D03), not by cross-platform rebuild.

Pinned Three.js (D16): `tools/vendor/three-0.170.0.module.min.js`, 691648 bytes, SHA-256 `08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7`. The file is identical from jsDelivr and unpkg. It has no static import.

## 4. Save namespace

| Item | Decision |
|---|---|
| Source | `window.__deependVersion.ns` (set by the artifact). It is the base phase ID. It is empty on the default page |
| `js/save.js` | `loadGame(gen = 1, ns = '')`, `saveGame(s, ns = '')`, `clearGame(ns = '')`. Progress key = `deepend.save.v1` when `ns` is empty, else `deepend.save.v1.<ns>`. An absent `ns` is the empty string (default game). A supplied nonempty `ns` must match `^[a-z0-9]+$`. Any other value throws an `Error` before any storage access and never falls back to the default key. An archived page always supplies a valid nonempty `ns` |
| `js/main.js` | Only the save, clear and load call sites change. They pass `NS`. One constant `NS` is added |
| Settings | `deepend.settings.v1` is unchanged (P0-V01) |
| Revisions | `p0-r1` and `p0` use namespace `p0`. Saves survive a candidate rebuild |

## 5. v1 compatibility

- No parameter: the router branch does nothing. The page is the v1 game.
- `?v=pre-column` and `?gen=v2` keep their code path and their save key.
- `dist/index.html` is never touched by packaging or tests (P0-B02).
- `tools/build.mjs` output for the current sources must stay byte-identical except for the router segment and the namespace wiring (P0-B01).

## 6. Deployment and rollback

- `pages.yml` gets one step after the build: copy `versions/` to `dist/versions/` when the folder exists.
- Rollback: revert the router branch in `index.html` and the `pages.yml` step. The `versions/` folder stays in Git and is not published. The save namespace code is inert without `__deependVersion`. Saves written under `deepend.save.v1.p0` are not read by the default page.
- Rollback proof (P0-D03): a run with the `pages.yml` change reverted, and a check that the default URL loads v1. The result goes into the phase report.

## 7. Test lifecycle

Follow the Phase Tests section of `docs/testing.md`. The independent reviewer writes the P0 tests from `v3-acceptance-02` section 2 and this file before the implementation. The implementer saves each file as delivered and checks its SHA-256. P0 tests that are not resident guards run through a separate official npm entry, named in the phase report.

## 8. Baseline (P0-P01)

Fixed v1 commit: `c511558376fd2081df8b9d4960720df5e02af963`. Build: `node tools/build.mjs --root <git archive of the commit> --out work/.v3-accept-p0-base`. Tool: `tools/measure-fps.mjs`. Page: `index.html?test=1&seed=42`, Chromium with the GPU arguments of `playwright.config.js`, viewport 1280x720. Sequence: 5 s title screen, then 60 s of fixed key input (forward 4 s, right 1 s, forward 4 s, left 1 s, repeated). Unit: mean frame rate per run.

Valid run: the game reaches ready and playing states, finishes the scripted interval, stays in playing mode, loads at least one chunk, moves a positive distance and reports no page or console error. A run with missing frame timestamps is invalid. The tool exits non-zero when any run is invalid. Invalid runs are never counted or replaced silently.

Comparison: run the same tool, browser, GPU settings, viewport, seed and key sequence five times on three builds: (1) the fixed pre-P0 commit above, (2) the final default v1 build, (3) the archived `p0` artifact. Record title and play median, minimum and maximum of per-run mean FPS. The comparison value is each post-P0 play minimum divided by the baseline play minimum. The 90% limit stays PROPOSED until the user approves it. Record source commits, artifact IDs and the full JSON files in the phase report.

Baseline result file: `work/p0-baseline-v1.json` (valid only after the tool ends with exit 0).

### Measured result (2026-11-06, 5 valid runs each, mean FPS per run)

| Build | Source | Title median / min / max | Play median / min / max | Play min vs baseline min |
|---|---|---|---|---|
| Baseline v1 | `c511558` | 60 / 56 / 60 | 59.77 / 58.67 / 59.82 | 100% |
| Final default v1 | working tree of `69885aa` | 60 / 60 / 60 | 59.89 / 59.89 / 59.94 | 102.1% |
| Archived `p0-r1` | `69885aa`, payload `e18dd602…880d2b` | 60 / 60 / 60 | 59.95 / 59.89 / 59.95 | 102.1% |

Both post-P0 builds stay above the PROPOSED 90% limit. The limit stays PROPOSED until the user approves it. The full JSON files are in `work/` (not tracked).

FPS was measured on `p0-r1`. The review fixes in section 9 changed tools only. The candidate for the user play test is `p0-r2` (commit `9961c6e`, payload `4083f037…eba0`). Its payload differs from `p0-r1` only in the commit label and the version object.

## 9. Deviations from the plan

- Cold review c2c_p0r1 found four gaps; all four were real and are fixed in `9961c6e` with red-first tests in `tests/unit/p0-review-fixes.test.mjs` (written by the implementer, in addition to the reviewer's tests): the freeze did not recompute the candidate payload hash; a missing audio file named by `js/audio.js` passed packaging; external audio URLs and resource paths outside the artifact passed; `import/* c */(...)` passed the dynamic-import ban. The path-escape part of finding 3 has no red proof: the staging layout makes a failing input hard to build, so only the external-URL case is tested.

- The Playwright P0 specs need more than the configured 40 s for P0-SV01 (three v1 boots, about 42 s on the test machine). `npm run test:p0` passes `--timeout=120000`. The reviewer's test file is not edited. A corrected config from the reviewer would remove the flag.
- `@playwright/test` moves from `^1.49.1` to `^1.64.0` (user approved). Version 1.49.1 hangs on ESM spec files under Node 24.14.
- `tests/phase/package.json` (`"type": "module"`) scopes ESM to the phase specs.
- `index.html` loads the game with an inline `import './js/main.js'` tag. The browser preload scanner fetched `js/main.js` for a `src` tag even after `window.stop()`. The builder accepts both tag forms; the built output is unchanged.

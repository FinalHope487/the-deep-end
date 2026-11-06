# v3 P1 slice 4: diagnostic entry, packager phase map, SC-01 URL amendment

Status: DECIDED by the agent on 2026-11-07 under AGENTS.md "代 user 決策" (a deviation from an approved spec text is allowed with this record). Planning source: ChatGPT read-only PLAN `c2c_s4a1` (REASONED, no test run by ChatGPT). Spec: rev3 section 7 and 13, `2026-11-06-v3-p1-contracts-and-screenshots.md` sections 3 and 4.

## 1. What was built

| Item | Choice |
|---|---|
| Entry | `js/v3/entry/main.js`. Direct named imports of each module. It never imports `core/contracts.js`, because that file uses `export … from`, which `tools/build.mjs` rejects (BAD_EXPORT) |
| View | `js/v3/diagnostic/view.js`. `buildP1Summary` is pure and frozen. `renderP1Diagnostic` only sets text and `hidden` |
| Page | `js/v3/diagnostic/index.html`. One import map, one `<title>`, one `<script type="module">import './js/v3/entry/main.js';</script>` (path equals `--entry`) |
| Packager | `PHASE_BUILD_FLAGS` in `tools/package-version.mjs`. `p0` keeps the default build. `p1` passes `--entry js/v3/entry/main.js --html js/v3/diagnostic/index.html`. A phase without a map entry exits 1 before any folder is created |
| Seed | `?seed=` decimal uint32, default 42. Invalid value gives `P1_INVALID_SEED` and `ready:false` |
| Query bounds | min (0,-2,0), max (32,8,16). Gives 5 modules and 5 spaces for the default composition |
| State | `window.__deependV3 = {ready, error, summary:{seed, worldId, moduleCount, spaceCount, structuralDigest}}`. `ready:true` only after a real `composeWorld` and `queryWorld` |

## 2. Contradiction found and amended

Contract section 4 listed the two SC-01 URLs against `<artifact>` (header: "real `p1-rK` artifact").

| Row | Text before | Fact | Result when taken literally |
|---|---|---|---|
| SC-01A | `<artifact>/?seed=42` | The `p1-rK` artifact now has the diagnostic page as `index.html` | Shows the P1 diagnostic, not the v1 title |
| SC-01B | `<artifact>/?gen=v3&phase=p1` | An archived page sets `window.__deependVersion` and skips the router (`index.html:7-41`). Query `phase` is ignored. There is no `seed=61` | Shows seed 42 only |

Amended text (contract section 4 table edited in place):

| Row | New URL | Meaning |
|---|---|---|
| SC-01A | `<deployment-root>/?seed=42` | Root page stays v1 |
| SC-01B | `<deployment-root>/?gen=v3&phase=p1-rK&seed=61` | Root router sends the browser to `versions/p1-rK/` |

- Candidate acceptance uses `phase=p1-rK`. After freeze use `phase=p1`.
- New direct-entry check, not a screenshot: `<deployment-root>/versions/p1-rK/?seed=61`.
- At capture time record the routed URL, the landing URL, the artifact ID and the `payloadHash` in the screenshot manifest.
- Fixture screenshots from `tests/phase/p1-s4-preview.spec.js` are labeled fixtures. They are not a SC-01 PASS (CP-20, CP-21).
- rev3 section 13 sits in the git-ignored `work/` folder. It is not edited. This file replaces its SC-01 URLs.

## 3. Test fixture limits

- `p1-r2` in the preview spec adds a Worker probe file in a scratch git repo only. It proves a real module Worker loads under the artifact sub-path and returns the main-thread digest. It is not a product Worker. The P2 scheduler (lifecycle, cancel, retry, cache) stays out of slice 4.
- The three new test files are reviewer-owned (ChatGPT plan, written without change): `tests/fixtures/v3/s4-fixture.mjs`, `tests/unit/p1-s4-entry.test.mjs`, `tests/phase/p1-s4-preview.spec.js`.

## 4. Cost to revert

Low. Remove the `p1` map entry and the three production files. The rest of P1 does not import them.

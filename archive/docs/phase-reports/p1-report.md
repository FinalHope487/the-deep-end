# P1 phase report: NP baselines (slice 5, check P1-S01)

Date: 2026-11-07. Status: MEASURE-AND-RECORD. No NP limit is approved. The limits in section 4 are PROPOSED. Check P1-S02 (user approval) is not done.

## 1. What this report covers

| Item | Value |
|---|---|
| Check | P1-S01: capture v1 and v2 baselines for NP-01 to NP-11 on the target device, then propose limits (Foundation section 7) |
| Rule for missing equivalents | USER-2: label "no equivalent", record a local v3 baseline only, add phone numbers later (`docs/decisions/2026-11-06-v3-p1-user-decisions.md`) |
| Not covered | Walking speed and journey length (P1 has no controller; see P2-W01, P2M-J13). Phone numbers. Any v3 workload (P1 has no planner and no renderer) |

## 2. Method

| Item | Value |
|---|---|
| Tools | `tools/measure-np.mjs` (browser metrics, v1 and v2), `tools/measure-np02.mjs` (NP-02, v1 only) |
| Raw data | `docs/measurements/p1/np-baseline-v1.json`, `np-baseline-v2.json`, `np02-v1-walkable-area.json` |
| Device | Implementer PC, not a phone: Intel Core i5-13500H, 16 logical cores, 23.7 GiB RAM, Windows 11 |
| Browser | Playwright Chromium 156.0.8078.4. GPU flags `--enable-gpu --ignore-gpu-blocklist --use-angle=d3d11`. GPU model not recorded |
| Page | `index.html?test=1&seed=42` (v1) and `...&gen=v2` (v2). Viewport 1280x720. Quality is the page default |
| Runs | 3 runs per version, one seed (42), one device. Variance below is the spread of these 3 runs only |
| Script per run | Load. Click Start. Hold W. Walk 60 s in a fixed pattern (W 4 s, D 1 s, W 4 s, A 1 s). Then 3 cycles of: teleport 192 m away on each axis, wait 1.5 s, teleport back, wait 1.5 s |
| GPU memory | No reliable reading. The GPU figure is a PROXY: attribute and index bytes of each geometry in the scene, plus texture bytes with mipmaps, each object counted once. It excludes render targets, driver overhead and objects not in the scene. Do not call it GPU memory |
| JS heap | `performance.memory.usedJSHeapSize` after a forced `gc()`. The first run set sampled without `gc()` and showed a false upward trend in v1 (45, 58, 82 MiB); that set is discarded |
| Display limit | The display ran at 60 Hz: mean frame time is 16.67 ms in every run. This device cannot show frame-rate headroom above 60 fps. Use per-frame CPU work as the headroom figure |

## 3. Results

Numbers are the median of 3 runs with the range in brackets, unless one value is shown.

| ID | Measurement | v1 | v2 | Label |
|---|---|---|---|---|
| NP-01 | Start click to first movement after holding W | 227 ms (214 to 267) | 213 ms (169 to 323) | Measured |
| NP-01 (related) | Page load to Start enabled (`ready`), no network throttle | 14.1 s (14.1 to 14.8) | 47.1 s (46.4 to 54.6) | Measured. See section 5 item 1 |
| NP-02 | Walkable tiles reachable from spawn inside a 65 m square (4,225 m2), 8 corpus seeds | 3,629 to 3,885 m2, median 3,682 m2 | no equivalent (no tile query outside the browser) | v1 measured |
| NP-03 | Background planning time per unit | no equivalent (v1 generates on the main thread) | Teleport-to-ready 192 m away, includes Worker planning: first cycle 534 to 556 ms, later cycles 265 to 378 ms; return 198 to 301 ms. No per-unit percentile: the API has no unit hook | v2 measured, coarse |
| NP-04 | Main-thread publication cost | Frame CPU work 0.60 to 0.69 ms mean. One frame of 117 to 150 ms per 60 s run (0.03% of frames over 40 ms). Chunk build 4.1 to 4.6 ms mean, 11 to 14 ms max | Frame CPU work 0.37 to 0.42 ms mean. Max frame 16.8 ms. Cell build is a time-sliced job: 70 to 73 ms total work per cell, 94 to 100 ms max | Measured |
| NP-05 | P2 tracked GPU memory (proxy) | no equivalent (P2 does not exist yet) | no equivalent | Local v3 baseline pending P2 |
| NP-06 | Final tracked GPU memory (proxy) | 10.6 MiB after the walk (geometry 6.1, textures 4.4); 9.4 MiB at start | 6.3 MiB after the walk (geometry 1.9, textures 4.4); 5.7 MiB at start | Proxy, measured |
| NP-07 | Retained cache and JS heap (after `gc()`) | 18.4 at idle, 21.6 at start, 23.9 MiB after the walk, 32.6 MiB after travel | 9.6 idle, 13.9 start, 14.9 MiB after the walk, 16.0 to 19.3 MiB after travel | Measured |
| NP-08 | Release after travelling away | Geometry count 133 and texture count 6 at every return. Heap at return 32.5, 32.6, 32.6 MiB | Geometry count 29, 26, 26. Heap at return 16.3, 17.5, 18.1 MiB (run 1); 16.3, 16.0, 19.3 MiB (run 3) | Measured, 3 cycles |
| NP-09 | Fixed-seed corpus | `CORPUS.seeds` in `js/gen2-measure.js`: 1, 2, 3, 7, 42, 99, 1234, 20261024 | same | Existing corpus, used for NP-02 |
| NP-10 | Endurance | Heap flat from 30 s to 60 s (23.9 MiB) | Heap flat from 40 s to 60 s (14.9 MiB) | 60 s only. A long run is NOT done |
| NP-11 | Mobile Worker count | 0 Workers | 2 Workers (`page.workers()`). This PC has 16 logical cores | Phone not measured (pending device) |

Frame rate: 3,594 to 3,602 frames in 60 s in every run (60 fps, display limited). Slow frames (over 40 ms): v1 1 of about 3,594 per run, v2 none.

## 4. Proposed limits (PROPOSED, needs user approval in a dated decision file)

Evidence grade: A = from a measured baseline of this report. B = derived from a baseline with a stated margin. C = no baseline; the value is a design choice.

| ID | Proposed limit | Grade | Why this value |
|---|---|---|---|
| NP-01 | Start click to first movement: at most 500 ms on this PC | B | About 1.5 times the worst of the 6 runs (323 ms). A phone value needs a phone run |
| NP-02 | Safe start area of at least 900 m2 (30 m by 30 m) of verified walkable tiles | C | v1 offers more than 3,600 m2 inside a 65 m square, but v1 is one open hall and v3 start rules differ. 900 m2 is a floor, not a v1 match |
| NP-03 | No limit now. Define after the P2 planner exists, from a per-unit p95 on this PC | C | v2 gives only a coarse teleport time. A limit without a per-unit hook is a guess |
| NP-04 | Frame CPU work at most 2 ms mean. Per-unit total work spread over frames so that no frame exceeds 25 ms | B | v1 and v2 stay under 0.7 ms mean. The v1 117 to 150 ms frame shows a limit on max frame is needed, but one frame per run is too few to set a percentile |
| NP-05 | P2 proxy at most 16 MiB | B | 1.5 times the v1 proxy after a walk (10.6 MiB). The proxy is not GPU memory |
| NP-06 | Final proxy at most 32 MiB. Per-phase caps set from the measured P2 proxy | B | 3 times the v1 proxy. Each content phase needs its own measured ceiling (Foundation section 7) |
| NP-07 | JS heap after `gc()` at most 64 MiB after travel | B | 2 times the v1 value after travel (32.6 MiB) |
| NP-08 | After 3 away and return cycles: same geometry and texture count as the first return, heap growth at most 1 MiB per cycle | A for v1, B for v2 | v1 grows 0.05 MiB per cycle. v2 grows about 0.8 to 3 MiB per cycle: v2 would not meet this value. The cause is not investigated (a tile cache is a likely cause) |
| NP-09 | Use the 8 existing seeds plus seed 61 (the SC-01B seed): 9 seeds, a fixed list, no re-draw | B | Reuses an existing corpus. Adding 61 keeps the screenshot seed under the same structural tests |
| NP-10 | 30 minutes on this PC, 10 minutes on the phone, heap growth under 10% after the first 2 minutes | C | Only 60 s was run. No long-run data exists |
| NP-11 | At most 2 Workers on mobile until a phone run exists | B | v2 uses 2. A phone run can raise or lower it |

## 5. Findings that need the user's attention

1. **Start availability.** On this PC with no network limit, v1 needs 14.1 s from page load to an enabled Start button, and v2 needs 47.1 s. GB-07 asks for Start within 5 s of first load on a specified 4G profile. The two figures are not the same test. This report does not judge GB-07. The cause (world preparation, shader warm-up or audio decode) is not investigated. The test uses `ready` from `js/main.js:684-690`, which is set when no chunk is pending and `ui.enableStart()` runs.
2. **v1 frame spike.** Each v1 run had one frame of 117 to 150 ms in 60 s. The cause is not investigated. GB-02 (at most 2% of frames above 40 ms) holds: 0.03%.
3. **v1 chunk build.** Mean chunk build is 4.1 to 4.6 ms against GB-05 (4 ms of main-thread map generation per frame). GB-06 says a v3 loading unit must map before enforcement, so this report records the number and gives no verdict.
4. **v2 retention.** v2 heap and geometry count grow a little with each away and return cycle, and v1 does not.
5. **Display limit.** A 60 Hz display hides any headroom above 60 fps.

## 6. Limits of this report

- One device, one seed per browser run, 3 runs. The spread is small, but 3 runs give no percentile.
- No phone run. All phone fields are "pending device" (USER-2).
- The GPU figure is a proxy. No true GPU reading exists.
- NP-03 and NP-10 have weak data (section 3).
- The measurement tools have no automated test. They are exploration code (AGENTS: no automated test for POC work). Their evidence is the raw JSON files, and each tool ran end to end with `valid: true`.
- No ChatGPT or other cold review of these tools was run.

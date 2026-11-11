# Original expectations (first session, 2026-10-17)

Source: first Claude Code session of this project (transcript `122daf80-…jsonl`, copy `a921a2d0-…jsonl`), 15:02–16:03 UTC. Text is the user's own words or the user's chosen answers in the /grill-me interview. This file is a digest for comparison only; it is not a rule file.

## A. User's own words (first message)

- Build a "poolcore exploration simulator".
- Map: "最好可以用隨機算法自動往外生成" (should expand outward by a random algorithm).
- Performance: must run 60 fps smoothly on mid-range phones and tablets. "以不卡頓為優先" (no stutter has top priority).
- Process: record this rule, use /grill-me to clarify, write a spec, do not implement yet.
- Course assignment: single `index.html` (small external files allowed), GitHub Pages, spec + screenshot + link. Deadline 10/19 23:59.

## B. Interview answers (user choices; "(rec)" = user accepted the AI recommendation)

| # | Topic | User decision |
|---|---|---|
| Q1 | View | 3D first person, Three.js (rec) |
| Q2 | Gameplay | Explore + light goals. User added: several main regions to travel to; exploration % and distance; extra info "不佔空間" or inside options only; before reaching the goal, atmosphere turns oppressive over time (relaxed and exploratory early, oppressive late); **main line finishable within 30 minutes** |
| Q3 | Input | Touch + keyboard/mouse (rec) |
| Q4 | Map | Infinite chunks + landmark regions (rec) after user asked to re-ask following Q2 |
| Q5 | Regions | 4 regions, getting more oppressive (rec): shallow hall, stepped pools, narrow pipe corridor, deep dark pool, then exit |
| Q6 | Oppression driver | Progress first, time as floor (rec): max(regions/4, elapsed/25 min) |
| Q7 | Ending | Glowing exit door + result screen (rec) but **do not show the seed on the result screen** |
| Q8 | Water | Shallow water wadeable, deep water blocked (rec) **plus** a dynamic "wet" screen filter when splashed |
| Q9 | Exploration % | Regions + small finds (rec): 4 regions = 60 %, 12 finds = 40 %; **pick up only by approaching and clicking, with a small bubble saying "can take"** |
| Q10 | HUD | Only a pause button + region name fade-in (rec); everything else in pause menu |
| Q11 | Wet filter | Splash on entering water, dries off about 4 s after leaving (rec) |
| Q12 | Guidance | Distant glow + directional sound + occasional colored floor lines (rec) |
| Q13 | Sound | **Free audio files (CC0)**, not live synthesis |
| Q14 | Quality | Auto-reduce resolution + manual override (rec); step down below 55 fps |
| Q15 | Oppression level | **Add distant "presences"** (silhouettes), no chase, no jumpscare |
| Q16 | Save | Auto-save + Continue (rec) |
| Q17 | Opening | Title screen + click to start (rec) |
| Q18 | Style | Soft realistic tiles, procedural white/light-blue tile texture, fog, fake glow quads, no bloom (rec) |
| Q19 | Presence timing | From region 3, rare; fades when looked at 1 s or approached to 15 m (rec) |
| Q20 | Tests | Playwright tests (rec); real-phone 60 fps checked by the user |
| Q21 | Name | "the-deep-end / 深水區" (rec) |
| Q22 | Details | Traditional Chinese UI; walk + run, no jump, stairs auto step; finds are duck, towel, goggles, locker key; CC0 audio credited in "About" (rec) |
| — | Devlog | Keep `docs/devlog.md`, one entry per round (rec); also used as evidence of AI iteration |

## C. Resulting spec (first version, `docs/spec.md` as written 2026-10-17 16:01)

Key numbers: 16 m chunks; budget 16.6 ms/frame, ≤ 100 draw calls, ≤ 150 k triangles, ≤ 1 chunk generated per frame, ≤ 4 ms generation work; audio ≤ 3 MB; first load ≤ 5 s on 4G; 4 landmark regions 2×2 chunks each; route about 600 m; main line 15–25 min, cap 30 min; walk 3 m/s, run 5.5 m/s; 13 acceptance items A1–A13.

Out of scope in v1: swimming/diving, jumping, monsters/chase/fail state/jumpscare, multiplayer/leaderboard, real-time reflection/shadow/bloom.

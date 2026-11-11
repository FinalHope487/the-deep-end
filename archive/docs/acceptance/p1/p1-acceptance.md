# P1 acceptance record

Date: 2026-11-07. Decision file: `docs/decisions/2026-11-07-v3-p1-user-check-and-np-limits.md`.

## Result

| Item | Value |
|---|---|
| Phase | `p1` (frozen) |
| Accepted candidate | `p1-r1` |
| Source commit | `602dd180e9f7012d57ee0ed7e5e290d5db882860` |
| Payload hash | `a3f96cb19dde9f6ee5b30bd7351405bf3303f7dc070c2573f9e01230211ec354` (the same in `versions/p1-r1/manifest.json` and `versions/p1/manifest.json`) |
| P1-U01 | PASS, user answer on 2026-11-07 |
| P1-S02 | Approved, see the decision file |

## Screenshots

The user took both shots and sent them in chat.

| ID | File | Content | Size | Approved size and DPR | Status |
|---|---|---|---|---|---|
| SC-01A | `sc-01a-v1-title.webp` | v1 title screen (深水區, buttons 開始 / 繼續 / 跳轉關卡 / 設定) | 1088 x 846 | 1280 x 720, DPR 1, quality High | Content matches. Size differs from the approved value |
| SC-01B | `sc-01b-diagnostic.png` | P1 diagnostic: seed 61, 5 modules, 5 spaces, digest `28ed65302a6d82662b5fc3c0602f17facacb2f76f0132c73e166850d9cfe3f7a`, label `P1｜v3 封存版｜602dd18` | 1088 x 846 | 390 x 844, DPR 3, quality Low | Content matches the local and the published page. Size differs from the approved value |

## Deviations and unknowns

- Both shots have a desktop size (1088 x 846). The approved sizes were 1280 x 720 (SC-01A) and 390 x 844 at DPR 3 (SC-01B). The agent did not change the approved table: the content is the evidence that the right page ran, and the user gave the PASS with these shots.
- The shots show no address bar. The URL and the quality setting are NOT proven by the files. The SC-01B digest and label match the agent's own check of the published `p1-r1` page.
- The phone check (iPhone Safari, USER-5) is the user's statement. No phone screenshot is stored.

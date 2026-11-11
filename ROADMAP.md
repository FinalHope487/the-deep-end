# Roadmap

制定在建立目標時不可跨越的準則寫在〈硬約束〉。
commit 與 CI run 的 SHA 與狀態寫在〈基線〉。
新想法寫進〈待辦項目〉並標記，不打斷目前任務。

此檔不准自己寫新欄位，不准寫已拍板的決策（寫 `docs/decisions/`）。

- `[now]` — 阻塞當前任務
- `[next]` — 目前模組穩定後就做
- `[blocked]` — 需要 user 先拍板，見 `QUESTIONS.md`
- `[later]` — 現在做屬於過早設計，等需求明確再說
- `[parked]` — 先記錄，暫不評估

這五個以外的標籤不准用。

`[later]` 條目寫在 `ROADMAP/later.md`，`[parked]` 寫在 `ROADMAP/parked.md`，其餘留在本檔〈待辦項目〉。狀態改了就把條目搬到對應的檔。

格式如下:

### [狀態] {一句話描述}
**具體細節**：{描述問題狀態}
**怎麼做**：{描述解決問題的方法，僅限已知解法的事項}
**會改變什麼**：{明確做了這件事會改到什麼}
**做後回退代價**：{假設這件事做完了，要改回來得額外做什麼——`git revert` 哪個 commit、哪些資料或產出要另外清、有沒有東西回不來。「還沒做所以是零」不算答案}

範例如下:

### [next] 高負載時介面頓不頓，只有人工才測得出來
**具體細節**：2026-xx-xx 已驗證三個背景工作同時跑不逾時（N passed），手感部分 user 還沒實際操作過
**怎麼做**：在背景工作執行期間手動觀察介面的響應時間
**會改變什麼**：確認頓的話要把並行上限設定調成 1；這一步無法自動化，需要 user 實際操作時觀察
**做後回退代價**：結論若是要把並行上限設成 1，回退就是把它改回原值，一行設定；沒有資料或產出受影響

---

## 硬約束

不管在做什麼，這些不能跨過。每條 ≤2 行，且必須寫明誰在強制它。

<!-- - **<一句話規則>** **強制**：<測試名／哨兵／程序>
     長說明放 `SOP/` 或 `docs/decisions/`，不要寫在這裡 -->

- **The game must build into one HTML file** **強制**：user direction 2026-11-09 (`docs/decisions/2026-11-09-drop-fps-and-assignment-limits.md`)

---

## 基線

**只有一份，覆寫不追加，≤40 行。** 數字取自本輪實跑；沒跑的層寫「未跑」，
不得沿用上一輪的數字。

**2026-11-11 archive round**: docs only, scope exempt from automated tests. No test run. HEAD: see `git log -1` (this file is in that commit).
**Workbench (last code commit `4829df7`)**: `node workbench/feel-check.mjs` 73/73 PASS at that commit. Not run again in this round. Phone: not run.
**Resident suite (game)**: not run; no game file changed. Commands: `docs/testing.md`.
**CI run**: not run.

## 待辦項目

<!-- 條目照本檔開頭的格式。做完的直接刪掉，不留「已完成」條目。 -->

No item starts before the user says so in chat (2026-11-11: "但先不要開始做或派任務"). Item numbers, tiers and order: `docs/decisions/2026-11-11-component-order-and-tiers.md`.

### [blocked] The user measures the workbench on a phone (item 1, tier C)
**具體細節**：The 33 ms limit holds only with a phone number. The viewer renders at pixel ratio 1, so the number is the low-cost case.
**怎麼做**：`node workbench/serve.mjs --lan`, open the printed `phone:` URL, wait 10 s, read mean and p99 (`workbench/README.md`).
**會改變什麼**：No file. The light choice (item 2) depends on the number.
**做後回退代價**：None.

### [blocked] Light system test and choice (item 2, tier C)
**具體細節**：Light is the largest gap to the pictures: flat grey-green against strong directional light. There is no design.
**怎麼做**：Fable writes a test of 2 or 3 methods in one room; the builder builds them; the user chooses from pictures.
**會改變什麼**：`workbench/js/kit/`, light presets. Items 25 to 27 follow this choice.
**做後回退代價**：`git revert` the test commits; delete the test presets.

### [next] Foundations that need a design: material for each surface, more than one water body (items 3, 4, tier C)
**具體細節**：One material covers all surfaces. One water level covers the room. Fable has not written the designs.
**怎麼做**：Fable writes each design; the builder builds; water bodies get a test room.
**會改變什麼**：Room format in `workbench/js/room.js`, `workbench/rooms/*.room.json`. A format change needs a decision file.
**做後回退代價**：`git revert`; rooms in the new format must be changed back by hand.

### [next] Foundations to build directly: face class tags, gallery room, review advisory items (items 5 to 7, tier A)
**具體細節**：The gallery room is the evidence place for each component. The advisory items: doorway top collision, ramp below a lintel, doorway higher than the ceiling.
**怎麼做**：One builder round.
**會改變什麼**：`workbench/js/room.js`, `workbench/js/geometry.js`, one new room and sheet.
**做後回退代價**：`git revert` the round.

### [next] Shape components (items 8 to 20, tiers A and B)
**具體細節**：Columns, window rows, arch, platforms, sunken pool, stairs into water, railings, ladder, curved walls, openings, spiral stair, water shaft, props. Each is one object type with a coordinate and parameters.
**怎麼做**：Tier A in builder rounds; tier B after a ChatGPT plan. Evidence: gallery picture, dry and in water, and the collision check.
**會改變什麼**：The `OBJECTS` table in `workbench/js/room.js`, geometry and collision.
**做後回退代價**：`git revert` each round; rooms that use a removed type do not load.

### [next] Water: ripple styles, deep tint, caustics, then the final look by the user (items 21 to 24)
**具體細節**：The `waves` ripple style is too regular. Water colour is tint times ambient light, so it follows the light choice. Parked preset sets G, H, K are not committed and not verified.
**怎麼做**：Tier B rounds for 21 to 23. Then the user tunes with the sidebar (`?panel=1`) and exports a preset.
**會改變什麼**：`workbench/js/kit/water.js`, `workbench/js/params.js`, water presets.
**做後回退代價**：`git revert`; exported presets stay valid only if the parameter keys stay.

### [next] Light details, layer views, rebuild of the pictures (items 25 to 29)
**具體細節**：Glowing panels, local lamps, contact shade, fog, exposure and grade, layer views; then rooms for the 21 pictures made from the components. The user judges each room.
**怎麼做**：After item 2 and the components. Tier B.
**會改變什麼**：`workbench/js/kit/`, `workbench/rooms/`, `workbench/sheets/`.
**做後回退代價**：`git revert` each round.

# Roadmap

制定在建立目標時不可跨越的準則寫在〈硬約束〉。
新想法寫進〈待辦項目〉並標記，不打斷目前任務。

此檔不准自己寫新欄位，不准寫已拍板的決策（寫 `DECISIONS.md`）。

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
     長說明放 `SOP/` 或 `DECISIONS.md`，不要寫在這裡 -->

- **The game must build into one HTML file** **強制**：user direction 2026-11-09 (`DECISIONS.md`)

---

## 待辦項目

<!-- 條目照本檔開頭的格式。做完的直接刪掉，不留「已完成」條目。 -->

No item starts before the user says so in chat. Item numbers, tiers and the order of work: `docs/components-plan.md`. The order is in that file only.

### [next] Foundations to build directly: face class tags, gallery room, review advisory items (items 5 to 7, tier A)
**具體細節**：The gallery room is the evidence place for each component. The advisory items: doorway top collision, ramp below a lintel, doorway higher than the ceiling.
**怎麼做**：One builder round.
**會改變什麼**：`workbench/js/room.js`, `workbench/js/geometry.js`, one new room and sheet.
**做後回退代價**：`git revert` the round.

### [next] Document check script and the hook that runs it (item 31, tier A)
**具體細節**：No machine checks the documents. A dead path or a file above its size limit is found only when an agent reads it. Fable did not write the script: Fable does not write code (user, 2026-11-10).
**怎麼做**：One Node script with no dependency, for example `tools/check-docs.mjs`, plus an npm script. It fails when: a path in backticks in a current Markdown file does not exist (ignore `archive/`, `node_modules/`, `work/`, placeholders and command lines); a Markdown file is above 32 KiB; `STATE.md` is above 6 KiB; `CLAUDE.md` imports a file that does not exist. A pre-commit hook in a tracked hooks folder runs it, and `git config core.hooksPath` turns the hook on. The agent then runs the check at each commit without a rule to read.
**會改變什麼**：`tools/`, `package.json` scripts, a hooks folder, the local Git config. No dependency is added.
**做後回退代價**：`git config --unset core.hooksPath`, then `git revert`.

### [next] Layer views (item 28, tier B)
**具體細節**：Moved before the light test by the user on 2026-11-17. A layer view shows which factor makes an effect. It needs the face class tags (item 5).
**怎麼做**：ChatGPT plan, then one builder round.
**會改變什麼**：`workbench/js/kit/`, the viewer. Tool code only: the room, component and collision code must not need it.
**做後回退代價**：`git revert` the round.

### [blocked] Light system test and choice (item 2, tier C)
**具體細節**：Light is the largest gap to the pictures: flat grey-green against strong directional light. There is no design. Each method must have a low-cost form that still shows light against dark.
**怎麼做**：Fable writes a test of 2 or 3 methods in one room; the builder builds them; the user chooses from pictures.
**會改變什麼**：`workbench/js/kit/`, light presets. Items 25 to 27 follow this choice.
**做後回退代價**：`git revert` the test commits; delete the test presets.

### [next] Analyse `pool12` and `pool20` (item 32, tier C)
**具體細節**：The component list was made without these two pictures. They can add components or room format needs.
**怎麼做**：Fable reads the two pictures before the room format changes (items 3, 4).
**會改變什麼**：`docs/components-plan.md` only.
**做後回退代價**：None.

### [next] Foundations that need a design: material for each surface, more than one water body (items 3, 4, tier C)
**具體細節**：One material covers all surfaces. One water level covers the room. Fable has not written the designs. The room file has no version field.
**怎麼做**：Fable writes each design; the builder builds; water bodies get a test room. Add a version field to the room file in the same change.
**會改變什麼**：Room format in `workbench/js/room.js`, `workbench/rooms/*.room.json`. A format change needs a line in `DECISIONS.md`.
**做後回退代價**：`git revert`; rooms in the new format must be changed back by hand.

### [next] Shape components (items 8 to 20, tiers A and B)
**具體細節**：Columns, window rows, arch, platforms, sunken pool, stairs into water, railings, ladder, curved walls, openings, spiral stair, water shaft, props. Each is one object type with a coordinate and parameters.
**怎麼做**：Tier A in builder rounds; tier B after a ChatGPT plan. Evidence: gallery picture, dry and in water, and the collision check. A new component goes into the gallery room first, not into a picture room.
**會改變什麼**：The `OBJECTS` table in `workbench/js/room.js`, geometry and collision.
**做後回退代價**：`git revert` each round; rooms that use a removed type do not load.

### [next] Early assembly of one simple picture (item 30, tier B)
**具體細節**：Added by the user on 2026-11-17. It tests that the component vocabulary and the room format can make a picture. It is not look tuning.
**怎麼做**：After the dry shape components (items 8 to 11). Fable chooses the picture.
**會改變什麼**：One room and one sheet in `workbench/`. Gaps found go to `docs/components-plan.md`.
**做後回退代價**：Delete the room and the sheet.

### [next] Water: ripple styles, deep tint, caustics, then the final look by the user (items 21 to 24)
**具體細節**：The `waves` ripple style is too regular. Water colour is tint times ambient light, so it follows the light choice. Parked preset sets G, H, K are not committed and not verified. Each effect needs a low-cost form (example from the user: no reflection, but the water still shows change).
**怎麼做**：Tier B rounds for 21 to 23. Then the user tunes with the sidebar (`?panel=1`) and exports a preset.
**會改變什麼**：`workbench/js/kit/water.js`, `workbench/js/params.js`, water presets.
**做後回退代價**：`git revert`; exported presets stay valid only if the parameter keys stay.

### [next] Light details, then the rebuild of the pictures (items 25 to 27, 29)
**具體細節**：Glowing panels, local lamps, contact shade, fog, exposure and grade; then rooms for the 21 pictures made from the components. The user judges each room.
**怎麼做**：After item 2 and the components. Tier B.
**會改變什麼**：`workbench/js/kit/`, `workbench/rooms/`, `workbench/sheets/`.
**做後回退代價**：`git revert` each round.

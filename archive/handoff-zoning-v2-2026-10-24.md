# 交接：v2 分區重做（地形＋泳池＋跨樓層先於裝飾）· 2026-10-24

接手者：Opus（Claude Code）。先讀本檔，再讀 `AGENTS.md`、`handoff-generation-redesign-2026-10-23.md`。
實作計劃全文在 `handoff-zoning-v2-plan-2026-10-24.md`（ChatGPT 原文，逐項引用 114 個問題編號）；本檔只放接手所需的現況、規則與流程。

## 1. 先決條件（不可違反）

| 規則 | 來源 |
|---|---|
| 只動 `?gen=v2`；v1、預設網站、存檔契約不變 | 交接文件 + AGENTS |
| 不選、不做 ≥20 組預製建築（預製組） | 使用者，確認兩次 |
| 地形與泳池整套完成前，不加裝飾物件，也不為「看起來更亂」調建築參數 | 使用者，2026-10-24 中途補充 |
| 樓層面積比例 1F : 2F : B1 ≈ 2 : 1 : 1 是**使用者自己的目標**，不是 ChatGPT 發明。**這是大致方向，不是必須嚴格遵守的規範**：不當硬性驗收門檻，不為湊比例犧牲空間品質；偏離時回報數字與原因即可，不必修到達標 | 使用者（兩次強調）；`docs/decisions/2026-10-24-floor-ratio-2-1-1.md` |
| 走道不要都那麼長；大型建築可吃掉鄰格空間，不要靠加長走道留空白；走道位置、門、不同高度的門、額外蜿蜒走道要多樣；用制式生成做出不制式的空間 | 使用者 |
| Claude 只執行；規劃與審查交給 ChatGPT（Claude with ChatGPT）。不要替 ChatGPT 預先決定範圍 | 使用者 |
| 預設中文回答；AGENTS.md 全文適用（先紅後綠、小步、決策分級、回報格式） | AGENTS.md |
| 文件不得加新標題或欄位於 SOP／ROADMAP／QUESTIONS（除非使用者要求） | AGENTS.md |

## 2. 倉庫現況

- HEAD `88c1cce`（折返梯，已 push `main`）。工作樹只多一個未提交檔：`docs/decisions/2026-10-24-floor-ratio-2-1-1.md`，連同本檔與 plan 檔一併提交。
- `work/` 目錄（`zoning-request.md`、`issue-enumeration-request.md`、`.gamedev-router/` 解壓的 75 份指南）**只在本機**，已寫進 `.git/info/exclude`，不要提交。需求原文已摘進本檔第 1 節。
- 基線：unit 167 全綠；desktop 69 通過／2 skip；`npm run build` 成功。A11 v2 單次 56.1 fps、慢幀 1.47%（機器可能有背景負載，不可信）。這些數字是折返梯之後、審查修復前後的實跑，見 `ROADMAP.md`〈基線〉。
- 測試指令：`npm run test:unit`（約 6.5 分鐘）；`npm test -- --project=desktop`（約 12 分鐘）；`npx playwright test --project=perf --no-deps -g "A11 v2"`（要機器沒別的負載）；`npm run build`。背景跑，等完成通知，不要輪巡。Playwright globalSetup 會重建被追蹤的 `dist/index.html`，所以它會顯示為已修改，隨改動一起提交。
- 近期完成：巨型池廳（`ad84410`、`071b008`）、折返梯（`88c1cce`，含 Codex 審查後修的下降梯末階立面，測試 `tests/unit/gen2-mesh.test.mjs`）。
- 暫停：螺旋梯。任務 `c2c_8a13` 的計畫（約 270°–315° 弧、中央實心柱、`kind:'spiral'`、`addSpiral`、`spiralMesh`、`gen2Spiral(lv)` 測試介面）已收到，**未實作**。要不要做、何時做，看計劃全文。

## 3. v2 生成器現況（已讀過程式碼）

- `CELL2 = 64`（`js/gen2.js:8`，由 `dbbe91a` 引入）；每格一座 1F 廳（20–50 m）＋通往四鄰的走廊（走廊從廳內 1 m 到格邊，`gen2.js:~403-418`；偏移 ±4 m、寬 3–6 m 由邊雜湊決定，`edgeCorridor2` `gen2.js:341`）。
- 樓層高度：`Y[1]` = +6.5..9、`Y[0]` = 0、`Y[-1]` = −6..−8（每個 seed 一次，`gen2.js:350`）。
- 2F／B1 房間只出現在有樓梯的格子（2F 約 50%、B1 約 40% 嘗試；先試折返梯 `SWITCH_SHARE` 0.4，不行退直跑梯），大小 12–30×10–26 m（B1 12–30×8–22 m），夾在自己的格內（`clampRect2`）。沒有各樓層面積配額，也沒有跨格的 2F／B1 房間。
- 巨型廳（`GIANT_SHARE` 0.15）只沿 x 軸配對兩格，接縫處打通無走廊；池子不跨接縫，兩半各有池。
- 牆由每格 0.5 m 點陣畫出，並用 `world.roomAt` 查鄰格（`mesh2.js:113-117`），所以格緣相接的兩房間沒有牆。
- 碰撞與繪製分開讀同一份 plan；`candidates()` 一個 (x,z) 回傳多個可站高度，`surfaceAt` 取 STEP2=0.8 內最近者。
- 已知耦合：`plan.rooms[0]` 被當成本格主廳（出生點 `restPoint`、樓梯、`gen2-paths` 測試）。

## 4. ChatGPT 橋接（Claude with ChatGPT）

- 指令：`node D:/my-projects/claude-with-chatgpt/bin/c2c.js …`（hub 模式，伺服器端指令用 `-w hub`；專案指令用 `-w D:/my-projects/dreamcore-explorer`）。workspace 名稱 `dreamcore-explorer`，id `6ff5857c6307`。
- 開始前：`c2c doctor -w hub --json`，綠燈才動 ChatGPT。完整流程見 `C:\Users\sword\.claude\skills\agents-with-chatgpt\references\claude-with-chatgpt.md`。
- 瀏覽器：用內建瀏覽器（`mcp__Claude_Browser__*`），只用一個分頁（`tabId: seed`），不關。送訊息：`find` 輸入框「問問 ChatGPT」→`form_input`→`find`「傳送」→按。等回覆：每 10 秒讀 `document.body.innerText`，看「回覆完畢」；顯示「無法載入這則回覆」時 `location.reload()` 就會出現。推理強度滑桿在輸入框旁，聚焦後按 ArrowRight 可從 Medium 調到 High。
- 兩個對話：

| 對話 | URL | 用途 | 任務 |
|---|---|---|---|
| 主對話（`c2c session` 存的就是這個） | `https://chatgpt.com/c/6adc74d2-2d38-83e8-8a3c-b9f9379e5d6b` | 規劃／審查，推理強度高 | `c2c_b41d` 折返梯（**已做完、已 push，但尚未回報 EXECUTED**，使用者說 Codex 沒額外任務就不回報直接做）；`c2c_8a13` 螺旋梯（暫停）；`c2c_e5c1` 分區重做（PLAN 已定稿，七階段，見下） |
| 分析對話 | `https://chatgpt.com/c/6adc9b2f-e354-83ec-b8c8-ce1df7ab5aa8` | 列出 114 個問題＋產實作計劃（已調成高） | `c2c_f7d2`：ITERATION 0＝114 項問題清單；ITERATION 1＝實作計劃（見 plan 檔）。這個對話**沒有**用 `c2c session set --url` 存 |

- `c2c session` 目前的 checkpoint：任務 `c2c_e5c1`，`PLAN_RECEIVED`，下一步「第一個切片」。回報 EXECUTED 時帶對應 `TASK_ID`；ChatGPT 的 MCP 只讀工作樹 diff、沒有 git log/show，**所以要請它審查就趁還沒 commit**。
- 控制訊息 < 1 KB、不貼檔案內容；長需求寫進檔案讓 ChatGPT 用 `read_file` 讀（`work/` 底下的檔 ChatGPT 讀得到）。

## 5. 分區重做的決定（c2c_e5c1，ChatGPT 定稿，Claude 未驗證任何數字）

架構：保留 64 m cell 當載入／繪製單位，但**不再當房間單位**。層級 District（2×2 cells＝128 m）→ Building（擁有跨格、跨 1F/2F/B1 的三維體積）→ Space → Surface；Connection（含 Portal）連接兩個 Space（相同或不同高度）。樓梯連接兩個 Space，不再綁「某格的主廳」。B1 迷宮由 Building 的 B1 入口 Space 長出，可跨格。

階段（依賴順序）：01 空間量測＋三維資料契約 → 02 水平分區、建築占地、基本地形 → 03 1F/2F/B1 體積所有權＋跨層骨架＋房型 → 04 完成地形與建築開口（**TERRAIN COMPLETE**）→ 05 完成整套泳池與水體（**POOL COMPLETE**）→ 06 裝飾 → 07 混亂度調參。04、05 通過前不得做 06／07。

**2:1:1 是大致要求，不是硬規範（使用者強調）。** plan 檔階段 03A 把它寫成「彙總容許帶 45–55%／22–28%／22–28%、2F/B1 比值 0.85–1.15」並列入驗收；那些容許帶是 ChatGPT 自訂的實作容許值，**不是使用者的要求**。接手後：量測並回報實際比例即可；未落在容許帶不算失敗，不得為此扭曲空間或重寫階段；階段 03 的驗收請改成「趨勢上接近、各區可有明顯差異」，並在動工前請 ChatGPT 依此改寫。

ChatGPT 建議的 2F／B1 覆蓋率（1F 平面聯集為分母）是**初始建議、未驗證**：開放池廳 10–30%／15–40%；疊層中庭 50–80%／20–50%；地下蓄水 10–35%／55–85%；混合 35–60%／35–60%；全世界各約 1F 的 40–60%。與使用者的 2:1:1（2F、B1 各約 1F 的一半）要在階段 03 對齊，不一致處要標出來問使用者。

注意：ChatGPT 的 114 項問題清單是**原始碼層級的審查，未執行任何測試或量測**；「推測」標記的項目不是已確認的錯誤；幾乎每項標「阻擋完成：是」，沒分輕重。分輕重的結果見 plan 檔的涵蓋表。

## 6. 接手後的第一步

1. 讀 plan 檔，找出它指定的「ITERATION 1 切片」（Stage 01A 修 cell key＋01B 量測工具；注意它與主對話 `c2c_e5c1` 的「`zoning2.js` 契約」切片不同，以 `c2c_f7d2` 這份為準，因為它逐項引用問題編號；兩份對 district 大小的說法也不同：`c2c_e5c1` 用 2×2 cells，`c2c_f7d2` 留到階段 01 量測後決定）。
2. `git status` 只有本檔、plan 檔、`docs/decisions/2026-10-24-floor-ratio-2-1-1.md`；先提交這三個（`docs:`）。
3. 照 AGENTS：先寫會失敗的測試，確認紅的原因，再實作；測試用專案自己的指令。
4. 做完一批後，請 ChatGPT 審查要在 commit 之前；程式碼批次 push 前派唯讀 subagent 冷審（AGENTS）。
5. 每輪結束前補 `docs/devlog.md`、`ROADMAP.md` 基線，commit 並 `git push origin main`。

## 7. 未做／未驗證

- 本輪沒有改任何程式碼；折返梯外觀沒截圖看過（Codex 也只驗了幾何）。
- A11b（整合顯卡）、A13（線上）、A12（真機）未跑；A11 v2 要在沒有背景負載下重測。
- 114 項問題清單、覆蓋率數字、七階段順序都是 ChatGPT 的文字產出，未經 Claude 逐項對程式碼核實；只核實過：`CELL2`、`Y` 範圍、2F/B1 房間來自樓梯、`rooms[0]` 耦合、巨型廳只沿 x 配對。
- 我曾斷言「2:1:1 是 ChatGPT 加的」，是錯的（使用者糾正）；找不到文字紀錄時，先問，不要斷言。

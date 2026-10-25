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

- **中階手機／平板上 ≥ 50fps（目標 60），流暢優先於畫質與功能** **強制**：A11／A11b 效能測試（≥ 50 fps，超過 40 ms 的幀 ≤ 2%）
- **交付 `index.html` 為入口的靜態網頁，可引用少量外部檔，公開在 GitHub Pages** **強制**：課程作業規定
- **地圖用隨機演算法自動往外生成** **強制**：課程作業規格（user 指定）
- **2026-10-19 23:59 前繳交（遲交至 10-20 16:00）；繳交含網站連結、介面截圖、規格文字說明** **強制**：課程作業規定

---

## 基線

**只有一份，覆寫不追加，≤40 行。** 數字取自本輪實跑；沒跑的層寫「未跑」，
不得沿用上一輪的數字。

**驗證版本**：T3 叢集房間內容（`js/gen2-district.js` 正式建構器、`js/gen2.js` 的 `clusterAccessMouths` 與 `CLUSTER_SHARE=0.5`），三個 commit `895aea7`、`7738d9c`、`c3b78c6`（`c3b78c6` 為驗證版本），基準 `6d0b93f`。預設世界約半數區塊是叢集；`{ clusterShare: 0 }` 與舊版逐位元相同（512 個計畫雜湊與報告雜湊不變，歷史測試皆釘在此）。
**CI run**：未跑；本輪為本機驗證。

| 層 | 指令 | 本輪實跑 |
|---|---|---|
| 內層 | `npm run test:unit` | **281 passed / 0 failed / 0 skipped**（exit 0；含 `gen2-district*` 21 個、`gen2-cluster-rooms` 13 個，跑於 `c3b78c6`） |
| user 層 | `npm test -- --project=desktop` | **71 passed / 2 skipped / 0 failed**（exit 0，13.4 分，跑於 `c3b78c6`；改預設後第一次跑 L 形廳 e2e 失敗，換 seed 10 後全套重跑通過，見 `docs/decisions/2026-10-26-t3-legacy-test-exceptions.md`） |
| 建置 | `npm run build` | exit 0（`c3b78c6`） |
| v2 房間圖量測 | `node tools/gen2-measure.mjs` | 未跑（量測尚不支援叢集區塊，見待辦；legacy 報告雜湊與 T1 時相同，由 `gen2-district-baseline.test.mjs` 以子行程釘住） |
| 效能（A11，獨顯） | `--project=perf --no-deps` | 未跑（只動 v2 生成，預設 v1 未動） |
| 效能（A11b，內顯） | `--project=perf-igpu --no-deps` | 未跑 |
| 線上（A13） | 人工 | 未跑 |
| 實機（A12） | 人工 | 未跑 |

## 待辦項目

<!-- 條目照本檔開頭的格式。做完的直接刪掉，不留「已完成」條目。 -->

### [next] 生成器 v2 第 2–5 步（`?gen=v2`，方案見 `handoff-generation-redesign-2026-10-23.md`〈後續順序提案〉）
**具體細節**：2026-10-24 第 1 步原型完成：曲線池、平／單向斜池底、1F／2F／B1 真疊層、封閉直跑樓梯（`docs/decisions/2026-10-24-gen2-prototype.md`）。2026-10-24 第 2 步完成：自由曲線池、階梯池底（每階 ≤ 0.40 m）、斜池淺端 1 m 平台、稀疏柱（每室一種形與排法）、B1 小迷宮（低矮走廊、牆到牆淹水走廊、深水蓄水廳）。柱子排法目前多為「走道兩端四柱」（大廳中央常被池子佔住，其他排法放不下），第 3 步之後可依池位另排。2026-10-24 第 3 步完成：試玩回饋（深水降 0.6 m、涉水 1.5 m、步高 0.8 m、0.4 m 碰撞箱、樓梯井牆厚）、中庭與坑、封閉觀景窗、走廊緩坡、裂縫坑強迫換層（梯子）；見 `docs/decisions/2026-10-24-gen2-water-body-voids.md`。獨立高台 user 說另議。2026-10-24 巨型池廳完成：相鄰兩格（2m、2m+1）15% 合成一座 78–100 m 大廳，格邊全開、必有池（池不跨格邊，距格邊 ≥ 2.5 m），走過格邊再走回的單元與 e2e 測試已釘住（`gen2.test.mjs` giant halls、`gen2.spec.js` 巨型廳）；目前只沿 x 向配對，池子不跨格邊，格邊兩側燈光各烘各的。2026-10-24 折返梯完成：約 40% 的樓梯（放得下時）改為 U 形，兩條 3 m 梯道各爬一半，遠端共用 2 m 平台，中間 0.5 m 隔牆，入口與出口同端（leg A 進大廳、leg B 出到 2F／B1 房），純資料見 `gen2.js` switchH／switchWall，繪製見 `mesh2.js` switchMesh；單元（`gen2.test.mjs` switchbacks）與 e2e（折返梯上 2F／下 B1，只用前進、橫移、後退）已釘住；外觀未截圖檢視。尚缺：螺旋梯、觀景開口、隨機組能力驗證與 ≥20 種互補預製組、錯置展示 5%→30%、四地標與存檔回到地標、連續探索驗收；v2 目前每格只有直跑梯，2F 是只能原路返回的盡頭房，B1 迷宮也只從樓梯口長出。2026-10-24 改走分區重做七階段（`handoff-zoning-v2-2026-10-24.md`、計劃 `handoff-zoning-v2-plan-2026-10-24*.md`）：Stage 01A＋01B 完成並經 ChatGPT 審查通過（基線 `docs/gen2-floor-baseline.md`），Stage 02A 跨格空間所有權完成並經 ChatGPT 審查通過：`spaceOf`／`lOf` 共享空間（巨型廳＋L 形廳，20% 的 2×2 區塊）、`primaryHallId`、量測依 spaceId 去重；Stage 02B-1 連接室完成並經 ChatGPT 審查通過：`connectionOf(i, j, axis)` 依 seed 決定每條格邊（接縫／走廊／連接室），兩側大廳都離格邊 ≥12 m 的連結 40% 改成 12–16 m 寬的跨格連接室，走廊縮進室內，量測改為真正的連接圖（`measureConnections`）；最長連結 47 m 未變（不合格的連結沒動）。2026-10-25 Stage 02B-2～7 完成（長連結全改連接室、淺連接室、每區塊剪一條、錯位門、折線／蜿蜒、斜向連結、全部連結與繞行實走），見 devlog。實測：走廊變短，但相鄰大廳中心到中心的步行平均 70.0→85.2 m（剪掉的 93 對各多約 130 m），大廳沒有變近。要真的拉近區塊，得讓大廳更貼近格邊（Stage 01 範疇）或降低剪連結比例，下一輪先拿 `measureWalks` 當驗收指標再決定。2026-10-25 Stage 02B 收尾完成（窄矮走廊、對角線中間連接室、高度感知步行，見 devlog 與 `docs/decisions/2026-10-25-stage-02b-finish.md`）；留下的小項：`tests/e2e/gen2.spec.js` 的 `gen2Connector` 走身體中線，1.5 m 短走廊只有 0.1 m 餘裕，全套跑過但脆弱；`js/gen2-measure.js` 的 36 與 `corridorPhase2` 重複 `gen2.js` 的 `DIAG_STRETCH`／`phase2`，可改 import；L 形廳夾具只有 seeds 1–60 中的 7 個找得到（目前用 seed 8）。2026-10-25 T1 房間鄰近量測完成（`js/gen2-measure.js` 的房間圖與指標，見 devlog），T2–T6 用它當驗收；下一步 Stage 03A 樓層面積規劃。2026-10-26 T2 區塊規劃層完成（`js/gen2-district.js` 驗證與切格、`World2.districtPlan`、叢集區塊的 `hallOf`／`linkOf`／`makeClusterPlan`、保護口與共用燈格，見 devlog）；正式建構器仍回 null，下一步 T3 才產生真實區塊。2026-10-26 T3 完成：正式建構器產生 3–4 間房／格的叢集區塊（錨點＋E／S／T 衛星、L 形、3 m 參考通道樹），錨點保護口，`CLUSTER_SHARE=0.5`；歷史測試改釘 `clusterShare:0`＋子行程 `legacyReport`（見 `docs/decisions/2026-10-26-t3-legacy-test-exceptions.md`）
**怎麼做**：照方案一步交一個可走場景；每步先在 `tests/unit/gen2.test.mjs` 補不變量（可達可返、爬得出水、疊層不相交），再接 `mesh2.js` 與 `tests/e2e/gen2.spec.js`；改完跑 A11 v2
**會改變什麼**：`js/gen2.js`、`js/mesh2.js`、`js/cells2.js`；v1 與預設網站不變，直到另外決定切換預設
**做後回退代價**：各步各自 `git revert`；v2 存檔帶 `gen: 2`，切回 v1 時位置不採用、進度保留，不損資料

### [next] 決定 v2 何時取代 v1 成為預設（會改動已繳交作業的線上網址）
**具體細節**：v2 現在只在 `?gen=v2` 啟用；切換預設會讓既有 v1 存檔的位置失效（依 `docs/decisions/2026-10-24-save-recovery.md` 回起點、進度保留）
**怎麼做**：v2 補齊地標與出口（第 5 步）且 A11 v2 達標後，問 user 是否切換；切換只改 `js/main.js` 的 `GEN` 預設
**會改變什麼**：GitHub Pages 預設體驗
**做後回退代價**：改回一行預設值並重新部署；切換期間玩家的 v2 存檔回到 v1 時位置不採用

### [next] 用中階手機／平板實機玩一輪，確認 ≥ 50fps 與觸控手感（規格書 A12）
**具體細節**：2026-10-18 自動化只在桌機 Chromium 以「390×844、DPR 3、CPU 降速 4 倍」近似；加入樓梯房、欄杆、溜滑梯後量到 58.8 fps（原 59.9），餘裕變小；真機 GPU、iOS Safari、省電模式都沒驗；樓梯房與區域 2 是最重的場景
**怎麼做**：user 在手機開 GitHub Pages 網址，暫停選單打開「顯示 FPS」，走過淺水大廳與深水黑池各一分鐘，回報畫面左上的數字與是否卡頓
**會改變什麼**：若掉到 55fps 以下，調低 `js/quality.js` 觸控裝置的起始階或 `QUALITY_LEVELS` 的視距；若操作不順，調 `js/input.js` 的搖桿半徑與轉向靈敏度
**做後回退代價**：都是常數調整，`git revert` 該 commit 即可；不影響存檔

### [next] T2 遺留：叢集區塊的小缺口與不穩的 e2e
**具體細節**：（1）`validateDistrictPlan` 只靠通道判房間連通，兩房間只相接沒有通道會被擋（`js/gen2-district.js` 的 `reached` 迴圈）；錨點要求 `role === 'anchor'`，比交接文件嚴。T3 若要相接房間免通道或讓 `room` 當錨點，要放寬。（2）保護口 3 m 對「任何跨過錨點面的通道矩形」都建，不看該通道的端點是否為此錨點；目前夾具不誤判，只會多留空地（`js/gen2.js` 的 `makeClusterPlan`）。（3）叢集錨點的外側面若有接縫，外側走廊仍從該面接出，不跳過（傳給 `addEdgeLinks` 的 `seams` 為 null）；夾具沒有這種形狀。（4）`tests/e2e/game.spec.js` A8 與 `batch6.spec.js` B6-5 在整套並行（約 21 分）時各失敗一次，單獨重跑 25 秒內通過；本輪沒改它們讀的程式。
**怎麼做**：T3 寫正式建構器時一併決定（1）（3）；（4）若再現，看是否是並行負載下的等待時間太短。
**會改變什麼**：`js/gen2-district.js`、`js/gen2.js`；測試等待時間。
**做後回退代價**：`git revert`。

### [next] T1 量測：補房間圖 adapter 的 gap／length 直接測試
**具體細節**：`js/gen2-measure.js` 的連接房間短截線（`:a`/`:b`）、走廊中心（`corridorPhase2`）與路線裁切，只被語料測試涵蓋；該測試只驗 1 個連通塊與邊界合法，不驗 gap 與 length。交換 `gapA`／`gapB` 的變異可能不被抓到（2026-10-25 冷審查 advisory）。
**怎麼做**：在 `tests/unit/gen2-measure.test.mjs` 用 `synth` 假 World2 補一組連接房間與斜向中間房間的 gap／length 精確值。
**會改變什麼**：只加測試。
**做後回退代價**：`git revert` 該測試 commit。

### [next] T1 整合：量測支援叢集區塊
**具體細節**：`js/gen2-measure.js` 的 `roomGraph` 讀每條連結的 `gaps`／`parts`，叢集內部連結（`mode:'district'`）依設計沒有這些欄位，`measureWorld` 對預設世界會丟 TypeError（`js/gen2-measure.js:318`）；`measureWalks` 同理。T3 因此把 `gen2-measure.test.mjs` 與其他歷史測試釘在 `clusterShare:0`，混合配置目前沒有量測。
**怎麼做**：替 adapter 加 district-mode 與多房間支援，再把歷史測試釘（`legacyReport`）逐一放開；用量測驗證叢集後房間鄰近度。
**會改變什麼**：`js/gen2-measure.js`、`tools/gen2-measure.mjs`、`tests/unit/gen2-legacy-report.mjs` 與各歷史測試。
**做後回退代價**：`git revert`；不影響存檔。

### [next] T3 遺留：測試依賴預設世界的布局
**具體細節**：（1）`clusterAccessMouths` 為了直接測試而匯出（交接文件稱私有）；若改回私有，要把 quarter-grid 與輸入不變性測試改走 `World2` 整合路徑。（2）`gen2.spec.js` 的 L 形廳 e2e 靠 `gen2L` 找普通走廊入口，現用 seed 10（第 6 圈）；叢集布局或 `CLUSTER_SHARE` 再變就可能找不到，要重掃 seed（把 `gen2L` 複製進 Node 批次跑即可）。（3）T2 遺留的（1）（3）T3 未處理：錨點角色已放寬為 `anchor`／`main`／`giant`，其餘不變。
**怎麼做**：（2）若再壞，優先考慮讓 `gen2L` 接受測試用的世界選項，而不是再換 seed。
**會改變什麼**：`js/gen2.js`、`js/main.js` 的測試掛鉤、`tests/e2e/gen2.spec.js`。
**做後回退代價**：`git revert`。


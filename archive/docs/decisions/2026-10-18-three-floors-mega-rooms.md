# 2026-10-18 · 三層樓（B1／1F／2F）並排成方塊、巨大房間

- **決策**：
  - 樓層不是疊在同一格上，而是 3×3 區塊的方塊各自在 B1（−3 m）、1F、2F，B1／2F 方塊只落棋盤偶數格，樓梯區塊在 1F 方塊每邊中間（`js/levelmap.js`）；舊的「同格兩層」`up` 只留在樓梯房與區域 2
  - 約 30% 1F 門洞封死，但封之前用有上限的 BFS（220 節點）證明仍有永不封的路徑；證明不出來就不封
  - 巨大房間佔奇數方塊西北 2×2 區塊（`js/mega.js`），N／W 鄰方塊固定 1F；2F 入口走房間自己方塊的樓梯區塊，所以也是並排而非疊起來
  - 跳水板越過走道的一段是實心 3 m 高台，不是下面能走的橋
  - 深淵牆用獨立材質 `fog: false` 漸變到真黑，不動全域霧色（FOG_A／FOG_B 不變）；房內霧 40 m、`megaK` 平滑
  - 一個區塊的網格建置拆成多段（`buildChunkSteps` 在段間 `yield`），每幀只用 2 ms 預算，一幀最多完成一塊（`js/chunks.js`）
- **依據**：PM 批次 2／3 的 G、H、I、J、K；A11b 在 iGPU＋4 倍降速下，單塊 12–16 ms 的建置讓每個建塊幀都掉 vsync（區域進入慢幀 3–6%），分段後 A11b 五段 58.7–59.6 fps、慢幀 0.1–0.4%（無背景負載時）
- **反悔成本**：
  - 三層樓：牽動 `levelmap.js`、`world.js`、`levels.js`、`chunkmesh.js`、`guides.js`、`jump.js`、`main.js`，`git revert d5b08b7 f87e78f 302b1b3`；存檔的 `h` 讀入時落到最近可站高度，不受影響
  - 巨大房間：`git revert 302b1b3`；`MEGA_SHARE = 0` 可停用生成但碼仍在
  - 分段建置：`git revert` 該 commit；回到每幀整塊建，A11b 區域進入會再掉到 55–57 fps
- **釘住**：`tests/unit/levels.test.mjs`、`mega.test.mjs`、`chunks.test.mjs`；`tests/e2e/levels.spec.js`（H3、H4、H5）；`perf-igpu.spec.js`

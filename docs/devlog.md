# 開發日誌

每一輪和 AI 的討論、決定、修改都記一筆，新的在下面。格式：時間、做了什麼、AI 提議、user 決定或修改。

2026-10-17～18（規格訪談、第一版、部署）見 [`devlog-2026-10-17-18.md`](devlog-2026-10-17-18.md)。

---

## 2026-10-19 01:46– · 試玩回饋：破圖、燈、重複性、螺旋梯與滑梯、速度、走道、門位

- 使用者提出：破圖（附截圖）、2F 水池透到 1F、陽光與燈重疊、圓燈太大、地圖重複性偏高、螺旋梯下方不能走、幾乎看不到螺旋溜滑梯、移動速度可稍快、有些房間太空曠、十字走道太寬太亮、柱子圍成的全淺水房太常見、走道太寬、入口都在邊的正中央很無趣
- PM 查到的原因：圓燈直徑＝原方燈短邊，大燈成 4–5 m 圓盤；螺旋梯整個 5×5 佔地都算樓梯；滑梯只有直、彎兩種；柱廊有 60% 會下沉積水；3600 區塊中窄走道佔 18%；截圖中拱門插進相鄰牆、牆接縫有白縫、全畫面一條水平細線
- 已確定：
  1. 修破圖：拱門不插進相鄰牆、牆接縫不留縫、移除全畫面水平細線；2F 水池下方的 1F 天花板封死
  2. 天窗與高窗光斑 2 m 內不放燈
  3. 大燈一律方燈、小燈（≤2×2）才用圓燈；巨型房的大燈可以是圓燈
  4. 重複性：每種房型加 2–3 種內部變體、相鄰區塊不同房型、窄走道 18%→12%、大廳加救生員高椅與救生圈架
  5. 螺旋梯：踏板高於 2.2 m 的那段下方可走
  6. 新增螺旋滑梯，直／彎／螺旋各 1/3；約 8 區塊一根；有滑梯的房約 1/4 是 2–3 根並排
  7. 速度：走 3.3、跑 6 m/s；水中淺水 ×0.75、最深 ×0.55
  8. 窄走道房一半恢復舊版小迷宮；另一半保留拱頂廊但改 1.5 m、更暗、交叉點偏移、中途錯位一次、寬窄變化與小空間；B1 與區域 1／4 穿越通道一起調暗；沉水走道房與水淹柱房的走道也套用
  9. 門位：每條邊的門在第 3–12 格隨機，相鄰區塊對齊；樓梯區塊與地標區域不動
  10. 柱廊下沉積水 60%→15%、水淹柱房 1/24→1/40

## 2026-10-19 03:53– · 接手批次 5：門位、房型討論

- 使用者提出：接手 Sonnet 沒做完的批次 5；做完後用 grilling 討論每種房型、B1 地下走道與設施的格式（審美疲勞，多數房型與預期不同）
- 已確定：
  1. 先驗收 0951b63（單元 136、桌面 61 passed）
  2. M10 門位照原規格做（1c848b3）；做的時候發現約 40 個門洞（3 個種子 × 29×29 區塊）因樓梯房、樓梯間的牆根本走不過去，一併封成牆，樓梯間廣場加寬到第 8 格
  3. M5（房型變體）、M9（窄走廊與 B1 亮度）延到房型討論定案後重寫規格再做

## 2026-10-19 · 批次 6：房間格式定案，1F／2F 改連續區域

- 使用者提出：專注幫 Sonnet 收尾與增加房間多樣性；房間要能用各種隨機算法做出上千種不同地形（不算裝飾）；柱子房應是跨區塊的淹水柱廳（附照片），不是 4×4 的小房
- 已確定（細節見 `docs/spec.md` 2.2.4、`docs/decisions/2026-10-19-continuous-regions.md`）：
  1. 不再一區塊一房：世界座標上 10–60 m 的不規則區域，約四成面積在 30 m 以上的區域；交界用台階、池緣、柱列或斷牆
  2. 分層產生器：形狀 × 高低 × 水 × 柱 × 隔間，每 2000 個區域至少 1000 種地形；舊房型全刪，保證出現柱池（淹水柱廳）、曲折的沉水走道、樓梯房
  3. 柱池：跨區塊、滿淺水、水深每區不同、0.8 m 圓柱間距 6–9 m 規則排列並缺幾根、籠梯
  4. 欄杆只圍危險邊與小泳池等造景；封閉房改成牆上開洞裝鐵欄、可三面封閉一面看進去、內部大；原本的鐵欄箱移到角落兩牆兩欄
  5. 燈每區挑一種排法（格狀、沿牆或池緣、散落、成群、幾乎全暗、天窗），不重疊、離牆與柱 0.5 m
  6. B1：天花板 2.2–3 m、彎曲水道與淺溝、亮度降 60%、迷宮式窄廊、水由地形生成
  7. 驗收：程式掃描（可達、設施落點、燈、欄杆、柱卡人、水面、牆連續）＋貼圖用真瀏覽器截圖；巨型深淵池跳水板底面沒貼圖要修
  8. 交付順序：連續 1F＋產生器＋柱池＋掃描＋跳水板底 → 2F、B1、天花板與池底 → 設施
- 實作中發現：傳送進區域時內顯效能（A11b-2）掉到 56.7 fps；原因是區域區塊與相鄰樓梯房在同一幀整塊生成。改成每幀只做一個階段後五段全過

## 2026-10-19 晚 · 批次 6 第 2、3 步：B1、區域天花板、平台塔

- 使用者提出：
  - 第 2、3 步也是這一輪的範圍（不是下一輪）。
  - 效能驗收放寬到 50 fps。
  - 等背景測試時不要反覆查進度。
  - 全部做完再改文件。
- 已做（細節見 `docs/decisions/2026-10-19-region-facilities.md`）：
  1. B1 改走自己的區域產生器：
     - 天花板 2.2–3 m，迷宮窄廊。
     - 水由地勢生成：蜿蜒水道、低窪淺池、淺溝。
     - 亮度 ×0.4；舊的管道房、蓄水池房刪除。
  2. 每個區域有自己的天花板高度（3–8 m，大區域偏高、張力壓低），逐格畫出，高低交界封住。
  3. 2F 池底：批次 5 已做，補了真瀏覽器截圖。
  4. 平台塔：
     - 爬梯或螺旋梯上去；柱子大池裡的爬梯加鐵籠。
     - 多數附滑梯落進淺水。
     - 依地形放置，另外隨張力亂撒。
     - 不卡牆、不卡人、走得進也走得出。
  5. ≥ 0.7 m 的落差補欄杆；樓梯房比例 14% → 8%。
- 實作中發現：
  - 平台的滑梯管會把平台自己的格子標成擋路。改成平台高度以上的格子不擋。
  - 原本只檢查「走得到」，漏了「從深池走得出來」，現在兩個方向都檢查。
  - 區域 2（階梯高低池）的螺旋梯在 80% 處站不上去：舊問題，本輪沒改，記進 ROADMAP。

## 2026-10-19 晚 · 濕鏡頭與漂浮玩具

- 使用者提出：
  - 走進水裡後陽光光束明顯變暗，要解釋原因。
  - 決定以最小改動修正，不重跑效能測試。
  - 只有 0.9 m 以上的深水才弄濕鏡頭。
  - 把浮板、海灘球做回來，隨進度只剩褪色泳圈。
- 原因：
  - 濕鏡頭的扭曲先把場景畫進 sRGB 離屏貼圖。
  - 加法混合的光束因此在線性空間相加，看起來變暗。
  - 實測同一畫面平均亮度 198 → 185。
- 已確定（細節見 `docs/decisions/2026-10-19-wet-lens-toys.md`）：
  1. 扭曲改成照常畫到螢幕，再複製畫面去折射。
  2. 鏡頭只在 ≥ 0.9 m 的水裡變濕：踏進去濕一次，之後走動每 3–8 秒再濕。
  3. 漂浮玩具在區塊生成時依壓抑度決定種類：
     - 第 1 階段全是鮮豔泳圈、浮板、海灘球。
     - 第 2–3 階段褪色泳圈比例逐步增加。
     - 第 4 階段只剩褪色泳圈。
     - 已生成的區塊不變。

## 2026-10-19 晚 · 標題畫面按鈕往上偏

- 使用者提出：標題畫面整組按鈕往上偏（附截圖），修正時不跑效能測試。
- 原因：
  - 矮的橫向畫面（手機橫放、低視窗）把按鈕欄壓在「結束於畫面中線」。
  - 有存檔時共有 4 顆按鈕，整組在中線以上，最上面一顆超出畫面頂端 27–42 px。
- 改法：
  - 標題＋英文副標、按鈕＋操作說明各包成一塊，兩欄都垂直置中。
  - `tests/e2e/ui-ratio.spec.js` 改成帶存檔測（4 顆按鈕），並檢查兩欄中心同高。

## 2026-10-24 · 地圖生成重設第 1 步原型、存檔回復、測試清理

- user 核准：實作第 1 步原型；用 `?gen=v2` 隔離，預設網站維持 v1；舊存檔保留進度、回起點；不用外部審查。
- 生成器 v2（`js/gen2.js`、`mesh2.js`、`cells2.js`）：
  - 64 m 格。1F 大廳 20–50 m，以走廊連接四鄰。
  - 2F 房間與 B1 大廳疊在 1F 上下，以封閉直跑樓梯（中途平台）連接。
  - 泳池為完整曲線形狀，碰撞與繪製讀同一份平面描述。
- 測試抓到並修掉的缺陷：淺水池深於 0.4 m 時走得進去卻爬不出來，改成可涉水的池子一定有 ≤ 0.40 m 的段落。
- 存檔回復（fork 實作，主流程驗證）：
  - 逐欄驗證，位置壞了只丟位置。
  - 回最後造訪的地標，沒有紀錄就回起點。
  - 新增 `last`、`gen` 欄位。
- 測試清理：subagent 列出候選，user 核准後刪 3 條、改 9 處（理由見 commit）。
- 提交前冷審查（verifier subagent）抓到：v1 走完四地標的存檔在 `?gen=v2` 繼續時，出口判定讀 null 而每幀報錯。已補 e2e 重現並修掉。

## 2026-10-24 · 區域 2 螺旋梯卡住

- 原因：`zoneTerraces` 的封閉淺水房（欄杆／柱圈到 x = 20）在螺旋梯之後才鋪，蓋掉螺旋梯外圈的兩格踏板，走到 70–85% 時身體中心踩空、角落撞欄杆。
- 修法：封閉房東界退到 x = 19，空出的一格 (20, 7) 補牆不留死角；同種子的區域 2 版面因此微調。
- 重現測試：`levels.test.mjs`「a walker climbs region 2's atrium spiral」，修前停在 h = 2.73，修後 5 個種子都走上 4.5 m 迴廊。
- 一般區域高台螺旋梯在 95% 處外角懸空被擋，是邊緣防跌判定，頂端從側面接高台，不是同一個問題，沒動。

## 2026-10-24 · 生成器 v2 第 2 步：池形、池底、稀疏柱、B1 迷宮

- user 指示：一次做一步、每步看額度；整步做完才派一次冷審查。
- 池形：新增自由曲線池（二、三次諧波的極座標曲線，貼齊外框），池岸每段 ≤ 0.125 m，與碰撞誤差 ≤ 1 cm。
- 池底：新增 3–5 階的階梯池，每階 ≤ 0.40 m；斜池淺端先有 1 m 平台。
  - 平台的由來：測試抓到曲線池淺端只剩 0.5 m 寬的可出水帶，人走得進去卻爬不出來。
  - 繪製改成依深度轉折切帶（`poolBands`），池壁在切線處分段，階梯有立面。
- 稀疏柱：約三成房間有柱，每室同一種柱形與排法（中線一排、兩排、一對、四柱方陣、走道兩端），柱距牆、池、樓梯、走廊口都 ≥ 1 m。
- B1：從樓梯口長出最多 7 段的走廊樹，寬 2.5–3 m、淨高 2.2–3 m；約三分之一淹水，水深 ≤ 0.40 m，路口保持乾燥。
  - 分支末端有六成機率出現深水蓄水廳，放不下池子就改成空曠暗廳。
- 檢查方式：無頭 Chromium 截圖檢查階梯立面、曲線池岸、方柱、淹水走廊、蓄水廳。
- 整步冷審查（Sonnet，約 6 萬 token）報 9 條，確認 8 條並修掉：
  - B1 走廊寬 2.5 m 讓邊落在 0.5 m 格外（繪製與碰撞會差 0.25 m），改成 2 或 3 m；
  - 柱子會擋 B1 走廊；蓄水廳可能吞掉其他走廊；
  - 池岸頂點正好落在階梯切線上時立面消失；與切線重合的池壁取錯階；
  - 三條測試寫得太寬或同義反覆。
- 「凹形池切帶後三角化退化」那條，用真 three.js 對 6 種子 484 帶實測，面積誤差 ≤ 2e-13，不成立。

## 2026-10-24 · 試玩回饋（深水、步高、碰撞箱、牆厚）併入 v2 第 3 步

- user 回饋：深水太貼地面、涉水上限要 1.5 m、深水至少 2 m 且往下看深藍到藍黑、上下一步 0.8 m、身體要有碰撞箱、樓梯牆沒有厚度。數值與依據見 `docs/decisions/2026-10-24-gen2-water-body-voids.md`。
- 碰撞箱：v2 世界提供 `bodyR`（0.4），玩家沿方框四邊取點；v1 沒有 `bodyR`，照舊只查四角。
- 第 3 步前半：中庭與坑兩種挑空，先於池子排位；坑留整圈通路。
- user 允許派工給 Codex：桌面 App 內附的 `codex.exe` 可用 `codex exec` 叫用。ChatGPT 橋接（c2c）沒裝，codex-with-chatgpt 連不上。Codex 寫了 `tests/unit/gen2-paths.test.mjs`（起點走到周圍 9 個大廳，不靠深水），我讀過並重跑通過。

## 2026-10-24 · v2 巨型池廳（第 3 步剩餘，使用 Claude with ChatGPT）

- 流程：user 指示由 ChatGPT 規劃與審查、Claude 只執行；排除預製組（交接文件 §隨機組與預製組：不得轉成 20 項任務）。ChatGPT 經 MCP 讀完 repo 後，把順序定為巨型廳、折返／螺旋梯、觀景開口、隨機組盤點、錯置、地標與存檔回復，本輪只做第 1 項。
- 做法：相鄰兩格（2m、2m+1）由 `(seed, m, j)` 決定 15% 合成一座大廳，兩半在格邊相接、z 範圍與天花板一致、各伸入格內 39–50 m（全長 78–100 m，≥ 39 m 才能讓每條走廊仍開進大廳）。
  - 牆沿用 `mesh2.js` 逐格向鄰格查詢（`world.roomAt`），格邊兩側都是室內就沒有牆；`cells2.js`、碰撞、繪製都不用改。
  - 格邊兩側各 6 m 不放樓梯、坑、窗，池距格邊 ≥ 2.5 m：旁邊只靠既有的避讓表，沒有新增跨格規則。
  - 巨型廳必有池；燈格在兩半共用同一個原點。其餘格的隨機流不變。
- 測試：先寫會失敗的兩條（舊程式 `0 giant halls`），再實作；e2e 走完全長再走回。
- 踩坑：新常數 `MEGA_SHARE` 與 `levelmap.js` 同名，建置合併測試擋下，改為 `GIANT_*`。
- 效能：A11 v2 在有背景負載的機器上來回不穩（見 ROADMAP 基線），未判定。

## 2026-10-24 · v2 折返梯（第 3 步剩餘，使用 Claude with ChatGPT）

- 流程：ChatGPT 讀完 repo 後規劃：兩段平行直梯加單一轉向平台的 U 形、先寫失敗測試、螺旋梯另開一輪。本輪只做折返梯。
- 做法：`f.turn` 的樓梯佔 7 m 寬（兩條 3 m 梯道、兩道外牆、0.5 m 中牆），長度為單段長加 2 m 平台。
  - 高度與牆都是一個函式（`switchH`、`switchWall`），`flightH`、`inFlightWall` 依 `f.turn` 轉派，碰撞、`candidates`、避讓表都不用另寫。
  - 遠端房間貼在入口端、接 leg B 的端面；放不下就退回直跑梯。折返梯用自己的隨機流，直跑梯的格子不受影響。
- 測試教訓：變異驗證（拿掉隔牆）顯示「不能穿牆」測試在梯道中段本來就被高差擋住，形同虛設；改成在平台前 0.6 m（兩層高差不到一步）才測得到隔牆。
- 既有測試調整：直跑梯測試只測直跑梯；展示窗「走進去」檢查補上樓層（折返梯的 2F 房與展示窗在平面上重疊但不同層）。
- 外觀：只驗證真瀏覽器無錯誤、走得通；沒有截圖。
- Codex 審查（ChatGPT 規劃）：判定 1 項 P2，下降折返梯每段最後一階缺立面（`mesh2.js` 下降分支只在每階起點建面，漏了末端）。先寫 `tests/unit/gen2-mesh.test.mjs`（每個階緣在腿中線都要有立面，上下行都測）確認紅在 seed 1 cell -1,-1，再補末端立面轉綠。碰撞與行走沒有問題。外觀仍未截圖。

## 2026-10-24 · v2 分區重做 Stage 01A＋01B（使用 Claude with ChatGPT）

- 依據：`handoff-zoning-v2-2026-10-24.md`；ChatGPT 分析對話任務 `c2c_f7d2` 指定的第一個切片（只做 01A＋01B，不動生成結果）。
- 01A：`World2.plan` 的快取 key 由 `(i+32768)*65536+(j+32768)` 改成字串 `"i,j"`；舊式在 (0,65536) 與 (1,0) 撞號，後請求的格拿到前一格的 plan。`makePlan` 未動，既有地圖不變。
- 01B：`js/gen2-measure.js`（純資料，不進建置包）＋`tools/gen2-measure.mjs`。在每格 0.5 m 網格中心取樣（同 `cellRaster`），量每層房間聯集、扣掉樓梯與挑空後的 footprint、可走面積（再扣柱、深水、封閉展示窗）、房型、走廊長寬、樓梯種類、池子、上下層水與地板重疊；樓梯面積另計。報告除耗時外與請求順序無關。
- 基線（8 seeds × 64 格）：1F 82.4%／2F 6.7%／B1 10.9%，2F 只在 42% 格出現。另量到 1F 池子壓在 B1 池子上方 302 m²（Stage 05 疊層要處理的案例）。
- 測試：新增 8 條，先確認紅（key 撞號、模組不存在），再實作轉綠；unit 175 全綠、v2 e2e 9 passed、build 成功。
- 2:1:1：照 user 指示只量測回報；已請 ChatGPT 在 Stage 03 前把 03A 驗收改寫成「趨勢接近、各區可不同」。

## 2026-10-24 · v2 分區重做 Stage 02A 跨格空間所有權（使用 Claude with ChatGPT）

- 依據：ChatGPT 任務 `c2c_f7d2` 的 Stage 02A 切片；ITERATION 5 判定 DONE（10 個 issue ID 全數通過）。
- 做了什麼：
  1. `World2.spaceOf(i, j)`：跨格大廳變成一個有 `spaceId`、`owner`、每格一塊 `parts` 的共享空間。巨型廳改用這套表示，生成結果不變。
  2. 新增 L 形廳 `lOf(a, b)`：2×2 區塊 20% 機率把其中三格合成一座 L 形大廳，兩條格邊全開、不穿走廊；第四格保留自己的大廳。
  3. 每格的主大廳改用 `plan.primaryHallId` 找，不再靠 `rooms[0]`（`primaryHall()`，`mesh2.js`、`restPoint` 一併改）。
  4. 量測：共享大廳依 `seed|spaceId` 只算一次，面積按每格的那一塊累加。
- 變異驗證：
  - 拿掉「接縫不開走廊」→ L 開口測試紅。
  - 拿掉接縫口淨空 → 開口淨空測試紅。
  - L 臂寬從 h 10–18 縮成 3–5 → 外部入口測試紅（走廊撞牆）。
- Codex 冷審：1 項 P3，L 廳的燈只看「這邊是接縫」就跨過格邊，但只有開口那段是通的。先寫「每盞燈四角都在同一個空間下」的測試，紅在 seed 1 cell 1,-3。修法：`seams` 由布林改成開口區間 `{lo, hi}`，燈箱跨出開口以外就不放。
- ChatGPT 審查：F01，原本的 L 測試從臂內瞬移起步，沒驗證從外面走進來。補了兩條：
  - 單元：從區塊邊的普通走廊起步，一次 reachSet 到得了三塊、六條外走廊，也走得回來。
  - e2e：只瞬移到 arm A 外的走廊，之後全用真實移動走完再走回走廊。seed 42 的 (2,-1) 沒有直線路徑，瀏覽器改用 (0,-3)；(2,-1) 由單元測試涵蓋。
- 量測（8 seeds × 64 格）：
  - 樓層：1F 83.0%／2F 6.5%／B1 10.4%。
  - 共享廳：17 座 L 廳（51 塊）、38 座巨型廳。
  - 1F 走廊：1904 條（原 1972），中位 16 m、最長 26 m。
  - 非 L 格的 plan 與前一版逐位元組相同（461 格；比較時排除新增的身分欄位 primaryHallId／spaceId／span／seams／grid）。
- 未做：長走廊與連接圖是 Stage 02B（T08–T11、C02）。外觀未截圖檢視。

## 2026-10-24 · v2 分區重做 Stage 02B-1 連接室（使用 Claude with ChatGPT）

- 依據：ChatGPT 任務 `c2c_f7d2` 的 Stage 02B-1 切片（ITERATION 6 合約）；處理 user 提的「不同區塊的房間被很長的走廊隔得很遠」。
- 做了什麼：
  1. `World2.connectionOf(i, j, axis)`：每條格邊一筆標準記錄，只看 seed、不建 plan。模式三種：`seam`（同一座共享大廳內）、`corridor`、`connector-room`。
  2. 兩側大廳都離格邊 ≥12 m（`CONNECT_GAP`）的連結合格，其中 40%（`CONNECT_SHARE`）改成連接室：寬 12–16 m，每側深 8–10 m，跨格邊，兩格各一塊、共用 spaceId 與天花板；兩邊走廊縮短到伸進室內 1 m 為止。
  3. 連接室不放柱、燈格固定 6 m、用自己的亂數流（不吃 plan 的亂數），其他物件照常避開它。
  4. 量測：`measureConnections` 以 spaceId 做 union-find，報連結數、模式、改前改後走廊長、連接圖塊數。
- 測試：
  - `gen2-connections.test.mjs` 11 條契約測試先紅後綠（先補 `CONV.length >= 20`，免得沒有連接室時空轉通過）。
  - 單元走路測試（大廳→短走廊→連接室→短走廊→下一個大廳→走回）事後補，變異驗證：走廊停在室外 1 m → 紅。
  - e2e 連接室走過再走回、量測順序無關的覆蓋測試事後補，未做變異驗證。
  - 柱子比例測試第一次全套跑紅（69/489 < 15%）：連接室進了分母。改為排除連接室並斷言連接室無柱。
- 量測（8 seeds × 64 格）：大廳間連結 824 條（連接室 164、走廊 660），合格 402；改成連接室的連結走廊總長少 51.7%（中位 34→16.5 m）；全部連結中位 29.5→26 m、p75 34→31.5 m，最長 47 m 不變（那些連結不合格）；每個 seed 連接圖 1 塊。
- 與前一版比較：無連接室的 232 格 plan 完全相同；有連接室的 280 格中 264 格只差走廊、連接室與 id 參照，16 格因展示窗避開連接室，該格之後的亂數抽取跟著移位。
- 審查：Codex adversarial review approve，無實質發現；ChatGPT 唯一阻擋是修正後的全套 unit 證據，已重跑。
- 未做：剪連結、錯位門、折線走廊（02B 其餘切片）；全部 164 條連接室逐條實走的回歸（ChatGPT N01）；desktop e2e 全套未重跑；外觀未截圖檢視。

## 2026-10-25 · v2 分區重做 Stage 02B-2～7 連接圖與走廊（使用 Claude with ChatGPT）

- 依據：ChatGPT 任務 `c2c_f7d2` ITERATION 10 的整批合約；user 指定整份 02B 做完再一次審查，過程中各切片綠了就本機 commit。
- 做了什麼：
  1. 02B-2：合格且走廊超過 30 m 的連結一律改成連接室（不再抽 40%）。
  2. 02B-3：一側大廳離格邊只有 8–12 m 的長連結改成淺的連接室，每側深度隨間距縮放，走廊至少留 4 m。
  3. 02B-4：每個 2×2 區塊最多關掉一條最短的內部連結（新模式 `closed`，走廊與路線都拿掉），一定繞得過去。
  4. 02B-5：15% 的走廊口偏離格子中線（`portalOf`），合法區間取兩側大廳的交集，扣掉身體半徑與牆的淨空。
  5. 02B-6：20% 的走廊改成兩彎的折線或多彎的蜿蜒（`routeOf`，每次偏移 ≤ `JOG_MAX` 7 m）。另有 50% 的區塊多一條斜向連結（`diagonalOf`），由三段軸向矩形穿過第三格的空隙組成，兩種方向都有。
  6. 02B-7：每條斜向連結雙向實走，每條關閉的連結從區塊內繞過去實走；量測加「1F 通不到大廳也通不到格邊的房間」。
- 測試：
  - 每個切片先紅後綠。
  - 共用的格點走路抽成 `tests/unit/reach.mjs`。
  - 731 條連結雙向、31 條斜向雙向、93 條關閉連結繞行，全部 0 失敗。
- 量測（8 seeds × 64 格）：
  - 一般直走廊超過 36 m：0 條；超過 30 m：1 條；最長 30.5 m。
  - 全部連結中位 29.5→20.5 m，p75 34→26 m。
  - 偏移 ≥ 7 m 的走廊口 75 個；折線 31、蜿蜒 30（最長 50 m）；斜向 31。
  - 關閉 93 條，繞行都是 3 跳，繞行走廊中位 52.5 m。
  - 每個 seed 連接圖 1 塊；孤立房間 0。
- 步行距離（Codex 審查後補的量測 `measureWalks`：相鄰兩格大廳中心到中心的最短步行，經過連接室、折線、斜向，關閉的連結走繞路）：
  - 和 `32bf56b` 比，同樣 896 對：683 對不變、203 對變長、10 對變短；平均 70.0→85.2 m，中位 70.25→72.75 m，p90 79.75→180.25 m。
  - 關閉的 93 對中位 200.5 m，每對多走約 130 m。
  - 結論：02B 縮短的是「走廊」（連接室把長走廊換成房間），不是大廳之間的距離；大廳位置沒動，所以步行沒有變近。
- 踩到的坑：
  - 蜿蜒走廊一度長到 76.5 m，和 user 嫌走廊太長的問題相反，加了 `JOG_MAX` 上限。
  - 斜向連結起初只有 2 條：亂數取的 z 帶會切到區塊內部的走廊。改成固定在區塊中線附近，兩種方向都試。
  - 裂開的大廳曾切到中庭底下，把中庭放進切割要保留的範圍。
- 審查：
  - Codex adversarial：needs-attention，1 項 medium。舊量測扣掉連接室長度、又把關閉的連結排除在外，看起來走廊少一半，實際步行沒變短。補了步行量測與測試（先紅後綠），舊那行改標「不是步行」。
  - ChatGPT ITERATION 11：PLAN，三項阻擋。V01 邊界 136 間連接室沒實走 → 補走，410＋136＝546，867 條 0 失敗；V02 desktop 全套重跑 71 passed；V03 匯出累積 diff 供它讀。
  - e2e 的 L 形廳測試在 02B-5 之後變紅：世界沒壞，是夾具只認一條零寬的直線。改成搜尋 8 個區塊、走路線兩側 ±0.5 m 都要乾，時限 240 s；連跑 3 次都綠。

## 2026-10-25 · v2 Stage 02B finish: narrow low corridors, diagonal middle rooms, height-aware walk (Claude with ChatGPT)

- Contract: `docs/handoff/T0-02b-finish.md`. Decisions: `docs/decisions/2026-10-25-stage-02b-finish.md`.
- What changed:
  1. Corridor widths are `[1.5,2,2,2.5,3,3.5]` m (diagonals `[1.5,2,2,2.5]`), ceilings `[2,2.5,3]` m. Widths 1.5, 2.5 and 3.5 m shift the centre by 0.25 m, so all rectangle edges stay on the 0.5 m grid.
  2. A diagonal longer than 36 m gets one 8×8 m (else 6×6 m) connector room at its middle. Each corridor side is at most 36 m.
  3. `walkLength` in `tests/unit/reach.mjs` is now a height-aware Dijkstra. Ladders cost their 3D distance.
  4. The `gen2L` e2e fixture takes only ordinary corridors of 2.5 m or wider. The L-hall test boots seed 8 (seed 42 has no such corridor within 8 districts).
- Tests: unit 222/222 (exit 0, 14.7 min). Desktop e2e: 71 passed, 2 skipped at `78ad0d9` and again at `c27dd40` (14.6 min).
- Measure (8 seeds × 64 cells, 896 pairs): max stretch 32 m, 0 pairs over 36 m. 36 diagonals (18 with a middle room). 824 links: 410 connector, 321 corridor, 93 closed. Walk median 73 m. 0 orphan rooms. One graph piece per seed.
- Review:
  - Codex adversarial review failed on the usage limit. A read-only Sonnet verifier did the cold review: no blocking item, six advisories.
  - Advisory 1 was a real defect: 1F corridors had no lamps. The lamp grid needs a width over 3.6 m, and D3 caps width at 3.5 m. Fixed with a red test first (466 of 466 corridors dark).
  - Advisory 2: `diagAvoid` never changes a plan (see the decision file). Kept as a guard.
  - Open advisories are in `ROADMAP.md` (gen2Connector margin, magic number 36 and duplicate `corridorPhase2` in `js/gen2-measure.js`).
- Pitfalls:
  - A BFS cross-check without height took minutes. The Dijkstra rewrite fixed it.
  - Two uncommitted work-tree changes (the 10-pair walk test and the 36 m gate) were described as existing in the handoff. They were finished and committed in this round.
  - `rm` of `work/.gamedev-router/` was denied. The folder stays on disk.
  - A user screenshot showed a hole above a corridor mouth. Cause: the ceiling step face looked into the lower room, so the hall culled it as a back face (all 424 steps in 15 sampled cells). Present since the v2 prototype. Fixed with a red test first (`gen2-mesh.test.mjs`); `mesh-helper.mjs` stub now has `Vector2` and `ShapeUtils`.
  - Second screenshot: the step face above a corridor mouth was a flat grey patch, paler than the hall wall. It now takes the higher room's lamps and the 1.0 to 0.82 wall shade per vertex (plan from ChatGPT `c2c_cf18`, test reads the real vertex colours, red first: got 0.651 flat). The sloped-room case never occurs in 45,296 sampled steps.

## 2026-10-25 · T1 room proximity measurement (Claude with ChatGPT)

- Contract: `docs/handoff/T1-measurement.md`. ChatGPT task `c2c_t1a7`, PLAN in one iteration. Commits `9938d28` (slices 1-3) and `3ae733a` (slice 4).
- What changed (measurement only; generator, saves and default selection are untouched):
  1. `roomGraphFromRecords` turns canonical room records into nodes (union area on the 0.5 m grid, exact anchor) and edges (wall-to-wall `gap`, anchor-to-anchor `length`). It rejects bad records with `TypeError` before it filters by sample.
  2. `roomGraph` reads `hallOf`, `connectionOf` and `diagonalOf` only. Edge connector rooms and diagonal middle rooms split one link into two edges.
  3. `measureRoomGraphs` reports gap shares, rooms per 2x2 district, median area and graph pieces. `measureClosedDetours` and `measureWalks(..., {restoreId})` show what one closed edge costs.
  4. The report has the new fields and lines, and the legacy walk line has mean and p90.
  5. The ten-pair body test is now a thirty-pair one-sided bound (`body <= 1.25 x graph`).
- Tests: unit 247/247 (14.0 min), desktop e2e 71 passed and 2 skipped (14.2 min). Mutations on the restore, the near share, the canonical swap and the boundary check each turned a test red. The first boundary mutation survived, so two cases were added.
- Numbers (8 seeds x 64 cells): 1212 room edges, gap median 11 m, near (<= 6 m) 18.8%, long (> 30 m) 5.2%, direct 0%. Room count per 2x2 district median 9. Area median 312 m2. One graph piece per seed. 93 closed edges, added walk median 126 m, none unreachable.
- Review: read-only verifier, no blocking item, four advisories. Kept: the sorted seed loop (spec 4.10 asks for it), the 1e-9 tolerance on summed lengths, and the extra export `summarizeClosedDetours` (it makes the report field testable alone). Fixed: the A10 test now uses the spec's boundary connector fixture.
- Pitfalls:
  - Slices 1 to 3 share one commit. The F1 tests need `measureRoomGraphs` and the world test needs `closedDetour`, so no green snapshot exists between them.
  - The 30-pair body test takes about 3 min. The closed-edge walk test (4 min) was already slow.
  - `docs/handoff/T1-measurement.md` is 33,567 bytes, over the 32 KiB rule for Markdown files. It was left as the user wrote it.

## 2026-10-26 · T2 district planning layer (Claude with ChatGPT)

- Contract: `docs/handoff/T2-district-plan.md`. ChatGPT task `c2c_7b3e` (new chat, no T1 context): PLAN in one step, two review rounds. Commits `9612140` (baseline) and `81b4550` (plumbing).
- What changed (the production builder returns null and `CLUSTER_SHARE` is 0, so default worlds are unchanged):
  1. `js/gen2-district.js` (pure): `validateDistrictPlan` returns a frozen copy; `clipDistrictRect` and `cutDistrictCell` cut a 128 m district into per-cell fragments with seams; two fixtures.
  2. `World2` takes `{clusterShare, cluster}`. `districtPlan(a, b)` selects, validates and caches (FIFO 100, nulls included). The start district is always legacy.
  3. Cluster cells get `hallOf`, `linkOf` (mode `district` on inner edges), `closedOf` and `diagonalOf` (null) from the district. Outer edges keep the legacy corridors and connector rooms.
  4. `makePlan` now shares `addEdgeLinks`, `addConnectorRooms`, `addHallFeatures` and `addLamps` with `makeClusterPlan`. The 512 plan hashes did not move.
  5. Passage mouths (3 m) and continuation mouths (6 m) stay clear of flights, entries, voids, showcases, columns and pools. Other room pieces get lamps only. A corridor with a lamp grid is lit on its grid; one lamp per centre of a logical source.
- Tests: baseline 2 + district 19 (new), unit 268/268, desktop e2e 71 passed and 2 skipped. Mutations (no 6 m mouth, columns on every piece, no mouths) each turned the mouth test red.
- Review:
  - Read-only Sonnet verifier: one blocking item, a test gap (the 6 m mouth and the lamps-only rule had no failing test). Fixed with the seam fixture; two dead assertions removed.
  - ChatGPT round 1: F1, `clipDistrictRect` accepted a fractional cell index. Fixed red-first and amended into the second commit. Round 2: DONE.
- Pitfalls:
  - The spawn already asks the factory for the start district's neighbours, so tests that count factory calls or cache size must read the count after construction. A factory that returns a bad plan makes the constructor throw.
  - First full desktop run: 2 failures (B6-5, A8) that pass alone in 25 s. The second full run passed 71. Noted in `ROADMAP.md`.
  - A seam fixture arm that overlaps room B is invalid on its own; tests that grow room A must grow it on a side with no neighbour.

## 2026-10-26 · T4 shared-wall openings (Claude with ChatGPT)

- Contract: `docs/handoff/T4-shared-openings.md`. ChatGPT task `c2c_t4a7`. Commits `500c836` (core), `a4dd309` (integration), `db58669` (mesh), `2bf54a3` (decisions), `32d1795` (corrective). Production districts still build passages only, so default worlds are unchanged.
- What changed:
  1. `js/gen2-district.js`: `buildSharedOpening` (open, doorway, row; five fixed draws), the `shared-opening` link kind with its own validator branch, `openingMouths`, and two forced fixtures.
  2. `js/gen2.js`: `makeClusterPlan` turns opening fragments into corridor rooms (ceiling = opening height, no lamps) and keeps 3 m mouths clear on both sides of each aperture.
  3. `js/mesh2.js`: `crossCellSteps` emits ceiling steps across cell boundaries at lv 0. The lower-ceiling cell owns each Q2 quad. `cutsAperture` is exported for its test.
- Tests: 13 named tests (9 in `gen2-openings.test.mjs`, 4 in `gen2-openings-mesh.test.mjs`). Full unit and e2e totals are in `ROADMAP.md` (Baseline).
- Review:
  - Slice 1: read-only verifier found a blocking test gap (the third-room cases hit the room-overlap check) and 4 advisories. All fixed; mutations now turn the tests red.
  - Batch: ChatGPT found 2 validator gaps (open height, row count formula) and asked for an explicit proof for the cross-cell sample rule. Fixed red-first in `32d1795`; the rule is proved by a property test.
  - Process deviation: slices 2 and 3 were not red-first. Mutation checks replaced it. The lamp skip and the legacy-loop skip survive mutation because the geometry already prevents the fault; they stay as spec guards.
- Pitfalls:
  - The handoff says step faces look "toward the lower sample". That hides the step from the taller room. The code faces the higher room (`docs/decisions/2026-10-26-t4-stale-t3-premises.md`, C5).
  - `node --test` loads each file in its own process. Editing source during a full run mixes old and new code; stop the run and start again.
  - Reverting only `gen2.js` to the slice 1 version leaves 8 of 9 core tests green, because slice 1 already wired `cutCell`. Only the cut-order test needs the integration code.

## 2026-10-26 · T5 cluster topology (Claude with ChatGPT)

- Contract: `docs/handoff/T5-cluster-topology.md`. ChatGPT task `c2c_t5k2`. Commits `5268dd4` (core), `8c47ea1` (links), `df0ace7` (protection). Production cluster districts now join their rooms by the selected topology, not by a fixed passage tree.
- What changed:
  1. `js/gen2-district.js`: `buildClusterTopology` (salt 8810, two draws: five groups, one omitted perimeter edge). `buildClusterDistrict` draws the same 46 room draws as T3, then materializes one source link per selected edge.
  2. Anchor to satellite links are T4 `shared-opening` links (k = sorted edge index). Every other edge is a temporary 3 m passage. A preflight checks the links before `validateDistrictPlan`.
  3. `js/gen2.js`: `topologyAnchorMouths` keeps a strip from each aperture to the cell centre clear of features.
- Tests: 10 named tests in `gen2-cluster-topology.test.mjs`. Unit 304/304, build exit 0, desktop e2e 71 passed and 2 skipped. The T3 room JSON hash did not move.
- Review: see the report for the ChatGPT result.
- Pitfalls:
  - A shell heredoc with a large JS block fails with "unexpected EOF". Write the text with the Write tool, then append it with `cat`.
  - A mutation that does not fire looks the same as a test that cannot fail. Check the mutant is reachable (E always has a lower index than T).
  - The T5 strips cannot be pinned exactly by a black-box test: the generator rarely places a feature there, and the centre-line legs equal the T3 spines (`docs/decisions/2026-10-26-t5-topology-deviations.md`, D4).

## 2026-10-27 · Test tiers

- User asked: is most of the test time wasted? The user agreed after analysis, chose tiers (fast default, slow and visual out), then asked for the rules in an outside file, not inside AGENTS.md.
- Measured before the change: unit 548 s (4 files = 66%), desktop e2e 810 s, about 14 s of page boot per e2e test. The 16 most recent `fix` commits were mostly visual bugs the user found in play.
- Change: rules in `docs/testing.md`; decision in `docs/decisions/2026-10-27-test-tiers.md`. AGENTS.md "Verification" points to the file. `tests/unit/slow.mjs` marks 17 slow cases; `tests/slow.env` enables them. 12 e2e tests carry `@smoke`; the `smoke` Playwright project runs them.
- Result: fast unit 83 s (303 passed, 17 skipped), smoke e2e 110 s (12 passed).
- Pitfalls:
  - Do not edit Playwright spec titles during a run. Workers reload the files and miss the test.
  - Running 36 unit files at once is quick (74 s). Times of single cases under load run about 30% above solo times.
  - The global setup rebuilds `dist/index.html`. Restore it with `git checkout -- dist/index.html` before commit (the project does not commit it per the baseline note).

## 2026-10-27 · Layout redesign consultation (c2c_7b21)

- User asked: fewer corridor-linked rooms, more space reachable only via 2F or B1, floors still overlap, small rooms of different heights inside or instead of large halls. Asked ChatGPT at high effort how to change it and what is missing.
- Result: PLAN recorded in `work/layout-redesign-plan.md`. Chosen: cross-floor topology first, then mixed room sizes (five stages S0 to S4). No code changed.
- Verified by Claude: `lv === 0` limits at `js/gen2-district.js:793` and `js/gen2-measure.js:189`. One ChatGPT line was off: `STEP2` is at `js/gen2.js:15`, not :13.
- New finding: reach and return unit tests use `clusterShare: 0` (`tests/unit/gen2.test.mjs:204-208`), so the cluster path has no walk test of this kind.
- Pitfall: a stale `runtime/*.json` in the c2c state folder made `c2c` report `workspace_mismatch`. Move the file aside; do not kill processes.

## 2026-10-27 · Layout redesign, round 2 (c2c_4e9a)

- User corrected the first PLAN: no island regions. Some A to B routes (straight line and a cone to each side) need 2F or B1; 1F keeps a long detour. User answers: detour ratio about 3 (ChatGPT picks the distribution), only some district borders, keep a few special halls, irregular inner rooms with mixed heights, clear height and floor height together, round rooms as cylinders, small steps as steps and big differences as stairs.
- ChatGPT PLAN (high effort): triangular distribution 2 to 4 (mode 3), cone half-angle 25 degrees (not 30), about 20% of eligible borders, perimeter-subtraction partitions, per-room floor surfaces (`nominalLevel` and `elevation`), analytic circle rooms. Stages S0 to S4. Recorded in `ROADMAP.md`.
- Verified by Claude: `js/gen2.js:1294` (`seen.includes(o.lv)`), `js/player.js:39-59` (foot-only check), `js/player.js:4` (EYE 1.6), cone width at 128 m is 74 m at 30 degrees and 60 m at 25 degrees.
- Pitfall: `c2c session set -w dreamcore-explorer` fails with "Workspace root does not exist" (path doubled). Run `c2c session set` without `-w`.

## 2026-10-27 · S0 route metrics

- User asked: start S0 of the cross-floor plan: re-measure the baseline, define 1F-only and any-floor route ratios and the fan test, keep old layouts unchanged.
- New: `js/gen2-routes.js` (pure graph functions plus a World2 adapter), `node tools/gen2-measure.mjs --routes`, `tests/unit/gen2-routes.test.mjs` (25 tests), `docs/gen2-route-baseline.md`. `js/gen2-measure.js` and the default report are untouched.
- Result: floors now 85.2 / 5.9 / 8.9 % (old 82.4 / 6.7 / 10.9). 16,857 far pairs: 0 shortcuts, ratio 1.00 for all, 1F detour median 1.52 times the straight line (p90 2.15, max 4.23). All 1,620 rooms off 1F stay in their own cell, so no flight joins two cells today.
- Pitfalls:
  - A first-run green test can be blind. A mutant (`shortcut: true &&`) survived until one test had a faster flight over an open 1F line. Run mutants on new metric tests.
  - A Node script that imports repo files needs `file:///D:/...` URLs on Windows; `/d/...` paths fail.

### S0 review fixes (c2c_a51d, FIX_REQUIRED, 5 findings, all confirmed in code)

- F1: `shortcut` now needs a walk inside the fan that is shorter than the 1F way. Before, a shorter way outside the fan counted.
- F2: `flightWalk` gives the real walk of a flight (ramps, landing, switchback legs). Before, a flat formula was used.
- F3: a split cuts its hall into two 1F nodes joined only by a B1 shaft node. Before, the graph had one node per hall, so the 50 splits were invisible. New metric `forced`: 1F has no way, another floor has one.
- F4: `graphDistances` is exact; the `1e-6` tolerance hid shorter ways.
- F5: the baseline doc now uses the contract ratio (1F way / any-floor way), and shows the detour against the straight line only for context.
- Numbers after the fixes and the second round below: 18,232 pairs, 222 cut off on 1F (all joined through B1), 424 shortcut pairs (2.3%), detour median 1.54. The old "0 shortcuts" was an artefact of the one-node-per-hall graph.
- Finding for S1: the 50 existing splits already break "1F joins every pair". S1 must keep, move or drop them.
- Pitfall: a lower-bound assertion on a sum of edge lengths let a mutant (no pit width) survive. Assert the exact sum from the plan data.

### S0 review, round 2 (c2c_a51d, FIX_REQUIRED, 1 finding)

- G1: `splitsOf` threw when one shared hall held two splits (a giant or L hall has one pit per cell). The corpus has no such hall, but seeds 16, 36, 57 and 61 do. Fix: a hall point is named by its side of every pit of the hall (`splitRegion`), one 1F node per region, one shaft node per pit. Tests use seed 16 (giant) and 57 (L, two pits across each other).
- A reviewer worry that a pit may not cut a shared hall: no pit of 326 over seeds 1 to 300 ends on a cell edge, so the generator keeps every pit wall to wall. The adapter skips a pit that would end on a cell edge; no test covers that branch.
- Pitfall: a check script that filters a node id by suffix (`:shaft`) silently stops working when the id gains an index. Filter by `includes`.

### S0 review, round 3 (c2c_a51d, G1 closed, 1 finding)

- F6: `otherFloorShorter` counted the 222 pairs 1F cannot join, because `Infinity > lAll` holds. It needs a finite 1F way now (1,615 became 1,393). The earlier forced fixture asserted `forced1F` only; it asserts `otherFloorShorter === 0` too.

## 2026-10-27 · S0 standard change: pits count as 1F

- User decision: a split pit is the same layer as 1F. The pit is one 1F edge between the two hall regions; the B1 shaft node is gone from the route graph (`routeGraph3D`).
- Re-measured: 18,232 pairs, all joined on 1F, 0 shortcut pairs, ratio 1.00 for all, detour median 1.54 (p90 2.18, max 4.23), fan blocked on 1F 62.6%. The `forced` and `otherFloorShorter` metrics stay in the code for S1, but read 0 now.
- Effect: the old "0 shortcuts" is true again, now for the right reason. The 222 and 424 of the first run were the pits counted as B1.

## 2026-10-28 · S1 cross-floor topology plan

- New `js/gen2-zoning.js`: pure data plan on the S0 route graph. Some district borders close their 1F links and get a bridge on 2F or B1 between two far 1F rooms. 1F keeps the same pieces and a longer way round. The bridge length is the 1F way over a drawn ratio (triangular 2 to 4, mode 3). `validateZoningPlan` checks a plan again on the graph. Report: `node tools/gen2-zoning.mjs`. Details and numbers: `docs/gen2-zoning-s1.md`.
- `js/gen2-routes.js`: `fanWalk` is exported. Nothing else changed in S0.
- Result over 8 seeds (192 borders): 35 drawn, 26 accepted (13.5%, aim was about 20%). Accepted ratios 2.06 to 3.56, median 2.77. 187 shortcut pairs (1.1%). 0 pairs cut off on 1F.
- Honest limit: more draws do not reach 20%. With `borderShare` 0.25, 0.30, 0.35 the accepted share is 15.1%, 17.2%, 17.2%, because accepted borders conflict with later ones. The check was not relaxed.
- Decision (done by Claude, to confirm): the user added "use Claude with ChatGPT" in the middle of the turn. I read it as the c2c loop (ChatGPT plans and reviews, Claude builds) and did not ask first.
- Pitfalls:
  - Closing both stubs of a connector room leaves the room orphaned, and it then looks like a 1F island. The cut must remove the orphan too (`closedNodes`). 21 of 24 borders were `island` before this fix.
  - A rejected border can fail at several stages. Report the latest stage (`ratio-low`, `slack`, `verify` over `unjoined`, `cone-open` over `no-cone`), or the reason hides the real limit.
  - A mutation script that reads files with the Windows default code page fails on UTF-8 (cp950). Read with `encoding='utf-8'`, and restore the source file from the backup if the run stops early.
- Tests: 29 new (`tests/unit/gen2-zoning.test.mjs`), 15 mutants killed.

### S1 review, round 1 (c2c_7e3d, FIX_REQUIRED, 3 findings, all confirmed in code)

- F1: `validateZoningPlan` trusted the recorded ratio, length budget, floor, seed, border name and closed nodes. Now it works them out again from the graph (`bridgeProblems`), and a closed node must be a connector room. Before the fix a plan could close a real room with its links and pass.
- F2: the report had no eligible count and kept the draws of accepted borders only. Now `stats` has `eligible` (a pair across the border passes the cut and fan checks on the base graph) and `drawnEligible`, and the draws of every drawn border. Result: all 192 borders are eligible, so the 13.5% is lost at the ratio check and at conflicts. The target of about 20% stays unmet, and the doc says so.
- F3: the doc said "no length is made up to fit". The lengths are budgets from the drawn ratio, not built corridors. The doc now says so, and calls the slack reserved length.
- Tests: 31 (2 new). 13 mutants of the new checks killed. The test for "the shortest walk does not use the bridge" now looks for that message in the list, because the stretched edges also break the recorded budget.

### S1 review, round 2 (c2c_7e3d, F2 and F3 closed, 1 finding)

- F1-R: the validator checked the sum of the two bridge edges only. A plan could move the bridge node, move length from one leg to the other, change an edge kind or name, and still pass. Now `bridgeProblems` needs one node `<id>:bridge` at the middle of A and B, two edges with the canonical names, ends and kind `stair`, and each leg at least its horizontal run plus the stair excess.
- Found by a new test: a plan with an edge to a node that is not there made `validateZoningPlan` throw (`graph.nodes.get(...).floor`). It now returns `ok: false`.
- Pitfall: a negative test that also breaks the sum is no proof for the per-leg check. Move length from one leg to the other (same sum) to isolate it, and run a mutant for each condition. The first run left three mutants alive (endpoints, excess) until the cases `a leg too short for its climb` and `edge direction swapped` existed.


## 2026-10-28 · S2 slice 1 (Claude with ChatGPT, c2c_5b2e)

- ChatGPT planned S2 as 7 slices (planning tiles, bridge compiler, multi-elevation, sealing, bridge geometry and walk, atomic acceptance, enable). S3 is not authorized in that plan.
- Slice 1 (`8ec6854`): `js/gen2-zoning-runtime.js`. A tile is 4 x 4 districts. Owner of a border is the tile of its first district. A border on a tile edge is never bridged (25% fewer bridges near tile lines). One tile builds in about 0.15 s.
- Review F1 (`e96613e`): `planTile` returned the cache entry, so a caller could overwrite the plan and a mutated route graph (Map, array: `Object.freeze` does not stop `.set()`) would change later decisions. The cache now holds a frozen `{ seed, tile, plan }`. `tileInputs()` builds a new graph per call. Pitfall: 13 green tests did not cover a caller that changes returned data. Ask for that test whenever a cache returns its own object.
- The subagent that wrote slice 1 left `AGENTS.md` and `dist/index.html` modified in the work tree. `AGENTS.md` was the user's own edit (a rule: hand review to ChatGPT, no subagent). `dist/index.html` is rebuilt by the e2e global setup. Neither is committed.
- Round stopped at the plan usage limit (weekly 97%). Slices 2 to 7 are not started. `ChatGPT` connector, bridge and chat checkpoint (`c2c session`) are ready: task `c2c_5b2e`, next step slice 2.
- Pitfall: the `tail -25` of the fast tier output hid the unit totals. Redirect the whole output to a file and read the `ℹ pass` lines.

## 2026-10-28 · S2 slices 2 to 4 (Claude with ChatGPT, c2c_5b2e)

- Slice 2 (`cf88c00`, review fixes `c9d24e4`, approved): bridge compiler. Review F1: a flight slot had no `up/lo/hi` and a reversed B1 `y0/y1`. F2: new stairs were not tested against the upper floor and a passage was tested at its corners only. F3: the real-world test could pass with no bridge. Fixed red first. A passage now leaves a stair straight for 1.5 m; a sideways first run would sit over the last treads. Real result is unchanged: 1 of 10 S1 borders on seed 42 builds.
- Slice 3 (`f7deb57`, review fixes `9d2d3cb`): rooms may carry an elevation. Review found that head room was tested at the height the body leaves (a 0.5 m step failed), that pool, flight and void masks cut elevated floors and drew pools twice, and that a cell-edge wall ignored elevation. `ceil` is the one ceiling height.
- Slice 4 (`da0580a`): `World2` option `sealed` and `sealOutcome`. All 20 S1 closed ports on seed 42 are sealable. `diagonalOf` reads raw links, so sealing moves no diagonal.
- Tests at the end: fast tier 416 tests, 399 pass, 0 fail, 17 skip; full unit tier 416 pass.
- Not pushed. Slices 5 to 7 are not started. Round stopped at the plan usage limit (weekly 99%). Task `c2c_5b2e`, the review of 9d2d3cb and da0580a is with ChatGPT.
- Pitfall: when a review runs, do not edit code files the reviewer reads; ChatGPT `git_diff` shows only the work tree, and it mixed slice 3 code into a review of slice 2. Edit docs only while waiting.


## 2026-10-31 · T6 recheck (Claude with ChatGPT, c2c_91d3)

- Goal was "the newest ROADMAP todo". The first `[next]` item still said "next step T6, no handoff". T6 was already in HEAD since 2026-10-27 (`8ddc6b2`, `1298414`, `d2fdb70`, `12c4d01`, `48719c1`). ChatGPT found this from the code and changed the plan to verify-first. No code changed.
- Recheck at `b1976cc`: six slow unit files 68 passed, 0 failed; measure CLI exit 0, valid JSON; forced corpus 128 districts, 1813 links, 1231 openings, 582 passages, 0 over 30 m; 896 walks, max stretch 34.5 m, one component per seed; T6 midpoint smoke passed.
- Fixed the stale T6 sentence in `ROADMAP.md` and added one recheck line to the baseline.
- Pitfall: the Playwright global setup rebuilds `dist/index.html`, which holds the user's uncommitted edit. Copy it aside first and restore it after.
- Pitfall: a ROADMAP "next step" line can lag behind git. Run `git log --oneline -- <test file>` before planning from it.

## 2026-10-31 · S2 integration baseline (moved from ROADMAP, code `43cbfe0`, ChatGPT c2c_7a42)

Verbatim copy of the ROADMAP baseline at HEAD `b1976cc`, moved here when the ROADMAP baseline was overwritten by the T6 recheck. Numbers unchanged.

**Verification version**: Code commit `43cbfe0`, verified on 2026-10-31. ChatGPT task `c2c_7a42`. Decision: `docs/decisions/2026-10-30-s2-game-activation.md`.
**Result**: Seed 42 fixed corpus: 2 atomically accepted B1 bridges / 10 S1 borders. Both bridges passed real keyboard round trips in source and dist. A midpoint save restored the exact position at -6 m. Continue overlap, request failure, retry, and the L hall passed focused browser checks. The other eight borders remain unaccepted. Compiler corpus 14/86 is a separate metric.
**CI run**: Not run. Local verification only. Final ChatGPT code review: PASS, iteration 13, with the stated test limits. Keep unrelated AGENTS.md, dist/index.html, and T6 handoff changes outside the commit. Do not push with these changes present.

| Tier | Command | Executed result |
|---|---|---|
| Fast | `npm run test:fast` | Exit 0; unit 453 passed, 0 failed, 21 skipped; smoke 12 passed |
| Full unit | `npm run test:unit:full` | Exit 0; 471 passed, 0 failed, 0 skipped before the final client scheduler edit. Latest client contracts: 9 passed |
| Full desktop | `npm run test:e2e:full` | 72 passed, 3 failed, 2 skipped before final fixes. The failed cases passed focused reruns. No later full-desktop sweep |
| Focused desktop | `npx playwright test tests/e2e/gen2-s2.spec.js tests/e2e/gen2.spec.js --project=desktop --grep 'S2\|v2 L 形大廳' --workers=1 --retries=0` | 4 passed, 1 failed at fault injection setup. Isolated `--grep 'S2 replay waits'` passed after setup isolation. All five cases have passing evidence |
| Build | Playwright global setup within fast tier | Exit 0. Source and dist Worker loading passed. Restore the pre-task dist file after local builds |
| Performance | `npx playwright test --project=perf --no-deps --workers=1` | Exit 0; 2 passed. V1 59.6 fps, slow 0.22%; v2 57.1 fps, slow 0.87%. Planning finished before frame measurement |
| Low-power GPU | `npx playwright test --project=perf-igpu --no-deps --workers=1` | Exit 0; 5 passed; 58.3-59.9 fps. The browser flag does not prove physical GPU selection |
| Online / physical device | Existing acceptance commands | Online checks skipped because URLs are not configured. No physical device run |


## 2026-10-31 · S3-1 subdivision planner (Claude with ChatGPT, c2c_b73e)

- User authorized S3-1 only. Cylinder rooms are part of the overall S3 and are modelled as discs in S3-1 data. Ratio 20/70/10. Giant and L-shaped halls stay whole.
- Added `js/gen2-s3-plan.js` (pure planner, validator, `protectedRectsFor`, `isSpecialHall`) and `tests/unit/gen2-s3-plan.test.mjs` (17 tests, slow corpus inside). No runtime code imports them. Decision: `docs/decisions/2026-10-31-s3-subdivision-planner.md`.
- First ChatGPT review found two defects, both real: no free 2 m floor in front of an arc doorway; L-hall fragments not marked special (each fragment lies inside its own cell). Both fixed red-first. ChatGPT's second review showed that 72 sample points in front of an arc doorway miss a small obstacle between rays, so the check is now closed-form (`arcApproachClear`, over-approximating, body radius included; a random search of 200 000 rectangles found 1 398 misses in the first angle test, which wrapped at the +-pi cut, and 0 after the fix) and each new room re-checks the earlier discs' doorways. Corpus after the fixes: 887 halls, 216 cut, mean carved share 0.110.
- Pitfall: the first `ceil` rule let a 3 m hall step up by 0.4 m; the rule now needs a parent ceiling of at least 3.5 m.
- Pitfall: do not round arc angles up. `ceil` to 4 digits put the end angle above 2 pi and the validator rejected the plan.
- Skill change (user order): `agents-with-chatgpt` now rejects a PLAN that is not code-level (file, function, signature, before/after, tests). ChatGPT then produced a full S3-2 plan: anchors in `work/s3-2-code-plan-c2c_b73e.md`, full text in the ChatGPT chat. S3-2 stays unauthorized.

## 2026-10-31 · S3-2 rectangular sub-rooms and inner walls (Claude with ChatGPT, c2c_7e31)

- User authorized S3-2 only. `s3Rects` stays `false` by default, so no cell plan changes in the game. Decision: `docs/decisions/2026-10-31-s3-2-rect-rooms.md`.
- Three commits: S3-2A floor ownership (`6f2d819`), S3-2B inner wall boxes with swept collision (`6a60ee8`), S3-2R placement rules, S3-2C wall mesh, lamps and floor audit (see ROADMAP baseline for the SHAs).
- Mid-task the user changed the design twice. Round rooms were removed from the whole plan. Rooms in a hall now form one cluster that starts in a corner, so a room that stands on another room's wall sits at its corner and leaves no strip. A single room has no rule.
- Pitfall: a new top-level name in `js/` must be unique over all files. `SIDES` collided with `mega.js` and the build test caught it (renamed `S3_SIDES`).
- Pitfall: a test that cannot fail. Two mutations (no shared-wall dedupe, no flush rule) left the suite green. The tests now assert one wall between two rooms, and use a 2 m clear case so only the flush rule can refuse it. Run a mutation after every placement test.
- Pitfall: `s3Meet` tests with a room 1 m from both ends were refused by another rule first. A case must be clear of every other rule or the test proves nothing.
- The `/verify` skill needs `PROMPT.md` or `IMPLEMENTATION_PLAN.md`. This repo has neither, so it stopped at step 1.
- ChatGPT review of S3-2R and S3-2C (iteration 2) returned FIX_REQUIRED: F1 the validator did not check the central cross (the planner did; my own singleton test even pinned a room on the cross), F2 a shared wall was lit by the hall and its host room only, F3 the centre lamp differs from the approved plan, G1 no outer fallback in `World2.plan`, G2 no body walk over the S2 bridges with S3 on. F1, F2, G1, G2 were real and fixed red-first (mutations turn each test red). F3 is a design detail the user did not rule on; it stays and is listed as a choice made for the user.
- Pitfall: a validator that is looser than its planner is a latent defect; both now read `s3Reserved`. Check the maker's reserved set against the checker whenever one of them changes.
- Pitfall: the first G2 idea (`neighborId` on every wall) was not needed. Lighting each 2 m piece by the room that holds the floor in front of it needs no new data and is right for any wall.
- The slow S2 x S3 test now also runs `bodyPathJob` in both directions for both seed 42 bridges, in the world with S3 and without: 4 walks found, same lengths (73.0 m and 76.0 m).

## 2026-10-31 · Poolcore water rooms: research, plan and ten rulings (Claude with ChatGPT, research chat)

- User asked ChatGPT (new chat, with reference images) whether v2 can make a room with an all-water floor, a stair that leads down into a bright flooded room, and when ordinary pools and round pools appear. Answer: v2 cannot yet. No full-room flood, no bright Poolcore light, no spiral stair, no railing on ordinary pools. v1 has flooded halls and round columns but only a round pool in mega abyss rooms.
- User direction: remove random ellipse pools. Put a round pool at the centre of a special rectangular room. ChatGPT agreed with refinements.
- ChatGPT consolidated one plan of 10 items. The user ruled on each item (all the recommended option). Item 2 got a condition: the round-pool room must be guaranteed, not drawn by chance. ChatGPT designed a 16-cell hash-ordered pick with one fixed fallback hall at cell (2,0), a hard reserve against S2 bridges and S3 rooms, and a test over seeds 1..256.
- Spot checks against code before use: ellipse draw at `js/gen2.js:360`, `POOL_MARGIN` 2.5, column refuses pool at `js/gen2.js:1326`, `railHit` at `js/gen2.js:1409`, `ownHall` half sides 10 to 25 m at `js/gen2.js:620-624` (so the 32 m hall minimum is met by about 36 % of own halls).
- Files: `docs/decisions/2026-10-31-poolcore-water-rooms.md`, `docs/handoff/poolcore-water-plan.md`, one ROADMAP entry. No code changed. Implementation is not authorized yet.
- Pitfall: a long ChatGPT answer streams for 5 to 10 minutes. Read it only after the stop button is gone. The page text shrinks when old turns unload, so take the text after the last marker string.
- Open: `tests/e2e/gen2.spec.js:60` (v2 save and continue) fails in the smoke tier. A control run without the `?v=pre-column` hook failed too. Cause not found.

## 2026-10-31 · Poolcore Phase A: no random ellipse, guaranteed round-pool hall

- User authorized Phase A only (items 1 and 2). Decision record extended: `docs/decisions/2026-10-31-poolcore-water-rooms.md`.
- Item 1 red proof: the old code (HEAD copy) draws 178 ellipse pools in 1 119; the new test asserts none. `withoutEllipse` keeps every rect, rrect, blob and L pool as it was.
- Item 2: `World2.roundHall()` picks the first plain own hall at least 32 x 32 m in 16 hash-ordered cells; seeds 1..256 all have one, at least 180 without the fallback. Fallback is the fixed hall at cell (2,0) and makes district (1,0) legacy. Tests: `tests/unit/gen2-round-hall.test.mjs`.
- Re-pinned `tests/fixtures/gen2-district-baseline.json` on purpose: 271 of 512 plan hashes changed.
- Pitfall: old tests pinned incidental layouts (ellipse in a kinds list, column counts on every level, "no legacy district in a full-cluster world"). Rewrite them to the public contract, not to new numbers.
- Pitfall: a mutation that deletes a branch the new code no longer has (M5) proves nothing. The old-code count was the red proof for item 1.
- Pitfall: the pick must not call the overrides it depends on. `#roundBusy` switches `ownHall`, `megaOf`, `lOf` and `districtPlan` off while `roundHall()` chooses.
- Pitfall: ordinary tests that count columns or pools must filter by level; the landmark pool and reserve live on level 0.
- Codex adversarial review: one real finding. `plan()` accepted injected S2 rooms, flights and hall entries on the reserve, while the plan says to throw. Fixed red-first with `RoundPoolReserveError`. Soft reservations still keep the pool and never throw: the walk line through a hall may cross the square.
- Full unit tier (slow files on) found one red: bridge `1234 zt:0,0 db:x:0,0` is refused now because seed 1234 puts the round pool in its hall. It left the pin list, with a comment.
- Smoke tier: `gen2.spec.js:17` and `:213` time out at 120 s on this machine. A control (HEAD copy of `js/`) boots seed 42 in 176 s, the new build in 169 s, so it is the machine and not Phase A. `:60` passed this time; the smoke failures move with load.
- Pitfall: a new guard that throws on injected geometry must be run against every test file that feeds `bridgeParts` (7 files, 71 tests in slow mode) before it ships.

## 2026-10-31 · Poolcore Phase B: fully flooded B1 rooms

- User authorized Phase B only (items 3 and 4). Decision record extended: `docs/decisions/2026-10-31-poolcore-water-rooms.md` ("Phase B built").
- Design: `World2.addFlood` marks about 10 % of B1 basements (`room.fullFlood`, `plan.floods`), `candidates()` returns the sunk floor and the water level, `mesh2.js` `floodCells()` sinks floor and walls and adds one water plane. Collision, render and measure read the same record. Measured 192 of 1 781 basements (10.8 %) over 10 seeds.
- Pitfall: a flood built as a widened pool draws stray floor, because `poolBox` is widened by `Q2`. Use dedicated geometry.
- Pitfall: a new plan field on every plan changes every plan hash. `plan.floods` exists only when a room floods, and the flood draws from its own stream after all other features.
- Pitfall: a small sample misleads. 31 of 200 basements (15.5 %) over 8 seeds looked high; 192 of 1 781 over 10 other seeds gave 10.8 %. Check the draw is uniform, then enlarge the sample.
- Pitfall: tests that sample pools by index shift when a feature removes pools (the wade test hit a showcase pool, a flaw that was there before). Tests that assume a dry B1 floor must read `floodAt(x, z)?.floor`.
- Baseline: the oracle worlds run with `floodShare: 0`, so the district fixture is unchanged. Re-pinning would hide non-flood plan changes.
- Slow tier once showed a red in `bridge search corpus` (`gen2-bridge-world.test.mjs:85`) that did not repeat: the test passes alone (18.9 s) and with its file (8 of 8).
- Review (ChatGPT, cold adversarial, c2c_pb01): 5 findings, all checked against code. F1 (S2 passage into a flooded basement) cannot happen: `bridgeContext.upper` lists every room of the floor and the compiler keeps passages off it. F2 (`floodAt` is a footprint test) documented on the function. F3 (a pool that only touches a flooded room goes whole: 140 of 826 stick out) kept and pinned. T1 (share 0 against 1 hid B1 pool and column loss) fixed: the test now compares them; deleting all B1 pools turns it red. T2 (no switchback case) left for Phase C.
- Verification: full unit tier 538 of 538 (slow files on); fast tier 515 passed, 23 skipped; smoke 11 passed, `gen2.spec.js:17` timed out at 120 s (known slow machine). Screenshot of a flooded room (seed 42, 108 / -26.5) taken in the browser pane: tiled floor under shallow water, water reaches the walls, no console errors. `/verify` and `/simplify` did not run: the repo has no `PROMPT.md` spec.
- Pitfall: the browser pane renders nothing while hidden. Show it with `show_pane preview` and front the tab, then wait for the title screen to start the game before `__deepend.teleport`.

## 2026-10-31 · Rounded-rectangle pools: corner radius 1 m

- User ruling: every rounded-rectangle corner is a 1 m quarter circle (`POOL_CORNER_R`). User said to change it without writing a test.
- Kept the old `between2` radius draw so the random stream of the cell does not shift. Differential check against HEAD: plans equal after setting `r` to 1.
- Re-pinned `tests/fixtures/gen2-district-baseline.json` with a scratch script (the capture tool refuses to overwrite): 209 of 512 plan hashes, report changed (pool area up, walkable down).
- Pitfall: the old rule made stadium pools (radius = short half side). They are gone; a 2 m wide rrect pool is a rectangle with 1 m corners.

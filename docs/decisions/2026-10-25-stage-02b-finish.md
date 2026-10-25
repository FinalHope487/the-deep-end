# 2026-10-25 Stage 02B 收尾：窄矮走廊、對角線中間房間、高度感知步行

依據：`docs/handoff/T0-02b-finish.md`（D1–D8 由該文件固定，這裡只記實作時偏離或補充的決定）。

## 決定

| # | 決定 | 理由 | 反悔成本 |
|---|---|---|---|
| 1 | 走廊寬 `[1.5,2,2,2.5,3,3.5]`、高 `[2,2.5,3]`；寬 1.5／2.5／3.5 m 的中心正向偏 0.25 m，矩形邊維持在 Q2 格上 | 窄矮走廊壓低「長走廊」感；偏移讓每個矩形邊仍落在 0.5 m 格 | 改 `edgeCorridor2` 與 `phase2` 兩處；plan 內容全變，v2 無存檔幾何，不損資料 |
| 2 | 長於 36 m 的對角線在中點放一間 8×8（不行再 6×6）連接室；走廊段各 ≤ 36 m | 36 m 走廊段上限的唯一出口 | 刪 `diagonalMiddle` 與 `makePlan` 碎片段 |
| 3 | 中間房間必須整個落在對角線所屬的 2×2 區塊內（`diagonalMiddle` 內的邊界檢查，交接文件沒寫） | 鄰區塊的格子只看得到自己區塊的對角線，房間越界會在鄰格缺一塊 | 8 seeds × 16×16 區塊的 559 間中間房離區塊邊界最近 42.5 m，守衛目前不改變任何結果（6×6 只出現 1 間，其餘 8×8） |
| 4 | `measureWalks` 的路線 stretch 取牆到牆軸向距離，graph 步行成本仍用完整 `route.length` | 轉折是轉角不是直走段（D8） | 改一行 |
| 5 | 另外改了 `tests/unit/gen2.test.mjs`（1F 走廊天花板下限 2.2→2；「大廳可達每間房」只略過沒有經由對角線碎片連到本格大廳的碎片）與 `tests/unit/gen2-connection-walk.test.mjs`（連接室對帳加上對角線中間房間數） | 這兩條斷言隱含舊的走廊高度範圍與「連接室只來自邊連結」；只路過本格角落的對角線碎片由 `gen2-detour-walk.test.mjs` 雙向實走負責 | 還原兩處測試即可，不影響生成 |
| 6 | L 形廳 e2e 改用 seed 8（原 seed 42） | 夾具現在只收 ≥2.5 m 的一般走廊且要乾而平的 ±0.5 m 車道：seed 1–60 只有 7 個 seed 在 8 圈內找得到，seed 42 沒有（候選不是走廊有緩坡，就是大廳裡有池與柱擋住）。seed 8 在第 3 圈 | 夾具條件放寬或換 seed 即可；`gen2L` 找不到時直接丟出交接文件指定的錯誤 |

| 7 | `kind === 'corridor'` 的燈改成沿長軸一排、置中、每 6 m 一盞（`gen2.js` 燈迴圈）；其他房型的燈格不動 | Found in the adversarial review: the lamp grid starts 3 m from the wall, so a corridor needs more than 3.6 m width for any lamp. D3 caps width at 3.5 m, so none of 476 corridors (1F, ≥ 8 m long, seeds 1, 2, 3, 42 × 36 cells) had a lamp; at `5615e9e` all 397 of 493 corridors of 4 m or wider had lamps (the 96 of 3 m had none). The handoff keeps the 6 m step but does not name corridor lamps | 還原燈迴圈兩行；燈不吃亂數，其他 plan 內容不變 |

## 前提不符

交接文件 3.1 稱「既有」的 10 組步行交叉驗證與 36 m gate，開工時只存在於工作目錄（未提交的改動），不在 HEAD。本輪沿用並補齊它們，所以「先紅後綠」只能從本輪的測試輸出驗證，無法從 git 歷史驗證。

## 已知：`diagAvoid` 目前不會觸發

規格 4.10 的排除（樓梯、坑、窗、柱、池避開對角線中間房間）已實作，但 120 個 seed、2162 間中間房、每間 4 格比對「有／無排除」的 plan，沒有任何一格不同；把它清空，測試也不會變紅。原因是中間房距每座大廳 ≥1 m，且在走廊中點，離大廳內的設施位置太遠。保留它是為了日後大廳或房間尺寸改變時不靜默失效；測試釘的是間距不變量，不是這條程式碼。

## 沒做

- 沒加 gallery 走廊、沒動 2F／B1 房型、沒加 walk-mean／p90 門檻（交接文件第 7 節）。
- `gen2L` 回傳多兩個欄位 `corridorW`、`routed`，只給 e2e 驗「走廊 ≥2.5 m、非路線」。

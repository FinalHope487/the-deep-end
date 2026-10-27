<!--
本專案專屬規則：規則檔的通用規則在本專案代入的值。
放：專案目錄、各層驗證指令、真依賴與替身、開發服務埠、專案專屬工具的執行方式。
不放：通用規則（寫規則檔）、測試數字（寫 ROADMAP.md〈基線〉）、決策（寫 docs/decisions/）。
與規則檔衝突時以規則檔為準，並修正這份。
-->

## 目錄

- 網頁：repo 根目錄（`index.html`、`js/`、`audio/`），無建置步驟，直接開
- 單檔版：`dist/index.html`（由 `node tools/build.mjs` 產生，改 `js/` 或 `index.html` 後重跑；Playwright 開跑前會自動重建）
- Python：只用來跑 `tools/outline.py`

## 驗證指令

| 層 | 指令 | 說明 |
|---|---|---|
| 內層 | `npm run test:unit` | 世界生成的純邏輯；分層與其他指令見 `docs/testing.md` |
| user 層 | `npm run test:e2e` | 真 Chromium 打 `node tools/serve.mjs 8090`；`smoke` 專案只跑 `@smoke`；完整套件、`perf` 專案（A11）見 `docs/testing.md` |

- 真依賴：Three.js 走 jsDelivr CDN（測試需要網路）；Chromium 用 GPU（`--use-angle=d3d11`）
- 替身：中階手機用「390×844、DPR 3、觸控、CPU 降速 4 倍」近似；實機 60fps 由 user 人工驗收
- GPU：本機有 Intel Iris Xe 內顯與 RTX 4060 獨顯，Chromium 預設用獨顯；啟動參數加 `--force_low_power_gpu` 改用內顯。內顯在全 DPR 3、不降速 CPU 下仍有 58.9 fps，比中階手機強，只能抓填充率的相對退步
- 效能數字受同機其他工作影響：2026-10-18 同一版（afab71a）基線 59.2 fps，另一個 session 同時工作時重跑只剩 54–56 fps。A11 只在沒有其他測試、建置在跑時採信
- `package.json` 不可設 `"type": "module"`：Playwright 1.49 在 Node 24 載入 ESM 設定檔會卡住
- 在 Node 腳本裡不要呼叫 `python`：Windows cmd 會解析成微軟商店假捷徑

## 開發服務埠

| 埠 | 用途 |
|---|---|
| 8080 | 手動試玩（`node tools/serve.mjs 8080`，`.claude/launch.json` 的 `deep-end`） |
| 8090 | Playwright 專用，測試自己起、跑完關 |

## 專案專屬工具

- `tools/outline.py`：在 repo 根目錄跑 `python tools/outline.py <檔> --min 20`
- `tools/build-audio.sh <來源資料夾>`：從 CC0 原始檔重建 `audio/*.mp3`，需要 ffmpeg；來源見 `audio/CREDITS.md`

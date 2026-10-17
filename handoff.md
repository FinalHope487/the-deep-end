# 交接摘要

跨多輪任務結束前產出。給下一輪冷 context 的人／agent 讀，只寫他接手需要的東西。

## 目前狀態

樓梯／疊層／窄暗走道／溜滑梯／隱晦引導這一輪已實作並推上 `main`。單元 37 passed、Playwright 35 passed／2 skipped、A11 59.2 fps（前一次 58.8；門檻 58，餘裕小）。等 user 試玩確認觀感。

## 已完成

- 需求 ①–⑯（見 `docs/devlog.md` 2026-10-18 04:35 條）｜`tests/unit/levels.test.mjs` 14 條、`tests/e2e/levels.spec.js` 5 條｜本輪 commit 見 git log
- 規格書、README、繳交稿同步更新；決策見 `docs/decisions/2026-10-18-multilevel-stairs.md`

## 未完成待辦

- 實機 60fps 與手感（A12）｜只有 user 能驗｜`ROADMAP.md`〈待辦項目〉
- A11 餘裕小｜欄杆改貼圖面片可省三成面數｜`js/chunkmesh.js`

## 待決問題

無（`QUESTIONS.md` 為空）

## 本輪不可碰的範圍

- `package.json` 不可設 `"type": "module"`（Playwright 1.49 在 Node 24 會卡住）
- Node 腳本裡不要呼叫 `python`（Windows cmd 會解析成微軟商店假捷徑）
- 改 `js/` 或 `index.html` 後要重跑 `node tools/build.mjs` 並 commit `dist/`
- 新增幾何前先跑 A11（`npx playwright test perf`），餘裕只剩約 1 fps

## 下一步建議任務

依 user 試玩回饋調整。第一個動作：請 user 開網址走一趟樓梯房與區域 2，回報 FPS 與觀感。

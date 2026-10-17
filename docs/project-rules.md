<!--
本專案專屬規則：規則檔的通用規則在本專案代入的值。
放：專案目錄、各層驗證指令、真依賴與替身、開發服務埠、專案專屬工具的執行方式。
不放：通用規則（寫規則檔）、測試數字（寫 ROADMAP.md〈基線〉）、決策（寫 docs/decisions/）。
與規則檔衝突時以規則檔為準，並修正這份。
-->

## 目錄

- 網頁：repo 根目錄（`index.html`、`js/`、`audio/`），無建置步驟
- Python 目錄：無（只用系統 Python 跑 `tools/`）

## 驗證指令

- 內層：無獨立單元測試層；純邏輯（生成、探索度、壓抑度）由 user 層測試經 `?test=1` 狀態介面驗證
- user 層：Playwright（預定，實作時安裝）。`npx playwright test`，由設定檔自動起本機靜態伺服器
- 真依賴與替身：Three.js 走 CDN 真檔；效能測試用 Playwright 的 CPU 降速模擬中階手機，實機 60fps 由 user 人工驗收

## 開發服務埠

- 8080：本機靜態伺服器（`python -m http.server 8080`），Playwright 共用

## 專案專屬工具

- `tools/outline.py`：在 repo 根目錄跑 `python tools/outline.py <檔> --min 20`

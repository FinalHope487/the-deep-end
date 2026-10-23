# 2026-10-18 · 技術棧與驗證方式

- **決策**：靜態網頁，`index.html` 入口＋少量 `js/*.js`；3D 用 Three.js（CDN、鎖定版本）；音檔用 CC0；user 層驗證用 Playwright；部署到 GitHub 公開庫 `the-deep-end` 的 GitHub Pages
- **依據**：課程作業要求 `index.html`＋GitHub Pages（`ROADMAP.md`〈硬約束〉）；user 在規格訪談選 3D 第一人稱、免費音檔、加 Playwright、名稱 the-deep-end（`docs/devlog-2026-10-17-18.md` 第 1、4、6 輪）
- **反悔成本**：換 3D 方案要重寫全部渲染；拿掉 Playwright 只需刪 `package.json` 與測試；改庫名要改 `docs/spec.md` 網址並在 GitHub 改名

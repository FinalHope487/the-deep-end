# 2026-10-18 · 顆粒感只在高畫質

**決策**：`QUALITY_LEVELS.high.grain = true`，中／低畫質隱藏 `#grain`；自動檔掉到中階時一起消失。
**依據**：全螢幕混合層吃填色率，A11 餘裕只剩約 1 fps（`ROADMAP.md` 待辦「A11 效能餘裕」）。
**反悔成本**：改 `js/quality.js` 一個旗標。
**釘住**：`tests/e2e/levels.spec.js` 的 C8 測試。

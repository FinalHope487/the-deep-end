# 2026-10-18 · 跳轉關卡不計入進度、不存檔

**決策**：標題與暫停選單可跳到區域 1–4 與出口。跳轉時把真實進度（visited／found／distance）收進 `game.jump`，遊戲內暫時換成「全開、空 found」；`persist()` 與 `startEnding()` 的 `clearGame()` 在跳轉中不動存檔；回標題、開始、繼續時 `endJump()` 還原。
**依據**：PM 批次 1 第 F 項要求「不計入探索度／小發現／距離、不存檔」；存檔格式（`js/save.js`）不可動，所以用記憶體旗標而不是存檔欄位。
**反悔成本**：改 `js/main.js` 的 `jumpTo`／`endJump`／`real()` 與 `js/jump.js`、`js/ui.js` 的跳轉清單；存檔不受影響。
**釘住**：`tests/e2e/levels.spec.js` 的兩條 F 測試、`tests/unit/jump.test.mjs`。

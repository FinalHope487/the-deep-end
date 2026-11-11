# 2026-10-24 · 存檔位置失效時的回復

- **決策**：存檔逐欄驗證，壞欄位丟棄、其餘保留（不再整筆作廢）。位置失效、站不住或屬於別的生成器時，回最後實際造訪的地標安全點；沒有可靠的最後地標紀錄（含所有舊存檔）就回起點。新存檔多記 `last`（最後造訪地標，每次進入都更新）與 `gen`（生成器 1／2）。`v:1` 與 key `deepend.save.v1` 不變，舊檔照讀。
- **不做**：不從 `visited` 推測最後地標；JSON 整筆壞時不重建歷史（等同無存檔）；不保證新版回到原座標。
- **依據**：user 2026-10-23 訪談原意（`handoff-generation-redesign-2026-10-23.md`〈最新覆蓋決策：存檔回復〉）；2026-10-24 user 選「保留進度，回起點」。
- **取代**：`tests/e2e/review.spec.js` 舊契約「不合理的存檔會被忽略、不顯示繼續」。
- **反悔成本**：還原 `js/save.js` `parseSave`／`loadGame`、`js/main.js` `continueGame`、`js/world.js` `safePoint`；已寫入的 `last`／`gen` 欄位舊版會忽略，不損資料。
- **釘住**：`tests/unit/save.test.mjs`、`tests/e2e/save-recovery.spec.js`、`review.spec.js`「不合理的存檔欄位…其餘進度保留」

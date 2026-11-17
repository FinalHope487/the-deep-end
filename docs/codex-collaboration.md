# Codex & ChatGPT 協作

## Codex & ChatGPT 協作
- 如果 agents with ChatGPT 工具可用則以下任務都交給 ChatGPT 執行，否則才交給 Codex。
- 每做完一批次任務 git push 之前,先執行 /codex:review;有發現問題就修正或回報,通過才能提交。
- 同第一項但改動涉及架構或設計取捨時,改用 /codex:adversarial-review。
- 可獨立進行的任務(例如:寫測試、查另一個 bug、調研),用 codex:codex-rescue 以 --background 交給 Codex,
  自己繼續做主線工作，最後再用 /codex:status 和 /codex:result 取回結果。
- 不要把會改到同一批檔案的任務同時交給 Codex 和自己做。

## 名詞定義

| 詞 | 定義 |
|---|---|
| 一批次任務 | 一輪（user 的一次委派）的全部程式碼改動。只動文件或測試的批次不審 |
| 提交 | `git push`。commit 照 `docs/procedures/close-round.md` 綠了就 commit；push 前對整批 diff 審一次 |
| 通過 | 每條阻擋項都已修正（真缺陷照〈缺陷修復〉先寫重現測試），或附 `檔案:行號` 與證據回報為非缺陷；建議項已記入 `ROADMAP.md`〈待辦項目〉 |
| 涉及架構或設計取捨 | 這批改了公開契約、資料格式或 Schema、模組邊界或資料流，或在 `DECISIONS.md` 新增一行；命中就只跑 adversarial-review，不再跑 review |
| 後續開發 | 本批 push 之後，已列在 `ROADMAP.md`〈待辦項目〉或 `DECISIONS.md` 已核准的工作項，加上它們呼叫本批公開介面的程式。未列入的設想不算 |
| 阻擋後續開發 | 同時滿足 (a) 和 (b)。(a) 輸入來自合法來源：本專案程式碼、Save 檔、Worker 訊息、使用者匯入檔；registry、adapter、generator 是本專案靜態程式碼，不當作惡意來源。(b) 屬於下列之一：1. 違反已核准契約的明文（附 `檔案:行號`），使依契約寫的後續程式得到錯結果或崩潰；2. 同一契約在兩個公開入口判定不同，一方通過的值被另一方拒絕；3. 造成資料遺失或覆寫既有檔案；4. 某個已列出的後續工作項必須改本批的公開介面才能完成。發現須寫出被擋的工作項名稱 |
| 建議項 | 不符合「阻擋後續開發」的發現：只有惡意構造才會觸發的加固、契約沒有明文的錯誤碼或路徑標籤、命名與風格、沒有量測基準的效能。記入 `ROADMAP.md`〈待辦項目〉，不阻擋 push |

## 額度

- review、adversarial-review、codex-rescue 背景任務都已獲 user 長期同意使用 Codex 額度（2026-10-24），不逐次問。
- codex-rescue 的委派 prompt 照 `docs/procedures/delegation.md` 寫齊五項；它回報後照該節自己驗證再轉述。
- 回報〈subagent 額度〉一行寫明用了幾次 Codex、各做什麼。

## Codex & ChatGPT 不可用或剩餘額度過少時

不可用＝CLI 不在、未登入、額度用盡、或指令報錯／逾時。
額度過少＝周額度 < 15%。

1. 退化順序：ChatGPT -> Codex -> Subagent
2. 報錯或逾時：先查用量。額度用盡就直接退；否則重試一次，再失敗才退。
3. 退路：
   - review／adversarial-review：派唯讀 Sonnet subagent 審整批 diff（adversarial 版要它挑戰設計取捨），合約同 `docs/procedures/close-round.md`。
   - codex-rescue 的任務：自己做，不派 subagent。
4. 回報寫明「Codex 不可用，退回 subagent／自己做」與原因。

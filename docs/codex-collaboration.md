# Codex & ChatGPT 協作

## Codex & ChatGPT 協作
- 如果 agents with ChatGPT 工具可用則以下任務都交給 ChatGPT 執行，否則才交給 Codex。
- 每做完一批次任務 git push 之前,先執行 /codex:review;有發現問題就修正或回報,通過才能提交。
- 同第一項但改動涉及架構或設計取捨時,改用 /codex:adversarial-review。
- 可獨立進行的任務(例如:寫測試、查另一個 bug、調研),用 codex:codex-rescue 以 --background 交給 Codex,
  自己繼續做主線工作，最後再用 /codex:status 和 /codex:result 取回結果。
- 不要把會改到同一批檔案的任務同時交給 Codex 和自己做。a

## 名詞定義

| 詞 | 定義 |
|---|---|
| 一批次任務 | 一輪（user 的一次委派）的全部程式碼改動。只動文件或測試的批次不審 |
| 提交 | `git push`。commit 照 AGENTS〈動過檔案之後〉綠了就 commit；push 前對整批 diff 審一次 |
| 通過 | 每條發現都已修正（真缺陷照〈缺陷修復〉先寫重現測試），或附 `檔案:行號` 與證據回報為非缺陷 |
| 涉及架構或設計取捨 | 這批改了公開契約、資料格式或 Schema、模組邊界或資料流，或新增 `docs/decisions/`；命中就只跑 adversarial-review，不再跑 review |

## 額度

- review、adversarial-review、codex-rescue 背景任務都已獲 user 長期同意使用 Codex 額度（2026-10-24），不逐次問。
- codex-rescue 的委派 prompt 照 AGENTS〈委派邊界規格〉寫齊五項；它回報後照該節自己驗證再轉述。
- 回報〈subagent 額度〉一行寫明用了幾次 Codex、各做什麼。

## Codex & ChatGPT 不可用或剩餘額度過少時

不可用＝CLI 不在、未登入、額度用盡、或指令報錯／逾時。
額度過少＝周額度 < 15%。

1. 退化順序：ChatGPT -> Codex -> Subagent
2. 報錯或逾時：先查用量。額度用盡就直接退；否則重試一次，再失敗才退。
3. 退路：
   - review／adversarial-review：派唯讀 Sonnet subagent 審整批 diff（adversarial 版要它挑戰設計取捨），合約同 AGENTS〈動過檔案之後〉。
   - codex-rescue 的任務：自己做，不派 subagent。
4. 回報寫明「Codex 不可用，退回 subagent／自己做」與原因。

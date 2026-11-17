# 程序：雜務

觸發：user 要求整理，或文件檢查腳本報錯。
不觸發：任務輪的結尾。做任務的 agent 不讀這份檔。
讀者：agent。

雜務＝與任務本身無關、只為維持專案紀錄整齊的事。

| 雜務 | 做法 | 機器能檢查 |
|---|---|---|
| 斷掉的路徑 | Markdown 裡寫到的路徑不存在：改成新路徑，或刪掉那句 | 是 |
| 檔案過大 | Markdown 超過 32 KiB 就拆；`STATE.md` 超過 6 KiB 就把非現行的內容移走 | 是 |
| `ROADMAP.md` | 刪掉已完成的條目；`[later]` 搬到 `ROADMAP/later.md`，`[parked]` 搬到 `ROADMAP/parked.md` | 否 |
| `QUESTIONS.md` | user 答過的題照 `docs/procedures/questions.md` 搬走並刪除 | 否 |
| 做完的計畫 | 仍生效的規則搬進 `STATE.md`，計畫檔搬進 `archive/`（保留原路徑），修正所有指向它的檔案 | 部分（斷路徑） |
| 非現行文件 | 冷啟動的 agent 做現行目標用不到、也不是常設規則的文件，搬進 `archive/`。規則與搬回方法：`archive/README.md` | 否 |
| 重複的事實 | 同一件事寫在兩個檔：留一個家，另一處改成指過去 | 否 |

機器能檢查的項目由文件檢查腳本負責（`docs/components-plan.md` 項目 31，尚未建立）。腳本建立前，這兩項只在 user 要求整理時人工做。

# 如何提問與回饋（給 user）

給 user 用的訊息模板與回饋方法。agent 不需要讀這份檔。
原本是 `DIRECTION.md` 的第 5、6、8 節（2026-11-17 拆出）。

## 1. How to give feedback at the lowest cost

One message costs the same if it is short or long. So:

- Send one message with all points. Number them.
- For a look: use the sidebar, find values that you like, and send the exported preset. Do not describe it.
- For a fault that you cannot name: say where in the picture (for example "far water, left") and what is wrong in plain words. The agent maps it to a factor (table below) and does not ask again.
- Say "default" to take each default that the agent proposes.
- The agent sends one complete report for each of your messages. The builder writes its report to `workbench/out/builder-report.md` and sends no message.

| What you see | Usual factor |
|---|---|
| Brown or dark blotches on the water | Reflection of the ceiling or of dark walls |
| Water too vivid | Sky colours of the light preset; haze; body tint weight |
| Water looks like glass, no body | Clarity too high; haze too low |
| Floor not visible under near water | Clarity; reflection share near the viewer |
| Room looks flat | No strong sun direction; ambient level too high; no contact shade |
| Everything has one hue | The material value `floor` colours all upward faces and the bounce light |

## 2. How to ask

### 2.1 Four kinds of message

Start the message with the kind. Then the agent knows what answer you want and does not guess.

| Kind | Use it when | Write | The agent gives |
|---|---|---|---|
| DO | You know what you want | The result that you want to see, not the method. Add "do not change X" if something must stay. | The work, the evidence, and what it chose for you |
| CHOOSE | You must decide and do not know the options | "Options for X" and what matters most to you (picture, phone speed, quota, time) | 2 to 4 options, what each changes, one recommendation, and a default |
| WHY | Something looks or feels wrong and you do not know the cause | See 2.3 | The cause with proof (a picture or a number), not a fix. A fix comes only if you say "and fix it". |
| CHECK | You want to know where the work stands or if a claim is true | "State of X" or "Is it true that X" | Facts with file and line or command output; what is not verified |

### 2.2 How to decide what to ask

Ask a question only if the answer changes what you do next. Go down this list and stop at the first "yes".

1. Is there a result on screen that you can judge by eye? Then judge it (keep, drop, or 2.3). Do not ask about the method.
2. Can you change it yourself in the sidebar? Then change it and send the exported preset. This costs no round of guesses.
3. Is the next step already decided in `STATE.md` or `DECISIONS.md`? Then say "continue". Do not decide again.
4. Does the choice cost quota, lose data, add a dependency, or change a decided line of this file? The agent must ask you, and it asks all such points in one message. If it did not, tell it.
5. All other choices belong to the agent. It reports them under "decided for you". Read that part; overrule a line by its number.

Questions that are worth their cost, in this order: what is the largest gap to the target now; what is the cheapest test that can prove the plan wrong; what did you decide for me; what is not verified.

### 2.3 When you do not know what the problem is

Do not try to name the cause. A wrong cause sends the agent the wrong way (the "wave transparency" case: the real cause was the reflection). Give evidence, and let the agent find the cause. Send these five lines; leave a line empty if you do not know it.

| Line | Content | Example |
|---|---|---|
| WHERE | The sheet or room, and the place in the picture | "m1-pool15-doorways, far water on the left" |
| SEE | What you see, in plain words | "brown patches that move" |
| WANT | What you expected, or the reference picture and the place in it | "as pool15, the water behind the second doorway" |
| GUESS | Your guess, marked as a guess | "guess: waves too transparent" |
| KEEP | What must not change | "the near water is good" |

Then the agent must do these things in this order, in one reply:

1. Say again what it understood, in one line.
2. Show the cause with proof: a layer view, a picture with one factor off, or a number. Not an opinion.
3. Say if your GUESS was correct. If it was wrong, say what the real factor is.
4. Show 2 or 3 fixed variants beside the reference, or name the sidebar control to move.
5. Ask one question only if two readings of your words lead to different work.

Other ways to show a problem with no words for it:

- Point to a reference: "more like pool3 here". A picture carries more than a description.
- Send two renders: "this one is better than that one". The agent finds what is different between them.
- Give a rank, not a number: "A, then C, then B".
- Say the feeling: "flat", "plastic", "empty", "too clean". The agent maps it to factors with the table in section 1 and adds the new pair to that table.

### 2.4 If the agent does not understand you

Signs: it repeats work, it fixes a thing that you did not name, or its "what I understood" line is wrong. Then:

- Answer only "wrong: " plus the part of its understood line that is wrong. Do not explain again from the start.
- If two tries fail, say "show me the layers". Do not let it try a third fix.
- If the same kind of misunderstanding happens two times, tell the agent to add the case to section 1 or to this section.

## 3. 模板

# 專案溝通提問模板

## ① DO｜直接執行任務

**使用時機：** 我已經知道想達成什麼結果，不需要參與技術方法的選擇。

```text
DO｜[一句話描述目標]

【預期結果】
我希望最終看到：
[描述實際成果、畫面或使用體驗，而不是技術實作方法]

【判斷標準】
[怎樣才算符合預期？可引用參考圖片、既有場景或可觀察的行為]

【限制與保留】
[哪些既有成果不能受到影響？沒有則填「無」]

【參考依據】
[圖片、檔案、場景名稱或先前決策；沒有則留空]

請依照現有 STATE.md、已確定的決策與專案規範執行。

技術方法由你自行判斷，不需要為一般實作細節徵求我的同意。只有當選擇涉及額外額度、資料遺失、新增相依套件，或改變已確定的方向時，才需要事先詢問。

完成後請回報：
1. 最終產出了什麼，以及如何查看。
2. 與預期結果的差距，附上可檢查的證據。
3. 你替我做了哪些重要決定，以及各自的理由。
4. 哪些部分尚未驗證或未完成。

不要把完成程式修改直接等同於達成畫面或體驗目標。
```

## ② CHOOSE｜比較方案並協助決策

**使用時機：** 我知道要解決什麼問題，但不確定有哪些合理選項，也不希望自己先猜技術方法。

```text
CHOOSE｜[需要決定的問題]

【決策目標】
我想達成：
[描述最終想要的效果]

【目前情況】
[目前的實作狀態、限制或遇到的困難]

【我最在意的因素】
[例如：視覺品質、手機效能、開發時間、額度、維護成本]
優先順序：[因素 A] > [因素 B] > [因素 C]

【不可犧牲的條件】
[哪些現有目標或成果不能因這次決策被放棄]

請根據專案現況提供 2～4 個實際可行的方案。

每個方案都要說明：
1. 最終成果會有什麼可觀察的差異。
2. 對效能、成本、開發時間與後續擴充的影響。
3. 最重要的風險與不確定性。
4. 哪些結論已有證據，哪些仍是推測。

最後請給出：
- 你的推薦方案及理由。
- 如果我沒有特別指定，你建議採用的預設方案。
- 是否存在成本很低、可以先排除錯誤方向的測試。
- 這次決策是否需要修改 STATE.md 或既有決策。

不要把尚未驗證的預估當成已確定的結果。

本次只需要協助決策，不要直接實作，除非我另外要求。
```

## ③ WHY｜診斷畫面或體驗問題

**使用時機：** 我看到不符合預期的現象，但不確定真正原因。

```text
WHY｜[場景或問題的簡短名稱]

WHERE：
[問題出現在哪個場景、畫面的哪個位置]

SEE：
[實際看到什麼，用日常語言描述，不需要技術名詞]

WANT：
[我希望看到什麼；可以指出參考圖片、其他場景或具體區域]

GUESS：
[如果有猜測，寫「猜：...」；沒有則留空]

KEEP：
[目前哪些部分已經符合預期，不能因修正而受到破壞]

【附加證據】
[圖片、兩張算圖的比較、操作過程或設定檔；沒有則留空]

請將我的觀察與猜測分開處理，不要直接把 GUESS 當成問題原因。

請在一次回覆中完成：

1. 用一句話複述你理解的問題，確認 WHERE、SEE、WANT、KEEP 沒有被混淆。
2. 透過可檢查的圖片、數值、程式證據或控制變因測試，找出問題可能來自哪一層。
3. 判斷 GUESS 是否正確；若證據不足，明確標示尚未確定。
4. 提供 2～3 種可能的修正方向，說明它們會造成什麼可見差異；能產生比較圖時，請並排展示。若可直接透過側邊欄調整，請指出控制項。
5. 只有當兩種合理解讀會導致實際工作方向不同時，才問我一個關鍵問題。

優先找出根因，不要只針對表面現象做補丁。

本次只診斷，不直接修改程式或套用修正方案。
除非我明確寫「順便修」，才可以在完成診斷後進行修正。

如果證據不足，請說明尚缺少什麼，以及取得該證據的最低成本方法。
```

## ④ CHECK｜查證進度、事實與完成程度

**使用時機：** 我想知道某件事目前做到什麼程度，或某個說法是否真的成立。

```text
CHECK｜[想要查證的事項]

【需要確認的問題】
[明確描述想知道的現況、數據或說法]

【判斷依據】
[指定要對照的目標、STATE.md、決策文件、參考圖片或驗收標準]

【查證範圍】
[指定場景、功能、檔案或里程碑；沒有則以問題直接相關的範圍為準]

請根據實際的專案檔案、程式執行結果、測試輸出與其他可取得的證據進行查證。

請回報：

1. 已確認的事實：附具體證據、檔案行號或指令輸出。
2. 尚未確認的事項：說明缺少什麼證據。
3. 目前與目標之間最大的差距。
4. 下一個最值得確認的問題，以及原因。
5. 是否存在已知會阻礙後續開發的問題。

請明確區分：
- 已驗證的事實。
- 根據證據做出的推論。
- 尚未驗證的假設。

不要用「程式已完成」「測試通過」代替實際的畫面、效能或體驗驗收。

這次只需要查證與回報，不要修改程式或重新規劃。
```

---

## ⑤ 極簡提問｜不需要填完整模板時

如果需求很簡單，可以只用以下格式，不必補齊所有欄位。

**直接執行**

`DO｜讓 pool15 的門廊更接近參考圖，保留現有近處水面效果。完成後提供比較圖與驗收結果。`

**比較方案**

`CHOOSE｜pool7 和 pool10 的自由曲面有哪些造形方案？我優先在意畫面相似度，其次是手機效能。比較後推薦一個預設方案，不要直接實作。`

**診斷問題**

```text
WHY｜pool15 遠處水面異常

WHERE：第二個門廊後方
SEE：水面出現會移動的棕色斑塊
WANT：接近 pool15 參考圖中的遠處水面
GUESS：猜測是透明度問題
KEEP：近處的水面效果
```

**確認現況**

`CHECK｜目前 21 張參考圖各自達到九成目標的進度。區分已目視驗收、只有程式實作，以及尚未開始的項目，並指出最大的差距。`

---

## ⑥ Agent 理解錯誤時

**第一次或第二次理解錯誤：**

`wrong: [貼上 Agent 複述中錯誤的部分]`

只指出理解錯誤的位置，不需要重新描述整件事。

**連續兩次仍無法正確理解：**

`show me the layers`

要求 Agent 把問題拆成可觀察的畫面、技術因素、已知證據與尚待決定的事項，讓我指出真正有問題的層次。

---

## ⑦ 共通原則

無論使用哪種提問方式，都遵守以下規則：

1. **先看既有方向。** 已經決定的事情不要反覆詢問；沒有新證據，不應擅自推翻。
2. **把目標和方法分開。** 我主要描述想看到的結果，Agent 負責尋找合理的實作方式。
3. **只問會影響下一步的問題。** 不要為了消除所有不確定性而一直追問。
4. **替我決定一般細節。** 在回報中列出重要的代理決策，讓我可以按編號推翻。
5. **讓證據優先於解釋。** 能用圖片、比較測試或數據確認時，不要只依賴文字推測。
6. **保留未驗證狀態。** 沒有實際驗證的事項，不能因為看起來合理就標為完成。
7. **聚焦當前目標。** 不因為發現非阻擋性的次要問題，就無限制擴大開發或審查範圍。
8. **尊重每種訊息的權限。** CHOOSE、WHY、CHECK 預設不修改程式；DO 才授權在既有約束內直接執行。
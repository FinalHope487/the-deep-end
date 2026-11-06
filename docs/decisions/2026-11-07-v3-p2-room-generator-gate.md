# P2 room generator gate (READ FIRST)

Date: 2026-11-07. Status: user direction. Owner: user.

This file has priority over every P2 and later plan, brief and test spec that exists before this date. Read it before you read or use any of them. Do not edit those plans. This file blocks the parts that conflict with it.

## 1. Goal

1. Make a room generator plan that the USER accepts.
2. Build a small demo that the user can explore in first person.

The user accepts the plan. The agent does not. Do not call the plan "approved" before the user says so in chat.

## 2. Scope now

Only these three subjects are open:

| # | Subject |
|---|---|
| S1 | How the space is divided into rooms |
| S2 | How walls are generated |
| S3 | How bridges, water bodies and slides can be added later without a generator rewrite |

Do not plan or build anything else for this goal (audio, UI, atmosphere, save, journey, packaging, release).

## 3. User requirements (original words)

> 我預期會有像圖片中的連續且具高度流動性也能夠無限延伸的結構 黑色框為房間 實際上可以無限延伸 藍色為多個房間之間構建出來的走道 也可以解讀成做出走道之後再把旁邊做成房間或牆體 「注意不要總是把走道旁邊的空缺做成房間或是牆體」
> 紅色為獨立的地道或是天橋等建築 黑色區塊為同層樓房間之間的重疊 不同房間之間可有不同高度
>
> 我要鄭重宣告我需要釐清的只有房間結構跟走道 這只是例子只構成建議 絕對不是具體實作方向 你需要關注的現階段只有房間隔間怎麼隔 牆壁怎麼生成 以及確保未來新增橋、水體、滑梯等設施的可擴充性 絕對不可出現以正方形為單位的單一房間結構
>
> 具體比喻就像俄羅斯方塊一般的房間結構
>
> 你要考慮到尺度問題 有小型10m內的房間也要有大型連通數十m的連通房間

Sketch: `work/c2c_user_sketch.jpg` (git-ignored; the user owns the original).

## 4. Hard rules derived from the words

| ID | Rule |
|---|---|
| G-01 | A room is NOT a square cell. No layout may use one square unit as the room. |
| G-02 | Room outlines are irregular and rectilinear, like Tetris pieces. They are not limited to the seven Tetris shapes. |
| G-03 | The structure is continuous and has no limit in size. The grid of the world contract (cell) is a storage unit only. It is never a room. |
| G-04 | The scale range is wide: small rooms of 10 m or less AND large connected rooms of several tens of metres. |
| G-05 | A corridor joins several rooms. The space beside a corridor is sometimes a room, sometimes a wall, sometimes open or empty. It is NOT always filled. |
| G-06 | Rooms on the same floor may overlap. Rooms may have different heights. |
| G-07 | Tunnels and bridges are independent structures. They are not parts of a room. |
| G-08 | The sketch is an example. Do not copy its shapes. |
| G-09 | The seed must change the layout, not only the door positions. |
| G-10 | Seams between world cells must not show. Filler walls are at least 2 m thick (P2-S03). |

## 5. What this file blocks

| Item | State |
|---|---|
| Slice 1 geometry in `work/c2c_p2plan-rev1.md` (40 m hall, four 12 x 8 m passages per cell, `dryRectanglePartition`, `createDryRegion('dry01')`) | VOID. It breaks G-01, G-03, G-09. |
| Round 2 brief `work/c2c_p2plan-request2.md` (vary the cross hall) | VOID. The user rejected the direction. |
| The 24 m corridor limit | Stays PROPOSED. The user has not decided it. |
| Slices 2 to 7 of the rev1 plan (Worker, render, controller, save, metrics, packaging) | PROPOSED only. Do not build them for this goal. Re-check each one against sections 2 and 4 before reuse. |
| Spec P2-S01..P2-V01 in `docs/handoff/v3-acceptance-02-early-phases-2026-11-05.md` section 4 | Still valid as the later acceptance bar. The demo does not need to pass them. |

## 6. Frozen facts the generator must respect

P1 is frozen (`versions/p1`, tag `p1`). Do not edit the P1 files. Read them as the contract:

- `queryWorld` calls `generate({worldId, seed, slotId, cell, config})` per owner cell (`js/v3/core/world.js:295-356`).
- A Space origin lies in its owner cell. Bounds may exceed the cell by at most `maxSpaceExtent` (64 m) (`js/v3/core/world.js:264-277`).
- If a user rule needs a larger overlap, report which fact blocks it and give options with their cost. Do not bend the user rule. Do not edit P1 without the user's decision.

## 7. Gates before build

1. Plan: ChatGPT writes the plan. The agent checks it against sections 3 to 6 and against the P1 code.
2. Preview: show the user top-down drawings for at least two seeds. The drawings must show G-01, G-04, G-05 and G-06. State which parts are computed and which are drawn by hand.
3. The user says in chat that the plan is accepted. Only then build the demo.
4. Demo scope: dry rooms, corridors, walls, first-person walk and collision, no water, no stairs. Keep one clear extension point for each of bridge, water and slide.
5. The user explores the demo and decides. The agent does not claim the demo is accepted.

## 8. Order of reading for any agent

1. `AGENTS.md`
2. This file
3. Other plans and decisions, in the light of this file

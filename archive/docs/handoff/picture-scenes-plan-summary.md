# Poolcore 圖片還原方案摘要

來源：ChatGPT 對話 `https://chatgpt.com/c/6ae5fce5-cf9c-83ee-b276-25767b7f429a`（唯讀方案包 PLAN.md）。
前提：不看光影、場景互不衝突、先能造出來不管能否行走。本摘要由 Claude 整理，未改動 repo。

## 總覽

- 場景 19 個：AUTO 6、FIXED 13。`pool12.jpg` 依使用者裁決暫停；`pool20.jpg` 未附圖，略過。
- 新模組 `js/gen2-picture-scenes.js`；`plan.pictureSceneId`、`plan.sceneFeatures`；選項 `pictureScenes:false` 可整體關閉。
- FIXED 場景放在 (i,4) 格，局部原點 (64i,256)；AUTO 用 `hash2(seed,i,j,SALT+sceneId)` 抽中，不動既有隨機流。
- 大小 S/M/L 是 ChatGPT 的粗估，未換算工時。

## 場景表

原圖在 `pictures/`（相對連結）。注意：`pictures/` 目前不在 git 追蹤內，其他 clone 看不到；SHA256 用來確認是同一批檔案。pool20 有檔但本輪未附給 ChatGPT，故不列。

| 圖（原圖） | SHA256 前 12 碼 | 路線 | FIXED 格 / AUTO 機率 | 共用構件 | 大小 |
|---|---|---|---|---|---|
| [pool1](../../pictures/pool1.jpg) | `4ab8532a7d9d` | AUTO | 0.06 | G06 G05 G08 | M |
| [pool2](../../pictures/pool2.jpg) | `14797a7f42fc` | AUTO | 0.04 | G07 G04 G06(flared) | L |
| [pool3](../../pictures/pool3.jpg) | `8791de83558c` | FIXED | (44,4) | G03 G13 G01 G06 | L |
| [pool4](../../pictures/pool4.jpg) | `cb68d097b0fb` | FIXED | (46,4) | G10 G07 G06 | L |
| [pool5](../../pictures/pool5.jpg) | `d9858f4f5272` | FIXED | (48,4) | G04 G09(through) G08 | L |
| [pool6](../../pictures/pool6.jpg) | `7e7872437695` | FIXED | (50,4) | G12 + 既有 pools[]×3 | M |
| [pool7](../../pictures/pool7.jpg) | `382b04736e24` | FIXED | (52,4) | G02 G06 G01 G13 | L |
| [pool8](../../pictures/pool8.jpg) | `4d9d795aeef2` | AUTO | 0.06 | G06 G10 G14 | M |
| [pool9](../../pictures/pool9.jpg) | `341c1ddd78d8` | FIXED | (54,4) | G08 G09 | L |
| [pool10](../../pictures/pool10.jpg) | `3ffcfa9179cb` | FIXED | (56,4) | G02 G09(blind) | L |
| [pool11](../../pictures/pool11.jpg) | `a37dddcc182b` | FIXED | (58,4) | G11 G05 G09 G10 | L |
| [pool13](../../pictures/pool13.jpg) | `afacba1e5d78` | FIXED | (60,4) | G10 G04 G09(niche) + 既有雙池；分 A–F 六區 | L |
| [pool14](../../pictures/pool14.jpg) | `642d467a36b1` | AUTO | 0.05 | G06 G10 | M |
| [pool15](../../pictures/pool15.jpg) | `0dce24b47715` | AUTO | 0.03 | G08 G09；延伸 S3 矩形 | L |
| [pool16](../../pictures/pool16.jpg) | `be2c86fd755c` | AUTO | 0.04 | G07 G04 G06 | M |
| [pool18](../../pictures/pool18.jpg) | `7a7e5a1eb0ef` | FIXED | (62,4) | G12 G09 + 既有長池；球體可選 | M |
| [pool19](../../pictures/pool19.jpg) | `ce4cd53d511d` | FIXED | (64,4) | G01 G12 + 既有長池 | L |
| [pool21](../../pictures/pool21.jpg) | `7c83f3cc3c5e` | FIXED | (66,4) | G05 G08 G09 | L |
| [ppool12](../../pictures/ppool12.jpg) | `e22bfaa8174f` | FIXED | (68,4) | G09 G07 G08（整廳積水） | L |
| [pool12](../../pictures/pool12.jpg) | `019d807b9742` | 暫停 | — | 使用者：先不做這張；保留原圖與雜湊，無 scene、無機率、無固定格 | — |

## 共用構件 G01–G14

| 碼 | 內容 | 主要掛鉤（ChatGPT 引用） |
|---|---|---|
| G01 | 拱形開口（半圓頂線封邊） | 擴充 S3 矩形 door；mesh2 門洞兩側拆面 |
| G02 | 曲／斜牆、漏斗柱頂曲面 | mesh2 牆面輪廓；`CURVE_SEG` 0.25 m 切片 |
| G03 | 真螺旋梯（`walkable:false`） | 新 `plan.sceneFeatures.spirals` |
| G04 | 實體欄杆／扶手 | 碰撞走 `railHit` |
| G05 | 池壁梯／爬梯 | 延伸 `plan.ladders`，`kind:'pool'` |
| G06 | 水中柱、漏斗柱 | 柱身起於積水底；Phase C |
| G07 | 樓梯踏板直接入水 | addHallFeatures／addSwitchback 末端；Phase C |
| G08 | 多房連續淹水（單一水面） | addFlood／floodAt 延伸；Phase D |
| G09 | 重複壁龕／長窗列（through / blind / niche） | mesh2 牆面開口 |
| G10 | 乾燥平台／圓角島、樓中樓條形走廊 | `cellRaster` 加高度遮罩 |
| G11 | 充水垂直井 | 延伸 shaft／void |
| G12 | 長柱廊 | 延伸 `addColumns` rows／aisles |
| G13 | 圓形天花／樓板開口 | 新圓形 void mask |
| G14 | 管件／壁孔（不貫穿） | mesh2 鑽孔與折線管 |

## 建置順序

| 步 | 內容 | 對照圖 |
|---|---|---|
| E0 | 資料契約與 fixture：新模組、固定格排除 cluster/S2/S3、空白固定格的 mesh/measure 契約 | — |
| E1 | G06 + G07（Phase C） | pool1/2/4/16 |
| E2 | G08（Phase D 延伸） | pool9/15，接著 pool21、ppool12 |
| E3 | G09 + G01 + G02 | pool5/7/10/18/19 |
| E4 | G10 + G12 | pool4/6/8/13/14/19 |
| E5 | G04 + G05 | pool1/2/5/11/13/16/21 |
| E6 | G03 + G13 | pool3/7 |
| E7 | G11 + G14 | pool8/11 |
| E8 | 逐場景收斂；AUTO 驗證在 corpus 出現，FIXED 驗證任意 seed 與讀取順序 | 全部 |

每個切片先寫紅燈測試再寫實作。測試檔：`gen2-picture-scenes.test.mjs`、`mesh2-picture-scenes.test.mjs`、`gen2-picture-measure.test.mjs`。

## Claude 的核對與疑慮

已核對：
- `gen2.js:944-961`（makePlan）、`1144-1149`（floodAt）、`1611-1633`（cellRaster／poolBox）、`mesh2.js:384-393` 的行號與內容吻合。其餘錨點未逐條核對。
- B1 在地面下 6–8 m（`gen2.js:508`）；圓池大廳只找 j 0..3（`gen2.js:58-59`），不與 j=4 的固定格衝突。

疑慮（推論，未驗證）：
- 授權：G06、G07 屬 Phase C，G08 屬 Phase D，G03／G04 屬 Phase E，皆未獲授權；方案內多數場景依賴它們。
- FIXED 格落在 i=44…68、j=4，離出生區數十格遠，玩家實際很難走到；要「看得到」可能需要傳送點或較近的格。
- 固定格要壓過該 district 的 cluster 規劃（`CLUSTER_SHARE` 0.5），範圍比 Phase A 的 `ROUND_FALLBACK`（只把 district (1,0) 改成 legacy）大；「其他格不動」的承諾未實測，Phase A 有過被打破的先例。
- 方案內推論旗標：pool13 的 B（橫向平台）、C（第二個小池）、E（凹槽而非開孔）；pool2 遠端開口是否為圓拱；pool11 左側是固定梯還是窄階梯。
- ppool12 水位 H+2 超過 `WADE_MAX`（1.5 m）：使用者說先不管能否行走，故不構成阻礙。

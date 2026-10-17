# 深水區 The Deep End

池核（poolcore）空間的第一人稱探索網頁。你在一座無止盡的白磁磚泳池建築裡醒來，循著遠處的光與聲音找到四個區域，最後走出發光的出口。前半段放鬆，越往後越安靜、越壓抑。

- 線上遊玩：https://finalhope487.github.io/the-deep-end/
- 單檔版：[`dist/index.html`](dist/index.html)（CSS 與 JS 全部內嵌，音檔在 `dist/audio/`）
- 規格書：[`docs/spec.md`](docs/spec.md)
- 開發日誌（和 AI 的討論與修改紀錄）：[`docs/devlog.md`](docs/devlog.md)

## 操作

| | 手機／平板 | 電腦 |
|---|---|---|
| 移動 | 左半邊按住拖曳（推到底跑步） | WASD／方向鍵，Shift 跑步 |
| 轉視角 | 右半邊拖曳 | 點畫面鎖定滑鼠後移動滑鼠 |
| 拾取 | 點物品或「可以拿」泡泡 | 點擊或按 E |
| 暫停 | 右上暫停鈕 | Esc |

## 開發

需要 Node.js。網頁本身不需建置，Three.js 從 CDN 載入。

```bash
node tools/serve.mjs 8080
```

```bash
node tools/build.mjs
```

```bash
node --test "tests/unit/*.test.mjs"
```

```bash
npx playwright test
```

| 路徑 | 內容 |
|---|---|
| `index.html` | 頁面、CSS、介面 |
| `js/world.js` | 種子區塊生成、4 個地標區域、出口（純資料，可在 node 測） |
| `js/chunkmesh.js`、`js/chunks.js` | 區塊網格合併、視距內載入與卸載 |
| `js/player.js`、`js/input.js` | 碰撞移動、鍵鼠與觸控搖桿 |
| `js/atmosphere.js`、`js/presence.js` | 壓抑度曲線、遠處的「存在」 |
| `js/wet.js`、`js/audio.js`、`js/quality.js` | 水滴濾鏡、音效、自動畫質 |
| `js/main.js`、`js/ui.js`、`js/save.js` | 遊戲流程、畫面、存檔 |
| `tools/build.mjs` | 合併成單檔 `dist/index.html` |

## 授權與來源

- 3D：[three.js](https://threejs.org/)（MIT）
- 音效：全部 CC0，見 [`audio/CREDITS.md`](audio/CREDITS.md)

# 双指滑动返回 (Swipe Back for macOS Chrome)

给 macOS 版 Chrome 补上双指滑动返回/前进的手势。

Safari 上双指向右推可以直接返回上一页，Chrome 不行。这个扩展把这件事补上，并且处理了一个 Safari 也没解决好的场景：**点链接弹出的新标签页，右滑会关掉它并退回来源标签。**

## 为什么 Chrome 在 Mac 上没有这个手势

不是配置问题，是架构差异。

| | Safari | Chrome (macOS) |
|---|---|---|
| 手势入口 | 原生 `HistorySwiper`，直接吃 AppKit 的 `NSEvent` 触摸事件 | 走 **wheel 事件 + 滚动链**：手势先给 renderer 当横向滚动处理，只有 `overscroll-behavior-x` 放行且横向已到边界，才交回浏览器做历史导航 |
| 页面写 `overscroll-behavior-x: none` | 不受影响，根本不走这条链路 | 手势被页面吃掉 |
| 页面是横向轮播 / swiper | 系统手势优先级更高 | 滑动被内容消费 |

Windows 和 Linux 的 Chromium 通过 `OverscrollHistoryNavigation` 这个 feature 接入了手势，macOS 没接。所以桌面 Mac 上这就是常态，不是 bug。

## 工作方式

```
swipe.js  (content script)
  ├─ 监听 wheel，累计 deltaX
  ├─ 纵向 delta 出现 → 冻结 60ms，交给页面滚动
  ├─ 页面自己横向滚动 → 暂停手势 800ms，避免抢轮播
  └─ 横向累计超阈值 → 发消息给后台
        │
background.js  (service worker)
  ├─ 1. tab.historyLength > 1     → chrome.tabs.goBack()
  ├─ 2. tab.openerTabId 存在      → 激活来源标签 + 关闭当前标签
  └─ 3. 都没有                    → 按配置跳新标签页 / 关闭 / 不做
```

第 2 步是关键。在新标签页里打开的第一页，`history.length === 1`，`history.back()` 没有目标可回退，任何浏览器都是静默无反应。靠 `openerTabId` 才能知道「是谁打开了我」，所以退回去正好符合直觉。

## 安装

1. 下载或 clone 本仓库
2. 打开 `chrome://extensions`
3. 开启右上角「开发者模式」
4. 点「加载已解压的扩展程序」，选中本目录
5. 刷新已打开的网页（脚本不会注入到加载前就已存在的标签）

## 参数

都在 `swipe.js` 顶部：

| 参数 | 默认 | 含义 |
|---|---|---|
| `THRESHOLD` | `100` | 触发的横向累计位移。太灵敏调大，滑不动调小 |
| `RATIO` | `2.0` | 横向须明显大于纵向才算横滑 |
| `GAP` | `350` | 两次手势间隔超此时长则重置累计（ms） |
| `FREEZE` | `60` | 检测到纵向滚动后冻结横向判定的时长（ms） |
| `HSCROLL_MS` | `800` | 页面横向滚动后暂停手势的时长（ms） |
| `FALLBACK` | `'newtab'` | 无历史且无来源标签时的行为：`'newtab'` / `'close'` / `'none'` |

改完在 `chrome://extensions` 点扩展卡片上的刷新图标，再刷新网页。

## 已知限制

- `chrome://` 页面、Chrome 应用商店等受保护页面无法注入脚本
- 部分站点（尤其自绘滚动容器的 SPA）手势仍可能被内容抢走，用 `HSCROLL_MS` 调
- 只测过 macOS 15 + Chrome 155

## 参考

- [mistweaverco/chrome-extension-swipe-back](https://github.com/mistweaverco/chrome-extension-swipe-back) — 纵向冻结防误触的思路来源（该项目在 Mac 上主动跳过启用）
- [Pajn/two-finger-history-jump](https://github.com/Pajn/two-finger-history-jump) — content script + background 分层的相近结构

## License

MIT

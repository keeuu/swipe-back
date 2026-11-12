// 后台：处理返回 / 前进
// 返回策略（按优先级）：
//   1. 有站内历史 -> goBack
//   2. goBack 之后如果跳到了别的站点（跨站入口那一跳），立刻 goForward 撤回并关标签/退来源
//   3. 没有历史 -> 退回来源标签 / 兜底
//
// 为什么不用 history.length 数步数：Chrome 里 pushState 不会让它增长，
// 数不出来的。所以采用"退一步 -> 检查结果 -> 不对就撤回"这种事后校验。

const sameOrigin = (a, b) => {
  try { return new URL(a).origin === new URL(b).origin; } catch (e) { return false; }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null || !msg) return;

  if (msg.type === 'swipe-forward') {
    chrome.tabs.goForward(tabId, () => {
      void chrome.runtime.lastError;
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type !== 'swipe-back') return;

  const pageOrigin = msg.origin || '';
  const beforeURL = msg.url || '';

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) { sendResponse({ ok: false }); return; }

    // 先把"当前标签被哪些标签打开"记下来，别在一次后退里丢掉
    const openerId = tab.openerTabId;

    // 没有历史可退，直接走回退
    if (tab.historyLength <= 1) {
      fallbackToOpener(openerId, tabId, msg, sendResponse);
      return;
    }

    chrome.tabs.goBack(tabId, () => {
      if (chrome.runtime.lastError) {
        fallbackToOpener(openerId, tabId, msg, sendResponse);
        return;
      }
      // 退完之后看落在哪
      setTimeout(() => {
        chrome.tabs.get(tabId, (t2) => {
          if (chrome.runtime.lastError || !t2) { sendResponse({ ok: true, how: 'history' }); return; }
          const landed = t2.url || '';
          if (pageOrigin && landed && !sameOrigin(pageOrigin, landed)) {
            // 跨站了（典型：X 用 replaceState 改写入口，back 到 Google 搜索页）
            // 立刻前进撤回，再走"关标签 / 回来源"
            chrome.tabs.goForward(tabId, () => {
              void chrome.runtime.lastError;
              fallbackToOpener(openerId, tabId, msg, sendResponse);
            });
            return;
          }
          sendResponse({ ok: true, how: 'history' });
        });
      }, 90);
    });
  });

  return true;
});

async function fallbackToOpener(openerId, tabId, msg, sendResponse) {
  if (openerId != null) {
    try {
      const exists = await new Promise((res) =>
        chrome.tabs.get(openerId, (t) => res(!chrome.runtime.lastError && !!t)));
      if (exists) {
        await chrome.tabs.update(openerId, { active: true });
        await chrome.tabs.remove(tabId);
        sendResponse({ ok: true, how: 'opener' });
        return;
      }
    } catch (e) { /* 来源标签已关 */ }
  }

  if (msg.fallback === 'close') {
    chrome.tabs.remove(tabId);
    sendResponse({ ok: true, how: 'close' });
  } else if (msg.fallback === 'none') {
    sendResponse({ ok: false, how: 'nothing' });
  } else {
    chrome.tabs.update(tabId, { url: 'chrome://newtab' });
    sendResponse({ ok: true, how: 'newtab' });
  }
}

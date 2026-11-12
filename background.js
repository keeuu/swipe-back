// 后台：处理返回 / 前进
//
// 核心策略：不做「固定延时后读 URL」的猜测，改为等待真实的导航完成事件。
// 慢网络下 90ms 窗口拿到的还是旧文档的 URL，会导致跨站守卫失效（v1.4 的 bug）。
//
// 后退流程：
//   1. 记录发起页面 origin
//   2. 订阅 chrome.tabs.onUpdated，等到 status='complete' 后再看 URL
//   3. 若落点跨站 -> goForward 撤回 -> 退回来源标签 / 关标签
//   4. 超时（比如 2.5s）仍未完成 -> 当作站内，放弃干预，避免卡死用户

const pending = new Map(); // tabId -> { origin, openerId, done, timer }

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

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) { sendResponse({ ok: false }); return; }

    const openerId = tab.openerTabId;

    // 没有历史：直接走回退分支
    if (tab.historyLength <= 1) {
      fallbackToOpener(openerId, tabId, msg, sendResponse);
      return;
    }

    const origin = msg.origin || '';
    const token = { origin, openerId, done: false, timer: 0 };
    pending.set(tabId, token);

    // 超时保护：导航迟迟不 complete，就别再干预
    token.timer = setTimeout(() => {
      if (!token.done) {
        token.done = true;
        pending.delete(tabId);
        sendResponse({ ok: true, how: 'timeout(assume-ok)' });
      }
    }, 2500);

    chrome.tabs.goBack(tabId, () => {
      if (chrome.runtime.lastError) {
        clearTimeout(token.timer);
        pending.delete(tabId);
        fallbackToOpener(openerId, tabId, msg, sendResponse);
      }
    });
  });

  return true;
});

// 等导航真正落地再看 URL
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const token = pending.get(tabId);
  if (!token || token.done) return;
  if (info.status !== 'complete') return;

  token.done = true;
  clearTimeout(token.timer);
  pending.delete(tabId);

  const landed = tab.url || '';
  if (token.origin && landed && !sameOrigin(token.origin, landed)) {
    // 跨站了 -> 撤回
    chrome.tabs.goForward(tabId, () => {
      void chrome.runtime.lastError;
      fallbackToOpener(token.openerId, tabId, { fallback: 'newtab' }, () => {});
    });
  }
  // 站内：什么都不做，用户已停在正确的上一页
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

  const fb = (msg && msg.fallback) || 'newtab';
  if (fb === 'close') {
    chrome.tabs.remove(tabId);
    sendResponse({ ok: true, how: 'close' });
  } else if (fb === 'none') {
    sendResponse({ ok: false, how: 'nothing' });
  } else {
    chrome.tabs.update(tabId, { url: 'chrome://newtab' });
    sendResponse({ ok: true, how: 'newtab' });
  }
}

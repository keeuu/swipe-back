// 后台：处理返回 / 前进
//
// noHistory = true（白名单站点）时：绝不调 tabs.goBack()，直接走 opener 关标签。
// 其余站点维持原策略：等真导航完成再判断是否跨站，跨站则撤回。

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

    // 白名单站点：不碰历史，只关标签回来源
    if (msg.noHistory) {
      if (openerId != null) {
        fallbackToOpener(openerId, tabId, msg, sendResponse);
      } else {
        // 没有 opener，说明是用户自己开的标签：什么都别做
        sendResponse({ ok: false, how: 'blocked-no-opener' });
      }
      return;
    }

    if (tab.historyLength <= 1) {
      fallbackToOpener(openerId, tabId, msg, sendResponse);
      return;
    }

    const origin = msg.origin || '';
    const token = { origin, openerId, done: false, timer: 0 };
    pending.set(tabId, token);

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

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const token = pending.get(tabId);
  if (!token || token.done) return;
  if (info.status !== 'complete') return;

  token.done = true;
  clearTimeout(token.timer);
  pending.delete(tabId);

  const landed = tab.url || '';
  if (token.origin && landed && !sameOrigin(token.origin, landed)) {
    chrome.tabs.goForward(tabId, () => {
      void chrome.runtime.lastError;
      fallbackToOpener(token.openerId, tabId, { fallback: 'newtab' }, () => {});
    });
  }
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

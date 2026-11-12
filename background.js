// 后台处理「返回」：优先站内历史退，其次退回打开当前标签的那个标签
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'swipe-back') return;
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) return;

  chrome.tabs.get(tabId, async (tab) => {
    if (chrome.runtime.lastError || !tab) { sendResponse({ ok: false }); return; }

    // 1) 站内还有可退历史（content script 已确认不是跨站那一跳）-> 后退
    if (msg.allowedHistory && tab.historyLength > 1) {
      chrome.tabs.goBack(tabId, () => {
        // 后退失败（已到栈底）时，转去退回来源标签
        if (chrome.runtime.lastError) fallbackToOpener(tab, tabId, msg, sendResponse);
        else sendResponse({ ok: true, how: 'history' });
      });
      return;
    }

    // 2) 没有站内历史 -> 退回来源标签并关掉自己
    fallbackToOpener(tab, tabId, msg, sendResponse);
  });

  return true; // 保持 sendResponse 通道
});

async function fallbackToOpener(tab, tabId, msg, sendResponse) {
  const opener = tab.openerTabId;
  if (opener != null) {
    try {
      const exists = await new Promise((res) =>
        chrome.tabs.get(opener, (t) => res(!chrome.runtime.lastError && !!t)));
      if (exists) {
        await chrome.tabs.update(opener, { active: true });
        await chrome.tabs.remove(tabId);
        sendResponse({ ok: true, how: 'opener' });
        return;
      }
    } catch (e) { /* 来源标签已关，继续往下 */ }
  }

  // 3) 兜底：按配置跳新标签页 / 关闭 / 什么都不做
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

// 双指滑动返回 / 前进
// 右滑 = 返回（交给后台：站内历史退 / 退回来源标签 / 兜底）
// 左滑 = 前进（本地 history.forward）
//
// 防误触借鉴 mistweaverco/chrome-extension-swipe-back：
//   纵向 delta 一旦出现，就冻结一段窗口期，避免滚动时抖动误判为横滑
(() => {
  const THRESHOLD   = 100;   // 触发的横向累计位移
  const RATIO       = 2.0;   // 横向要明显大于纵向才算横滑
  const GAP         = 350;   // 两次手势之间的间隔阈值(ms)
  const FREEZE      = 60;    // 检测到纵向滚动后，冻结横向判定的时长(ms)
  const HSCROLL_MS  = 800;   // 页面自己发生横向滚动后，暂停手势的时长(ms)
  const FALLBACK    = 'newtab'; // 无历史且无来源标签时: 'newtab' | 'close' | 'none'

  let sumX = 0, sumY = 0, fired = false, last = 0;
  let freezeUntil = 0;

  // ---- 站内历史记录守卫 ----
  // SPA（X/Twitter、YouTube、B站 等）会用 replaceState 改写入口那条历史，
  // 一路 back 到底会把用户送回 Google 搜索页。这里记录本标签内「安全」的历史条数，
  // 只允许退到本站自己产生的记录，跨站那一跳一律拦截。
  let safeDepth = 0;          // 允许的最大后退步数
  let lastURL = location.href;

  const ownOrigin = location.origin;

  function sameSite(a, b) {
    try { return new URL(a).origin === new URL(b).origin; } catch (e) { return false; }
  }

  function syncDepth() {
    // 打开页面时，若来源不是本站，则把这一跳标记为「不可退」
    if (document.referrer && !sameSite(document.referrer, location.href)) {
      safeDepth = Math.max(0, history.length - 2);
    } else {
      safeDepth = Math.max(0, history.length - 1);
    }
    lastURL = location.href;
  }
  syncDepth();

  // 监听同文档内的 URL 变化（pushState / replaceState / popstate / hashchange）
  function onLocationChange() {
    if (location.href === lastURL) return;
    lastURL = location.href;
    // 同文档导航 = 本站内部前进了一步，允许退回来
    if (safeDepth < history.length - 1) safeDepth = history.length - 1;
  }

  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    history[m] = function (...args) {
      const r = orig.apply(this, args);
      onLocationChange();
      return r;
    };
  }
  addEventListener('popstate', onLocationChange);
  addEventListener('hashchange', onLocationChange);

  // 页面可能被 BFCache 恢复，恢复时重算
  addEventListener('pageshow', (e) => { if (e.persisted) syncDepth(); });

  function canGoBackHere() {
    // 1) 完全没历史
    if (history.length <= 1) return false;
    // 2) 已经退到底了（本站内无可退记录）
    if (safeDepth <= 0) return false;
    return true;
  }

  function goBack() {
    try {
      const allowed = canGoBackHere();
      chrome.runtime.sendMessage(
        { type: 'swipe-back', fallback: FALLBACK, allowedHistory: allowed },
        () => { void chrome.runtime.lastError; }
      );
    } catch (e) { /* 扩展刚重载，忽略 */ }
  }

  function onWheel(e) {
    const now = Date.now();

    // 手势会话超时，重置累计
    if (now - last > GAP) { sumX = 0; sumY = 0; fired = false; }
    last = now;

    if (fired) return;
    if (now < freezeUntil) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;

    // 只要出现纵向分量，就冻结横向判定，交给页面正常滚动
    if (e.deltaY !== 0) {
      freezeUntil = now + FREEZE;
      sumX = 0; sumY = 0;
      return;
    }

    sumX += e.deltaX;
    sumY += e.deltaY;

    if (Math.abs(sumX) < THRESHOLD) return;
    if (Math.abs(sumX) < Math.abs(sumY) * RATIO) return;

    fired = true;
    if (sumX < 0) {
      goBack();
      // 同文档后退不触发 popstate 之外的信号，这里主动扣一格
      if (safeDepth > 0) safeDepth -= 1;
    } else {
      history.forward();
    }
  }

  // 页面自己横向滚起来了（轮播、表格、代码块），说明横滑已被内容消费，别抢
  let lastScrollX = 0;
  function onScroll(e) {
    const t = e.target;
    const x = (t && (t.scrollX ?? t.scrollLeft)) ?? 0;
    if (x !== lastScrollX) {
      lastScrollX = x;
      sumX = 0; sumY = 0;
      freezeUntil = Date.now() + HSCROLL_MS;
    }
  }

  // 兜底：扩展上下文失效（重载后旧脚本还在页面里）时不再调用 API
  function alive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  addEventListener('wheel', (e) => { if (alive()) onWheel(e); }, { passive: true });
  addEventListener('scroll', onScroll, { capture: true, passive: true });
})();

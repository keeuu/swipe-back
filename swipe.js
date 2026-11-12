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

  const origin = location.origin;

  function goForward() {
    try {
      chrome.runtime.sendMessage({ type: 'swipe-forward' }, () => { void chrome.runtime.lastError; });
    } catch (e) {}
  }

  function onWheel(e) {
    const now = Date.now();

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
      // 把当前 URL 和来源一起交给后台，由后台决定退还是关
      try {
        chrome.runtime.sendMessage({
          type: 'swipe-back',
          fallback: FALLBACK,
          url: location.href,
          origin
        }, () => { void chrome.runtime.lastError; });
      } catch (e) {}
    } else {
      goForward();
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

  function alive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  addEventListener('wheel', (e) => { if (alive()) onWheel(e); }, { passive: true });
  addEventListener('scroll', onScroll, { capture: true, passive: true });
})();

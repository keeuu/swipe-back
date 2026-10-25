# 隐私政策 / Privacy Policy

**双指滑动返回 (Swipe Back for macOS Chrome)**

本扩展不收集、不存储、不传输任何用户数据。

## 涉及的数据访问

扩展申请了 `tabs` 权限，仅用于在用户主动触发滑动手势时读取当前标签页的两个属性：

- `historyLength` — 判断是否有可回退的历史记录
- `openerTabId` — 判断当前标签页是由哪个标签打开的，以便退回

这些值只在本地内存中即时使用，不写入磁盘，不发送到任何服务器，扩展也没有网络请求代码。

## 不涉及的行为

- 不读取网页内容
- 不记录浏览历史
- 不使用分析/统计/追踪服务
- 不包含第三方代码或远程加载脚本
- 不与任何第三方共享数据

## 联系方式

如有疑问，请在本仓库提交 issue。

---

This extension collects, stores, and transmits no user data.

The `tabs` permission is used solely to read `historyLength` and `openerTabId` of the current tab at the moment the user performs a swipe gesture. These values are used in memory only, are never persisted, and are never sent anywhere. The extension contains no networking code.

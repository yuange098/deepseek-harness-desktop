/**
 * 预加载脚本：只给页面开一个口子 —— 删会话。
 *
 * 页面（DSH 客户端）本身没有文件系统权限，删会话数据必须由主进程做，
 * 所以这里用 contextBridge 暴露一个最小的、参数受限的接口：
 *   window.dshDesktop.deleteSession(sessionId)        → 真删
 *   window.dshDesktop.planSessionDeletion(sessionId)  → 只列清单（不删，供调试/预览）
 *   window.dshDesktop.isDesktop                      → true（页面用它判断是否在桌面壳里）
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dshDesktop', {
  isDesktop: true,
  deleteSession: (sessionId) => ipcRenderer.invoke('dsh:delete-session', String(sessionId ?? '')),
  planSessionDeletion: (sessionId) =>
    ipcRenderer.invoke('dsh:plan-delete-session', String(sessionId ?? '')),
});

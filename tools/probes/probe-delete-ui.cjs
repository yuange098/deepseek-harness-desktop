/**
 * 验证「删除对话」功能：
 *  1. 会话行上有没有垃圾桶按钮（在官方 rowActions 里）
 *  2. 点它会不会弹出确认框 + 文案是否包含"无法恢复"
 *  3. 取消 → 关掉，不删任何东西
 *  4. 走 preload + IPC 的真实链路做一次 dry-run（planSessionDeletion），证明链路通
 * 全程不真删：真删只在桌面壳里由用户点「永久删除」触发。
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';
const HOME = 'E:\\DeepSeekHarness\\home';
const PRELOAD = 'E:\\DeepSeekHarness\\desktop\\src\\preload.js';
const { deleteSessionData, planSessionDeletion } = require('E:\\DeepSeekHarness\\desktop\\src\\session-store.js');

app.setPath('userData', path.join(WORK, '.electron-scratch-del'));
app.disableHardwareAcceleration();

function currentUrl() {
  const files = fs
    .readdirSync(LOGS)
    .filter((f) => f.startsWith('dsh-web-') && f.endsWith('.log'))
    .map((f) => ({ f, t: fs.statSync(path.join(LOGS, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files) {
    const m = fs.readFileSync(path.join(LOGS, f), 'utf8').match(/dsh web:\s+(http\S+)/);
    if (m) return m[1];
  }
  throw new Error('no url');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  // 用桌面壳同一套实现注册 IPC（这样页面里 window.dshDesktop 就是真实链路）
  ipcMain.handle('dsh:plan-delete-session', (_e, id) => planSessionDeletion(HOME, id));
  ipcMain.handle('dsh:delete-session', (_e, id) => deleteSessionData(HOME, id));

  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    useContentSize: true,
    x: 40,
    y: 30,
    show: true,
    webPreferences: { preload: PRELOAD, paintWhenInitiallyHidden: true, backgroundThrottling: false },
  });
  await win.loadURL(currentUrl());
  await sleep(12000);

  const before = await win.webContents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('[data-row-key^="session:"]')];
    return {
      rows: rows.length,
      buttons: document.querySelectorAll('.dsh-del-btn').length,
      buttonsInActions: [...document.querySelectorAll('.dsh-del-btn')]
        .filter((b) => b.parentElement && /rowActions/.test(b.parentElement.className || '')).length,
      desktopApi: typeof window.dshDesktop,
      hasDelete: !!(window.dshDesktop && typeof window.dshDesktop.deleteSession === 'function'),
      ids: rows.map((r) => (r.getAttribute('data-row-key') || '').replace('session:', '')).slice(0, 3),
    };
  })()`);
  console.log('按钮状态: ' + JSON.stringify(before));

  // 点第一个按钮 → 看弹窗
  const dialog = await win.webContents.executeJavaScript(`(() => {
    const btn = document.querySelector('.dsh-del-btn');
    if (!btn) return { error: '没有按钮' };
    btn.click();
    return { done: true };
  })()`);
  await sleep(600);
  const opened = await win.webContents.executeJavaScript(`(() => {
    const mask = document.querySelector('.dsh-del-mask');
    if (!mask) return { error: '没有弹窗' };
    const text = mask.textContent || '';
    const buttons = [...mask.querySelectorAll('button')].map((b) => b.textContent.trim());
    return { hasMask: true, hasWarning: text.includes('无法恢复'), text: text.slice(0, 90), buttons };
  })()`);
  console.log('弹窗: ' + JSON.stringify(opened));

  // 取消 → 弹窗应关闭，且什么都不删
  const cancelled = await win.webContents.executeJavaScript(`(() => {
    const mask = document.querySelector('.dsh-del-mask');
    const cancel = [...mask.querySelectorAll('button')].find((b) => b.textContent.trim() === '取消');
    cancel.click();
    return !document.querySelector('.dsh-del-mask');
  })()`);
  console.log('取消后弹窗关闭: ' + cancelled);

  // 真实链路 dry-run：preload → IPC → session-store
  const sessionId = before.ids[0];
  const planned = await win.webContents.executeJavaScript(
    `window.dshDesktop.planSessionDeletion(${JSON.stringify(sessionId)})`,
  );
  console.log('dry-run 链路: ' + JSON.stringify({
    id: sessionId,
    ok: planned.ok,
    targets: planned.targets.length,
    registry: !!planned.registry,
  }));

  // 确认没有任何文件被删
  const after = await win.webContents.executeJavaScript(
    `document.querySelectorAll('[data-row-key^="session:"]').length`,
  );
  console.log('会话行数 前后: ' + before.rows + ' → ' + after);

  app.exit(0);
});
